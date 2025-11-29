import { serviceNowClient } from "../../lib/tools/servicenow";
import { createSystemContext, type ServiceNowContext } from "../../lib/infrastructure/servicenow-context";

type JsonBody =
  | {
      status: "ok";
      message: string;
      processed: number;
      closed: number;
      skipped: number;
      casesClosed: number;
    }
  | {
      status: "error";
      message: string;
    };

// Incident state constants (matching incident-sync-service.ts)
const INCIDENT_STATE = {
  RESOLVED: "6",
  CLOSED: "7",
} as const;

const DEFAULT_LIMIT = parseInt(process.env.INCIDENT_AUTO_CLOSE_LIMIT || "50", 10);
const DEFAULT_OLDER_THAN_MINUTES = parseInt(
  process.env.INCIDENT_AUTO_CLOSE_MINUTES || "60",
  10,
);
const DEFAULT_CLOSE_CODE =
  process.env.INCIDENT_AUTO_CLOSE_CODE || "Resolved - Awaiting Confirmation";

function jsonResponse(body: JsonBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

/**
 * Attempt to close the parent case after closing an incident.
 * Only closes the case if ALL linked incidents are closed/resolved.
 *
 * This mirrors the logic in incident-sync-service.ts:syncCaseFromClosedIncident
 */
async function tryCloseParentCase(
  incidentNumber: string,
  incidentSysId: string,
  parentCaseSysId: string,
  olderThanMinutes: number,
  snContext: ServiceNowContext,
): Promise<boolean> {
  try {
    // Check if there are other active incidents linked to this case
    const allIncidents = await serviceNowClient.getIncidentsByParent(
      parentCaseSysId,
      { includeClosed: false },
      snContext,
    );

    // Filter out the current incident and check for other active ones
    const otherActiveIncidents = allIncidents.filter((incident) => {
      // Skip the incident we just closed
      if (incident.sys_id === incidentSysId || incident.number === incidentNumber) {
        return false;
      }
      // Check if this incident is still active (not closed/resolved)
      const state = incident.state?.toString();
      return state !== INCIDENT_STATE.CLOSED && state !== INCIDENT_STATE.RESOLVED;
    });

    if (otherActiveIncidents.length > 0) {
      // Other active incidents exist - don't close the case yet
      console.log(
        `[Cron] Case ${parentCaseSysId} has ${otherActiveIncidents.length} other active incident(s) - not closing case`,
      );

      // Add work note to case about this incident being closed
      await serviceNowClient.addCaseWorkNote(
        parentCaseSysId,
        `🕒 Incident ${incidentNumber} was automatically closed after remaining in Resolved state for ${olderThanMinutes}+ minutes.\n\n` +
        `${otherActiveIncidents.length} linked incident(s) remain active. Case will be closed when all incidents are resolved.`,
        true,
        snContext,
      );

      return false;
    }

    // All incidents are closed - close the parent case
    const closeNotes =
      `Case automatically closed when all linked incidents were closed.\n` +
      `Last incident (${incidentNumber}) was auto-closed after remaining in Resolved state for ${olderThanMinutes}+ minutes.`;

    await serviceNowClient.updateCase(
      parentCaseSysId,
      {
        state: "Closed",
        close_notes: closeNotes,
      },
      snContext,
    );

    await serviceNowClient.addCaseWorkNote(
      parentCaseSysId,
      `✅ Case automatically closed.\n\n` +
      `All linked incidents have been resolved and closed. Last incident ${incidentNumber} was auto-closed by scheduled cron job.`,
      true,
      snContext,
    );

    console.log(
      `[Cron] Auto-closed parent case ${parentCaseSysId} after incident ${incidentNumber} closure (all incidents now closed)`,
    );

    return true;
  } catch (error) {
    console.error(
      `[Cron] Failed to close parent case ${parentCaseSysId} for incident ${incidentNumber}:`,
      error instanceof Error ? error.message : error,
    );
    // Don't fail the incident closure if case closure fails
    return false;
  }
}

async function runAutoClose(): Promise<Response> {
  if (!serviceNowClient.isConfigured()) {
    return jsonResponse(
      {
        status: "error",
        message: "ServiceNow client is not configured. Cannot close incidents.",
      },
      503,
    );
  }

  const limit = Math.max(DEFAULT_LIMIT, 1);
  const olderThan = Math.max(DEFAULT_OLDER_THAN_MINUTES, 1);
  const closeCode = DEFAULT_CLOSE_CODE;

  // Create ServiceNow context for cron job (deterministic routing)
  const snContext = createSystemContext('cron-close-resolved-incidents');

  try {
    const incidents = await serviceNowClient.getResolvedIncidents(
      {
        limit,
        olderThanMinutes: olderThan,
        requireParentCase: true,
        requireEmptyCloseCode: true,
      },
      snContext,
    );

    if (incidents.length === 0) {
      return jsonResponse({
        status: "ok",
        message: "No resolved incidents eligible for closure.",
        processed: 0,
        closed: 0,
        skipped: 0,
        casesClosed: 0,
      });
    }

    let closed = 0;
    let skipped = 0;
    let casesClosed = 0;

    for (const incident of incidents) {
      try {
        const workNote = [
          "🕒 Automated Incident Closure",
          "",
          `• Incident ${incident.number} remained in Resolved state for at least ${olderThan} minutes.`,
          "• Closure performed by scheduled cron job.",
          "",
          "If follow-up is required, reopen the incident and notify the service desk.",
        ].join("\n");

        await serviceNowClient.addIncidentWorkNote(incident.sys_id, workNote, snContext);

        const closeNotes = `Incident automatically closed after remaining in Resolved state for at least ${olderThan} minutes.`;

        await serviceNowClient.closeIncident(
          incident.sys_id,
          {
            closeCode,
            closeNotes,
          },
          snContext,
        );

        closed += 1;
        console.log(
          `[Cron] Closed incident ${incident.number} (${incident.sys_id}) from Resolved state.`,
        );

        // NEW: Attempt to close the parent case if all incidents are now closed
        if (incident.parent) {
          const caseClosed = await tryCloseParentCase(
            incident.number,
            incident.sys_id,
            incident.parent,
            olderThan,
            snContext,
          );
          if (caseClosed) {
            casesClosed += 1;
          }
        }
      } catch (error) {
        skipped += 1;
        console.error(
          `[Cron] Failed to close incident ${incident.number}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    const casesMessage = casesClosed > 0 ? `, ${casesClosed} parent case(s) auto-closed` : "";
    return jsonResponse({
      status: "ok",
      message: `Processed ${incidents.length} incident(s); closed ${closed}, skipped ${skipped}${casesMessage}.`,
      processed: incidents.length,
      closed,
      skipped,
      casesClosed,
    });
  } catch (error) {
    console.error("[Cron] Incident auto-close job failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ status: "error", message }, 500);
  }
}

export async function GET(): Promise<Response> {
  return runAutoClose();
}

export async function POST(): Promise<Response> {
  return runAutoClose();
}
