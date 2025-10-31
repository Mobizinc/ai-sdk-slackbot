/**
 * Case Triage Cache
 *
 * Two-layer caching strategy for case classifications to optimize performance
 * and prevent duplicate LLM calls.
 *
 * **Layer 1: Idempotency Guard (5 minute window)**
 * - Prevents duplicate work from webhook retries
 * - Catches partial failures and QStash redelivery
 * - Key: case_number only
 * - TTL: 5 minutes (configurable)
 *
 * **Layer 2: Workflow Cache (until assignment changes)**
 * - Reuses classification if workflow and assignment unchanged
 * - Key: case_number + workflow_id + assignment_group
 * - Invalidated by: Assignment group change (indicates re-routing)
 * - TTL: Indefinite (until invalidation condition)
 *
 * **Cache Hit Benefits:**
 * - Saves ~$0.05-0.10 per classification (LLM cost)
 * - Reduces latency from ~2-3s to ~50-100ms
 * - Prevents unnecessary ServiceNow API calls
 *
 * @module case-triage/cache
 *
 * @example
 * ```typescript
 * const cache = new TriageCache(repository);
 *
 * // Check idempotency (Layer 1)
 * const recent = await cache.checkIdempotency("SCS0012345", 5);
 * if (recent.hit) {
 *   return recent.data; // Skip re-classification
 * }
 *
 * // Check workflow cache (Layer 2)
 * const cached = await cache.checkWorkflowCache({
 *   caseNumber: "SCS0012345",
 *   workflowId: "standard",
 *   assignmentGroup: "IT Support"
 * });
 * if (cached.hit) {
 *   return cached.data; // Reuse previous classification
 * }
 *
 * // Cache miss - proceed with classification
 * ```
 */

import type { CaseTriageResult, CacheResult, CacheKey } from "./types";
import type { SimilarCaseResult } from "../../schemas/servicenow-webhook";
import type { KBArticle } from "../kb-article-search";
import type { CaseClassificationRepository } from "../../db/repositories/case-classification-repository";

/**
 * Two-layer cache for case triage operations
 *
 * **Architecture:**
 * - Layer 1 checked first (idempotency - short TTL)
 * - Layer 2 checked second (workflow - conditional TTL)
 * - Both layers query same DB table but use different cache keys
 *
 * **Performance:**
 * - Cache hit: ~50-100ms (DB query only)
 * - Cache miss: ~2-3s (full LLM classification)
 * - Typical hit rate: 15-25% (configurable workflows increase this)
 */
export class TriageCache {
  /**
   * @param repository - Database repository for classification lookups
   */
  constructor(private repository: CaseClassificationRepository) {}

  /**
   * Layer 1: Idempotency Guard
   *
   * Check if case was classified very recently to prevent duplicate work
   * from webhook retries or partial failures.
   *
   * **Use Case:**
   * - QStash webhook retries (if initial processing took >30s)
   * - ServiceNow webhook redelivery on network errors
   * - Duplicate events from ServiceNow business rules
   *
   * **Cache Key:** case_number only (simplest possible key)
   *
   * **Time Window:** Default 5 minutes (IDEMPOTENCY_WINDOW_MINUTES)
   *
   * @param caseNumber - ServiceNow case number
   * @param withinMinutes - Time window in minutes for considering result "recent"
   * @returns Cache result with hit status, data if found, age in minutes
   *
   * @example
   * ```typescript
   * // Check if classified in last 5 minutes
   * const result = await cache.checkIdempotency("SCS0012345", 5);
   *
   * if (result.hit) {
   *   console.log(`Cache HIT - ${result.age} minutes old`);
   *   return result.data; // Skip re-classification
   * }
   *
   * console.log("Cache MISS - proceeding with classification");
   * ```
   *
   * **Performance:**
   * - Hit: Returns in ~50ms (single DB query)
   * - Miss: Returns in ~50ms (no additional work)
   * - Saves: ~$0.05-0.10 + 2-3s latency on hit
   */
  async checkIdempotency(
    caseNumber: string,
    withinMinutes: number
  ): Promise<CacheResult<CaseTriageResult>> {
    try {
      const latestResult = await this.repository.getLatestClassificationResult(caseNumber);

      if (!latestResult) {
        return { hit: false };
      }

      // Check if classification is recent
      const ageMs = Date.now() - latestResult.createdAt.getTime();
      const ageMinutes = ageMs / 60000;

      if (ageMinutes > withinMinutes) {
        return { hit: false }; // Too old for idempotency guard
      }

      console.log(
        `[Case Triage Cache] Idempotency HIT for ${caseNumber} ` +
        `(${Math.round(ageMinutes * 60)}s ago)`
      );

      const cachedClassification = latestResult.classificationJson as any;

      const data: CaseTriageResult = {
        caseNumber,
        caseSysId: (cachedClassification as any).sys_id || "",
        workflowId: latestResult.workflowId,
        classification: cachedClassification,
        similarCases: ((cachedClassification as any).similar_cases || []) as SimilarCaseResult[],
        kbArticles: ((cachedClassification as any).kb_articles || []) as KBArticle[],
        servicenowUpdated: latestResult.servicenowUpdated,
        processingTimeMs: latestResult.processingTimeMs,
        entitiesDiscovered: latestResult.entitiesCount,
        cached: true,
        cacheReason: `Recent classification (${Math.round(ageMinutes * 60)}s ago)`,
        incidentCreated: false,
        problemCreated: false,
        catalogRedirected: false,
        recordTypeSuggestion: (cachedClassification as any).record_type_suggestion,
      };

      return {
        hit: true,
        data,
        reason: data.cacheReason,
        age: ageMinutes,
      };
    } catch (error) {
      console.error("[Case Triage Cache] Error checking idempotency:", error);
      return { hit: false };
    }
  }

