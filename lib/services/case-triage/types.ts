/**
 * Case Triage Types
 *
 * Shared type definitions for the case triage modular system.
 */

import type { CaseClassification } from "../case-classifier";
import type { SimilarCaseResult, ServiceNowCaseWebhook } from "../../schemas/servicenow-webhook";
import type { KBArticle } from "../kb-article-search";
import type { ClassificationConfig } from "./constants";
import type { RoutingResult } from "../workflow-router";

export interface CaseTriageOptions {
  /**
   * Enable classification caching
   * If true, checks for existing classification before running LLM
   */
  enableCaching?: boolean;

  /**
   * Enable similar case search
   * If true, fetches similar cases from Azure AI Search for context
   */
  enableSimilarCases?: boolean;

  /**
   * Enable KB article search
   * If true, fetches relevant KB articles for context
   */
  enableKBArticles?: boolean;

  /**
   * Enable business context enrichment
   * If true, enriches prompts with company-specific context
   */
  enableBusinessContext?: boolean;

  /**
   * Enable workflow routing
   * If true, uses WorkflowRouter to determine classification approach
   */
  enableWorkflowRouting?: boolean;

  /**
   * Enable ServiceNow work note writing
   * If true, writes classification results back to ServiceNow
   */
  writeToServiceNow?: boolean;

  /**
   * Enable catalog redirect for HR requests
   * If true, automatically redirects misrouted HR requests to catalog items
   */
  enableCatalogRedirect?: boolean;

  /**
   * Enable CMDB reconciliation
   * If true, performs CMDB entity matching and linking
   */
  cmdbReconciliationEnabled?: boolean;

  /**
   * Max retry attempts for classification
   */
  maxRetries?: number;

  /**
   * Skip quality gate validation
   * Used when resuming case processing after clarification is completed
   * Prevents infinite loops in the quality gate → clarification → resume flow
   */
  skipQualityGate?: boolean;
}

export interface CaseTriageResult {
  caseNumber: string;
  caseSysId: string;
  workflowId: string;
  classification: CaseClassification;
  similarCases: SimilarCaseResult[];
  kbArticles: KBArticle[];
  servicenowUpdated: boolean;
  updateError?: string;
  processingTimeMs: number;
  queueTimeMs?: number; // Time spent in queue before processing
  entitiesDiscovered: number;
  cmdbReconciliation?: any; // TODO: Import proper type from cmdb-reconciliation
  cached: boolean;
  cacheReason?: string;
  // Quality gate fields
  blocked?: boolean;
  qualityGate?: any; // QualityGateResult type
  // ITSM record type fields
  incidentCreated: boolean;
  incidentNumber?: string;
  incidentSysId?: string;
  incidentUrl?: string;
  problemCreated: boolean;
  problemNumber?: string;
  problemSysId?: string;
  problemUrl?: string;
  recordTypeSuggestion?: {
    type: string;
    is_major_incident: boolean;
    reasoning: string;
  };
  // Catalog redirect fields
  catalogRedirected: boolean;
  catalogRedirectReason?: string;
  catalogItemsProvided?: number;
}

export interface ClassificationStageCoreResult {
  caseNumber: string;
  caseSysId: string;
  workflowId: string;
  classification: CaseClassification;
  similarCases: SimilarCaseResult[];
  kbArticles: KBArticle[];
  processingTimeMs: number;
  cached: boolean;
  cacheReason?: string;
  queueTimeMs?: number;
  recordTypeSuggestion?: CaseTriageResult["recordTypeSuggestion"];
}

export interface ClassificationStageMetadata {
  webhook: ServiceNowCaseWebhook;
  workflowDecision: RoutingResult;
  inboundId?: number | null;
  snContext: Record<string, unknown>;
  workNoteContent?: string;
  rawClassificationResult: any;
  fullConfig: ClassificationConfig;
  startTime: number;
  classificationTimeMs: number;
  sideEffectsAlreadyApplied: boolean;
  retrievalStats?: {
    categoriesFetchMs: number;
    applicationsFetchMs: number;
  };
}

// Re-export for backward compatibility
export type WorkflowDecision = RoutingResult;

export interface ClassificationStageResult {
  core: ClassificationStageCoreResult;
  metadata: ClassificationStageMetadata;
  completedResult?: CaseTriageResult;
}

/**
 * Cache lookup result
 */
export interface CacheResult<T> {
  hit: boolean;
  data?: T;
  reason?: string;
  age?: number;
}

/**
 * Cache key for workflow-based caching
 */
export interface CacheKey {
  caseNumber: string;
  workflowId: string;
  assignmentGroup: string | null;
}

/**
 * Classification execution result
 */
export interface ClassificationExecutionResult {
  classification: CaseClassification;
  attemptCount: number;
  totalTimeMs: number;
}

/**
 * Record creation result (Incident/Problem)
 */
export interface RecordCreationResult {
  incidentCreated: boolean;
  incidentNumber?: string;
  incidentSysId?: string;
  incidentUrl?: string;
  problemCreated: boolean;
  problemNumber?: string;
  problemSysId?: string;
  problemUrl?: string;
}

/**
 * Data retrieval result
 */
export interface RetrievalResult {
  categories: {
    data: any; // CategoriesData type
    fetchTimeMs: number;
  };
  applicationServices: any[]; // ApplicationService[] type
  applicationsFetchTimeMs: number;
}
