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
  primaryKey,
  real,
} from "drizzle-orm/pg-core";

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
 * Category Mismatch Log Table
 * Tracks when AI suggests categories that don't exist in ServiceNow
 * Used to identify categories that should be added to ServiceNow
 */
export const categoryMismatchLog = pgTable(
  "category_mismatch_log",
  {
    id: serial("id").primaryKey(),
    caseNumber: text("case_number").notNull(),
    caseSysId: text("case_sys_id"),
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
    reviewedIdx: index("idx_mismatch_reviewed").on(table.reviewed),
    createdAtIdx: index("idx_mismatch_created_at").on(table.createdAt),
    confidenceIdx: index("idx_mismatch_confidence").on(table.confidenceScore),
  })
);

export type CategoryMismatchLog = typeof categoryMismatchLog.$inferSelect;
export type NewCategoryMismatchLog = typeof categoryMismatchLog.$inferInsert;
