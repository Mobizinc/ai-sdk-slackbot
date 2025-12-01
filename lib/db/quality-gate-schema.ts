/**
 * Quality Gate Database Schema
 * 
 * Database tables for persistent quality control system
 * to prevent issues like SCS0051638
 */

import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  jsonb,
  integer,
  real,
  index,
  unique
} from "drizzle-orm/pg-core";

/**
 * Quality Gate Records
 * 
 * Tracks all quality gate decisions and their outcomes
 * Provides audit trail for compliance and analysis
 */
export const qualityGateRecords = pgTable("quality_gate_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseNumber: text("case_number").notNull(),
  caseSysId: text("case_sys_id").notNull(),
  gateType: text("gate_type").notNull(), // CLASSIFICATION, ESCALATION, KB_GENERATION, CHANGE_VALIDATION
  status: text("status").notNull(), // PENDING, APPROVED, REJECTED, CLARIFICATION_NEEDED, ESCALATED, EXPIRED
  decision: jsonb("decision").notNull(), // Full quality gate result
  blocked: boolean("blocked").notNull().default(false),
  riskLevel: text("risk_level").notNull(), // LOW, MEDIUM, HIGH
  clarificationsRequired: jsonb("clarifications_required"), // Array of required clarifications
  autoApproved: boolean("auto_approved").default(false),
  reviewerId: text("reviewer_id"), // System or user ID who reviewed
  reviewReason: text("review_reason"),
  reviewMetadata: jsonb("review_metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  expiresAt: timestamp("expires_at"),
}, (table) => ({
  // Indexes for performance
  caseNumberIdx: index("idx_quality_gate_case_number").on(table.caseNumber),
  statusIdx: index("idx_quality_gate_status").on(table.status),
  gateTypeIdx: index("idx_quality_gate_gate_type").on(table.gateType),
  createdAtIdx: index("idx_quality_gate_created_at").on(table.createdAt),
  statusTypeIdx: index("idx_quality_gate_status_type").on(table.status, table.gateType),
  blockedIdx: index("idx_quality_gate_blocked").on(table.blocked),
  riskLevelIdx: index("idx_quality_gate_risk_level").on(table.riskLevel),
}));

/**
 * Clarification Sessions
 * 
 * Tracks interactive clarification sessions with users
 * Manages session lifecycle and response collection
 */
