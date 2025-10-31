import { createSystemContext, type ServiceNowContext } from "../infrastructure/servicenow-context";
import { serviceNowClient } from "../tools/servicenow";
import type { ServiceNowIncidentWebhook } from "../schemas/servicenow-incident-webhook";

const INCIDENT_STATE = {
  NEW: "1",
  IN_PROGRESS: "2",
  ON_HOLD: "3",
  RESOLVED: "6",
  CLOSED: "7",
} as const;

function normalizeState(state?: string | number | null, label?: string | null): string | undefined {
  if (state === undefined || state === null) {
    if (!label) return undefined;
    return normalizeState(label.toLowerCase().includes("closed") ? INCIDENT_STATE.CLOSED : undefined, label);
  }

  const value = state.toString().trim();
  if (!value) return undefined;

  if (/^\d+$/.test(value)) {
    return value;
  }

  const lowered = value.toLowerCase();
  if (lowered.includes("resolved")) return INCIDENT_STATE.RESOLVED;
  if (lowered.includes("closed")) return INCIDENT_STATE.CLOSED;
  if (lowered.includes("hold")) return INCIDENT_STATE.ON_HOLD;
  if (lowered.includes("progress")) return INCIDENT_STATE.IN_PROGRESS;
  if (lowered.includes("new")) return INCIDENT_STATE.NEW;

  if (label) {
    return normalizeState(label, undefined);
  }

  return undefined;
}

function isResolved(state?: string): boolean {
  return state === INCIDENT_STATE.RESOLVED;
}

function isClosed(state?: string): boolean {
  return state === INCIDENT_STATE.CLOSED;
}

function isOnHold(state?: string): boolean {
  return state === INCIDENT_STATE.ON_HOLD;
}

export async function handleIncidentUpdate(payload: ServiceNowIncidentWebhook): Promise<void> {
  const parentCaseSysId = payload.parent_case_sys_id || payload.parent;
  if (!parentCaseSysId) {
    console.warn("[IncidentSync] Incident update received without parent case", {
      incident: payload.incident_number,
    });
    return;
  }

  const incidentSysId = payload.incident_sys_id || payload.sys_id;
  const incidentState = normalizeState(payload.state, payload.state_label);
  const snContext = createSystemContext("incident-webhook");

  if (isResolved(incidentState)) {
    await syncCaseFromResolvedIncident(payload, parentCaseSysId, incidentSysId, snContext);
  }

  if (isClosed(incidentState)) {
    await syncCaseFromClosedIncident(payload, parentCaseSysId, incidentSysId, snContext);
  }

  if (isOnHold(incidentState)) {
    await noteIncidentOnHold(payload, parentCaseSysId, snContext);
  }
}

async function syncCaseFromResolvedIncident(
  payload: ServiceNowIncidentWebhook,
  caseSysId: string,
  incidentSysId: string | undefined,
  context: ServiceNowContext,
): Promise<void> {
  const closeNotes = payload.close_notes || payload.comments || "Incident resolved";
  const resolutionNote = `Incident ${payload.incident_number} resolved. ${closeNotes}`;

  try {
    await serviceNowClient.updateCase(
      caseSysId,
      {
        state: "Resolved",
        close_notes: closeNotes,
      },
      context,
    );

    await serviceNowClient.addCaseWorkNote(caseSysId, resolutionNote, true, context);
  } catch (error) {
    console.error("[IncidentSync] Failed to mark case resolved from incident", {
      caseSysId,
      incident: payload.incident_number,
      incidentSysId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function syncCaseFromClosedIncident(
  payload: ServiceNowIncidentWebhook,
  caseSysId: string,
  incidentSysId: string | undefined,
  context: ServiceNowContext,
): Promise<void> {
  try {
    const remaining = await serviceNowClient.getIncidentsByParent(caseSysId, { includeClosed: false }, context);
    const otherActive = remaining.filter((incident) => {
      if (incident.number === payload.incident_number || (incidentSysId && incident.sys_id === incidentSysId)) {
        return false;
      }
      const state = incident.state?.toString();
      return state !== INCIDENT_STATE.CLOSED && state !== INCIDENT_STATE.RESOLVED;
    });

    if (otherActive.length === 0) {
      const closeNotes = payload.close_notes || "All linked incidents closed.";
      await serviceNowClient.updateCase(
        caseSysId,
        {
          state: "Closed",
          close_notes: closeNotes,
        },
        context,
      );

      await serviceNowClient.addCaseWorkNote(
        caseSysId,
        `Incident ${payload.incident_number} closed. Case closed automatically.`,
        true,
        context,
      );
    } else {
      await serviceNowClient.addCaseWorkNote(
        caseSysId,
        `Incident ${payload.incident_number} closed. ${otherActive.length} linked incident(s) remain active.`,
        true,
        context,
      );
    }
  } catch (error) {
    console.error("[IncidentSync] Failed to sync case close state", {
      caseSysId,
      incident: payload.incident_number,
      incidentSysId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function noteIncidentOnHold(
  payload: ServiceNowIncidentWebhook,
  caseSysId: string,
  context: ServiceNowContext,
): Promise<void> {
  const reason = payload.hold_reason || payload.state_label || "On Hold";
  const resume = payload.hold_until ? ` Expected resume: ${payload.hold_until}.` : "";
  const note = `Incident ${payload.incident_number} placed on hold. Reason: ${reason}.${resume}`;

  try {
    await serviceNowClient.updateCase(caseSysId, { state: "On Hold" }, context);
  } catch (error) {
    console.error("[IncidentSync] Failed to set case on hold state", {
      caseSysId,
      incident: payload.incident_number,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await serviceNowClient.addCaseWorkNote(caseSysId, note, false, context);
  } catch (error) {
    console.error("[IncidentSync] Failed to add on-hold note to case", {
      caseSysId,
      incident: payload.incident_number,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function closeIncidentsForCase(
  caseSysId: string,
  reason: string,
  context?: ServiceNowContext,
): Promise<void> {
  try {
    const incidents = await serviceNowClient.getIncidentsByParent(caseSysId, { includeClosed: false }, context);
    if (!incidents.length) {
      return;
    }

    const snContext = context ?? createSystemContext("case-close-sync");

    for (const incident of incidents) {
      try {
        await serviceNowClient.closeIncident(
          incident.sys_id,
          {
            closeNotes: reason,
          },
          snContext,
        );
      } catch (error) {
        console.error("[IncidentSync] Failed to close linked incident", {
          incident: incident.number,
          caseSysId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    console.error("[IncidentSync] Failed to retrieve incidents for case close sync", {
      caseSysId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
