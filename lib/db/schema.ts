/**
 * Drizzle ORM Database Schema
 * Defines tables for case context persistence and KB generation state tracking
 */

import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  serial,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  real,
  uuid,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Custom pgvector type for semantic search
 * Supports vector embeddings with specified dimensions (default: 1536 for OpenAI text-embedding-3-small)
 */
const vector = customType<{ data: number[]; config: { dimensions: number } }>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value: number[]): string {
    return JSON.stringify(value);
  },
  fromDriver(value: unknown): number[] {
    if (typeof value === "string") {
      // pgvector returns vectors as strings like "[0.1,0.2,0.3]"
      return JSON.parse(value) as number[];
    }
    if (Array.isArray(value)) {
      return value as number[];
    }
    throw new Error(`Unsupported vector value: ${String(value)}`);
  },
});

/**
 * Case Contexts Table
 * Tracks case-related conversations across Slack threads
 */
export const caseContexts = pgTable(
  "case_contexts",
  {
    caseNumber: text("case_number").notNull(),
    threadTs: text("thread_ts").notNull(),
    channelId: text("channel_id").notNull(),
    channelName: text("channel_name"),
    channelTopic: text("channel_topic"),
    channelPurpose: text("channel_purpose"),
    isResolved: boolean("is_resolved").default(false).notNull(),
    resolvedAt: timestamp("resolved_at"),
    detectedAt: timestamp("detected_at").notNull().defaultNow(),
    lastUpdated: timestamp("last_updated").notNull().defaultNow(),
    notified: boolean("notified").default(false).notNull(),
    hasPostedAssistance: boolean("has_posted_assistance").default(false).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.caseNumber, table.threadTs] }),
    resolvedIdx: index("idx_resolved").on(table.isResolved, table.notified),
    caseNumberIdx: index("idx_case_number").on(table.caseNumber),
    lastUpdatedIdx: index("idx_last_updated").on(table.lastUpdated),
  })
);

/**
 * Case Messages Table
 * Stores individual messages within case conversation threads
 */
export const caseMessages = pgTable(
  "case_messages",
  {
    id: serial("id").primaryKey(),
    caseNumber: text("case_number").notNull(),
    threadTs: text("thread_ts").notNull(),
    userId: text("user_id").notNull(),
    messageText: text("message_text").notNull(),
    messageTimestamp: text("message_timestamp").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    caseThreadIdx: index("idx_case_thread").on(table.caseNumber, table.threadTs),
    timestampIdx: index("idx_timestamp").on(table.messageTimestamp),
  })
);

/**
 * KB Generation States Table
 * Tracks multi-stage KB generation workflow state
 */
export const kbGenerationStates = pgTable(
  "kb_generation_states",
  {
    caseNumber: text("case_number").notNull(),
    threadTs: text("thread_ts").notNull(),
    channelId: text("channel_id").notNull(),
    state: text("state").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    userResponses: jsonb("user_responses").$type<string[]>().default([]).notNull(),
    assessmentScore: integer("assessment_score"),
    missingInfo: jsonb("missing_info").$type<string[]>().default([]).notNull(),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    lastUpdated: timestamp("last_updated").notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.caseNumber, table.threadTs] }),
    stateIdx: index("idx_state").on(table.state),
    lastUpdatedStateIdx: index("idx_last_updated_state").on(table.lastUpdated),
  })
);

/**
 * Case Queue Snapshots Table
 * Stores periodic snapshots of Service Desk queue metrics by assignee
 */
export const caseQueueSnapshots = pgTable(
  "case_queue_snapshots",
  {
    id: serial("id").primaryKey(),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    assignedTo: text("assigned_to").notNull(),
    assignedToEmail: text("assigned_to_email"),
    assignmentGroup: text("assignment_group"),
    openCases: integer("open_cases").notNull(),
    highPriorityCases: integer("high_priority_cases").notNull().default(0),
    escalatedCases: integer("escalated_cases").notNull().default(0),
    lastSeenUtc: timestamp("last_seen_utc", { withTimezone: true }),
    source: text("source").notNull().default("azure_sql"),
    rawPayload: jsonb("raw_payload"),
  },
  (table) => ({
    snapshotIdx: index("idx_case_queue_snapshot_timestamp").on(table.snapshotAt),
    assigneeIdx: index("idx_case_queue_snapshot_assignee").on(table.assignedTo),
    uniqueSnapshotAssignee: uniqueIndex("uq_case_queue_snapshot").on(
      table.snapshotAt,
      table.assignedTo
    ),
  })
);

export type CaseQueueSnapshot = typeof caseQueueSnapshots.$inferSelect;
export type NewCaseQueueSnapshot = typeof caseQueueSnapshots.$inferInsert;

/**
 * Application Settings Table
 * Stores global key/value configuration (e.g., Slack channel IDs)
 */
export const appSettings = pgTable(
  "app_settings",
  {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    updatedIdx: index("idx_app_settings_updated").on(table.updatedAt),
  })
);

export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;

// Type exports for TypeScript
export type CaseContext = typeof caseContexts.$inferSelect;
export type NewCaseContext = typeof caseContexts.$inferInsert;

export type CaseMessage = typeof caseMessages.$inferSelect;
export type NewCaseMessage = typeof caseMessages.$inferInsert;

export type KBGenerationState = typeof kbGenerationStates.$inferSelect;
export type NewKBGenerationState = typeof kbGenerationStates.$inferInsert;

/**
 * Business Contexts Table
 * Stores business entity information (clients, vendors, platforms) for LLM context enrichment
 */
export const businessContexts = pgTable(
  "business_contexts",
  {
    id: serial("id").primaryKey(),
    entityName: text("entity_name").notNull().unique(),
    entityType: text("entity_type").notNull(), // CLIENT, VENDOR, PLATFORM
    industry: text("industry"),
    description: text("description"),
    aliases: jsonb("aliases").$type<string[]>().default([]).notNull(),
    relatedEntities: jsonb("related_entities").$type<string[]>().default([]).notNull(),
    relatedCompanies: jsonb("related_companies").$type<Array<{
      companyName: string;
      relationship: string;
      notes?: string;
    }>>().default([]).notNull(),
    technologyPortfolio: text("technology_portfolio"),
    serviceDetails: text("service_details"),
    keyContacts: jsonb("key_contacts").$type<Array<{name: string; role: string; email?: string}>>().default([]).notNull(),
    slackChannels: jsonb("slack_channels").$type<Array<{name: string; channelId?: string; notes?: string}>>().default([]).notNull(),
    cmdbIdentifiers: jsonb("cmdb_identifiers").$type<Array<{
      ciName?: string;
      sysId?: string;
      ipAddresses?: string[];
      description?: string;
      ownerGroup?: string;
      documentation?: string[];
    }>>().default([]).notNull(),
    contextStewards: jsonb("context_stewards").$type<Array<{
      type: "channel" | "user" | "usergroup";
      id?: string;
      name?: string;
      notes?: string;
    }>>().default([]).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    entityNameIdx: index("idx_entity_name").on(table.entityName),
    entityTypeIdx: index("idx_entity_type").on(table.entityType),
    isActiveIdx: index("idx_is_active").on(table.isActive),
  })
);