export const clarificationSessions = pgTable("clarification_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  qualityGateId: uuid("quality_gate_id").references(() => qualityGateRecords.id, { onDelete: "cascade" }),
  sessionType: text("session_type").notNull(), // CLASSIFICATION_CLARIFICATION, ENTITY_VERIFICATION, CMDB_RECONCILIATION
  sessionId: text("session_id").notNull().unique(),
  caseNumber: text("case_number").notNull(),
  caseSysId: text("case_sys_id").notNull(),
  questions: jsonb("questions").notNull(), // Array of clarification questions
  responses: jsonb("responses").default("{}"), // User responses
  status: text("status").notNull(), // ACTIVE, RESPONDED, RESOLVED, EXPIRED, CANCELLED
  slackChannel: text("slack_channel"),
  slackThreadTs: text("slack_thread_ts"),
  slackMessageTs: text("slack_message_ts"),
  requestedBy: text("requested_by"),
  respondedBy: text("responded_by"),
  responseMetadata: jsonb("response_metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  respondedAt: timestamp("responded_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => ({
  // Indexes for performance
  qualityGateIdIdx: index("idx_clarification_quality_gate_id").on(table.qualityGateId),
  sessionIdIdx: unique("uq_clarification_session_id").on(table.sessionId),
  statusIdx: index("idx_clarification_status").on(table.status),
  caseNumberIdx: index("idx_clarification_case_number").on(table.caseNumber),
  expiresAtIdx: index("idx_clarification_expires_at").on(table.expiresAt),
  createdAtIdx: index("idx_clarification_created_at").on(table.createdAt),
  statusTypeIdx: index("idx_clarification_status_type").on(table.status, table.sessionType),
}));

/**
 * Quality Audit Trail
 * 
 * Comprehensive audit log for all quality control actions
 * Essential for compliance and forensic analysis
 */
export const qualityAuditTrail = pgTable("quality_audit_trail", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: text("entity_type").notNull(), // QUALITY_GATE, CLARIFICATION_SESSION, CLASSIFICATION
  entityId: uuid("entity_id").notNull(),
  action: text("action").notNull(), // CREATED, UPDATED, APPROVED, REJECTED, ESCALATED, EXPIRED, RESUMED
  previousState: jsonb("previous_state"),
  newState: jsonb("new_state"),
  reason: text("reason"),
  performedBy: text("performed_by"), // System or user ID
  performedAt: timestamp("performed_at").defaultNow(),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (table) => ({
  // Indexes for audit queries
  entityIdx: index("idx_quality_audit_entity").on(table.entityType, table.entityId),
  actionIdx: index("idx_quality_audit_action").on(table.action),
  performedAtIdx: index("idx_quality_audit_performed_at").on(table.performedAt),
  performedByIdx: index("idx_quality_audit_performed_by").on(table.performedBy),
}));

/**
 * Quality Metrics
 * 
 * Aggregated metrics for quality control performance analysis
 * Supports reporting and continuous improvement
 */
export const qualityMetrics = pgTable("quality_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  metricType: text("metric_type").notNull(), // ACCURACY, CONFIDENCE, ESCALATION_RATE, CLARIFICATION_RATE, RESPONSE_TIME
  entityType: text("entity_type").notNull(), // CLASSIFICATION, KB_GENERATION, ESCALATION, CLARIFICATION
  timeWindow: text("time_window").notNull(), // HOURLY, DAILY, WEEKLY, MONTHLY
  windowStart: timestamp("window_start").notNull(),
  windowEnd: timestamp("window_end").notNull(),
  totalGates: integer("total_gates").default(0),
  approvedGates: integer("approved_gates").default(0),
  rejectedGates: integer("rejected_gates").default(0),
  escalatedGates: integer("escalated_gates").default(0),
  clarificationNeededGates: integer("clarification_needed_gates").default(0),
  averageConfidence: real("average_confidence"),
  averageProcessingTimeMs: real("average_processing_time_ms"),
  averageResponseTimeMinutes: real("average_response_time_minutes"),
  successRate: real("success_rate"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  // Indexes for metric queries
  metricTypeIdx: index("idx_quality_metrics_type").on(table.metricType),
  entityTypeIdx: index("idx_quality_metrics_entity").on(table.entityType),
  timeWindowIdx: index("idx_quality_metrics_time_window").on(table.timeWindow, table.windowStart),
  windowStartIdx: index("idx_quality_metrics_window_start").on(table.windowStart),
  metricEntityIdx: index("idx_quality_metrics_metric_entity").on(table.metricType, table.entityType),
}));

/**
 * Quality Thresholds
 * 
 * Configurable thresholds for quality control behavior
 * Allows runtime adjustment of quality criteria
 */
export const qualityThresholds = pgTable("quality_thresholds", {
  id: uuid("id").primaryKey().defaultRandom(),
  gateType: text("gate_type").notNull(),
  thresholdType: text("threshold_type").notNull(), // CONFIDENCE, PROCESSING_TIME, ENTITY_COUNT, RESPONSE_TIME
  minValue: real("min_value"),
  maxValue: real("max_value"),
  action: text("action").notNull(), // AUTO_APPROVE, REQUIRE_REVIEW, ESCALATE, BLOCK
  isActive: boolean("is_active").default(true),
  priority: integer("priority").default(0),
  conditions: jsonb("conditions"), // Complex conditions for threshold application
  clientId: text("client_id"), // Client-specific thresholds
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
}, (table) => ({
  // Indexes for threshold lookups
  gateTypeIdx: index("idx_quality_thresholds_gate_type").on(table.gateType),
  thresholdTypeIdx: index("idx_quality_thresholds_threshold_type").on(table.thresholdType),
  clientIdIdx: index("idx_quality_thresholds_client_id").on(table.clientId),
  isActiveIdx: index("idx_quality_thresholds_is_active").on(table.isActive),
  priorityIdx: index("idx_quality_thresholds_priority").on(table.priority),
}));

// Type exports
export type QualityGateRecord = typeof qualityGateRecords.$inferSelect;
export type NewQualityGateRecord = typeof qualityGateRecords.$inferInsert;
export type ClarificationSession = typeof clarificationSessions.$inferSelect;
export type NewClarificationSession = typeof clarificationSessions.$inferInsert;
export type QualityAuditTrail = typeof qualityAuditTrail.$inferSelect;
export type NewQualityAuditTrail = typeof qualityAuditTrail.$inferInsert;
export type QualityMetric = typeof qualityMetrics.$inferSelect;
export type NewQualityMetric = typeof qualityMetrics.$inferInsert;
export type QualityThreshold = typeof qualityThresholds.$inferSelect;
export type NewQualityThreshold = typeof qualityThresholds.$inferInsert;