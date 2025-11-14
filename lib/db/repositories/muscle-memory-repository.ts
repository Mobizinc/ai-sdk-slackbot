/**
 * Muscle Memory Repository
 * Handles persistence and vector similarity search for agent interaction exemplars
 */

import { eq, and, desc, gte, sql } from "drizzle-orm";
import { getDb } from "../client";
import {
  muscleMemoryExemplars,
  exemplarQualitySignals,
} from "../schema";
import type {
  MuscleMemoryExemplar,
  NewMuscleMemoryExemplar,
  ExemplarQualitySignal,
  NewExemplarQualitySignal,
} from "../schema";

export interface VectorSearchOptions {
  interactionType?: string;
  minQuality?: number;
  topK?: number;
  maxDistance?: number;
}

export interface ExemplarWithDistance extends MuscleMemoryExemplar {
  distance: number;
}

export class MuscleMemoryRepository {
  /**
   * Save a new exemplar with embedding
   */
  async saveExemplar(data: NewMuscleMemoryExemplar): Promise<string | undefined> {
    const db = getDb();
    if (!db) return undefined;

    try {
      const result = await db
        .insert(muscleMemoryExemplars)
        .values(data)
        .returning({ id: muscleMemoryExemplars.id });

      const exemplarId = result[0]?.id;
      console.log(`[MuscleMemory] Saved exemplar ${exemplarId} for case ${data.caseNumber}`);
      return exemplarId;
    } catch (error) {
      console.error(`[MuscleMemory] Error saving exemplar for case ${data.caseNumber}:`, error);
      throw error;
    }
  }

  /**
   * Find similar exemplars using pgvector cosine similarity search
   * Returns exemplars ordered by similarity (lowest distance = most similar)
   */
  async findSimilarExemplars(
    queryEmbedding: number[],
    options: VectorSearchOptions = {}
  ): Promise<ExemplarWithDistance[]> {
    const db = getDb();
    if (!db) return [];

    const {
      interactionType,
      minQuality = 0.6,
      topK = 3,
      maxDistance = 0.5, // Cosine distance threshold (0 = identical, 1 = opposite)
    } = options;

    try {
      // Convert embedding array to pgvector format
      const embeddingStr = JSON.stringify(queryEmbedding);

      // Build query with optional filters
      let query = db
        .select({
          id: muscleMemoryExemplars.id,
          caseNumber: muscleMemoryExemplars.caseNumber,
          interactionType: muscleMemoryExemplars.interactionType,
          inputContext: muscleMemoryExemplars.inputContext,
          actionTaken: muscleMemoryExemplars.actionTaken,
          outcome: muscleMemoryExemplars.outcome,
          embedding: muscleMemoryExemplars.embedding,
          qualityScore: muscleMemoryExemplars.qualityScore,
          qualitySignals: muscleMemoryExemplars.qualitySignals,
          createdAt: muscleMemoryExemplars.createdAt,
          updatedAt: muscleMemoryExemplars.updatedAt,
          distance: sql<number>`${muscleMemoryExemplars.embedding} <=> ${embeddingStr}::vector`,
        })
        .from(muscleMemoryExemplars)
        .where(
          and(
            gte(muscleMemoryExemplars.qualityScore, minQuality),
            interactionType
              ? eq(muscleMemoryExemplars.interactionType, interactionType)
              : undefined
          )
        )
        .orderBy(sql`${muscleMemoryExemplars.embedding} <=> ${embeddingStr}::vector`)
        .limit(topK);

      const results = await query;

      // Filter by max distance threshold
      const filtered = results.filter((r) => r.distance <= maxDistance);

      console.log(
        `[MuscleMemory] Found ${filtered.length} similar exemplars (type: ${interactionType || "all"}, quality >= ${minQuality})`
      );

      return filtered as ExemplarWithDistance[];
    } catch (error) {
      console.error("[MuscleMemory] Error finding similar exemplars:", error);
      return [];
    }
  }

  /**
   * Get exemplar by ID
   */
  async getExemplarById(id: string): Promise<MuscleMemoryExemplar | undefined> {
    const db = getDb();
    if (!db) return undefined;

    try {
      const result = await db
        .select()
        .from(muscleMemoryExemplars)
        .where(eq(muscleMemoryExemplars.id, id))
        .limit(1);

      return result[0];
    } catch (error) {
      console.error(`[MuscleMemory] Error getting exemplar ${id}:`, error);
      return undefined;
    }
  }

  /**
   * Get exemplars by case number
   */
  async getExemplarsByCaseNumber(caseNumber: string): Promise<MuscleMemoryExemplar[]> {
    const db = getDb();
    if (!db) return [];

    try {
      const results = await db
        .select()
        .from(muscleMemoryExemplars)
        .where(eq(muscleMemoryExemplars.caseNumber, caseNumber))
        .orderBy(desc(muscleMemoryExemplars.createdAt));

      return results;
    } catch (error) {
      console.error(`[MuscleMemory] Error getting exemplars for case ${caseNumber}:`, error);
      return [];
    }
  }

  /**
   * Get top N exemplars by quality score for a given interaction type
   */
  async getTopExemplarsByQuality(
    interactionType: string,
    limit: number = 10
  ): Promise<MuscleMemoryExemplar[]> {
    const db = getDb();
    if (!db) return [];

    try {
      const results = await db
        .select()
        .from(muscleMemoryExemplars)
        .where(eq(muscleMemoryExemplars.interactionType, interactionType))
        .orderBy(desc(muscleMemoryExemplars.qualityScore))
        .limit(limit);

      return results;
    } catch (error) {
      console.error(
        `[MuscleMemory] Error getting top exemplars for type ${interactionType}:`,
        error
      );
      return [];
    }
  }

