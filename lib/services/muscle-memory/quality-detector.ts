/**
 * Quality Detector Service
 * Detects and scores quality signals for muscle memory exemplar collection
 *
 * Implements multi-signal quality assessment:
 * - Supervisor approval (weight: 0.4)
 * - Human feedback (weight: 0.3)
 * - Outcome success (weight: 0.2)
 * - Implicit positive signals (weight: 0.1)
 */

import type { SupervisorDecision } from "../../supervisor";
import type { InteractiveState } from "../../db/schema";

/**
 * Quality signal types that contribute to exemplar quality scoring
 */
export type QualitySignalType = "supervisor" | "human_feedback" | "outcome" | "implicit";

/**
 * Individual quality signal with metadata
 */
export interface QualitySignal {
  type: QualitySignalType;
  value: string; // approved, positive, success, clean_interaction, etc.
  weight: number; // contribution to overall quality score
  metadata?: Record<string, any>;
  recordedAt: Date;
}

/**
 * Aggregated quality assessment for an interaction
 */
export interface QualityAssessment {
  signals: QualitySignal[];
  overallScore: number; // 0.0-1.0
  isExemplarWorthy: boolean; // true if score >= threshold
  summary: {
    supervisorApproval?: boolean;
    humanFeedback?: "positive" | "negative" | null;
    outcomeSuccess?: boolean;
    implicitPositive?: boolean;
  };
}

/**
 * Weighted scoring configuration for quality signals
 */
export const QUALITY_WEIGHTS: Record<QualitySignalType, number> = {
  supervisor: 0.4,
  human_feedback: 0.3,
  outcome: 0.2,
  implicit: 0.1,
};

/**
 * Default minimum quality score for exemplar-worthiness
 * Can be overridden via muscleMemoryQualityThreshold config
 */
export const DEFAULT_EXEMPLAR_QUALITY_THRESHOLD = 0.6;

/**
 * Quality Detector Service
 */
export class QualityDetector {
  /**
   * Detect supervisor approval signal
   */
  detectSupervisorSignal(decision: SupervisorDecision): QualitySignal | null {
    if (decision.status === "approved") {
      return {
        type: "supervisor",
        value: "approved",
        weight: QUALITY_WEIGHTS.supervisor,
        metadata: {
          reason: decision.reason,
          llmReview: decision.llmReview,
        },
        recordedAt: new Date(),
      };
    }

    // Blocked artifacts are NOT exemplar-worthy
    return null;
  }

  /**
   * Detect human feedback signal from interactive state
   */
  detectHumanFeedbackSignal(state: InteractiveState): QualitySignal | null {
    // Check if state was approved/completed by a human
    if (state.status === "approved" && state.processedBy) {
      return {
        type: "human_feedback",
        value: "positive",
        weight: QUALITY_WEIGHTS.human_feedback,
        metadata: {
          stateId: state.id,
          stateType: state.type,
          processedBy: state.processedBy,
          processedAt: state.processedAt,
        },
        recordedAt: new Date(),
      };
    }

    if (state.status === "rejected") {
      return {
        type: "human_feedback",
        value: "negative",
        weight: -QUALITY_WEIGHTS.human_feedback, // Negative weight
        metadata: {
          stateId: state.id,
          stateType: state.type,
          processedBy: state.processedBy,
          errorMessage: state.errorMessage,
        },
        recordedAt: new Date(),
      };
    }

    if (state.status === "completed") {
      return {
        type: "human_feedback",
        value: "positive",
        weight: QUALITY_WEIGHTS.human_feedback,
        metadata: {
          stateId: state.id,
          stateType: state.type,
        },
        recordedAt: new Date(),
      };
    }

    return null;
  }

  /**
   * Detect outcome success signal (case resolution, workflow completion)
   */
  detectOutcomeSignal(outcome: {
    success: boolean;
    caseNumber?: string;
    resolutionCode?: string;
    resolvedAt?: Date;
    metadata?: Record<string, any>;
  }): QualitySignal | null {
    if (outcome.success) {
      return {
        type: "outcome",
        value: "success",
        weight: QUALITY_WEIGHTS.outcome,
        metadata: {
          caseNumber: outcome.caseNumber,
          resolutionCode: outcome.resolutionCode,
          resolvedAt: outcome.resolvedAt,
          ...outcome.metadata,
        },
        recordedAt: new Date(),
      };
    }

    return null;
  }

