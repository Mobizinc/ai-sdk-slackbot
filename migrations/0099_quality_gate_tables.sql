/**
 * Quality Gate Database Migration
 * 
 * Creates tables for quality control system to prevent issues like SCS0051638
 */

import { sql } from "drizzle-orm";

export const up = sql`
-- Quality Gate Records Table
-- Tracks all quality gate decisions and their outcomes
CREATE TABLE IF NOT EXISTS quality_gate_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT NOT NULL,
  case_sys_id TEXT NOT NULL,
  gate_type TEXT NOT NULL, -- CLASSIFICATION, ESCALATION, KB_GENERATION, CHANGE_VALIDATION
  status TEXT NOT NULL, -- PENDING, APPROVED, REJECTED, CLARIFICATION_NEEDED, ESCALATED, EXPIRED
  decision JSONB NOT NULL,
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  risk_level TEXT NOT NULL, -- LOW, MEDIUM, HIGH
  clarifications_required JSONB,
  auto_approved BOOLEAN DEFAULT FALSE,
  reviewer_id TEXT, -- System or user ID who reviewed
  review_reason TEXT,
  review_metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Clarification Sessions Table
-- Tracks interactive clarification sessions with users
CREATE TABLE IF NOT EXISTS clarification_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quality_gate_id UUID REFERENCES quality_gate_records(id) ON DELETE CASCADE,
  session_type TEXT NOT NULL, -- CLASSIFICATION_CLARIFICATION, ENTITY_VERIFICATION, CMDB_RECONCILIATION
  session_id TEXT NOT NULL UNIQUE,
  case_number TEXT NOT NULL,
  case_sys_id TEXT NOT NULL,
  questions JSONB NOT NULL, -- Array of clarification questions
  responses JSONB DEFAULT '{}', -- User responses
  status TEXT NOT NULL, -- ACTIVE, RESPONDED, RESOLVED, EXPIRED, CANCELLED
  slack_channel TEXT,
  slack_thread_ts TEXT,
  slack_message_ts TEXT,
  requested_by TEXT,
  responded_by TEXT,
  response_metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  responded_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Quality Audit Trail Table
-- Comprehensive audit log for all quality control actions
CREATE TABLE IF NOT EXISTS quality_audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- QUALITY_GATE, CLARIFICATION_SESSION, CLASSIFICATION
  entity_id UUID NOT NULL,
  action TEXT NOT NULL, -- CREATED, UPDATED, APPROVED, REJECTED, ESCALATED, EXPIRED, RESUMED
  previous_state JSONB,
  new_state JSONB,
  reason TEXT,
  performed_by TEXT, -- System or user ID
  performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT
);

-- Quality Metrics Table
-- Aggregated metrics for quality control performance analysis
CREATE TABLE IF NOT EXISTS quality_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL, -- ACCURACY, CONFIDENCE, ESCALATION_RATE, CLARIFICATION_RATE, RESPONSE_TIME
  entity_type TEXT NOT NULL, -- CLASSIFICATION, KB_GENERATION, ESCALATION, CLARIFICATION
  time_window TEXT NOT NULL, -- HOURLY, DAILY, WEEKLY, MONTHLY
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  window_end TIMESTAMP WITH TIME ZONE NOT NULL,
  total_gates INTEGER DEFAULT 0,
  approved_gates INTEGER DEFAULT 0,
  rejected_gates INTEGER DEFAULT 0,
  escalated_gates INTEGER DEFAULT 0,
  clarification_needed_gates INTEGER DEFAULT 0,
  average_confidence REAL,
  average_processing_time_ms REAL,
  average_response_time_minutes REAL,
  success_rate REAL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Quality Thresholds Table
-- Configurable thresholds for quality control behavior
CREATE TABLE IF NOT EXISTS quality_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_type TEXT NOT NULL,
  threshold_type TEXT NOT NULL, -- CONFIDENCE, PROCESSING_TIME, ENTITY_COUNT, RESPONSE_TIME
  min_value REAL,
  max_value REAL,
  action TEXT NOT NULL, -- AUTO_APPROVE, REQUIRE_REVIEW, ESCALATE, BLOCK
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0,
  conditions JSONB, -- Complex conditions for threshold application
  client_id TEXT, -- Client-specific thresholds
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

-- Performance Indexes for Quality Gate Records
CREATE INDEX IF NOT EXISTS idx_quality_gate_case_number ON quality_gate_records(case_number);
CREATE INDEX IF NOT EXISTS idx_quality_gate_status ON quality_gate_records(status);
CREATE INDEX IF NOT EXISTS idx_quality_gate_gate_type ON quality_gate_records(gate_type);
CREATE INDEX IF NOT EXISTS idx_quality_gate_created_at ON quality_gate_records(created_at);
CREATE INDEX IF NOT EXISTS idx_quality_gate_status_type ON quality_gate_records(status, gate_type);
CREATE INDEX IF NOT EXISTS idx_quality_gate_blocked ON quality_gate_records(blocked);
CREATE INDEX IF NOT EXISTS idx_quality_gate_risk_level ON quality_gate_records(risk_level);

-- Performance Indexes for Clarification Sessions
CREATE INDEX IF NOT EXISTS idx_clarification_quality_gate_id ON clarification_sessions(quality_gate_id);
CREATE INDEX IF NOT EXISTS idx_clarification_session_id ON clarification_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_clarification_status ON clarification_sessions(status);
CREATE INDEX IF NOT EXISTS idx_clarification_case_number ON clarification_sessions(case_number);
CREATE INDEX IF NOT EXISTS idx_clarification_expires_at ON clarification_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_clarification_created_at ON clarification_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_clarification_status_type ON clarification_sessions(status, session_type);

-- Performance Indexes for Quality Audit Trail
CREATE INDEX IF NOT EXISTS idx_quality_audit_entity ON quality_audit_trail(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_quality_audit_action ON quality_audit_trail(action);
CREATE INDEX IF NOT EXISTS idx_quality_audit_performed_at ON quality_audit_trail(performed_at);
CREATE INDEX IF NOT EXISTS idx_quality_audit_performed_by ON quality_audit_trail(performed_by);

-- Performance Indexes for Quality Metrics
CREATE INDEX IF NOT EXISTS idx_quality_metrics_type ON quality_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_quality_metrics_entity ON quality_metrics(entity_type);
CREATE INDEX IF NOT EXISTS idx_quality_metrics_time_window ON quality_metrics(time_window, window_start);
CREATE INDEX IF NOT EXISTS idx_quality_metrics_window_start ON quality_metrics(window_start);
CREATE INDEX IF NOT EXISTS idx_quality_metrics_metric_entity ON quality_metrics(metric_type, entity_type);

-- Performance Indexes for Quality Thresholds
CREATE INDEX IF NOT EXISTS idx_quality_thresholds_gate_type ON quality_thresholds(gate_type);
CREATE INDEX IF NOT EXISTS idx_quality_thresholds_threshold_type ON quality_thresholds(threshold_type);
CREATE INDEX IF NOT EXISTS idx_quality_thresholds_client_id ON quality_thresholds(client_id);
CREATE INDEX IF NOT EXISTS idx_quality_thresholds_is_active ON quality_thresholds(is_active);
CREATE INDEX IF NOT EXISTS idx_quality_thresholds_priority ON quality_thresholds(priority);
`;

