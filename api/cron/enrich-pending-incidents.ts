/**
 * Incident Enrichment Cron Job
 * Runs every 15 minutes to enrich active incidents in the watchlist
 * Extracts entities, matches CIs, and updates incidents with technical metadata
 */

import { getIncidentEnrichmentRepository } from "../../lib/db/repositories/incident-enrichment-repository";
import { getIncidentEnrichmentService } from "../../lib/services/incident-enrichment-service";
import { createSystemContext } from "../../lib/infrastructure/servicenow-context";

type JsonBody =
  | {
      status: "ok";
      message: string;
      processed: number;
      enriched: number;
      clarifications: number;
      errors: number;
      skipped: number;
    }
  | {
      status: "error";
      message: string;
    };

const DEFAULT_BATCH_SIZE = parseInt(
  process.env.INCIDENT_ENRICHMENT_CRON_BATCH_SIZE || "50",
  10
);
const DEFAULT_INTERVAL_MINUTES = parseInt(
  process.env.INCIDENT_ENRICHMENT_CRON_INTERVAL || "15",
  10
);

function jsonResponse(body: JsonBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

async function runEnrichment(): Promise<Response> {
  // Check if feature is enabled (from app_settings)
  const enrichmentService = getIncidentEnrichmentService();
  const enabled = await enrichmentService.isEnabled();

  if (!enabled) {
    return jsonResponse({
      status: "ok",
      message: "Incident enrichment feature is disabled (check app_settings.incident_enrichment_enabled)",
      processed: 0,
      enriched: 0,
      clarifications: 0,
      errors: 0,
      skipped: 0,
    });
  }

  const batchSize = Math.max(DEFAULT_BATCH_SIZE, 1);
  const intervalMinutes = Math.max(DEFAULT_INTERVAL_MINUTES, 5);

  // Create ServiceNow context for cron job (deterministic routing)
  const snContext = createSystemContext("cron-enrich-pending-incidents");

  console.log(`[Cron: Enrich Incidents] Starting enrichment run`, {
    batchSize,
    intervalMinutes,
    enabledAccounts: process.env.INCIDENT_ENRICHMENT_ENABLED_ACCOUNTS || "all",
  });

  try {
    const repository = getIncidentEnrichmentRepository();
    const enrichmentService = getIncidentEnrichmentService();

    // Get incidents needing enrichment
    // Note: Excludes "error", "enriched", "completed", and "clarification_pending" stages
    const incidents = await repository.getActiveIncidents(
      ["created", "notes_analyzed", "ci_matched"], // Stages to process
      intervalMinutes, // Only process incidents not touched in last N minutes
      batchSize // Limit to prevent timeout
    );

    if (incidents.length === 0) {
      console.log(`[Cron: Enrich Incidents] No incidents needing enrichment`);
      return jsonResponse({
        status: "ok",
        message: "No incidents needing enrichment",
        processed: 0,
        enriched: 0,
        clarifications: 0,
        errors: 0,
        skipped: 0,
      });
    }

    console.log(
      `[Cron: Enrich Incidents] Processing ${incidents.length} incidents`,
      {
        stages: incidents.reduce((acc, i) => {
          acc[i.enrichmentStage] = (acc[i.enrichmentStage] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      }
    );

    let enriched = 0;
    let clarifications = 0;
    let errors = 0;
    let skipped = 0;

    for (const incident of incidents) {
      try {
        // Skip if clarification is already pending (waiting for human response)
        if (incident.enrichmentStage === "clarification_pending") {
          // Check if clarification has been pending too long (> 24 hours)
          const hoursSinceClarification = incident.clarificationRequestedAt
            ? (Date.now() - incident.clarificationRequestedAt.getTime()) / 1000 / 60 / 60
            : 0;

          if (hoursSinceClarification < 24) {
            console.log(
              `[Cron: Enrich Incidents] Skipping ${incident.incidentNumber} - clarification pending (${hoursSinceClarification.toFixed(1)}h)`
            );
            skipped++;
            continue;
          } else {
            console.log(
              `[Cron: Enrich Incidents] Clarification expired for ${incident.incidentNumber} - retrying enrichment`
            );
          }
        }

        // Run enrichment
        const result = await enrichmentService.enrichIncident(incident.incidentSysId);

        if (result.success) {
          if (result.ciLinked) {
            enriched++;
            console.log(
              `[Cron: Enrich Incidents] Enriched ${incident.incidentNumber} with CI: ${result.ciName}`
            );
          } else if (result.clarificationNeeded) {
            clarifications++;
            console.log(
              `[Cron: Enrich Incidents] Requested clarification for ${incident.incidentNumber}`
            );
          } else {
            enriched++;
            console.log(
              `[Cron: Enrich Incidents] Enriched ${incident.incidentNumber} (no CI match)`
            );
          }
        } else {
          errors++;
          console.error(
            `[Cron: Enrich Incidents] Error enriching ${incident.incidentNumber}: ${result.message}`
          );
        }
      } catch (error) {
        errors++;
        console.error(
          `[Cron: Enrich Incidents] Unhandled error processing ${incident.incidentNumber}:`,
          error
        );
      }
    }

    // Get watchlist stats for logging
    const stats = await repository.getWatchlistStats();

    console.log(`[Cron: Enrich Incidents] Enrichment run complete`, {
      processed: incidents.length,
      enriched,
      clarifications,
      errors,
      skipped,
      watchlistSize: stats.totalIncidents,
      byStage: stats.byStage,
    });

    return jsonResponse({
      status: "ok",
      message: `Processed ${incidents.length} incidents`,
      processed: incidents.length,
      enriched,
      clarifications,
      errors,
      skipped,
    });
  } catch (error) {
    console.error("[Cron: Enrich Incidents] Fatal error during enrichment run:", error);

    return jsonResponse(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error occurred",
      },
      500
    );
  }
}

// Vercel cron handlers (support both GET and POST)
export async function GET(): Promise<Response> {
  console.log("[Cron: Enrich Incidents] Triggered via GET");
  return runEnrichment();
}

export async function POST(): Promise<Response> {
  console.log("[Cron: Enrich Incidents] Triggered via POST");
  return runEnrichment();
}
