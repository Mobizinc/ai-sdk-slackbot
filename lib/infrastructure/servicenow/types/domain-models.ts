/**
 * ServiceNow Domain Models
 *
 * Clean domain models that abstract away ServiceNow's API response format.
 * These models provide type-safe interfaces for working with ServiceNow entities.
 */

/**
 * Case entity representing a customer service case
 */
export interface Case {
  sysId: string;
  number: string;
  shortDescription: string;
  description?: string;
  priority?: string;
  state?: string;
  category?: string;
  subcategory?: string;
  openedAt?: Date;
  updatedOn?: Date; // Mapped from sys_updated_on for stale detection and sorting
  ageDays?: number; // Calculated field: days since opened (for display)
  assignmentGroup?: string;
  assignmentGroupSysId?: string;
  assignedTo?: string;
  assignedToSysId?: string;
  openedBy?: string;
  openedBySysId?: string;
  callerId?: string;
  callerIdSysId?: string;
  submittedBy?: string;
  contact?: string;
  contactName?: string;
  account?: string;
  accountName?: string;
  company?: string;
  url: string;
}

/**
 * Customer account entity (multi-tenant context)
 */
export interface CustomerAccount {
  sysId: string;
  number: string;
  name: string;
  url: string;
}

/**
 * Incident entity representing an IT incident
 */
export interface Incident {
  sysId: string;
  number: string;
  shortDescription: string;
  description?: string;
  state?: string;
  priority?: string;
  resolvedAt?: Date;
  closeCode?: string;
  parent?: string;
  url: string;
}

/**
 * Problem entity representing an IT problem
 */
export interface Problem {
  sysId: string;
  number: string;
  shortDescription: string;
  description?: string;
  state?: string;
  priority?: string;
  url: string;
}

/**
 * Configuration Item (CI) representing an asset in the CMDB
 */
export interface ConfigurationItem {
  sysId: string;
  name: string;
  className?: string;
  fqdn?: string;
  hostName?: string;
  ipAddresses: string[];
  ownerGroup?: string;
  supportGroup?: string;
  location?: string;
  environment?: string;
  status?: string;
  description?: string;
  url: string;
}

/**
 * Knowledge Article entity
 */
export interface KnowledgeArticle {
  sysId: string;
  number: string;
  shortDescription: string;
  text?: string;
  url: string;
}

/**
 * Catalog Item entity
 */
export interface CatalogItem {
  sysId: string;
  name: string;
  shortDescription?: string;
  description?: string;
  category?: string;
  active: boolean;
  url: string;
}

/**
 * Task entity (generic task)
 */
export interface Task {
  sysId: string;
  number: string;
  shortDescription: string;
  state?: string;
  assignedTo?: string;
  parent?: string;
  url: string;
}

/**
 * Journal Entry (work note or comment)
 */
export interface JournalEntry {
  sysId: string;
  element: string;
  elementId: string;
  name?: string;
  createdOn: Date;
  createdBy: string;
  value?: string;
}

/**
 * Choice value from ServiceNow choice lists
 */
export interface Choice {
  label: string;
  value: string;
  sequence?: number;
  inactive?: boolean;
  dependentValue?: string;
}

/**
 * Assignment Group entity representing a ServiceNow group
 */
export interface AssignmentGroup {
  sysId: string;
  name: string;
  description?: string;
  manager?: string;
  active: boolean;
  url: string;
}

/**
 * Input for creating a new case
 */
export interface CreateCaseInput {
  shortDescription: string;
  description?: string;
  callerId?: string;
  contact?: string;
  account?: string;
  category?: string;
  subcategory?: string;
  priority?: string;
  assignmentGroup?: string;
}

/**
 * Input for updating a case
 */
export interface UpdateCaseInput {
  shortDescription?: string;
  description?: string;
  priority?: string;
  state?: string;
  category?: string;
  subcategory?: string;
  assignmentGroup?: string;
  assignedTo?: string;
}

/**
 * Input for creating an incident from a case
 */
export interface CreateIncidentInput {
  shortDescription: string;
  description?: string;
  caller?: string;
  category?: string;
  subcategory?: string;
  urgency?: string;
  priority?: string;
  assignmentGroup?: string;
  assignedTo?: string;
  // Company/Account context (prevents orphaned incidents)
  company?: string;
  account?: string;
  businessService?: string;
  location?: string;
  // Contact information
  contact?: string;
  contactType?: string;
  openedBy?: string;
  // Technical context
  cmdbCi?: string;
  // Multi-tenancy / Domain separation
  sysDomain?: string;
  sysDomainPath?: string;
  // Major incident flag
  isMajorIncident?: boolean;
}

/**
 * Input for creating a problem from a case
 */
export interface CreateProblemInput {
  shortDescription: string;
  description?: string;
  category?: string;
  subcategory?: string;
  urgency?: string;
  priority?: string;
  caller?: string;
  assignmentGroup?: string;
  assignedTo?: string;
  firstReportedBy?: string;
  // Company/Account context
  company?: string;
  account?: string;
  businessService?: string;
  location?: string;
  // Contact information
  contact?: string;
  contactType?: string;
  openedBy?: string;
  // Technical context
  cmdbCi?: string;
  // Multi-tenancy / Domain separation
  sysDomain?: string;
  sysDomainPath?: string;
  caseNumber?: string;
}

/**
 * Criteria for searching cases
 */
export interface CaseSearchCriteria {
  number?: string;
  shortDescription?: string;
  query?: string; // Full-text search across description fields
  account?: string; // Account sys_id
  accountName?: string; // Account display name (requires lookup)
  companyName?: string; // Company display name (requires lookup)
  caller?: string;
  state?: string;
  priority?: string;
  category?: string;
  assignmentGroup?: string; // Assignment group display name
  assignedTo?: string; // Assigned user display name
  openedAfter?: Date;
  openedBefore?: Date;
  updatedAfter?: Date;
  updatedBefore?: Date;
  activeOnly?: boolean; // Filter by active status
  sortBy?: 'opened_at' | 'priority' | 'updated_on' | 'state';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Criteria for searching configuration items
 */
export interface CISearchCriteria {
  name?: string;
  ipAddress?: string;
  fqdn?: string;
  className?: string;
  sysId?: string;
  ownerGroup?: string;
  environment?: string;
  limit?: number;
}