export type BusinessContext = typeof businessContexts.$inferSelect;
export type NewBusinessContext = typeof businessContexts.$inferInsert;
export type BusinessContextCmdbIdentifier = BusinessContext["cmdbIdentifiers"][number];
export type BusinessContextSteward = BusinessContext["contextStewards"][number];

/**
 * Case Classification Inbound Table
 * Records incoming webhook payloads for case classification
 */
export const caseClassificationInbound = pgTable(
  "case_classification_inbound",
  {
    id: serial("id").primaryKey(),
    caseNumber: text("case_number").notNull(),
    caseSysId: text("case_sys_id").notNull(),
    rawPayload: jsonb("raw_payload").notNull(),
    routingContext: jsonb("routing_context").$type<{
      assignmentGroup?: string;
      assignedTo?: string;
      category?: string;
      subcategory?: string;
      priority?: string;
      state?: string;
    }>().default({}).notNull(),
    processed: boolean("processed").default(false).notNull(),
    processingError: text("processing_error"),
    workflowId: text("workflow_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
  },
  (table) => ({
    caseNumberIdx: index("idx_inbound_case_number").on(table.caseNumber),
    caseSysIdIdx: index("idx_inbound_case_sys_id").on(table.caseSysId),
    processedIdx: index("idx_inbound_processed").on(table.processed),
    createdAtIdx: index("idx_inbound_created_at").on(table.createdAt),
  })
);

/**
 * Case Classification Results Table
 * Stores detailed classification results with metadata
 */
export const caseClassificationResults = pgTable(
  "case_classification_results",
  {
    id: serial("id").primaryKey(),
    caseNumber: text("case_number").notNull(),
    workflowId: text("workflow_id").notNull(),
    classificationJson: jsonb("classification_json").notNull(),
    tokenUsage: jsonb("token_usage").$type<{
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    }>().default({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }).notNull(),
    cost: real("cost").default(0).notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    processingTimeMs: real("processing_time_ms").notNull(),
    servicenowUpdated: boolean("servicenow_updated").default(false).notNull(),
    entitiesCount: integer("entities_count").default(0).notNull(),
    similarCasesCount: integer("similar_cases_count").default(0).notNull(),
    kbArticlesCount: integer("kb_articles_count").default(0).notNull(),
    businessIntelligenceDetected: boolean("business_intelligence_detected").default(false).notNull(),
    confidenceScore: real("confidence_score").notNull(),
    retryCount: integer("retry_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // Service Portfolio Classification (NEW)
    serviceOffering: text("service_offering"), // Main service offering (e.g., "Application Administration")
    applicationService: text("application_service"), // Specific application if Application Administration
    // ITSM Record Creation Tracking (NEW - for idempotency)
    incidentNumber: text("incident_number"), // Incident number created from this case (if any)
    incidentSysId: text("incident_sys_id"), // Incident sys_id for direct linking
    incidentUrl: text("incident_url"), // Full URL to incident in ServiceNow
    problemNumber: text("problem_number"), // Problem number created from this case (if any)
    problemSysId: text("problem_sys_id"), // Problem sys_id for direct linking
    problemUrl: text("problem_url"), // Full URL to problem in ServiceNow
  },
  (table) => ({
    caseNumberIdx: index("idx_results_case_number").on(table.caseNumber),
    workflowIdIdx: index("idx_results_workflow_id").on(table.workflowId),
    providerIdx: index("idx_results_provider").on(table.provider),
    createdAtIdx: index("idx_results_created_at").on(table.createdAt),
    confidenceScoreIdx: index("idx_results_confidence").on(table.confidenceScore),
  })
);

/**
 * Case Discovered Entities Table
 * Tracks entities discovered during case classification
 */
export const caseDiscoveredEntities = pgTable(
  "case_discovered_entities",
  {
    id: serial("id").primaryKey(),
    caseNumber: text("case_number").notNull(),
    caseSysId: text("case_sys_id").notNull(),
    entityType: text("entity_type").notNull(), // IP_ADDRESS, SYSTEM, USER, SOFTWARE, ERROR_CODE
    entityValue: text("entity_value").notNull(),
    confidence: real("confidence").notNull(),
    status: text("status").notNull().default("discovered"), // discovered, verified, false_positive
    source: text("source").notNull(), // llm, regex, manual
    metadata: jsonb("metadata").$type<Record<string, any>>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    caseNumberIdx: index("idx_entities_case_number").on(table.caseNumber),
    caseSysIdIdx: index("idx_entities_case_sys_id").on(table.caseSysId),
    entityTypeIdx: index("idx_entities_type").on(table.entityType),
    entityValueIdx: index("idx_entities_value").on(table.entityValue),
    statusIdx: index("idx_entities_status").on(table.status),
    confidenceIdx: index("idx_entities_confidence").on(table.confidence),
  })
);

export type CaseClassificationInbound = typeof caseClassificationInbound.$inferSelect;
export type NewCaseClassificationInbound = typeof caseClassificationInbound.$inferInsert;

export type CaseClassificationResults = typeof caseClassificationResults.$inferSelect;
export type NewCaseClassificationResults = typeof caseClassificationResults.$inferInsert;

export type CaseDiscoveredEntities = typeof caseDiscoveredEntities.$inferSelect;
export type NewCaseDiscoveredEntities = typeof caseDiscoveredEntities.$inferInsert;

/**
 * Case Classifications Table
 * Tracks AI classification results for ServiceNow cases
 */
export const caseClassifications = pgTable(
  "case_classifications",
  {
    id: serial("id").primaryKey(),
    caseNumber: text("case_number").notNull(),
    caseSysId: text("case_sys_id").notNull(),
    category: text("category").notNull(),
    subcategory: text("subcategory"),
    confidenceScore: real("confidence_score").notNull(),
    urgencyLevel: text("urgency_level"),
    reasoning: text("reasoning"),
    keywords: jsonb("keywords").$type<string[]>().default([]).notNull(),
    quickSummary: text("quick_summary"),
    immediateNextSteps: jsonb("immediate_next_steps").$type<string[]>().default([]).notNull(),
    technicalEntities: jsonb("technical_entities").$type<{
      ip_addresses: string[];
      systems: string[];
      users: string[];
      software: string[];
      error_codes: string[];
    }>().default({ ip_addresses: [], systems: [], users: [], software: [], error_codes: [] }).notNull(),
    businessIntelligence: jsonb("business_intelligence").$type<{
      project_scope_detected: boolean;
      project_scope_reason?: string;
      client_technology?: string;
      client_technology_context?: string;
      related_entities?: string[];
      outside_service_hours: boolean;
      service_hours_note?: string;
      executive_visibility: boolean;
      executive_visibility_reason?: string;
      compliance_impact: boolean;
      compliance_impact_reason?: string;
      financial_impact: boolean;
      financial_impact_reason?: string;
    }>().default({ 
      project_scope_detected: false, 
      outside_service_hours: false, 
      executive_visibility: false, 
      compliance_impact: false, 
      financial_impact: false 
    }).notNull(),
    similarCasesCount: integer("similar_cases_count").default(0).notNull(),
    kbArticlesCount: integer("kb_articles_count").default(0).notNull(),
    modelUsed: text("model_used").notNull(),
    classifiedAt: timestamp("classified_at").defaultNow().notNull(),
    processingTimeMs: real("processing_time_ms"),
    servicenowUpdated: boolean("servicenow_updated").default(false).notNull(),
    workNoteContent: text("work_note_content"),
    // Service Portfolio Classification (NEW)
    serviceOffering: text("service_offering"), // Main service offering (e.g., "Application Administration")
    applicationService: text("application_service"), // Specific application if Application Administration
  },
  (table) => ({
    caseNumberIdx: index("idx_case_number_classifications").on(table.caseNumber),
    caseSysIdIdx: index("idx_case_sys_id").on(table.caseSysId),
    categoryIdx: index("idx_category").on(table.category),
    classifiedAtIdx: index("idx_classified_at").on(table.classifiedAt),
    confidenceScoreIdx: index("idx_confidence_score").on(table.confidenceScore),
  })
);

export type CaseClassification = typeof caseClassifications.$inferSelect;
export type NewCaseClassification = typeof caseClassifications.$inferInsert;

/**
 * ServiceNow Choice Cache Table
 * Caches category/subcategory choice lists from ServiceNow sys_choice table
 * Synced every 12 hours to avoid real-time API calls during classification
 *
 * Original: sql/create_servicenow_category_cache.sql
 */
export const servicenowChoiceCache = pgTable(
  "servicenow_choice_cache",
  {
    choiceId: serial("choice_id").primaryKey(),
    tableName: text("table_name").notNull(), // e.g., "sn_customerservice_case"
    element: text("element").notNull(), // e.g., "category", "subcategory"
    value: text("value").notNull(), // ServiceNow internal value (e.g., "12", "15")
    label: text("label").notNull(), // Display label (e.g., "Hardware issue")
    sequence: integer("sequence").default(0).notNull(), // Display order
    inactive: boolean("inactive").default(false).notNull(), // Whether choice is inactive
    dependentValue: text("dependent_value"), // For subcategories, parent category value
    lastSyncedUtc: timestamp("last_synced_utc"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueChoice: index("idx_unique_choice").on(table.tableName, table.element, table.value, table.dependentValue),
    elementIdx: index("idx_element").on(table.element),
    inactiveIdx: index("idx_inactive").on(table.inactive),
    lastSyncedIdx: index("idx_last_synced").on(table.lastSyncedUtc),
  })
);

/**
 * ServiceNow Category Sync Log Table
 * Tracks category sync job execution history
 *
 * Original: sql/create_servicenow_category_cache.sql
 */
export const servicenowCategorySyncLog = pgTable(
  "servicenow_category_sync_log",
  {
    syncId: serial("sync_id").primaryKey(),
    tableName: text("table_name").notNull(),
    element: text("element").notNull(),
    startedAtUtc: timestamp("started_at_utc").notNull(),
    completedAtUtc: timestamp("completed_at_utc"),
    status: text("status").notNull(), // "running", "success", "failed"
    choicesFetched: integer("choices_fetched"),
    choicesAdded: integer("choices_added"),
    choicesUpdated: integer("choices_updated"),
    choicesRemoved: integer("choices_removed"),
    errorMessage: text("error_message"),
  },
  (table) => ({
    statusIdx: index("idx_sync_status").on(table.status),
    startedAtIdx: index("idx_sync_started_at").on(table.startedAtUtc),
  })
);

export type ServiceNowChoiceCache = typeof servicenowChoiceCache.$inferSelect;
export type NewServiceNowChoiceCache = typeof servicenowChoiceCache.$inferInsert;

export type ServiceNowCategorySyncLog = typeof servicenowCategorySyncLog.$inferSelect;
export type NewServiceNowCategorySyncLog = typeof servicenowCategorySyncLog.$inferInsert;

/**
 * Client Settings Table
 * Stores per-client configuration for catalog redirect and other features
 */
export const clientSettings = pgTable(
  "client_settings",
  {
    id: serial("id").primaryKey(),
    clientId: text("client_id").notNull().unique(), // ServiceNow company sys_id
    clientName: text("client_name").notNull(),
    // Catalog redirect settings
    catalogRedirectEnabled: boolean("catalog_redirect_enabled").default(true).notNull(),
    catalogRedirectConfidenceThreshold: real("catalog_redirect_confidence_threshold").default(0.5).notNull(),
    catalogRedirectAutoClose: boolean("catalog_redirect_auto_close").default(false).notNull(),
    supportContactInfo: text("support_contact_info"),
    // Custom catalog mappings (optional overrides)
    customCatalogMappings: jsonb("custom_catalog_mappings").$type<Array<{
      requestType: string;
      keywords: string[];
      catalogItemNames: string[];
      priority: number;
    }>>().default([]).notNull(),
    // Feature flags
    features: jsonb("features").$type<Record<string, boolean>>().default({}).notNull(),
    // Metadata
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
  },
  (table) => ({
    clientIdIdx: index("idx_client_id").on(table.clientId),
    clientNameIdx: index("idx_client_name").on(table.clientName),
    catalogRedirectEnabledIdx: index("idx_catalog_redirect_enabled").on(table.catalogRedirectEnabled),
  })
);

/**
 * Catalog Redirect Log Table
 * Tracks all catalog redirects for metrics and reporting
 */
export const catalogRedirectLog = pgTable(
  "catalog_redirect_log",
  {
    id: serial("id").primaryKey(),
    caseNumber: text("case_number").notNull(),
    caseSysId: text("case_sys_id").notNull(),
    clientId: text("client_id"),
    clientName: text("client_name"),
    requestType: text("request_type").notNull(), // onboarding, termination, etc.
    confidence: real("confidence").notNull(),
    confidenceThreshold: real("confidence_threshold").notNull(),
    catalogItemsProvided: integer("catalog_items_provided").notNull(),
    catalogItemNames: jsonb("catalog_item_names").$type<string[]>().default([]).notNull(),
    caseClosed: boolean("case_closed").notNull(),
    closeState: text("close_state"),
    matchedKeywords: jsonb("matched_keywords").$type<string[]>().default([]).notNull(),
    submittedBy: text("submitted_by"), // user who submitted the case
    shortDescription: text("short_description"),
    category: text("category"),
    subcategory: text("subcategory"),
    redirectedAt: timestamp("redirected_at").defaultNow().notNull(),
  },
  (table) => ({
    caseNumberIdx: index("idx_redirect_case_number").on(table.caseNumber),
    caseSysIdIdx: index("idx_redirect_case_sys_id").on(table.caseSysId),
    clientIdIdx: index("idx_redirect_client_id").on(table.clientId),
    requestTypeIdx: index("idx_redirect_request_type").on(table.requestType),
    redirectedAtIdx: index("idx_redirect_redirected_at").on(table.redirectedAt),
    caseClosedIdx: index("idx_redirect_case_closed").on(table.caseClosed),
  })
);

export type ClientSettings = typeof clientSettings.$inferSelect;
export type NewClientSettings = typeof clientSettings.$inferInsert;

export type CatalogRedirectLog = typeof catalogRedirectLog.$inferSelect;
export type NewCatalogRedirectLog = typeof catalogRedirectLog.$inferInsert;

/**
 * Category Mismatch Log Table
 * Tracks when AI suggests categories that don't exist in ServiceNow
 * Used to identify categories that should be added to ServiceNow
 *
 * DUAL CATEGORIZATION: Tracks which table (Cases vs Incidents) the mismatch is for
 */
export const categoryMismatchLog = pgTable(
  "category_mismatch_log",
  {
    id: serial("id").primaryKey(),
    caseNumber: text("case_number").notNull(),
    caseSysId: text("case_sys_id"),
    targetTable: text("target_table").notNull().default("sn_customerservice_case"), // "sn_customerservice_case" or "incident"
    aiSuggestedCategory: text("ai_suggested_category").notNull(),
    aiSuggestedSubcategory: text("ai_suggested_subcategory"),
    correctedCategory: text("corrected_category").notNull(), // What we used instead
    confidenceScore: real("confidence_score").notNull(),
    caseDescription: text("case_description").notNull(),
    reviewed: boolean("reviewed").default(false).notNull(), // Has ServiceNow team reviewed this?
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    caseNumberIdx: index("idx_mismatch_case_number").on(table.caseNumber),
    suggestedCategoryIdx: index("idx_mismatch_suggested_category").on(table.aiSuggestedCategory),
    targetTableIdx: index("idx_mismatch_target_table").on(table.targetTable),
    reviewedIdx: index("idx_mismatch_reviewed").on(table.reviewed),
    createdAtIdx: index("idx_mismatch_created_at").on(table.createdAt),
    confidenceIdx: index("idx_mismatch_confidence").on(table.confidenceScore),
  })
);