  /**
   * Update exemplar quality score and signals
   */
  async updateExemplarQuality(
    id: string,
    qualityScore: number,
    qualitySignals: Record<string, any>
  ): Promise<void> {
    const db = getDb();
    if (!db) return;

    try {
      await db
        .update(muscleMemoryExemplars)
        .set({
          qualityScore,
          qualitySignals,
          updatedAt: new Date(),
        })
        .where(eq(muscleMemoryExemplars.id, id));

      console.log(`[MuscleMemory] Updated quality for exemplar ${id}: ${qualityScore}`);
    } catch (error) {
      console.error(`[MuscleMemory] Error updating exemplar ${id} quality:`, error);
      throw error;
    }
  }

  /**
   * Save a quality signal for an exemplar
   */
  async saveQualitySignal(data: NewExemplarQualitySignal): Promise<void> {
    const db = getDb();
    if (!db) return;

    try {
      await db.insert(exemplarQualitySignals).values(data);

      console.log(`[MuscleMemory] Saved ${data.signalType} signal for exemplar ${data.exemplarId}`);
    } catch (error) {
      console.error(
        `[MuscleMemory] Error saving quality signal for exemplar ${data.exemplarId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get all quality signals for an exemplar
   */
  async getQualitySignals(exemplarId: string): Promise<ExemplarQualitySignal[]> {
    const db = getDb();
    if (!db) return [];

    try {
      const results = await db
        .select()
        .from(exemplarQualitySignals)
        .where(eq(exemplarQualitySignals.exemplarId, exemplarId))
        .orderBy(desc(exemplarQualitySignals.recordedAt));

      return results;
    } catch (error) {
      console.error(`[MuscleMemory] Error getting quality signals for exemplar ${exemplarId}:`, error);
      return [];
    }
  }

  /**
   * Check if a similar exemplar already exists (de-duplication)
   * Uses high similarity threshold (0.05 distance = 95%+ similar)
   * Searches across ALL cases for the interaction type to catch true duplicates
   */
  async findDuplicateExemplar(
    embedding: number[],
    interactionType: string
  ): Promise<MuscleMemoryExemplar | undefined> {
    const db = getDb();
    if (!db) return undefined;

    try {
      const embeddingStr = JSON.stringify(embedding);

      const results = await db
        .select({
          id: muscleMemoryExemplars.id,
          caseNumber: muscleMemoryExemplars.caseNumber,
          interactionType: muscleMemoryExemplars.interactionType,
          inputContext: muscleMemoryExemplars.inputContext,
          actionTaken: muscleMemoryExemplars.actionTaken,
          outcome: muscleMemoryExemplars.outcome,
          embedding: muscleMemoryExemplars.embedding,
          qualityScore: muscleMemoryExemplars.qualityScore,
          qualitySignals: muscleMemoryExemplars.qualitySignals,
          createdAt: muscleMemoryExemplars.createdAt,
          updatedAt: muscleMemoryExemplars.updatedAt,
          distance: sql<number>`${muscleMemoryExemplars.embedding} <=> ${embeddingStr}::vector`,
        })
        .from(muscleMemoryExemplars)
        .where(eq(muscleMemoryExemplars.interactionType, interactionType))
        .orderBy(sql`${muscleMemoryExemplars.embedding} <=> ${embeddingStr}::vector`)
        .limit(1);

      const candidate = results[0];

      // Consider it a duplicate if distance < 0.05 (95%+ similar)
      if (candidate && candidate.distance < 0.05) {
        console.log(
          `[MuscleMemory] Found duplicate exemplar ${candidate.id} from case ${candidate.caseNumber} (distance: ${candidate.distance})`
        );
        return candidate as MuscleMemoryExemplar;
      }

      return undefined;
    } catch (error) {
      console.error("[MuscleMemory] Error checking for duplicate exemplar:", error);
      return undefined;
    }
  }

  /**
   * Get exemplar count by interaction type
   */
  async getExemplarCountByType(interactionType?: string): Promise<number> {
    const db = getDb();
    if (!db) return 0;

    try {
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(muscleMemoryExemplars)
        .where(
          interactionType ? eq(muscleMemoryExemplars.interactionType, interactionType) : undefined
        );

      return Number(result[0]?.count ?? 0);
    } catch (error) {
      console.error("[MuscleMemory] Error getting exemplar count:", error);
      return 0;
    }
  }

  /**
   * Get all distinct interaction types currently in the database
   * Supports dynamic analytics without hard-coding type lists
   */
  async getDistinctInteractionTypes(): Promise<string[]> {
    const db = getDb();
    if (!db) return [];

    try {
      const result = await db
        .selectDistinct({ type: muscleMemoryExemplars.interactionType })
        .from(muscleMemoryExemplars)
        .orderBy(muscleMemoryExemplars.interactionType);

      return result.map((r) => r.type);
    } catch (error) {
      console.error("[MuscleMemory] Error getting distinct interaction types:", error);
      return [];
    }
  }
}

// Export singleton instance
export const muscleMemoryRepository = new MuscleMemoryRepository();
