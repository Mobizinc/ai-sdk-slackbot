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
  impact?: string;
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
  assignedToEmail?: string | null;
  openedBy?: string;
  openedBySysId?: string;
  callerId?: string;
  callerIdSysId?: string;
  submittedBy?: string;
  contact?: string;
  contactName?: string;
  contactPhone?: string;
  account?: string;
  accountName?: string;
  company?: string;
  companyName?: string;
  businessService?: string;
  location?: string;
  cmdbCi?: string;
  urgency?: string;
  sysDomain?: string;
  sysDomainPath?: string;
  resolvedAt?: Date;
  closedAt?: Date;
  active?: boolean;
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
  assignedTo?: string;
  assignmentGroup?: string;
  company?: string;
  callerId?: string;
  category?: string;
  subcategory?: string;
  businessService?: string;
  cmdbCi?: string;
  sysCreatedOn?: Date;
  sysUpdatedOn?: Date;
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
  company?: string;
  companyName?: string;
  ownerGroup?: string;
  supportGroup?: string;
  location?: string;
  environment?: string;
  status?: string;
  description?: string;
  url: string;
}

/**
 * Input for creating a new configuration item
 */
export interface CreateConfigurationItemInput {
  className: string;
  name: string;
  shortDescription?: string;
  ipAddress?: string;
  environment?: string;
  ownerGroup?: string;
  supportGroup?: string;
  location?: string;
  status?: string;
  installStatus?: string;
  company?: string;
  attributes?: Record<string, string | undefined>;
}

/**
 * Input for creating a CI relationship
 */
export interface CreateCIRelationshipInput {
  parentSysId: string;
  childSysId: string;
  relationshipType?: string;
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
  closeNotes?: string;
  closeCode?: string;
  incident?: string;
  problem?: string;
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
  impact?: string;
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
  // Enriched context
  workNotes?: string;
  customerNotes?: string;
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
  resolvedAfter?: Date;
  resolvedBefore?: Date;
  closedAfter?: Date;
  closedBefore?: Date;
  activeOnly?: boolean; // Filter by active status
  sysDomain?: string; // Domain sys_id for multi-tenant filtering
  includeChildDomains?: boolean; // If true, includes cases from child domains (hierarchical search)
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
  company?: string;
  ownerGroup?: string;
  environment?: string;
  operationalStatus?: string;
  location?: string;
  limit?: number;
}

/**
 * SPM (Service Portfolio Management) Project entity
 * Represents a project from the pm_project table
 */
export interface SPMProject {
  sysId: string;
  number: string;
  shortDescription: string;
  description?: string;
  state: string; // -5=Pending, -4=Open, -3=Work in Progress, 0=Closed Complete, 1=Closed Incomplete, 2=Closed Cancelled
  priority?: string;
  assignedTo?: string;
  assignedToName?: string;
  assignedToSysId?: string;
  assignmentGroup?: string;
  assignmentGroupName?: string;
  assignmentGroupSysId?: string;
  parent?: string; // Parent project sys_id
  parentNumber?: string;
  openedAt?: Date;
  closedAt?: Date;
  dueDate?: Date;
  startDate?: Date;
  endDate?: Date;
  percentComplete?: number;
  cost?: number;
  projectManager?: string;
  projectManagerName?: string;
  projectManagerSysId?: string;
  sponsor?: string;
  sponsorName?: string;
  portfolio?: string;
  portfolioName?: string;
  lifecycleStage?: string;
  active?: boolean;
  url: string;
}

/**
 * SPM Epic entity (child of project)
 * Represents an epic from the pm_epic or rm_epic table
 */
export interface SPMEpic {
  sysId: string;
  number: string;
  shortDescription: string;
  description?: string;
  state: string;
  parent: string; // Project sys_id
  parentNumber?: string;
  assignedTo?: string;
  assignedToName?: string;
  priority?: string;
  percentComplete?: number;
  dueDate?: Date;
  url: string;
}

/**
 * SPM Story entity (child of epic)
 * Represents a story from the rm_story table
 */
export interface SPMStory {
  sysId: string;
  number: string;
  shortDescription: string;
  description?: string;
  state: string;
  parent: string; // Epic sys_id
  parentNumber?: string;
  assignedTo?: string;
  assignedToName?: string;
  priority?: string;
  storyPoints?: number;
  sprintSysId?: string;
  url: string;
}

/**
 * Input for creating a new SPM project
 */
export interface CreateSPMProjectInput {
  shortDescription: string;
  description?: string;
  assignedTo?: string; // User sys_id or user name
  assignmentGroup?: string; // Group sys_id or group name
  priority?: string;
  parent?: string; // Parent project sys_id
  dueDate?: string; // ISO date string
  startDate?: string; // ISO date string
  projectManager?: string; // User sys_id or user name
  sponsor?: string; // User sys_id or user name
  portfolio?: string; // Portfolio sys_id
  lifecycleStage?: string;
}

/**
 * Input for updating an SPM project
 */
export interface UpdateSPMProjectInput {
  shortDescription?: string;
  description?: string;
  state?: string;
  assignedTo?: string;
  assignmentGroup?: string;
  percentComplete?: number;
  priority?: string;
  dueDate?: string;
  projectManager?: string;
  sponsor?: string;
  lifecycleStage?: string;
}

/**
 * Criteria for searching SPM projects
 */