export type CategoryMismatchLog = typeof categoryMismatchLog.$inferSelect;
export type NewCategoryMismatchLog = typeof categoryMismatchLog.$inferInsert;

/**
 * CMDB Reconciliation Results Table
 * Tracks results of CMDB reconciliation process for case entities
 */
export const cmdbReconciliationResults = pgTable(
  "cmdb_reconciliation_results",
  {
    id: serial("id").primaryKey(),
    caseNumber: text("case_number").notNull(),
    caseSysId: text("case_sys_id").notNull(),
    entityValue: text("entity_value").notNull(),
    entityType: text("entity_type").notNull(), // IP_ADDRESS, SYSTEM, USER, SOFTWARE, ERROR_CODE
    originalEntityValue: text("original_entity_value").notNull(), // Before alias resolution
    resolvedEntityValue: text("resolved_entity_value"), // After alias resolution
    reconciliationStatus: text("reconciliation_status").notNull(), // matched, unmatched, ambiguous, skipped
    cmdbSysId: text("cmdb_sys_id"),
    cmdbName: text("cmdb_name"),
    cmdbClass: text("cmdb_class"),
    cmdbUrl: text("cmdb_url"),
    confidence: real("confidence").notNull(),
    businessContextMatch: text("business_context_match"), // Name of matching business context
    childTaskNumber: text("child_task_number"), // If task was created
    childTaskSysId: text("child_task_sys_id"), // If task was created
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, any>>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    caseNumberIdx: index("idx_cmdb_reconcile_case_number").on(table.caseNumber),
    caseSysIdIdx: index("idx_cmdb_reconcile_case_sys_id").on(table.caseSysId),
    entityValueIdx: index("idx_cmdb_reconcile_entity_value").on(table.entityValue),
    entityTypeIdx: index("idx_cmdb_reconcile_entity_type").on(table.entityType),
    statusIdx: index("idx_cmdb_reconcile_status").on(table.reconciliationStatus),
    confidenceIdx: index("idx_cmdb_reconcile_confidence").on(table.confidence),
    createdAtIdx: index("idx_cmdb_reconcile_created_at").on(table.createdAt),
  })
);

