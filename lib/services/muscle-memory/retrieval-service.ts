/**
 * Exemplar Retrieval Service
 * Performs semantic search over muscle memory exemplars
 *
 * Provides context-aware retrieval for discovery pack integration
 */

import { getEmbeddingService } from "../embedding-service";
import { muscleMemoryRepository, type ExemplarWithDistance } from "../../db/repositories/muscle-memory-repository";
import { getConfigValue } from "../../config";
import type { DiscoveryContextPack } from "../../agent/discovery/context-pack";

/**
 * Exemplar summary formatted for discovery pack
 */
export interface MuscleMemoryExemplarSummary {
  caseNumber: string;
  interactionType: string;
  summary: string;
  qualityScore: number;
  similarityScore: number; // 1.0 - distance (higher = more similar)
  actionTaken: string;
  outcome: string;
}

/**
 * Retrieval options
 */
export interface RetrievalOptions {
  interactionType?: string;
  topK?: number;
  minQuality?: number;
  maxDistance?: number;
}

/**
 * Exemplar Retrieval Service
 */
export class RetrievalService {
  /**
   * Find similar exemplars based on context pack
   */
  async findExemplarsForContext(
    contextPack: DiscoveryContextPack,
    options?: RetrievalOptions
  ): Promise<MuscleMemoryExemplarSummary[]> {
    try {
      const enabled = getConfigValue("muscleMemoryRetrievalEnabled");
      if (enabled === false) {
        return [];
      }

      // Build query text from context pack
      const queryText = this.buildQueryFromContext(contextPack);

      if (!queryText) {
        console.log("[MuscleMemory] No queryable context available");
        return [];
      }

      // Generate embedding for query
      const embeddingService = getEmbeddingService();
      const queryEmbedding = await embeddingService.generateEmbedding(queryText);

      // Retrieve similar exemplars
      const topK = options?.topK || getConfigValue("muscleMemoryTopK") || 3;
      const minQuality = options?.minQuality || getConfigValue("muscleMemoryMinQuality") || 0.7;
      const maxDistance = options?.maxDistance || 0.5;

      const exemplars = await muscleMemoryRepository.findSimilarExemplars(queryEmbedding, {
        interactionType: options?.interactionType,
        topK,
        minQuality,
        maxDistance,
      });

      console.log(
        `[MuscleMemory] Retrieved ${exemplars.length} exemplars for context (type: ${options?.interactionType || "all"})`
      );

      // Format for discovery pack
      return exemplars.map((ex) => this.formatForDiscovery(ex));
    } catch (error) {
      console.error("[MuscleMemory] Error retrieving exemplars:", error);
      return [];
    }
  }

  /**
   * Build query text from discovery context pack
   */
  private buildQueryFromContext(contextPack: DiscoveryContextPack): string {
    const parts: string[] = [];

    // Business context
    if (contextPack.businessContext) {
      if (contextPack.businessContext.entityName) {
        parts.push(`Client: ${contextPack.businessContext.entityName}`);
      }
      if (contextPack.businessContext.technologyPortfolio) {
        parts.push(`Technology: ${contextPack.businessContext.technologyPortfolio}`);
      }
    }

    // Similar cases (first case excerpt)
    if (contextPack.similarCases && contextPack.similarCases.cases.length > 0) {
      const firstCase = contextPack.similarCases.cases[0];
      parts.push(`Issue: ${firstCase.excerpt.substring(0, 100)}`);
    }

    // CMDB hits
    if (contextPack.cmdbHits && contextPack.cmdbHits.items.length > 0) {
      const ciNames = contextPack.cmdbHits.items.slice(0, 2).map((ci) => ci.name);
      parts.push(`CIs: ${ciNames.join(", ")}`);
    }

    // Policy alerts
    if (contextPack.policyAlerts && contextPack.policyAlerts.length > 0) {
      const alertTypes = contextPack.policyAlerts.slice(0, 2).map((a) => a.type);
      parts.push(`Alerts: ${alertTypes.join(", ")}`);
    }

    // Recent Slack messages (last user message)
    if (contextPack.slackRecent && contextPack.slackRecent.messages.length > 0) {
      const lastMsg = contextPack.slackRecent.messages[contextPack.slackRecent.messages.length - 1];
      if (lastMsg.text) {
        parts.push(`Recent: ${lastMsg.text.substring(0, 100)}`);
      }
    }

    return parts.join(" | ");
  }

  /**
   * Format exemplar for discovery pack inclusion
   */
  private formatForDiscovery(exemplar: ExemplarWithDistance): MuscleMemoryExemplarSummary {
    // Extract action summary from action_taken
    let actionSummary = "Action taken";
    if (exemplar.actionTaken) {
      const action = exemplar.actionTaken as any;
      if (action.classification?.quick_summary) {
        actionSummary = action.classification.quick_summary.substring(0, 150);
      } else if (action.workNotes && action.workNotes.length > 0) {
        actionSummary = action.workNotes[0].substring(0, 150);
      } else if (action.kbArticle?.title) {
        actionSummary = `KB: ${action.kbArticle.title}`;
      } else if (action.diagnostics) {
        actionSummary = "Diagnostic analysis performed";
      }
    }

    // Extract context summary from input_context
    let contextSummary = `${exemplar.interactionType} interaction`;
    if (exemplar.inputContext) {
      const ctx = exemplar.inputContext as any;
      if (ctx.userRequest) {
        contextSummary = ctx.userRequest.substring(0, 100);
      } else if (ctx.caseSnapshot?.short_description) {
        contextSummary = ctx.caseSnapshot.short_description.substring(0, 100);
      }
    }

    // Convert distance to similarity score (lower distance = higher similarity)
    const similarityScore = 1.0 - exemplar.distance;

    return {
      caseNumber: exemplar.caseNumber,
      interactionType: exemplar.interactionType,
      summary: contextSummary,
      qualityScore: exemplar.qualityScore,
      similarityScore: Math.round(similarityScore * 100) / 100, // Round to 2 decimals
      actionTaken: actionSummary,
      outcome: exemplar.outcome,
    };
  }

  /**
   * Find top exemplars by quality for a given interaction type
   * Useful for analytics/review
   */
  async getTopExemplars(
    interactionType: string,
    limit: number = 10
  ): Promise<MuscleMemoryExemplarSummary[]> {
    try {
      const exemplars = await muscleMemoryRepository.getTopExemplarsByQuality(interactionType, limit);

      return exemplars.map((ex) => ({
        caseNumber: ex.caseNumber,
        interactionType: ex.interactionType,
        summary: `High-quality ${ex.interactionType} interaction`,
        qualityScore: ex.qualityScore,
        similarityScore: 1.0, // Not applicable for quality-based retrieval
        actionTaken: "See action_taken field",
        outcome: ex.outcome,
      }));
    } catch (error) {
      console.error(`[MuscleMemory] Error getting top exemplars for ${interactionType}:`, error);
      return [];
    }
  }
}

// Export singleton instance
export const retrievalService = new RetrievalService();
