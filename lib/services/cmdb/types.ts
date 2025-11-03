/**
 * CMDB Reconciliation Module Types
 * 
 * Canonical source for all CMDB reconciliation types.
 * Shared interfaces and types for CMDB reconciliation services.
 */

import type { ServiceNowConfigurationItem } from "../../tools/servicenow";
import type { CmdbReconciliationResult } from "../../db/schema";

/**
 * Input for reconciliation processing
 */
export interface ReconciliationInput {
  caseNumber: string;
  caseSysId: string;
  entities: {
    ip_addresses: string[];
    systems: string[];
    users: string[];
    software: string[];
    error_codes: string[];
    network_devices: string[];
  };
}

/**
 * Result of reconciliation processing
 */
export interface ReconciliationResult {
  caseNumber: string;
  totalEntities: number;
  matched: number;
  unmatched: number;
  skipped: number;
  ambiguous: number;
  results?: CmdbReconciliationResult[];
}

/**
 * Result of entity resolution process
 */
export interface EntityResolutionResult {
  originalValue: string;
  resolvedValue: string | null;
  businessContextMatch?: string;
  isAliasResolved: boolean;
  isCiWorthy: boolean;
}

/**
 * Business context match information
 */
export interface CmdbContextMatch {
  entityName: string;
  aliases: string[];
  cmdbIdentifiers: Array<{
    ciName: string;
    sysId: string;
    ipAddresses?: string[];
  }>;
}

/**
 * Entity input for reconciliation processing
 */
export interface EntityInput {
  value: string;
  type: string;
  caseNumber: string;
  caseSysId: string;
}

/**
 * Result of entity resolution process
 */
export interface ResolvedEntity {
  originalValue: string;
  resolvedValue: string | null;
  businessContextMatch?: string;
  isAliasResolved: boolean;
  isCiWorthy: boolean;
}

/**
 * CMDB match processing results
 */
export interface MatchResult {
  action: 'link_ci' | 'create_task' | 'ambiguous' | 'skip';
  match?: ServiceNowConfigurationItem;
  details?: string;
  confidence: number;
}

/**
 * Reconciliation processing context
 */
export interface ReconciliationContext {
  caseNumber: string;
  caseSysId: string;
  entityValue: string;
  entityType: string;
  originalEntityValue: string;
  resolvedEntityValue?: string | null;
  businessContextMatch?: string;
}

/**
 * Side-effect execution results
 */
export interface SideEffectResult {
  taskCreated?: {
    taskNumber: string;
    taskSysId: string;
  };
  ciLinked?: {
    ciSysId: string;
    ciName: string;
    ciClass?: string;
    ciUrl: string;
  };
  notificationSent?: {
    channel: string;
    message: string;
  };
}

/**
 * Processing statistics
 */
export interface ProcessingStats {
  total: number;
  matched: number;
  unmatched: number;
  skipped: number;
  ambiguous: number;
}

/**
 * Service health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  checks: {
    database: boolean;
    businessContext: boolean;
    serviceNow: boolean;
    slack: boolean;
  };
  errors?: string[];
}

/**
 * Configuration options for reconciliation
 */
export interface ReconciliationOptions {
  enableCaching?: boolean;
  enableNotifications?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
}

/**
 * Entity type mapping
 */
export const ENTITY_TYPES = {
  IP_ADDRESS: 'IP_ADDRESS',
  SYSTEM: 'SYSTEM', 
  USER: 'USER',
  SOFTWARE: 'SOFTWARE',
  ERROR_CODE: 'ERROR_CODE',
  NETWORK_DEVICE: 'NETWORK_DEVICE',
} as const;

export type EntityType = typeof ENTITY_TYPES[keyof typeof ENTITY_TYPES];

/**
 * CI-worthy entity types
 */
export const CI_WORTHY_TYPES = [
  ENTITY_TYPES.IP_ADDRESS,
  ENTITY_TYPES.SYSTEM,
  ENTITY_TYPES.SOFTWARE,
  ENTITY_TYPES.NETWORK_DEVICE,
] as const;

/**
 * Reconciliation action types
 */
export const RECONCILIATION_ACTIONS = {
  LINK_CI: 'link_ci',
  CREATE_TASK: 'create_task', 
  AMBIGUOUS: 'ambiguous',
  SKIP: 'skip',
} as const;

export type ReconciliationAction = typeof RECONCILIATION_ACTIONS[keyof typeof RECONCILIATION_ACTIONS];