export type CmdbReconciliationResult = typeof cmdbReconciliationResults.$inferSelect;
export type NewCmdbReconciliationResult = typeof cmdbReconciliationResults.$inferInsert;

/**
 * Call Interactions Table
 * Stores metadata about voice interactions retrieved from Webex Contact Center
 */
export const callInteractions = pgTable(
  "call_interactions",
  {
    sessionId: text("session_id").primaryKey(),
    contactId: text("contact_id"),
    caseNumber: text("case_number"),
    direction: text("direction"),
    ani: text("ani"),
    dnis: text("dnis"),
    agentId: text("agent_id"),
    agentName: text("agent_name"),
    queueName: text("queue_name"),
    startTime: timestamp("start_time", { withTimezone: true }),
    endTime: timestamp("end_time", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    wrapUpCode: text("wrap_up_code"),
    recordingId: text("recording_id"),
    transcriptStatus: text("transcript_status").notNull().default("pending"),
    rawPayload: jsonb("raw_payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    // ServiceNow interaction tracking
    servicenowInteractionSysId: text("servicenow_interaction_sys_id"),
    servicenowInteractionNumber: text("servicenow_interaction_number"),
    servicenowSyncedAt: timestamp("servicenow_synced_at", { withTimezone: true }),
  },
  (table) => ({
    caseNumberIdx: index("idx_call_interactions_case").on(table.caseNumber),
    startTimeIdx: index("idx_call_interactions_start").on(table.startTime),
    transcriptStatusIdx: index("idx_call_interactions_transcript_status").on(table.transcriptStatus),
    servicenowInteractionSysIdIdx: index("idx_call_interactions_sn_interaction").on(table.servicenowInteractionSysId),
  })
);

/**
 * Call Transcripts Table
 * Tracks transcription lifecycle for recorded calls
 */
export const callTranscripts = pgTable(
  "call_transcripts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: text("session_id")
      .references(() => callInteractions.sessionId, { onDelete: "cascade" })
      .notNull(),
    provider: text("provider"),
    status: text("status").notNull().default("pending"),
    language: text("language"),
    transcriptText: text("transcript_text"),
    transcriptJson: jsonb("transcript_json"),
    audioUrl: text("audio_url"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("idx_call_transcripts_status").on(table.status),
    sessionUnique: uniqueIndex("uq_call_transcripts_session").on(table.sessionId),
  })
);

export type CallInteraction = typeof callInteractions.$inferSelect;
export type NewCallInteraction = typeof callInteractions.$inferInsert;
export type CallTranscript = typeof callTranscripts.$inferSelect;
export type NewCallTranscript = typeof callTranscripts.$inferInsert;

/**
 * Case Escalations Table
 * Tracks non-BAU case escalations sent to Slack channels
 * Used for tracking escalation history and preventing duplicate notifications
 */
export const caseEscalations = pgTable(
  "case_escalations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseNumber: text("case_number").notNull(),
    caseSysId: text("case_sys_id").notNull(),
    // Escalation trigger details
    escalationReason: text("escalation_reason").notNull(), // e.g., "project_scope", "executive_visibility"
    businessIntelligenceScore: integer("business_intelligence_score"), // 0-100 score at time of escalation
    triggerFlags: jsonb("trigger_flags").$type<{
      project_scope_detected?: boolean;
      executive_visibility?: boolean;
      compliance_impact?: boolean;
      financial_impact?: boolean;
    }>().default({}).notNull(),
    // Slack notification details
    slackChannel: text("slack_channel").notNull(), // Channel where escalation was posted (without #)
    slackThreadTs: text("slack_thread_ts"), // Thread timestamp (if posted in thread)
    slackMessageTs: text("slack_message_ts").notNull(), // Message timestamp
    // Case context at time of escalation
    assignedTo: text("assigned_to"), // Engineer assigned when escalated
    assignmentGroup: text("assignment_group"), // Group assigned when escalated
    companyName: text("company_name"), // Client name (from account_id)
    category: text("category"), // Case category
    subcategory: text("subcategory"), // Case subcategory
    priority: text("priority"), // Priority level
    urgency: text("urgency"), // Urgency level
    // Escalation lifecycle tracking
    status: text("status").notNull().default("active"), // active, acknowledged, dismissed, resolved
    acknowledgedBy: text("acknowledged_by"), // Slack user_id who acknowledged
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedAction: text("acknowledged_action"), // e.g., "create_project", "acknowledge_bau"
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    // Metadata
    llmGenerated: boolean("llm_generated").notNull().default(false), // Whether LLM was used for message
    tokenUsage: integer("token_usage"), // Tokens used if LLM generated
    metadata: jsonb("metadata").$type<Record<string, any>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    caseNumberIdx: index("idx_escalations_case_number").on(table.caseNumber),
    caseSysIdIdx: index("idx_escalations_case_sys_id").on(table.caseSysId),
    statusIdx: index("idx_escalations_status").on(table.status),
    channelIdx: index("idx_escalations_channel").on(table.slackChannel),
    createdAtIdx: index("idx_escalations_created_at").on(table.createdAt),
    // Composite index for finding active escalations for a case
    activeCaseIdx: index("idx_escalations_active_case").on(table.caseNumber, table.status),
  })
);