  /**
   * Detect implicit positive signals
   * (no user corrections, no follow-up escalations, clean interaction)
   */
  detectImplicitSignals(context: {
    hadUserCorrection: boolean;
    hadFollowUpEscalation: boolean;
    interactionDurationMs?: number;
    messageCount?: number;
  }): QualitySignal | null {
    // Clean interaction: no corrections, no escalations, reasonable duration
    const isClean =
      !context.hadUserCorrection &&
      !context.hadFollowUpEscalation &&
      (context.messageCount === undefined || context.messageCount <= 5);

    if (isClean) {
      return {
        type: "implicit",
        value: "clean_interaction",
        weight: QUALITY_WEIGHTS.implicit,
        metadata: {
          interactionDurationMs: context.interactionDurationMs,
          messageCount: context.messageCount,
        },
        recordedAt: new Date(),
      };
    }

    return null;
  }

  /**
   * Aggregate multiple signals into overall quality assessment
   */
  aggregateSignals(signals: QualitySignal[]): QualityAssessment {
    // Calculate weighted score
    let totalScore = 0;
    const summary: QualityAssessment["summary"] = {};

    for (const signal of signals) {
      totalScore += signal.weight;

      // Build summary
      switch (signal.type) {
        case "supervisor":
          summary.supervisorApproval = signal.value === "approved";
          break;
        case "human_feedback":
          summary.humanFeedback =
            signal.value === "positive" ? "positive" : signal.value === "negative" ? "negative" : null;
          break;
        case "outcome":
          summary.outcomeSuccess = signal.value === "success";
          break;
        case "implicit":
          summary.implicitPositive = signal.value === "clean_interaction";
          break;
      }
    }

    // Normalize score to 0.0-1.0 range
    const maxPossibleScore = Object.values(QUALITY_WEIGHTS).reduce((sum, w) => sum + w, 0);
    const normalizedScore = Math.max(0, Math.min(1, totalScore / maxPossibleScore));

    return {
      signals,
      overallScore: normalizedScore,
      isExemplarWorthy: normalizedScore >= DEFAULT_EXEMPLAR_QUALITY_THRESHOLD,
      summary,
    };
  }

  /**
   * Quick check: is this interaction exemplar-worthy based on available signals?
   */
  isExemplarWorthy(signals: QualitySignal[]): boolean {
    const assessment = this.aggregateSignals(signals);
    return assessment.isExemplarWorthy;
  }

  /**
   * Calculate quality score from raw signal indicators
   */
  calculateQualityScore(indicators: {
    supervisorApproved?: boolean;
    humanFeedbackPositive?: boolean;
    humanFeedbackNegative?: boolean;
    outcomeSuccess?: boolean;
    implicitClean?: boolean;
  }): number {
    const signals: QualitySignal[] = [];

    if (indicators.supervisorApproved) {
      signals.push({
        type: "supervisor",
        value: "approved",
        weight: QUALITY_WEIGHTS.supervisor,
        recordedAt: new Date(),
      });
    }

    if (indicators.humanFeedbackPositive) {
      signals.push({
        type: "human_feedback",
        value: "positive",
        weight: QUALITY_WEIGHTS.human_feedback,
        recordedAt: new Date(),
      });
    }

    if (indicators.humanFeedbackNegative) {
      signals.push({
        type: "human_feedback",
        value: "negative",
        weight: -QUALITY_WEIGHTS.human_feedback,
        recordedAt: new Date(),
      });
    }

    if (indicators.outcomeSuccess) {
      signals.push({
        type: "outcome",
        value: "success",
        weight: QUALITY_WEIGHTS.outcome,
        recordedAt: new Date(),
      });
    }

    if (indicators.implicitClean) {
      signals.push({
        type: "implicit",
        value: "clean_interaction",
        weight: QUALITY_WEIGHTS.implicit,
        recordedAt: new Date(),
      });
    }

    const assessment = this.aggregateSignals(signals);
    return assessment.overallScore;
  }
}

// Export singleton instance
export const qualityDetector = new QualityDetector();
