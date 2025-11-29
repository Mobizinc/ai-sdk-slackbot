/**
 * Muscle Memory Service
 * Orchestrates exemplar capture: quality detection → embedding generation → de-duplication → storage
 *
 * This is the main entry point for storing high-quality agent interactions
 */

import { getEmbeddingService } from "../embedding-service";
import { muscleMemoryRepository } from "../../db/repositories/muscle-memory-repository";
import { collectionService, type InteractionCapture } from "./collection-service";
import { qualityDetector } from "./quality-detector";
import { getConfigValue } from "../../config";

export interface CaptureResult {
  success: boolean;
  exemplarId?: string;
  reason: string;
  qualityScore?: number;
  wasDuplicate?: boolean;
}

/**
 * Muscle Memory Service
 */
export class MuscleMemoryService {
  /**
   * Capture an interaction as a muscle memory exemplar
   * Main entry point for exemplar collection
   */
  async captureExemplar(interaction: InteractionCapture): Promise<CaptureResult> {
    try {
      // Check if collection is enabled
      const collectionEnabled = getConfigValue("muscleMemoryCollectionEnabled");
      if (collectionEnabled === false) {
        return {
          success: false,
          reason: "Muscle memory collection is disabled",
        };
      }

      // Step 1: Decide if this interaction is worth capturing
      const decision = await collectionService.shouldCaptureExemplar(interaction);

      if (!decision.shouldCapture) {
        console.log(`[MuscleMemory] Skip exemplar: ${decision.reason}`);
        return {
          success: false,
          reason: decision.reason,
          qualityScore: decision.qualityScore,
        };
      }

      // Step 2: Prepare exemplar data
      const exemplar = collectionService.prepareExemplar(interaction, decision.qualityScore);

      // Step 3: Generate embedding from context summary
      const embeddingService = getEmbeddingService();
      const embedding = await embeddingService.generateEmbedding(exemplar.embeddableSummary);

      console.log(
        `[MuscleMemory] Generated embedding for ${interaction.caseNumber} (${embedding.length} dimensions)`
      );

      // Step 4: Check for duplicates (95%+ similar exemplars across all cases)
      const duplicate = await muscleMemoryRepository.findDuplicateExemplar(
        embedding,
        interaction.interactionType
      );

      if (duplicate) {
        console.log(
          `[MuscleMemory] Duplicate exemplar detected (similar to case ${duplicate.caseNumber}), skipping storage`
        );
        return {
          success: false,
          reason: `Similar exemplar already exists from case ${duplicate.caseNumber}`,
          qualityScore: decision.qualityScore,
          wasDuplicate: true,
        };
      }

      // Step 5: Store exemplar with embedding
      const exemplarId = await muscleMemoryRepository.saveExemplar({
        caseNumber: exemplar.caseNumber,
        interactionType: exemplar.interactionType,
        inputContext: exemplar.inputContext,
        actionTaken: exemplar.actionTaken,
        outcome: exemplar.outcome,
        embedding,
        qualityScore: exemplar.qualityScore,
        qualitySignals: exemplar.qualitySignals,
      });

      if (!exemplarId) {
        console.error(`[MuscleMemory] Failed to save exemplar for ${interaction.caseNumber}`);
        return {
          success: false,
          reason: "Database save failed",
        };
      }

      // Step 6: Store individual quality signals for audit trail
      for (const signal of interaction.qualitySignals) {
        await muscleMemoryRepository.saveQualitySignal({
          exemplarId,
          signalType: signal.type,
          signalValue: signal.value,
          signalWeight: signal.weight,
          signalMetadata: signal.metadata,
        });
      }

      console.log(
        `[MuscleMemory] ✅ Captured exemplar ${exemplarId} for ${interaction.caseNumber} (score: ${decision.qualityScore.toFixed(2)})`
      );

      return {
        success: true,
        exemplarId,
        reason: "Exemplar captured successfully",
        qualityScore: decision.qualityScore,
      };
    } catch (error) {
      console.error("[MuscleMemory] Error capturing exemplar:", error);
      return {
        success: false,
        reason: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Update exemplar quality score when new signals arrive
   * (e.g., case resolution comes later, human reviews after initial capture)
   */
  async updateExemplarQuality(
    exemplarId: string,
    newSignals: Array<{ type: string; value: string; weight: number; metadata?: Record<string, any> }>
  ): Promise<boolean> {
    try {
      // Get existing exemplar
      const exemplar = await muscleMemoryRepository.getExemplarById(exemplarId);
      if (!exemplar) {
        console.warn(`[MuscleMemory] Exemplar ${exemplarId} not found for quality update`);
        return false;
      }

      // Get existing signals
      const existingSignals = await muscleMemoryRepository.getQualitySignals(exemplarId);

      // Combine old and new signals
      const allSignalData = [
        ...existingSignals.map((s) => ({
          type: s.signalType as any,
          value: s.signalValue,
          weight: s.signalWeight,
          metadata: s.signalMetadata,
          recordedAt: s.recordedAt,
        })),
        ...newSignals.map((s) => ({ ...s, recordedAt: new Date() })),
      ];

      // Recalculate quality score
      const newQualityScore = qualityDetector.calculateQualityScore({
        supervisorApproved: allSignalData.some((s) => s.type === "supervisor" && s.value === "approved"),
        humanFeedbackPositive: allSignalData.some(
          (s) => s.type === "human_feedback" && s.value === "positive"
        ),
        humanFeedbackNegative: allSignalData.some(
          (s) => s.type === "human_feedback" && s.value === "negative"
        ),
        outcomeSuccess: allSignalData.some((s) => s.type === "outcome" && s.value === "success"),
        implicitClean: allSignalData.some((s) => s.type === "implicit" && s.value === "clean_interaction"),
      });

      // Update quality signals in exemplar
      const updatedSummary = {
        supervisorApproval: allSignalData.some((s) => s.type === "supervisor" && s.value === "approved"),
        humanFeedback: allSignalData.find((s) => s.type === "human_feedback")?.value as
          | "positive"
          | "negative"
          | null,
        outcomeSuccess: allSignalData.some((s) => s.type === "outcome" && s.value === "success"),
        implicitPositive: allSignalData.some((s) => s.type === "implicit"),
        signalWeights: {
          supervisor: QUALITY_WEIGHTS.supervisor,
          human_feedback: QUALITY_WEIGHTS.human_feedback,
          outcome: QUALITY_WEIGHTS.outcome,
          implicit: QUALITY_WEIGHTS.implicit,
        },
      };

      // Update in database
      await muscleMemoryRepository.updateExemplarQuality(exemplarId, newQualityScore, updatedSummary);

      // Store new signals
      for (const signal of newSignals) {
        await muscleMemoryRepository.saveQualitySignal({
          exemplarId,
          signalType: signal.type,
          signalValue: signal.value,
          signalWeight: signal.weight,
          signalMetadata: signal.metadata,
        });
      }

      console.log(`[MuscleMemory] Updated exemplar ${exemplarId} quality score: ${newQualityScore.toFixed(2)}`);

      return true;
    } catch (error) {
      console.error(`[MuscleMemory] Error updating exemplar ${exemplarId} quality:`, error);
      return false;
    }
  }

  /**
   * Get exemplar count statistics
   * Dynamically queries all distinct interaction types from the database
   */
  async getStats(interactionType?: string): Promise<{
    total: number;
    byType?: Record<string, number>;
  }> {
    const total = await muscleMemoryRepository.getExemplarCountByType(interactionType);

    if (interactionType) {
      return { total };
    }

    // Get counts by type - query distinct types from database
    const allTypes = await muscleMemoryRepository.getDistinctInteractionTypes();
    const byType: Record<string, number> = {};

    for (const type of allTypes) {
      byType[type] = await muscleMemoryRepository.getExemplarCountByType(type);
    }

    return { total, byType };
  }
}

// Import quality weights for update method
import { QUALITY_WEIGHTS } from "./quality-detector";

// Export singleton instance
export const muscleMemoryService = new MuscleMemoryService();
