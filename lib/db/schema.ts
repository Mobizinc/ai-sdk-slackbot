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
    technologyPortfolio: text("technology_portfolio"),
    serviceDetails: text("service_details"),
    keyContacts: jsonb("key_contacts").$type<Array<{name: string; role: string; email?: string}>>().default([]).notNull(),
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
