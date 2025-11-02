/**
 * Incident Enrichment Repository
 * Handles persistence of incident enrichment workflow state and tracking
 */

import { eq, and, lt, inArray, desc } from "drizzle-orm";
import { getDb } from "../client";
import { incidentEnrichmentStates } from "../schema";
import type { NewIncidentEnrichmentState, IncidentEnrichmentState } from "../schema";

export class IncidentEnrichmentRepository {
  /**
   * Record a new incident in the enrichment watchlist
   */
  async recordIncident(
    incident: NewIncidentEnrichmentState
  ): Promise<IncidentEnrichmentState | null> {
    const db = getDb();
    if (!db) {
      console.warn(
        "[Incident Enrichment Repository] Database not available - skipping incident persistence"
      );
      return null;
    }

    try {
      const result = await db
        .insert(incidentEnrichmentStates)
        .values(incident)
        .returning();

      const created = result[0];
      if (created) {
        console.log(
          `[Incident Enrichment Repository] Added incident ${incident.incidentNumber} to watchlist (stage: ${incident.enrichmentStage || "created"})`
        );
      }
      return created || null;
    } catch (error) {
      console.error(
        `[Incident Enrichment Repository] Error recording incident ${incident.incidentNumber}:`,
        error
      );
      return null;
    }
  }

