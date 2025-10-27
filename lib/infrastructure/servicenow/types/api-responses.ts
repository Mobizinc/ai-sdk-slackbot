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
  result: T | T[];
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
  state: ServiceNowField;
  category: ServiceNowField;
  subcategory: ServiceNowField;
  company: ServiceNowField;
  opened_at: string;
  assignment_group: ServiceNowField;
  assigned_to: ServiceNowField;
  opened_by: ServiceNowField;
  caller_id: ServiceNowField;
  submitted_by: ServiceNowField;
  contact: ServiceNowField;
  account: ServiceNowField;
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