  /**
   * Layer 2: Workflow Cache
   *
   * Check if classification exists for same workflow + assignment group.
   * Reuses previous classification unless routing changed.
   *
   * **Cache Key:** case_number + workflow_id + assignment_group
   *
   * **Invalidation Rules:**
   * - Workflow ID changed → Cache MISS (different classification approach)
   * - Assignment group changed → Cache MISS (case was re-routed)
   * - Same workflow + assignment → Cache HIT (stable routing)
   *
   * **Use Case:**
   * - Case updated by user (description, priority, etc.) but routing unchanged
   * - Multiple webhook events for same case (ServiceNow update triggers)
   * - Background triage jobs re-processing same cases
   *
   * @param key - Cache key components
   * @param key.caseNumber - ServiceNow case number
   * @param key.workflowId - Workflow identifier (e.g., "standard", "expedited")
   * @param key.assignmentGroup - Current assignment group or null
   * @returns Cache result with hit status and data if found
   *
   * @example
   * ```typescript
   * const result = await cache.checkWorkflowCache({
   *   caseNumber: "SCS0012345",
   *   workflowId: "standard",
   *   assignmentGroup: "IT Support"
   * });
   *
   * if (result.hit) {
   *   console.log("Workflow cache HIT - routing unchanged");
   *   return result.data;
   * }
   *
   * // Cache miss reasons:
   * // - No previous classification
   * // - Workflow changed (standard → expedited)
   * // - Assignment group changed (re-routing occurred)
   * ```
   *
   * **Performance:**
   * - Provides long-term caching beyond idempotency window
   * - No TTL - valid until routing changes
   * - Particularly effective for cases that receive multiple updates
   */
  async checkWorkflowCache(
    key: CacheKey
  ): Promise<CacheResult<CaseTriageResult>> {
    try {
      const latestResult = await this.repository.getLatestClassificationResult(key.caseNumber);

      if (!latestResult) {
        return { hit: false };
      }

      // Check if workflow matches
      if (latestResult.workflowId !== key.workflowId) {
        console.log(
          `[Case Triage Cache] Workflow changed: ${latestResult.workflowId} → ${key.workflowId}`
        );
        return { hit: false };
      }

      // Check if assignment group matches (from routing_context)
      const cachedRouting = latestResult.classificationJson as any;
      const cachedAssignmentGroup = cachedRouting.assignment_group;

      if (
        key.assignmentGroup &&
        cachedAssignmentGroup &&
        cachedAssignmentGroup !== key.assignmentGroup
      ) {
        console.log(
          `[Case Triage Cache] Assignment group changed: ${cachedAssignmentGroup} → ${key.assignmentGroup}`
        );
        return { hit: false };
      }

      // Cache hit - return cached result
      console.log(
        `[Case Triage Cache] Workflow cache HIT for ${key.caseNumber} + ${key.workflowId}`
      );

      const cachedClassification = latestResult.classificationJson as any;

      const data: CaseTriageResult = {
        caseNumber: key.caseNumber,
        caseSysId: cachedRouting.sys_id || "",
        workflowId: latestResult.workflowId,
        classification: cachedClassification,
        similarCases: (cachedRouting.similar_cases || []) as SimilarCaseResult[],
        kbArticles: (cachedRouting.kb_articles || []) as KBArticle[],
        servicenowUpdated: latestResult.servicenowUpdated,
        processingTimeMs: latestResult.processingTimeMs,
        entitiesDiscovered: latestResult.entitiesCount,
        cached: true,
        cacheReason: "Previous classification found for same case + workflow + assignment",
        incidentCreated: false, // Cached results don't trigger new operations
        problemCreated: false,
        recordTypeSuggestion: cachedClassification.record_type_suggestion,
        catalogRedirected: false,
        catalogItemsProvided: 0,
      };

      return {
        hit: true,
        data,
        reason: data.cacheReason,
      };
    } catch (error) {
      console.error("[Case Triage Cache] Error checking workflow cache:", error);
      return { hit: false };
    }
  }
}