export type CaseEscalation = typeof caseEscalations.$inferSelect;
export type NewCaseEscalation = typeof caseEscalations.$inferInsert;

/**
 * Project Interview Archive
 * Persists completed interview transcripts and scoring metadata for analytics and mentor review.
 */
export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: text("status").notNull().default("draft"),
    githubUrl: text("github_url"),
    summary: text("summary").notNull(),
    background: text("background"),
    techStack: jsonb("tech_stack").$type<string[]>().default([]).notNull(),
    skillsRequired: jsonb("skills_required").$type<string[]>().default([]).notNull(),
    skillsNiceToHave: jsonb("skills_nice_to_have").$type<string[]>().default([]).notNull(),
    difficultyLevel: text("difficulty_level"),
    estimatedHours: text("estimated_hours"),
    learningOpportunities: jsonb("learning_opportunities").$type<string[]>().default([]).notNull(),
    openTasks: jsonb("open_tasks").$type<string[]>().default([]).notNull(),
    mentorSlackUserId: text("mentor_slack_user_id"),
    mentorName: text("mentor_name"),
    type: text("type").notNull().default("internal"),
    source: text("source").notNull().default("local"),
    interviewConfig: jsonb("interview_config").$type<Record<string, any> | null>().default(null),
    standupConfig: jsonb("standup_config").$type<Record<string, any> | null>().default(null),
    maxCandidates: integer("max_candidates"),
    postedDate: timestamp("posted_date", { withTimezone: true }),
    expiresDate: timestamp("expires_date", { withTimezone: true }),
    channelId: text("channel_id"),
    githubRepo: text("github_repo"),
    githubDefaultBranch: text("github_default_branch"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // SPM (ServiceNow Service Portfolio Management) Integration fields
    spmSysId: text("spm_sys_id"),
    spmNumber: text("spm_number"),
    spmState: text("spm_state"),
    spmPriority: text("spm_priority"),
    spmPercentComplete: integer("spm_percent_complete"),
    spmLifecycleStage: text("spm_lifecycle_stage"),
    spmProjectManagerSysId: text("spm_project_manager_sys_id"),
    spmProjectManagerName: text("spm_project_manager_name"),
    spmAssignmentGroupSysId: text("spm_assignment_group_sys_id"),
    spmAssignmentGroupName: text("spm_assignment_group_name"),
    spmParentSysId: text("spm_parent_sys_id"),
    spmParentNumber: text("spm_parent_number"),
    spmPortfolioName: text("spm_portfolio_name"),
    spmUrl: text("spm_url"),
    spmOpenedAt: timestamp("spm_opened_at", { withTimezone: true }),
    spmClosedAt: timestamp("spm_closed_at", { withTimezone: true }),
    spmDueDate: timestamp("spm_due_date", { withTimezone: true }),
    spmLastSyncedAt: timestamp("spm_last_synced_at", { withTimezone: true }),
    spmSyncEnabled: boolean("spm_sync_enabled").default(false),
  },
  (table) => ({
    statusIdx: index("idx_projects_status").on(table.status),
    typeIdx: index("idx_projects_type").on(table.type),
    sourceIdx: index("idx_projects_source").on(table.source),
    spmSysIdIdx: index("idx_projects_spm_sys_id").on(table.spmSysId),
    spmNumberIdx: index("idx_projects_spm_number").on(table.spmNumber),
  }),
);

