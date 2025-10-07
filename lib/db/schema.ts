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
    isResolved: boolean("is_resolved").default(false).notNull(),
    resolvedAt: timestamp("resolved_at"),
    detectedAt: timestamp("detected_at").notNull().defaultNow(),
    lastUpdated: timestamp("last_updated").notNull().defaultNow(),
    notified: boolean("notified").default(false).notNull(),
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