export const down = sql`
-- Drop indexes in reverse order
DROP INDEX IF EXISTS idx_quality_thresholds_priority;
DROP INDEX IF EXISTS idx_quality_thresholds_is_active;
DROP INDEX IF EXISTS idx_quality_thresholds_client_id;
DROP INDEX IF EXISTS idx_quality_thresholds_threshold_type;
DROP INDEX IF EXISTS idx_quality_thresholds_gate_type;

DROP INDEX IF EXISTS idx_quality_metrics_metric_entity;
DROP INDEX IF EXISTS idx_quality_metrics_window_start;
DROP INDEX IF EXISTS idx_quality_metrics_time_window;
DROP INDEX IF EXISTS idx_quality_metrics_entity;
DROP INDEX IF EXISTS idx_quality_metrics_type;

DROP INDEX IF EXISTS idx_quality_audit_performed_by;
DROP INDEX IF EXISTS idx_quality_audit_performed_at;
DROP INDEX IF EXISTS idx_quality_audit_action;
DROP INDEX IF EXISTS idx_quality_audit_entity;

DROP INDEX IF EXISTS idx_clarification_status_type;
DROP INDEX IF EXISTS idx_clarification_created_at;
DROP INDEX IF EXISTS idx_clarification_expires_at;
DROP INDEX IF EXISTS idx_clarification_case_number;
DROP INDEX IF EXISTS idx_clarification_status;
DROP INDEX IF EXISTS idx_clarification_session_id;
DROP INDEX IF EXISTS idx_clarification_quality_gate_id;

DROP INDEX IF EXISTS idx_quality_gate_risk_level;
DROP INDEX IF EXISTS idx_quality_gate_blocked;
DROP INDEX IF EXISTS idx_quality_gate_status_type;
DROP INDEX IF EXISTS idx_quality_gate_created_at;
DROP INDEX IF EXISTS idx_quality_gate_gate_type;
DROP INDEX IF EXISTS idx_quality_gate_status;
DROP INDEX IF EXISTS idx_quality_gate_case_number;

-- Drop tables in reverse order
DROP TABLE IF EXISTS quality_thresholds;
DROP TABLE IF EXISTS quality_metrics;
DROP TABLE IF EXISTS quality_audit_trail;
DROP TABLE IF EXISTS clarification_sessions;
DROP TABLE IF EXISTS quality_gate_records;
`;