export type ProjectRecord = typeof projects.$inferSelect;
export type NewProjectRecord = typeof projects.$inferInsert;

export const projectInterviews = pgTable(
  "project_interviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: text("project_id").notNull(),
    candidateSlackId: text("candidate_slack_id").notNull(),
    mentorSlackId: text("mentor_slack_id"),
    answers: jsonb("answers").$type<Array<Record<string, any>>>().notNull(),
    questions: jsonb("questions").$type<Array<Record<string, any>>>().notNull(),
    scoringPrompt: text("scoring_prompt"),
    matchScore: integer("match_score").notNull(),
    matchSummary: text("match_summary").notNull(),
    recommendedTasks: jsonb("recommended_tasks").$type<string[]>().default([]).notNull(),
    concerns: text("concerns"),
    skillGaps: jsonb("skill_gaps").$type<string[]>().default([]).notNull(),
    onboardingRecommendations: jsonb("onboarding_recommendations").$type<string[]>().default([]).notNull(),
    strengths: jsonb("strengths").$type<string[]>().default([]).notNull(),
    timeToProductivity: text("time_to_productivity"),
    interestId: uuid("interest_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    questionSource: text("question_source").notNull().default("default"),
    generatorModel: text("generator_model"),
    status: text("status").notNull().default("completed"),
  },
  (table) => ({
    projectIdx: index("idx_project_interviews_project").on(table.projectId),
    candidateIdx: index("idx_project_interviews_candidate").on(table.candidateSlackId),
    completedIdx: index("idx_project_interviews_completed_at").on(table.completedAt),
    statusIdx: index("idx_project_interviews_status").on(table.status),
    interestIdx: index("idx_project_interviews_interest").on(table.interestId),
  }),
);

export type ProjectInterview = typeof projectInterviews.$inferSelect;
export type NewProjectInterview = typeof projectInterviews.$inferInsert;

/**
 * Project Interests Table
 * Tracks candidate interest in projects and their status through the application process.
 * Supports duplicate prevention and capacity management.
 */
export const projectInterests = pgTable(
  "project_interests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: text("project_id").notNull(),
    candidateSlackId: text("candidate_slack_id").notNull(),
    status: text("status").notNull().default("pending"), // pending, interviewing, accepted, rejected, abandoned, waitlist
    interviewId: uuid("interview_id"), // FK to projectInterviews
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    abandonedAt: timestamp("abandoned_at", { withTimezone: true }), // when interview was abandoned
  },
  (table) => ({
    projectIdx: index("idx_project_interests_project").on(table.projectId),
    candidateIdx: index("idx_project_interests_candidate").on(table.candidateSlackId),
    statusIdx: index("idx_project_interests_status").on(table.status),
    projectCandidateIdx: index("idx_project_interests_project_candidate").on(table.projectId, table.candidateSlackId),
    createdAtIdx: index("idx_project_interests_created_at").on(table.createdAt),
  }),
);

export type ProjectInterest = typeof projectInterests.$inferSelect;
export type NewProjectInterest = typeof projectInterests.$inferInsert;

export const projectStandups = pgTable(
  "project_standups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: text("project_id").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    collectUntil: timestamp("collect_until", { withTimezone: true }).notNull(),
    channelId: text("channel_id"),
    status: text("status").notNull().default("collecting"),
    summary: jsonb("summary").$type<Record<string, any> | null>().default(null),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata").$type<Record<string, any>>().default({}).notNull(),
  },
  (table) => ({
    projectIdx: index("idx_project_standups_project").on(table.projectId),
    statusIdx: index("idx_project_standups_status").on(table.status),
    scheduledIdx: index("idx_project_standups_scheduled").on(table.scheduledFor),
  }),
);

export type ProjectStandup = typeof projectStandups.$inferSelect;
export type NewProjectStandup = typeof projectStandups.$inferInsert;

export const projectStandupResponses = pgTable(
  "project_standup_responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    standupId: uuid("standup_id").notNull(),
    participantSlackId: text("participant_slack_id").notNull(),
    answers: jsonb("answers").$type<Record<string, any>>().notNull(),
    blockerFlag: boolean("blocker_flag").notNull().default(false),
    contextSnapshot: jsonb("context_snapshot").$type<Record<string, any>>().notNull().default({}),
    insights: jsonb("insights").$type<Record<string, any>>().notNull().default({}),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    standupIdx: index("idx_project_standup_responses_standup").on(table.standupId),
    participantIdx: index("idx_project_standup_responses_participant").on(table.participantSlackId),
    standupParticipantUnique: uniqueIndex("uniq_project_standup_participant").on(
      table.standupId,
      table.participantSlackId,
    ),
  }),
);

export type ProjectStandupResponse = typeof projectStandupResponses.$inferSelect;
export type NewProjectStandupResponse = typeof projectStandupResponses.$inferInsert;

export const projectInitiationRequests = pgTable(
  "project_initiation_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: text("project_id").notNull(),
    requestedBy: text("requested_by").notNull(),
    requestedByName: text("requested_by_name"),
    ideaSummary: text("idea_summary"),
    contextSummary: text("context_summary"),
    llmModel: text("llm_model"),
    status: text("status").notNull().default("drafted"),
    output: jsonb("output").$type<Record<string, any>>().default({}).notNull(),
    sources: jsonb("sources").$type<Array<Record<string, any>>>().default([]).notNull(),
    rawResponse: text("raw_response"),
    metadata: jsonb("metadata").$type<Record<string, any>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdx: index("idx_project_initiation_project").on(table.projectId),
    statusIdx: index("idx_project_initiation_status").on(table.status),
    requesterIdx: index("idx_project_initiation_requester").on(table.requestedBy),
  }),
);

export type ProjectInitiationRequest = typeof projectInitiationRequests.$inferSelect;
export type NewProjectInitiationRequest = typeof projectInitiationRequests.$inferInsert;

export const strategicEvaluations = pgTable(
  "strategic_evaluations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectName: text("project_name").notNull(),
    requestedBy: text("requested_by").notNull(),
    requestedByName: text("requested_by_name"),
    channelId: text("channel_id"),
    commandText: text("command_text"),
    demandRequest: jsonb("demand_request").$type<Record<string, any>>().notNull(),
    analysis: jsonb("analysis").$type<Record<string, any>>().notNull(),
    summary: jsonb("summary").$type<Record<string, any>>().notNull(),
    needsClarification: boolean("needs_clarification").default(false).notNull(),
    totalScore: integer("total_score"),
    recommendation: text("recommendation"),
    confidence: text("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index("idx_strategic_eval_project").on(table.projectName),
    requestedByIdx: index("idx_strategic_eval_requested_by").on(table.requestedBy),
    createdAtIdx: index("idx_strategic_eval_created_at").on(table.createdAt),
  }),
);