  /**
   * Get incident enrichment state by incident sys_id
   */
  async getIncidentBySysId(
    incidentSysId: string
  ): Promise<IncidentEnrichmentState | null> {
    const db = getDb();
    if (!db) return null;

    try {
      const results = await db
        .select()
        .from(incidentEnrichmentStates)
        .where(eq(incidentEnrichmentStates.incidentSysId, incidentSysId))
        .limit(1);

      return results[0] || null;
    } catch (error) {
      console.error(
        `[Incident Enrichment Repository] Error fetching incident ${incidentSysId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Get incidents needing enrichment
   * Filters by enrichment stage and last_processed_at timestamp
   *
   * @param stages Enrichment stages to include
   * @param olderThanMinutes Only return incidents not processed in last N minutes
   * @param limit Maximum number of incidents to return
   */
  async getActiveIncidents(
    stages: string[] = ["created", "notes_analyzed", "ci_matched"],
    olderThanMinutes: number = 15,
    limit: number = 50
  ): Promise<IncidentEnrichmentState[]> {
    const db = getDb();
    if (!db) return [];

    try {
      const cutoffTime = new Date(Date.now() - olderThanMinutes * 60 * 1000);

      const results = await db
        .select()
        .from(incidentEnrichmentStates)
        .where(
          and(
            inArray(incidentEnrichmentStates.enrichmentStage, stages),
            lt(incidentEnrichmentStates.lastProcessedAt, cutoffTime)
          )
        )
        .orderBy(incidentEnrichmentStates.lastProcessedAt)
        .limit(limit);

      console.log(
        `[Incident Enrichment Repository] Found ${results.length} incidents needing enrichment`
      );
      return results;
    } catch (error) {
      console.error(
        "[Incident Enrichment Repository] Error fetching active incidents:",
        error
      );
      return [];
    }
  }

  /**
   * Update enrichment stage and metadata
   */
  async updateEnrichmentStage(
    incidentSysId: string,
    stage: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const db = getDb();
    if (!db) return;

    try {
      const updateData: any = {
        enrichmentStage: stage,
        lastProcessedAt: new Date(),
        updatedAt: new Date(),
      };

      if (metadata) {
        updateData.metadata = metadata;
      }

      await db
        .update(incidentEnrichmentStates)
        .set(updateData)
        .where(eq(incidentEnrichmentStates.incidentSysId, incidentSysId));

      console.log(
        `[Incident Enrichment Repository] Updated incident ${incidentSysId} to stage: ${stage}`
      );
    } catch (error) {
      console.error(
        `[Incident Enrichment Repository] Error updating stage for ${incidentSysId}:`,
        error
      );
    }
  }

  /**
   * Update matched CIs and confidence scores
   */
  async updateMatchedCis(
    incidentSysId: string,
    matchedCis: Array<{
      sys_id: string;
      name: string;
      class: string;
      confidence: number;
      source: "inventory" | "cmdb" | "manual";
      matched_at?: string;
    }>,
    confidenceScores: {
      overall?: number;
      ci_match?: number;
      entity_extraction?: number;
    }
  ): Promise<void> {
    const db = getDb();
    if (!db) return;

    try {
      await db
        .update(incidentEnrichmentStates)
        .set({
          matchedCis,
          confidenceScores,
          lastProcessedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(incidentEnrichmentStates.incidentSysId, incidentSysId));

      console.log(
        `[Incident Enrichment Repository] Updated ${matchedCis.length} matched CIs for incident ${incidentSysId} (confidence: ${confidenceScores.overall}%)`
      );
    } catch (error) {
      console.error(
        `[Incident Enrichment Repository] Error updating matched CIs for ${incidentSysId}:`,
        error
      );
    }
  }

  /**
   * Update extracted entities from note analysis
   */
  async updateExtractedEntities(
    incidentSysId: string,
    entities: {
      ip_addresses?: string[];
      hostnames?: string[];
      edge_names?: string[];
      error_messages?: string[];
      system_names?: string[];
      account_numbers?: string[];
    }
  ): Promise<void> {
    const db = getDb();
    if (!db) return;

    try {
      await db
        .update(incidentEnrichmentStates)
        .set({
          extractedEntities: entities,
          lastProcessedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(incidentEnrichmentStates.incidentSysId, incidentSysId));

      const entityCount = Object.values(entities).reduce(
        (sum, arr) => sum + (arr?.length || 0),
        0
      );
      console.log(
        `[Incident Enrichment Repository] Updated ${entityCount} extracted entities for incident ${incidentSysId}`
      );
    } catch (error) {
      console.error(
        `[Incident Enrichment Repository] Error updating entities for ${incidentSysId}:`,
        error
      );
    }
  }

  /**
   * Mark incident as needing clarification
   */
  async requestClarification(
    incidentSysId: string,
    slackMessageTs: string
  ): Promise<void> {
    const db = getDb();
    if (!db) return;

    try {
      await db
        .update(incidentEnrichmentStates)
        .set({
          enrichmentStage: "clarification_pending",
          clarificationRequestedAt: new Date(),
          clarificationSlackTs: slackMessageTs,
          lastProcessedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(incidentEnrichmentStates.incidentSysId, incidentSysId));

      console.log(
        `[Incident Enrichment Repository] Marked incident ${incidentSysId} as clarification_pending`
      );
    } catch (error) {
      console.error(
        `[Incident Enrichment Repository] Error requesting clarification for ${incidentSysId}:`,
        error
      );
    }
  }

  /**
   * Get incident by Slack clarification message timestamp
   */
  async getIncidentBySlackTs(
    slackMessageTs: string
  ): Promise<IncidentEnrichmentState | null> {
    const db = getDb();
    if (!db) return null;

    try {
      const results = await db
        .select()
        .from(incidentEnrichmentStates)
        .where(eq(incidentEnrichmentStates.clarificationSlackTs, slackMessageTs))
        .limit(1);

      return results[0] || null;
    } catch (error) {
      console.error(
        `[Incident Enrichment Repository] Error fetching incident by Slack ts:`,
        error
      );
      return null;
    }
  }

  /**
   * Remove incident from watchlist (when closed)
   */
  async removeFromWatchlist(incidentSysId: string): Promise<void> {
    const db = getDb();
    if (!db) return;

    try {
      await db
        .delete(incidentEnrichmentStates)
        .where(eq(incidentEnrichmentStates.incidentSysId, incidentSysId));

      console.log(
        `[Incident Enrichment Repository] Removed incident ${incidentSysId} from watchlist`
      );
    } catch (error) {
      console.error(
        `[Incident Enrichment Repository] Error removing incident ${incidentSysId}:`,
        error
      );
    }
  }

  /**
   * Remove incidents by case sys_id (when case is closed)
   */
  async removeIncidentsByCase(caseSysId: string): Promise<number> {
    const db = getDb();
    if (!db) return 0;

    try {
      const result = await db
        .delete(incidentEnrichmentStates)
        .where(eq(incidentEnrichmentStates.caseSysId, caseSysId));

      const count = result.rowCount || 0;
      console.log(
        `[Incident Enrichment Repository] Removed ${count} incidents for case ${caseSysId} from watchlist`
      );
      return count;
    } catch (error) {
      console.error(
        `[Incident Enrichment Repository] Error removing incidents for case ${caseSysId}:`,
        error
      );
      return 0;
    }
  }

  /**
   * Get watchlist statistics for monitoring
   */
  async getWatchlistStats(): Promise<{
    totalIncidents: number;
    byStage: Record<string, number>;
    oldestIncident: IncidentEnrichmentState | null;
    averageAge: number;
  }> {
    const db = getDb();
    if (!db) {
      return {
        totalIncidents: 0,
        byStage: {},
        oldestIncident: null,
        averageAge: 0,
      };
    }

    try {
      const allIncidents = await db.select().from(incidentEnrichmentStates);

      const totalIncidents = allIncidents.length;

      // Group by stage
      const byStage = allIncidents.reduce((acc, incident) => {
        acc[incident.enrichmentStage] = (acc[incident.enrichmentStage] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Find oldest
      const oldest = allIncidents.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      )[0] || null;

      // Calculate average age
      const totalAge = allIncidents.reduce((sum, incident) => {
        return sum + (Date.now() - incident.createdAt.getTime());
      }, 0);
      const averageAge = totalIncidents > 0 ? totalAge / totalIncidents / 1000 / 60 : 0; // in minutes

      return {
        totalIncidents,
        byStage,
        oldestIncident: oldest,
        averageAge,
      };
    } catch (error) {
      console.error(
        "[Incident Enrichment Repository] Error getting watchlist stats:",
        error
      );
      return {
        totalIncidents: 0,
        byStage: {},
        oldestIncident: null,
        averageAge: 0,
      };
    }
  }

  /**
   * Get all incidents for a specific case
   */
  async getIncidentsByCase(caseSysId: string): Promise<IncidentEnrichmentState[]> {
    const db = getDb();
    if (!db) return [];

    try {
      return await db
        .select()
        .from(incidentEnrichmentStates)
        .where(eq(incidentEnrichmentStates.caseSysId, caseSysId))
        .orderBy(desc(incidentEnrichmentStates.createdAt));
    } catch (error) {
      console.error(
        `[Incident Enrichment Repository] Error fetching incidents for case ${caseSysId}:`,
        error
      );
      return [];
    }
  }
}

// Singleton instance
let repositoryInstance: IncidentEnrichmentRepository | null = null;

export function getIncidentEnrichmentRepository(): IncidentEnrichmentRepository {
  if (!repositoryInstance) {
    repositoryInstance = new IncidentEnrichmentRepository();
  }
  return repositoryInstance;
}
