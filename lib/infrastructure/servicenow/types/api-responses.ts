/**
 * ServiceNow API Response Types
 *
 * These types represent the actual structure of responses from the ServiceNow REST API.
 * ServiceNow often returns fields as objects with {value, display_value, link} structure.
 */

/**
 * ServiceNow reference field structure
 */
export interface ServiceNowReference {
  value: string; // sys_id
  display_value: string; // Display name
  link?: string; // API link to the referenced record
}

/**
 * ServiceNow field that can be either a string or a reference object
 */
export type ServiceNowField = string | ServiceNowReference;

/**
 * Standard ServiceNow table response wrapper
 */
export interface ServiceNowTableResponse<T> {
  result?: T;
  headers?: Record<string, string>;
}

/**
 * ServiceNow error response
 */
export interface ServiceNowErrorResponse {
  error: {
    message: string;
    detail?: string;
  };
  status: string;
}

/**
 * Case record from ServiceNow API
 */
export interface CaseRecord {
  sys_id: string;
  number: string;
  short_description: ServiceNowField;
  description: ServiceNowField;
  priority: ServiceNowField;
  impact?: ServiceNowField;
  state: ServiceNowField;
  category: ServiceNowField;
  subcategory: ServiceNowField;
  company: ServiceNowField;
  opened_at: string;
  assignment_group: ServiceNowField;
  assigned_to: ServiceNowField;
  active?: ServiceNowField | string | boolean;
  opened_by: ServiceNowField;
  caller_id: ServiceNowField;
  submitted_by: ServiceNowField;
  contact: ServiceNowField;
  u_contact_phone?: ServiceNowField;
  contact_phone?: ServiceNowField;
  account: ServiceNowField;
  resolved_at?: string;
  closed_at?: string;
  business_service?: ServiceNowField;
  location?: ServiceNowField;
  cmdb_ci?: ServiceNowField;
  urgency?: ServiceNowField;
  sys_domain?: ServiceNowField;
  sys_domain_path?: ServiceNowField;
  sys_created_on?: string;
  sys_updated_on?: string;
}

/**
 * Incident record from ServiceNow API
 */
export interface IncidentRecord {
  sys_id: string;
  number: string;
  short_description: ServiceNowField;
  description: ServiceNowField;
  state: ServiceNowField;
  priority: ServiceNowField;
  assigned_to: ServiceNowField;
  assignment_group: ServiceNowField;
  company: ServiceNowField;
  caller_id: ServiceNowField;
  category: ServiceNowField;
  subcategory: ServiceNowField;
  business_service?: ServiceNowField;
  cmdb_ci?: ServiceNowField;
  resolved_at?: string;
  close_code: ServiceNowField;
  parent: ServiceNowField;
  sys_created_on?: string;
  sys_updated_on?: string;
}

/**
 * Problem record from ServiceNow API
 */
export interface ProblemRecord {
  sys_id: string;
  number: string;
  short_description: ServiceNowField;
  description: ServiceNowField;
  state: ServiceNowField;
  priority: ServiceNowField;
  sys_created_on?: string;
  sys_updated_on?: string;
}

/**
 * Configuration Item record from ServiceNow API
 */
export interface ConfigurationItemRecord {
  sys_id: string;
  name: ServiceNowField;
  sys_class_name: ServiceNowField;
  fqdn: ServiceNowField;
  host_name: ServiceNowField;
  ip_address: ServiceNowField | ServiceNowField[];
  company: ServiceNowField;
  owner_group: ServiceNowField;
  support_group: ServiceNowField;
  location: ServiceNowField;
  u_environment: ServiceNowField;
  install_status: ServiceNowField;
  short_description: ServiceNowField;
  sys_created_on?: string;
  sys_updated_on?: string;
}

/**
 * Task record from ServiceNow API
 */
export interface TaskRecord {
  sys_id: string;
  number: string;
  short_description: ServiceNowField;
  state: ServiceNowField;
  assigned_to: ServiceNowField;
  parent: ServiceNowField;
  sys_created_on?: string;
  sys_updated_on?: string;
}

/**
 * Journal entry record from ServiceNow API
 */
export interface JournalEntryRecord {
  sys_id: string;
  element: string;
  element_id: string;
  name: ServiceNowField;
  sys_created_on: string;
  sys_created_by: ServiceNowField;
  value: string;
}

/**
 * Knowledge Article record from ServiceNow API
 */
export interface KnowledgeArticleRecord {
  sys_id: string;
  number: string;
  short_description: ServiceNowField;
  text: ServiceNowField;
  sys_created_on?: string;
  sys_updated_on?: string;
}

/**
 * Catalog Item record from ServiceNow API
 */
export interface CatalogItemRecord {
  sys_id: string;
  name: ServiceNowField;
  short_description: ServiceNowField;
  description: ServiceNowField;
  category: ServiceNowField;
  active: string | boolean;
  sys_created_on?: string;
  sys_updated_on?: string;
}

/**
 * Choice record from ServiceNow API
 */
export interface ChoiceRecord {
  label: string;
  value: string;
  sequence?: string;
  inactive?: string | boolean;
  element?: string;
  name?: string;
  dependent_value?: string;
}

/**
 * Customer account record from ServiceNow API
 */
export interface CustomerAccountRecord {
  sys_id: string;
  number: ServiceNowField;
  name: ServiceNowField;
}

/**
 * Assignment Group record from ServiceNow API
 */
export interface AssignmentGroupRecord {
  sys_id: string;
  name: ServiceNowField;
  description: ServiceNowField;
  manager: ServiceNowField;
  active: string | boolean;
  type: ServiceNowField;
}

/**
 * Request record from ServiceNow API (sc_request table)
 */
export interface RequestRecord {
  sys_id: string;
  number: ServiceNowField;
  short_description: ServiceNowField;
  description: ServiceNowField;
  requested_for: ServiceNowField;
  requested_by: ServiceNowField;
  state: ServiceNowField;
  priority: ServiceNowField;
  opened_at: string;
  closed_at?: string;
  due_date?: string;
  stage: ServiceNowField;
  approval: ServiceNowField;
  delivery_address: ServiceNowField;
  special_instructions: ServiceNowField;
  price: ServiceNowField;
  sys_created_on?: string;
  sys_updated_on?: string;
}

/**
 * Requested Item record from ServiceNow API (sc_req_item table)
 */
export interface RequestedItemRecord {
  sys_id: string;
  number: ServiceNowField;
  short_description: ServiceNowField;
  description: ServiceNowField;
  request: ServiceNowField;
  cat_item: ServiceNowField;
  state: ServiceNowField;
  stage: ServiceNowField;
  opened_at: string;
  closed_at?: string;
  due_date?: string;
  assigned_to: ServiceNowField;
  assignment_group: ServiceNowField;
  quantity: ServiceNowField;
  price: ServiceNowField;
  sys_created_on?: string;
  sys_updated_on?: string;
}

/**
 * Catalog Task record from ServiceNow API (sc_task table)
 */
export interface CatalogTaskRecord {
  sys_id: string;
  number: ServiceNowField;
  short_description: ServiceNowField;
  description: ServiceNowField;
  request_item: ServiceNowField;
  request: ServiceNowField;
  state: ServiceNowField;
  active: ServiceNowField | string | boolean;
  opened_at: string;
  closed_at?: string;
  due_date?: string;
  assigned_to: ServiceNowField;
  assignment_group: ServiceNowField;
  priority: ServiceNowField;
  work_notes: ServiceNowField;
  close_notes: ServiceNowField;
  sys_created_on?: string;
  sys_updated_on?: string;
}