export type StrategicEvaluation = typeof strategicEvaluations.$inferSelect;
export type NewStrategicEvaluation = typeof strategicEvaluations.$inferInsert;

/**
 * Incident Enrichment States Table
 * Tracks incident enrichment workflow for automatic CI matching and metadata enhancement
 *
 * Workflow stages:
 * - created: Incident added to watchlist
 * - notes_analyzed: Work notes analyzed for entities
 * - ci_matched: CI matched with confidence >70%
 * - clarification_pending: CI confidence <70%, awaiting Slack response
 * - enriched: CI linked and incident updated
 * - completed: Final enrichment complete, ready for removal
 */
export const incidentEnrichmentStates = pgTable(
  "incident_enrichment_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Incident identification
    incidentSysId: text("incident_sys_id").notNull(),
    incidentNumber: text("incident_number").notNull(),
    caseSysId: text("case_sys_id"),
    caseNumber: text("case_number"),
    // Enrichment workflow
    enrichmentStage: text("enrichment_stage").notNull().default("created"), // created | notes_analyzed | ci_matched | clarification_pending | enriched | completed
    matchedCis: jsonb("matched_cis").$type<Array<{
      sys_id: string;
      name: string;
      class: string;
      confidence: number;
      source: "inventory" | "cmdb" | "manual";
      matched_at?: string;
    }>>().default([]).notNull(),
    extractedEntities: jsonb("extracted_entities").$type<{
      ip_addresses?: string[];
      hostnames?: string[];
      edge_names?: string[];
      error_messages?: string[];
      system_names?: string[];
      account_numbers?: string[];
    }>().default({}).notNull(),
    confidenceScores: jsonb("confidence_scores").$type<{
      overall?: number;
      ci_match?: number;
      entity_extraction?: number;
    }>().default({}).notNull(),
    // Clarification workflow
    clarificationRequestedAt: timestamp("clarification_requested_at", { withTimezone: true }),
    clarificationSlackTs: text("clarification_slack_ts"), // Slack message timestamp for tracking
    // Lifecycle tracking
    enrichmentAttempts: integer("enrichment_attempts").notNull().default(0),
    lastWorkNoteAt: timestamp("last_work_note_at", { withTimezone: true }),
    lastProcessedAt: timestamp("last_processed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Metadata
    metadata: jsonb("metadata").$type<Record<string, any>>().default({}).notNull(),
  },
  (table) => ({
    // Unique index on incident_sys_id (one enrichment state per incident)
    incidentSysIdIdx: uniqueIndex("idx_enrichment_incident_sys_id").on(table.incidentSysId),
    caseSysIdIdx: index("idx_enrichment_case_sys_id").on(table.caseSysId),
    enrichmentStageIdx: index("idx_enrichment_stage").on(table.enrichmentStage),
    lastProcessedIdx: index("idx_enrichment_last_processed").on(table.lastProcessedAt),
    createdAtIdx: index("idx_enrichment_created_at").on(table.createdAt),
    // Composite index for cron job queries (find incidents needing enrichment)
    stageProcessedIdx: index("idx_enrichment_stage_processed").on(table.enrichmentStage, table.lastProcessedAt),
  })
);

export type IncidentEnrichmentState = typeof incidentEnrichmentStates.$inferSelect;
export type NewIncidentEnrichmentState = typeof incidentEnrichmentStates.$inferInsert;

/**
 * Change Validations Table
 * Stores ServiceNow change validation results and audit trail
 * Tracks the lifecycle of automated validation for standard changes
 */
export const changeValidations = pgTable(
  "change_validations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Change identification
    changeNumber: text("change_number").notNull(),
    changeSysId: text("change_sys_id").notNull(),  // Unique constraint via index below
    // Component being validated
    componentType: text("component_type").notNull(), // catalog_item, ldap_server, mid_server, workflow, etc.
    componentSysId: text("component_sys_id"),
    // Webhook/Request metadata
    payload: jsonb("payload").notNull().$type<Record<string, any>>(),
    hmacSignature: text("hmac_signature"),
    requestedBy: text("requested_by"),
    // Validation lifecycle
    status: text("status").notNull().default("received"), // received, processing, completed, failed
    validationResults: jsonb("validation_results").$type<{
      overall_status: "APPROVE" | "APPROVE_WITH_CONDITIONS" | "REJECT";
      documentation_assessment?: string;
      risks?: string[];
      required_actions?: string[];
      synthesis?: string;
      checks?: Record<string, boolean>;
    }>(),
    failureReason: text("failure_reason"),
    // Timing
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    // Processing details
    processingTimeMs: integer("processing_time_ms"),
    retryCount: integer("retry_count").default(0).notNull(),
  },
  (table) => ({
    changeNumberIdx: index("idx_change_validations_change_number").on(table.changeNumber),
    changeSysIdIdx: uniqueIndex("idx_change_validations_change_sys_id").on(table.changeSysId),
    statusIdx: index("idx_change_validations_status").on(table.status),
    componentTypeIdx: index("idx_change_validations_component_type").on(table.componentType),
    createdAtIdx: index("idx_change_validations_created_at").on(table.createdAt),
    processedAtIdx: index("idx_change_validations_processed_at").on(table.processedAt),
    // Composite index for finding unprocessed changes
    statusCreatedIdx: index("idx_change_validations_status_created").on(table.status, table.createdAt),
  })
);

export type ChangeValidation = typeof changeValidations.$inferSelect;
export type NewChangeValidation = typeof changeValidations.$inferInsert;

/**
 * Muscle Memory Exemplars Table
 * Stores high-quality agent interactions for semantic retrieval and learning
 * Supports pgvector for similarity search on embeddings
 */
export const muscleMemoryExemplars = pgTable(
  "muscle_memory_exemplars",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseNumber: text("case_number").notNull(),
    interactionType: text("interaction_type").notNull(), // triage, kb_generation, escalation, connectivity, etc.
    inputContext: jsonb("input_context").notNull().$type<{
      discoveryPack?: Record<string, any>;
      caseSnapshot?: Record<string, any>;
      userRequest?: string;
    }>(),
    actionTaken: jsonb("action_taken").notNull().$type<{
      agentType: string;
      classification?: Record<string, any>;
      workNotes?: string[];
      escalations?: Record<string, any>[];
      kbArticle?: Record<string, any>;
      diagnostics?: Record<string, any>;
    }>(),
    outcome: text("outcome").notNull(), // success, partial_success, failure, user_corrected
    embedding: vector({ dimensions: 1536 }),
    qualityScore: real("quality_score").notNull(), // 0.0-1.0, weighted from quality signals
    qualitySignals: jsonb("quality_signals").notNull().$type<{
      supervisorApproval?: boolean;
      humanFeedback?: "positive" | "negative" | null;
      outcomeSuccess?: boolean;
      implicitPositive?: boolean;
      signalWeights?: Record<string, number>;
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // HNSW index for fast approximate nearest neighbor search on embeddings
    embeddingIdx: index("idx_muscle_memory_embedding_hnsw").using(
      "hnsw",
      table.embedding.asc().op("vector_cosine_ops")
    ),
    interactionTypeIdx: index("idx_muscle_memory_interaction_type").on(table.interactionType),
    qualityScoreIdx: index("idx_muscle_memory_quality_score").on(table.qualityScore),
    caseNumberIdx: index("idx_muscle_memory_case_number").on(table.caseNumber),
    createdAtIdx: index("idx_muscle_memory_created_at").on(table.createdAt),
    // Composite index for filtered vector searches
    typeQualityIdx: index("idx_muscle_memory_type_quality").on(
      table.interactionType,
      table.qualityScore
    ),
  })
);