export interface SPMSearchCriteria {
  number?: string;
  shortDescription?: string;
  query?: string; // Full-text search
  state?: string;
  priority?: string;
  assignedTo?: string; // User name or sys_id
  assignmentGroup?: string; // Group name or sys_id
  projectManager?: string; // User name or sys_id
  parent?: string; // Parent project sys_id
  portfolio?: string; // Portfolio sys_id
  lifecycleStage?: string;
  activeOnly?: boolean;
  openedAfter?: Date;
  openedBefore?: Date;
  dueBefore?: Date;
  sortBy?: 'number' | 'opened_at' | 'due_date' | 'priority' | 'percent_complete';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Health status value for project status reports
 * green = On Track, yellow = At Risk, red = Off Track
 */
export type HealthStatus = 'green' | 'yellow' | 'red';

/**
 * Project Status entity (project health reporting)
 * Represents a status report from the project_status table
 */
export interface ProjectStatus {
  sysId: string;
  number: string; // PRJSTAT0010761
  projectSysId: string;
  projectName: string;
  projectNumber?: string; // PRJ0002582
  overallHealth: HealthStatus;
  scheduleHealth: HealthStatus;
  costHealth: HealthStatus;
  scopeHealth: HealthStatus;
  resourcesHealth: HealthStatus;
  state: string;
  phase?: string; // executing, planning, etc.
  statusDate: Date; // as_on field
  createdOn: Date;
  createdBy?: string;
  url: string;
}

/**
 * Project with latest status (combined view)
 */
export interface ProjectWithStatus extends SPMProject {
  latestStatus?: {
    overallHealth: HealthStatus;
    scheduleHealth: HealthStatus;
    costHealth: HealthStatus;
    scopeHealth: HealthStatus;
    resourcesHealth: HealthStatus;
    statusDate: Date;
    statusNumber: string;
  };
}

/**
 * Criteria for searching project status reports
 */
export interface ProjectStatusSearchCriteria {
  projectSysId?: string;
  overallHealth?: HealthStatus;
  scheduleHealth?: HealthStatus;
  costHealth?: HealthStatus;
  scopeHealth?: HealthStatus;
  resourcesHealth?: HealthStatus;
  statusDateAfter?: Date;
  statusDateBefore?: Date;
  latestOnly?: boolean; // Only get latest status per project
  sortBy?: 'as_on' | 'sys_created_on' | 'overall_health';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Request entity (parent of RITM records)
 * Represents a service catalog request from the sc_request table
 */
export interface Request {
  sysId: string;
  number: string; // REQ0043549
  shortDescription: string;
  description?: string;
  requestedFor?: string; // User sys_id requesting
  requestedForName?: string;
  requestedBy?: string; // User sys_id who submitted
  requestedByName?: string;
  state?: string; // Pending, In Progress, Closed Complete, etc.
  priority?: string;
  openedAt?: Date;
  closedAt?: Date;
  dueDate?: Date;
  stage?: string; // Fulfillment stage
  approvalState?: string; // Approved, Rejected, etc.
  deliveryAddress?: string;
  specialInstructions?: string;
  price?: number;
  url: string;
}

/**
 * Requested Item entity (RITM - child of Request)
 * Represents a requested item from the sc_req_item table
 */
export interface RequestedItem {
  sysId: string;
  number: string; // RITM0046210
  shortDescription: string;
  description?: string;
  request?: string; // Parent REQ sys_id
  requestNumber?: string; // Parent REQ number
  catalogItem?: string; // Catalog item sys_id
  catalogItemName?: string;
  state?: string; // Pending, In Progress, Closed Complete, etc.
  stage?: string;
  openedAt?: Date;
  closedAt?: Date;
  dueDate?: Date;
  assignedTo?: string;
  assignedToName?: string;
  assignmentGroup?: string;
  assignmentGroupName?: string;
  quantity?: number;
  price?: number;
  url: string;
}

/**
 * Service Catalog Task entity (child of RITM)
 * Represents a catalog task from the sc_task table
 */
export interface CatalogTask {
  sysId: string;
  number: string; // CTASK0049921
  shortDescription: string;
  description?: string;
  requestItem?: string; // Parent RITM sys_id
  requestItemNumber?: string; // Parent RITM number
  request?: string; // Grandparent REQ sys_id
  requestNumber?: string; // Grandparent REQ number
  state?: string; // Open, Work in Progress, Closed Complete, etc.
  active?: boolean;
  openedAt?: Date;
  closedAt?: Date;
  dueDate?: Date;
  assignedTo?: string;
  assignedToName?: string;
  assignmentGroup?: string;
  assignmentGroupName?: string;
  priority?: string;
  workNotes?: string;
  closeNotes?: string;
  url: string;
}

/**
 * Criteria for searching requests
 */
export interface RequestSearchCriteria {
  number?: string;
  requestedFor?: string; // User sys_id
  requestedBy?: string; // User sys_id
  state?: string;
  priority?: string;
  openedAfter?: Date;
  openedBefore?: Date;
  sortBy?: 'number' | 'opened_at' | 'due_date' | 'priority';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Criteria for searching requested items
 */
export interface RequestedItemSearchCriteria {
  number?: string;
  request?: string; // Parent request sys_id or number
  catalogItem?: string; // Catalog item name or sys_id
  state?: string;
  assignedTo?: string;
  assignmentGroup?: string;
  openedAfter?: Date;
  sortBy?: 'number' | 'opened_at' | 'due_date';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Criteria for searching catalog tasks
 */
export interface CatalogTaskSearchCriteria {
  number?: string;
  requestItem?: string; // Parent RITM sys_id or number
  request?: string; // Grandparent REQ sys_id or number
  state?: string;
  active?: boolean;
  assignedTo?: string;
  assignmentGroup?: string;
  openedAfter?: Date;
  sortBy?: 'number' | 'opened_at' | 'due_date';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}
