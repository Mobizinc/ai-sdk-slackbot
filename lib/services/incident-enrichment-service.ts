/**
 * Incident Enrichment Service
 * Main orchestrator for incident enrichment workflow
 * Coordinates entity extraction, CI matching, and incident updates
 */

import { serviceNowClient } from "../tools/servicenow";
import { getIncidentNoteAnalyzerService } from "./incident-note-analyzer";
import { getCIMatchingService } from "./ci-matching-service";
import { getIncidentClarificationService } from "./incident-clarification-service";
import { getIncidentEnrichmentRepository } from "../db/repositories/incident-enrichment-repository";
import { getAppSettingWithFallback } from "./app-settings";
import type { ExtractedEntities } from "./incident-note-analyzer";
import type { IncidentEnrichmentState } from "../db/schema";

export interface EnrichmentResult {
  success: boolean;
  stage: string;
  message: string;
  ciLinked?: boolean;
  ciSysId?: string;
  ciName?: string;
  clarificationNeeded?: boolean;
  entities?: ExtractedEntities;
  confidence?: number;
}

export class IncidentEnrichmentService {
  /**
   * Load configuration from app_settings table (manageable via admin)
   */
  private async getConfig() {
    const enabled = await getAppSettingWithFallback("incident_enrichment_enabled", "false");
    const threshold = await getAppSettingWithFallback("incident_enrichment_confidence_threshold", "70");
    const maxAttempts = await getAppSettingWithFallback("incident_enrichment_max_attempts", "3");
    const maxAge = await getAppSettingWithFallback("incident_enrichment_max_age_hours", "24");
    const model = await getAppSettingWithFallback("incident_enrichment_model", "claude-haiku-4-5");

    return {
      enabled: enabled === "true",
      confidenceThreshold: parseInt(threshold ?? "70", 10),
      maxAttempts: parseInt(maxAttempts ?? "3", 10),
      maxAgeHours: parseInt(maxAge ?? "24", 10),
      model: model ?? "claude-haiku-4-5",
    };
  }