export type MuscleMemoryExemplar = typeof muscleMemoryExemplars.$inferSelect;
export type NewMuscleMemoryExemplar = typeof muscleMemoryExemplars.$inferInsert;

/**
 * Exemplar Quality Signals Table
 * Tracks individual quality signals that contribute to exemplar quality scores
 * Supports incremental quality updates as new signals arrive
 */
export const exemplarQualitySignals = pgTable(
  "exemplar_quality_signals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    exemplarId: uuid("exemplar_id")
      .notNull()
      .references(() => muscleMemoryExemplars.id, { onDelete: "cascade" }),
    signalType: text("signal_type").notNull(), // supervisor, human_feedback, outcome, implicit
    signalValue: text("signal_value").notNull(), // approved, positive, success, etc.
    signalWeight: real("signal_weight").notNull(), // contribution to quality score
    signalMetadata: jsonb("signal_metadata").$type<{
      supervisorReviewId?: string;
      interactiveStateId?: string;
      caseResolutionData?: Record<string, any>;
      userReaction?: string;
    }>(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    exemplarIdIdx: index("idx_quality_signals_exemplar_id").on(table.exemplarId),
    signalTypeIdx: index("idx_quality_signals_type").on(table.signalType),
    recordedAtIdx: index("idx_quality_signals_recorded_at").on(table.recordedAt),
  })
);

export type ExemplarQualitySignal = typeof exemplarQualitySignals.$inferSelect;
export type NewExemplarQualitySignal = typeof exemplarQualitySignals.$inferInsert;

/**
 * Workflows Table
 * A unified table to track the state of all multi-step, asynchronous, or interactive processes.
 */
export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Core Workflow Identification
    workflowType: text("workflow_type").notNull(), // e.g., 'PROJECT_INTERVIEW', 'SUPERVISOR_REVIEW', 'KB_GENERATION', 'INCIDENT_ENRICHMENT'
    workflowReferenceId: text("workflow_reference_id").notNull(), // A stable, external ID unique to this instance of the workflow's subject (e.g., project_id, case_number, incident_sys_id). This helps link back to original entities.

    // State Management
    currentState: text("current_state").notNull(), // e.g., 'STARTED', 'AWAITING_USER_INPUT', 'PENDING_APPROVAL', 'COMPLETED', 'FAILED', 'EXPIRED'
    lastTransitionAt: timestamp("last_transition_at", { withTimezone: true }).notNull().defaultNow(),
    transitionReason: text("transition_reason"), // Optional: Why the state transition occurred

    // Context & Linking (for communication channels or broader context)
    contextKey: text("context_key"), // Denormalized or composite key for quick lookup of associated external entities, e.g., "slack:C12345:12345.678" or "case:CS0012345"
    correlationId: text("correlation_id"), // Optional: For linking different workflows or external systems, e.g., an original request ID that spawns multiple workflows

    // Workflow-specific Data
    payload: jsonb("payload").$type<Record<string, any>>().notNull(), // Flexible JSONB for workflow-specific transient data
    metadata: jsonb("metadata").$type<Record<string, any>>().default({}).notNull(), // General metadata, e.g., originating agent, LLM details

    // Lifecycle & Concurrency
    version: integer("version").notNull().default(1), // For optimistic locking to prevent race conditions
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }), // For time-based cleanup
    lastModifiedBy: text("last_modified_by"), // Optional: Reference to the user/agent that last modified the state
  },
  (table) => ({
    // Indexes for efficient querying
    workflowTypeIdx: index("idx_workflows_type").on(table.workflowType),
    workflowReferenceIdIdx: index("idx_workflows_reference_id").on(table.workflowReferenceId),
    currentStateIdx: index("idx_workflows_current_state").on(table.currentState),
    contextKeyIdx: index("idx_workflows_context_key").on(table.contextKey),
    expiresAtIdx: index("idx_workflows_expires_at").on(table.expiresAt),
    // Ensures only one active workflow of a certain type for a given reference ID
    uniqueActiveWorkflow: uniqueIndex("uq_active_workflow").on(table.workflowType, table.workflowReferenceId).where(
      sql`"current_state" NOT IN ('COMPLETED', 'FAILED', 'EXPIRED')`
    ),
  })
);

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;

/**
 * Prompts Table
 * Centralized storage for all LLM prompts used in the system
 * Supports versioning, categorization, and variable substitution
 */
export const prompts = pgTable(
  "prompts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull().unique(), // e.g., "system_prompt", "requirement_case_number"
    type: text("type").notNull(), // 'system', 'requirement', 'workflow', 'context_template', 'custom'
    content: text("content").notNull(),
    description: text("description"),
    variables: jsonb("variables").$type<string[]>().default([]).notNull(), // Variables that can be injected: ["{{companyName}}", "{{date}}"]
    version: integer("version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
  },
  (table) => ({
    nameIdx: uniqueIndex("idx_prompts_name").on(table.name),
    typeIdx: index("idx_prompts_type").on(table.type),
    isActiveIdx: index("idx_prompts_is_active").on(table.isActive),
    typeActiveIdx: index("idx_prompts_type_active").on(table.type, table.isActive),
  })
);

/**
 * Prompt Versions Table
 * Tracks version history for prompt changes with rollback capability
 */
export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by"),
    changeNotes: text("change_notes"),
  },
  (table) => ({
    promptIdIdx: index("idx_prompt_versions_prompt_id").on(table.promptId),
    versionIdx: index("idx_prompt_versions_version").on(table.version),
    promptVersionUnique: uniqueIndex("uq_prompt_version").on(table.promptId, table.version),
  })
);

export type Prompt = typeof prompts.$inferSelect;
export type NewPrompt = typeof prompts.$inferInsert;
export type PromptVersion = typeof promptVersions.$inferSelect;
export type NewPromptVersion = typeof promptVersions.$inferInsert;

// Quality Gate Schema Exports (for drizzle-kit migrations)
export * from "./quality-gate-schema";
