/**
 * Exemplar Collection Service
 * Captures high-quality agent interactions for muscle memory learning
 *
 * Responsibilities:
 * - Filter interactions for exemplar-worthiness
 * - Extract embeddable context summaries
 * - De-duplicate similar exemplars
 * - Coordinate with quality detector and storage layer
 */

import { qualityDetector, type QualitySignal, DEFAULT_EXEMPLAR_QUALITY_THRESHOLD } from "./quality-detector";
import type { DiscoveryContextPack } from "../../agent/discovery/context-pack";
import type { CaseClassification } from "../case-classifier";
import { getConfigValue } from "../../config";

/**
 * Interaction data captured for potential exemplar storage
 */
export interface InteractionCapture {
  caseNumber: string;
  interactionType: "triage" | "kb_generation" | "escalation" | "connectivity" | "discovery" | "generic";
  inputContext: {
    discoveryPack?: DiscoveryContextPack;
    caseSnapshot?: Record<string, any>;
    userRequest?: string;
  };
  actionTaken: {
    agentType: string;
    classification?: CaseClassification;
    workNotes?: string[];
    escalations?: Record<string, any>[];
    kbArticle?: Record<string, any>;
    diagnostics?: Record<string, any>;
  };
  outcome: "success" | "partial_success" | "failure" | "user_corrected";
  qualitySignals: QualitySignal[];
}

/**
 * Exemplar capture decision
 */
export interface CaptureDecision {
  shouldCapture: boolean;
  reason: string;
  qualityScore: number;
  isDuplicate?: boolean;
}

/**
 * Exemplar Collection Service
 */
export class CollectionService {
  /**
   * Decide whether to capture an interaction as an exemplar
   */
  async shouldCaptureExemplar(interaction: InteractionCapture): Promise<CaptureDecision> {
    // Calculate quality score from signals
    const assessment = qualityDetector.aggregateSignals(interaction.qualitySignals);

    // Get configurable threshold (defaults to 0.6)
    const qualityThreshold = getConfigValue("muscleMemoryQualityThreshold") || DEFAULT_EXEMPLAR_QUALITY_THRESHOLD;

    // Check quality threshold
    if (assessment.overallScore < qualityThreshold) {
      return {
        shouldCapture: false,
        reason: `Quality score ${assessment.overallScore.toFixed(2)} below threshold ${qualityThreshold}`,
        qualityScore: assessment.overallScore,
      };
    }

    // Filter out failure outcomes (even if quality signals are positive)
    if (interaction.outcome === "failure") {
      return {
        shouldCapture: false,
        reason: "Interaction outcome was failure",
        qualityScore: assessment.overallScore,
      };
    }

    // User-corrected interactions are valuable but scored lower
    if (interaction.outcome === "user_corrected" && assessment.overallScore < 0.7) {
      return {
        shouldCapture: false,
        reason: "User-corrected interaction requires higher quality score (≥0.7)",
        qualityScore: assessment.overallScore,
      };
    }

    return {
      shouldCapture: true,
      reason: `High-quality interaction (score: ${assessment.overallScore.toFixed(2)})`,
      qualityScore: assessment.overallScore,
    };
  }

  /**
   * Extract embeddable summary from context
   * Creates a compact representation suitable for semantic search
   */
  summarizeContext(interaction: InteractionCapture): string {
    const parts: string[] = [];

    // Case identification
    parts.push(`Case: ${interaction.caseNumber}`);
    parts.push(`Type: ${interaction.interactionType}`);

    // User request (if available)
    if (interaction.inputContext.userRequest) {
      const request = interaction.inputContext.userRequest.substring(0, 200);
      parts.push(`Request: ${request}`);
    }

    // Discovery context highlights
    if (interaction.inputContext.discoveryPack) {
      const pack = interaction.inputContext.discoveryPack;

      if (pack.businessContext?.entityName) {
        parts.push(`Client: ${pack.businessContext.entityName}`);
      }

      if (pack.businessContext?.technologyPortfolio) {
        parts.push(`Tech: ${pack.businessContext.technologyPortfolio}`);
      }

      if (pack.policyAlerts && pack.policyAlerts.length > 0) {
        const alerts = pack.policyAlerts.slice(0, 2).map((a) => a.type);
        parts.push(`Alerts: ${alerts.join(", ")}`);
      }
    }

    // Classification summary (if available)
    if (interaction.actionTaken.classification) {
      const cls = interaction.actionTaken.classification;
      if (cls.category) {
        parts.push(`Category: ${cls.category}`);
      }
      if (cls.quick_summary) {
        const summary = cls.quick_summary.substring(0, 150);
        parts.push(`Summary: ${summary}`);
      }
    }

    // Work notes/KB content (first work note or KB title)
    if (interaction.actionTaken.workNotes && interaction.actionTaken.workNotes.length > 0) {
      const firstNote = interaction.actionTaken.workNotes[0].substring(0, 150);
      parts.push(`Action: ${firstNote}`);
    } else if (interaction.actionTaken.kbArticle?.title) {
      parts.push(`KB: ${interaction.actionTaken.kbArticle.title}`);
    }

    // Outcome
    parts.push(`Outcome: ${interaction.outcome}`);

    return parts.join(" | ");
  }

  /**
   * Prepare exemplar for storage
   * Returns structured data ready for embedding generation
   */
  prepareExemplar(interaction: InteractionCapture, qualityScore: number) {
    const assessment = qualityDetector.aggregateSignals(interaction.qualitySignals);

    return {
      caseNumber: interaction.caseNumber,
      interactionType: interaction.interactionType,
      inputContext: interaction.inputContext,
      actionTaken: interaction.actionTaken,
      outcome: interaction.outcome,
      qualityScore,
      qualitySignals: assessment.summary,
      embeddableSummary: this.summarizeContext(interaction),
    };
  }
}

// Export singleton instance
export const collectionService = new CollectionService();
