import { serviceNowClient } from "../../lib/tools/servicenow";
import { createSystemContext } from "../../lib/infrastructure/servicenow-context";

type JsonBody =
  | {
      status: "ok";
      message: string;
      processed: number;
      closed: number;
      skipped: number;
    }
  | {
      status: "error";
      message: string;
    };

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
      });
    }

    let closed = 0;
    let skipped = 0;

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
      } catch (error) {
        skipped += 1;
        console.error(
          `[Cron] Failed to close incident ${incident.number}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    return jsonResponse({
      status: "ok",
      message: `Processed ${incidents.length} incident(s); closed ${closed}, skipped ${skipped}.`,
      processed: incidents.length,
      closed,
      skipped,
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
