/**
 * Case Triage Cache
 *
 * Two-layer caching strategy for case classifications:
 * 1. Idempotency guard - prevents duplicate work from webhook retries (5 min window)
 * 2. Workflow cache - reuses classification if workflow + assignment unchanged
 */

import type { CaseTriageResult, CacheResult, CacheKey } from "./types";
import type { SimilarCaseResult } from "../../schemas/servicenow-webhook";
import type { KBArticle } from "../kb-article-search";
import type { CaseClassificationRepository } from "./storage";

export class TriageCache {
  constructor(private repository: CaseClassificationRepository) {}

  /**
   * Layer 1: Idempotency Guard
   *
   * Check if case was classified very recently to prevent duplicate work
   * from webhook retries or partial failures.
   *
   * @param caseNumber - Case number to check
   * @param withinMinutes - Time window in minutes
   * @returns Cached result if within window, null otherwise
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
   * Cache key: case_number + workflow_id + assignment_group
   *
   * Returns cached result unless assignment group changed (indicates re-routing).
   *
   * @param key - Cache key with case number, workflow ID, assignment group
   * @returns Cached result if valid, null otherwise
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