  /**
   * Main enrichment workflow
   * Analyzes incident, matches CIs, and updates records
   */
  public async enrichIncident(incidentSysId: string): Promise<EnrichmentResult> {
    console.log(`[Incident Enrichment Service] Starting enrichment for ${incidentSysId}`);

    try {
      // Load configuration from database
      const config = await this.getConfig();

      if (!config.enabled) {
        return {
          success: false,
          stage: "feature_check",
          message: "Incident enrichment feature is disabled (check app_settings.incident_enrichment_enabled)",
        };
      }

      const repository = getIncidentEnrichmentRepository();
      const enrichmentState = await repository.getIncidentBySysId(incidentSysId);

      if (!enrichmentState) {
        return {
          success: false,
          stage: "lookup",
          message: "Incident not found in enrichment watchlist",
        };
      }

      // Fetch incident from ServiceNow
      const incident = await serviceNowClient.getIncident(enrichmentState.incidentNumber);
      if (!incident) {
        // Mark as error to prevent retry loop
        await repository.updateEnrichmentStage(incidentSysId, "error", {
          error: "incident_not_found",
          error_message: `Failed to fetch incident ${enrichmentState.incidentNumber} from ServiceNow`,
          error_at: new Date().toISOString(),
        });

        return {
          success: false,
          stage: "fetch_incident",
          message: `Failed to fetch incident ${enrichmentState.incidentNumber} from ServiceNow`,
        };
      }

      // Fetch work notes
      const workNotes = await serviceNowClient.getIncidentWorkNotes(incidentSysId, {
        limit: 20,
      });

      console.log(
        `[Incident Enrichment Service] Fetched ${workNotes.length} work notes for ${enrichmentState.incidentNumber}`
      );

      // Check if new work notes exist
      const latestWorkNoteTime = workNotes.length > 0
        ? new Date(workNotes[0].sys_created_on).getTime()
        : 0;

      const lastCheckedTime = enrichmentState.lastWorkNoteAt
        ? enrichmentState.lastWorkNoteAt.getTime()
        : 0;

      const hasNewNotes = latestWorkNoteTime > lastCheckedTime;

      // Check stop conditions
      const attempts = enrichmentState.enrichmentAttempts || 0;
      const ageHours = (Date.now() - enrichmentState.createdAt.getTime()) / 1000 / 60 / 60;

      if (!hasNewNotes && attempts > 0) {
        console.log(
          `[Incident Enrichment Service] No new work notes for ${enrichmentState.incidentNumber} - skipping LLM call (cost savings)`
        );
        return {
          success: true,
          stage: enrichmentState.enrichmentStage,
          message: "No new work notes - skipped enrichment",
        };
      }

      if (attempts >= config.maxAttempts) {
        console.log(
          `[Incident Enrichment Service] Max attempts (${config.maxAttempts}) reached for ${enrichmentState.incidentNumber}`
        );
        await repository.updateEnrichmentStage(incidentSysId, "enriched", {
          max_attempts_reached: true,
        });
        return {
          success: true,
          stage: "enriched",
          message: `Max enrichment attempts (${config.maxAttempts}) reached - stopping`,
        };
      }

      if (ageHours > config.maxAgeHours) {
        console.log(
          `[Incident Enrichment Service] Incident ${enrichmentState.incidentNumber} is ${ageHours.toFixed(1)}h old - exceeds max age`
        );
        await repository.updateEnrichmentStage(incidentSysId, "enriched", {
          max_age_reached: true,
        });
        return {
          success: true,
          stage: "enriched",
          message: `Incident age (${ageHours.toFixed(1)}h) exceeds max (${config.maxAgeHours}h) - stopping`,
        };
      }

      // Step 1: Analyze notes to extract entities (only if new notes exist or first attempt)
      const noteAnalyzer = getIncidentNoteAnalyzerService();
      const analysisResult = await noteAnalyzer.analyzeNotes(
        enrichmentState.incidentNumber,
        incident.short_description || "",
        workNotes
          .filter((note) => note.value) // Filter out notes with no value
          .map((note) => ({
            value: note.value || "",
            sys_created_on: note.sys_created_on,
            sys_created_by: note.sys_created_by,
          })),
        config.model // Use configured model (default: Haiku 4.5)
      );

      // Update enrichment state with extracted entities and tracking fields
      await repository.updateExtractedEntities(incidentSysId, analysisResult.entities);
      await repository.updateEnrichmentStage(incidentSysId, "notes_analyzed", {
        enrichment_attempts: attempts + 1,
        last_work_note_at: latestWorkNoteTime > 0 ? new Date(latestWorkNoteTime).toISOString() : null,
      });

      console.log(
        `[Incident Enrichment Service] Extracted entities for ${enrichmentState.incidentNumber}`,
        {
          ipCount: analysisResult.entities.ip_addresses?.length || 0,
          hostnameCount: analysisResult.entities.hostnames?.length || 0,
          intent: analysisResult.intent?.issue_type || "unknown",
        }
      );

      // Check if this is an external dependency issue
      if (analysisResult.intent?.issue_type === "external_dependency") {
        console.log(
          `[Incident Enrichment Service] External dependency detected for ${enrichmentState.incidentNumber}`
        );

        const externalNote = `## External Dependency Issue Detected\n\n` +
          `This incident appears to be related to external dependencies rather than managed infrastructure.\n\n` +
          `**Classification:** ${analysisResult.intent.reasoning}\n\n` +
          `${analysisResult.intent.external_providers?.length ?
            `**External Providers:**\n${analysisResult.intent.external_providers.map(p => `- ${p.type}${p.name ? `: ${p.name}` : ''}`).join('\n')}` :
            ''}\n\n` +
          `**Recommendation:** Coordinate with external provider or escalate to account management.`;

        await serviceNowClient.addIncidentWorkNote(incidentSysId, externalNote);
        await repository.updateEnrichmentStage(incidentSysId, "enriched", {
          external_dependency: true,
          no_ci_matching: true,
        });

        return {
          success: true,
          stage: "external_dependency",
          message: "External dependency detected - no CI matching performed",
        };
      }

      // Step 2: Match entities to CIs (only for internal_ci or hybrid or unknown)
      const ciMatcher = getCIMatchingService();
      const matchingResult = await ciMatcher.matchEntities(analysisResult.entities);

      // Step 3: Decide action based on confidence
      if (matchingResult.highConfidenceMatches.length > 0) {
        // Auto-link highest confidence match
        const topMatch = matchingResult.highConfidenceMatches[0];

        console.log(
          `[Incident Enrichment Service] Auto-linking CI for ${enrichmentState.incidentNumber}`,
          {
            ciName: topMatch.name,
            confidence: topMatch.confidence,
          }
        );

        // Link CI to incident
        await serviceNowClient.linkCiToIncident(incidentSysId, topMatch.sys_id);

        // Add work note with enrichment details
        const enrichmentNote = noteAnalyzer.generateEnrichmentSummary(
          analysisResult.entities
        );
        const workNote = `${enrichmentNote}\n\n**Matched Configuration Item:**\n- **Name:** ${topMatch.name}\n- **Class:** ${topMatch.class}\n- **Confidence:** ${topMatch.confidence}%\n- **Source:** ${topMatch.source}\n- **Reason:** ${topMatch.match_reason}`;

        await serviceNowClient.addIncidentWorkNote(incidentSysId, workNote);

        // Update case notes if case exists
        if (enrichmentState.caseSysId) {
          const caseNote = `## Incident Enrichment Update\n\nIncident ${enrichmentState.incidentNumber} has been automatically enriched with CI: **${topMatch.name}** (${topMatch.confidence}% confidence).\n\nSee incident work notes for full details.`;
          await serviceNowClient.addCaseWorkNote(enrichmentState.caseSysId, caseNote);
        }

        // Update enrichment state
        await repository.updateMatchedCis(
          incidentSysId,
          [topMatch],
          {
            overall: matchingResult.overallConfidence,
            ci_match: topMatch.confidence,
            entity_extraction: analysisResult.confidence * 100,
          }
        );
        await repository.updateEnrichmentStage(incidentSysId, "enriched");

        return {
          success: true,
          stage: "enriched",
          message: `Successfully linked CI: ${topMatch.name}`,
          ciLinked: true,
          ciSysId: topMatch.sys_id,
          ciName: topMatch.name,
          confidence: topMatch.confidence,
          entities: analysisResult.entities,
        };
      } else if (matchingResult.lowConfidenceMatches.length > 0) {
        // Need clarification from technician
        console.log(
          `[Incident Enrichment Service] Clarification needed for ${enrichmentState.incidentNumber}`,
          {
            matchCount: matchingResult.lowConfidenceMatches.length,
            topConfidence: matchingResult.lowConfidenceMatches[0]?.confidence,
          }
        );

        // Update enrichment state with low confidence matches
        await repository.updateMatchedCis(
          incidentSysId,
          matchingResult.lowConfidenceMatches,
          {
            overall: matchingResult.overallConfidence,
            ci_match: matchingResult.lowConfidenceMatches[0]?.confidence || 0,
            entity_extraction: analysisResult.confidence * 100,
          }
        );

        // Send Slack clarification request
        const clarificationService = getIncidentClarificationService();
        const clarificationResult = await clarificationService.requestClarification({
          incidentSysId,
          incidentNumber: enrichmentState.incidentNumber,
          candidateCIs: matchingResult.lowConfidenceMatches.map((match) => ({
            sys_id: match.sys_id,
            name: match.name,
            class: match.class,
            confidence: match.confidence,
            match_reason: match.match_reason,
          })),
          // Use case's Slack channel/thread if available
          channelId: enrichmentState.metadata?.slack_channel_id as string | undefined,
          threadTs: enrichmentState.metadata?.slack_thread_ts as string | undefined,
        });

        if (clarificationResult.success) {
          console.log(
            `[Incident Enrichment Service] Clarification request sent for ${enrichmentState.incidentNumber}`
          );
        } else {
          console.error(
            `[Incident Enrichment Service] Failed to send clarification: ${clarificationResult.error}`
          );
        }

        return {
          success: true,
          stage: "clarification_pending",
          message: "CI matches found but confidence below threshold - clarification requested",
          clarificationNeeded: true,
          confidence: matchingResult.overallConfidence,
          entities: analysisResult.entities,
        };
      } else {
        // No matches found
        console.log(
          `[Incident Enrichment Service] No CI matches found for ${enrichmentState.incidentNumber}`
        );

        // Add work note indicating no matches
        const enrichmentNote = noteAnalyzer.generateEnrichmentSummary(
          analysisResult.entities
        );
        const workNote = `${enrichmentNote}\n\n**CI Matching Result:**\nNo matching Configuration Items found in inventory or CMDB.\n\nPlease manually link the affected CI if known.`;

        await serviceNowClient.addIncidentWorkNote(incidentSysId, workNote);

        // Update enrichment state
        await repository.updateEnrichmentStage(incidentSysId, "enriched", {
          no_matches: true,
        });

        return {
          success: true,
          stage: "enriched",
          message: "No CI matches found - enrichment complete with entities only",
          ciLinked: false,
          entities: analysisResult.entities,
        };
      }
    } catch (error) {
      console.error(
        `[Incident Enrichment Service] Error enriching incident ${incidentSysId}:`,
        error
      );

      return {
        success: false,
        stage: "error",
        message: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Handle manual CI selection from clarification response
   * Called when technician selects a CI from Slack interaction
   */
  public async handleClarificationResponse(
    incidentSysId: string,
    selectedCiSysId: string,
    selectedCiName: string
  ): Promise<EnrichmentResult> {
    console.log(
      `[Incident Enrichment Service] Processing clarification response for ${incidentSysId}`,
      {
        ciSysId: selectedCiSysId,
        ciName: selectedCiName,
      }
    );

    try {
      const repository = getIncidentEnrichmentRepository();

      // Link selected CI
      await serviceNowClient.linkCiToIncident(incidentSysId, selectedCiSysId);

      // Add work note
      const workNote = `**Manual CI Selection (via Slack)**\n\nTechnician selected Configuration Item:\n- **Name:** ${selectedCiName}\n- **Source:** Manual Selection\n\nCI has been linked to this incident.`;

      await serviceNowClient.addIncidentWorkNote(incidentSysId, workNote);

      // Update enrichment state
      await repository.updateEnrichmentStage(incidentSysId, "enriched", {
        manual_selection: true,
        ci_sys_id: selectedCiSysId,
        ci_name: selectedCiName,
      });

      return {
        success: true,
        stage: "enriched",
        message: `Successfully linked manually selected CI: ${selectedCiName}`,
        ciLinked: true,
        ciSysId: selectedCiSysId,
        ciName: selectedCiName,
      };
    } catch (error) {
      console.error(
        `[Incident Enrichment Service] Error processing clarification response:`,
        error
      );

      return {
        success: false,
        stage: "error",
        message: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Run final enrichment pass before incident closure
   * Ensures any new work notes are analyzed
   */
  public async runFinalEnrichment(incidentSysId: string): Promise<EnrichmentResult> {
    console.log(`[Incident Enrichment Service] Running final enrichment for ${incidentSysId}`);

    const repository = getIncidentEnrichmentRepository();
    const enrichmentState = await repository.getIncidentBySysId(incidentSysId);

    if (!enrichmentState) {
      console.log(
        `[Incident Enrichment Service] Incident ${incidentSysId} not in watchlist - skipping final enrichment`
      );
      return {
        success: false,
        stage: "not_tracked",
        message: "Incident not in enrichment watchlist",
      };
    }

    // If already enriched with CI, skip
    if (
      enrichmentState.matchedCis &&
      enrichmentState.matchedCis.length > 0 &&
      enrichmentState.enrichmentStage === "enriched"
    ) {
      console.log(
        `[Incident Enrichment Service] Incident ${enrichmentState.incidentNumber} already enriched - skipping`
      );
      return {
        success: true,
        stage: "enriched",
        message: "Already enriched - no action needed",
      };
    }

    // Otherwise, run enrichment
    return this.enrichIncident(incidentSysId);
  }

  /**
   * Check if feature is enabled (from app_settings)
   */
  public async isEnabled(): Promise<boolean> {
    const config = await this.getConfig();
    return config.enabled;
  }
}

// Singleton instance
let serviceInstance: IncidentEnrichmentService | null = null;

export function getIncidentEnrichmentService(): IncidentEnrichmentService {
  if (!serviceInstance) {
    serviceInstance = new IncidentEnrichmentService();
  }
  return serviceInstance;
}
