/**
 * ServiceNow Response Mappers
 *
 * Transform ServiceNow API responses to clean domain models
 */

import type { ServiceNowField } from "../types/api-responses";
import type {
  Case,
  Incident,
  Problem,
  ConfigurationItem,
  KnowledgeArticle,
  CatalogItem,
  Task,
  JournalEntry,
  Choice,
  CustomerAccount,
  AssignmentGroup,
} from "../types/domain-models";
import type {
  CaseRecord,
  IncidentRecord,
  ProblemRecord,
  ConfigurationItemRecord,
  KnowledgeArticleRecord,
  CatalogItemRecord,
  TaskRecord,
  JournalEntryRecord,
  ChoiceRecord,
  CustomerAccountRecord,
  AssignmentGroupRecord,
} from "../types/api-responses";

/**
 * Extract display value from ServiceNow field
 * Handles both string and {value, display_value} format
 */
export function extractDisplayValue(field: ServiceNowField | undefined | null): string {
  if (!field) return "";
  if (typeof field === "string") return field;
  if (typeof field === "object" && field.display_value) return field.display_value;
  if (typeof field === "object" && field.value) return field.value;
  return "";
}

/**
 * Extract sys_id from ServiceNow reference field
 * Reference fields return as { value: "sys_id", display_value: "name" }
 */
export function extractSysId(field: ServiceNowField | undefined | null): string | undefined {
  if (!field) return undefined;
  if (typeof field === "string") return field; // Already a sys_id
  if (typeof field === "object" && field.value) return field.value; // Extract sys_id from reference
  return undefined;
}

/**
 * Parse ServiceNow date string to Date object
 */
export function parseServiceNowDate(
  field: ServiceNowField | string | number | undefined | null,
): Date | undefined {
  if (field === undefined || field === null) {
    return undefined;
  }

  let raw: string;

  if (typeof field === "string" || typeof field === "number") {
    raw = String(field);
  } else if (typeof field === "object") {
    const value = "value" in field ? field.value : undefined;
    const displayValue = "display_value" in field ? field.display_value : undefined;
    raw = String(value ?? displayValue ?? "");
  } else {
    raw = String(field);
  }

  if (!raw || raw === "null" || raw === "undefined") {
    return undefined;
  }

  try {
    const parsed = new Date(raw);

    // Check if date is valid
    if (Number.isNaN(parsed.getTime())) {
      console.warn(`[ServiceNow Mapper] Invalid date string:`, { raw });
      return undefined;
    }

    // Additional validation: check if date is reasonable (not year 0000 or far future)
    const year = parsed.getFullYear();
    if (year < 1900 || year > 2100) {
      console.warn(`[ServiceNow Mapper] Date out of reasonable range:`, { raw, year });
      return undefined;
    }

    return parsed;
  } catch (error) {
    console.error(`[ServiceNow Mapper] Date parsing error:`, {
      raw,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

/**
 * Normalize IP addresses from ServiceNow field
 * Can be a comma-separated string or array
 */
export function normalizeIpAddresses(field: ServiceNowField | ServiceNowField[] | undefined | null): string[] {
  if (!field) return [];

  if (Array.isArray(field)) {
    return field
      .map((entry) => extractDisplayValue(entry))
      .map((value) => value.trim())
      .filter((value) => Boolean(value));
  }

  const display = extractDisplayValue(field);
  if (!display) return [];

  return display
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter((value) => Boolean(value));
}

/**
 * Build ServiceNow record URL
 */
export function buildRecordUrl(instanceUrl: string, table: string, sysId: string): string {
  return `${instanceUrl}/nav_to.do?uri=${table}.do?sys_id=${sysId}`;
}

/**
 * Map CaseRecord to Case domain model
 */
export function mapCase(record: CaseRecord, instanceUrl: string): Case {
  const openedAt = parseServiceNowDate(record.opened_at);
  const updatedOn = parseServiceNowDate((record as any).sys_updated_on); // Extract sys_updated_on

  // Calculate age in days if openedAt is available
  const ageDays = openedAt
    ? Math.floor((Date.now() - openedAt.getTime()) / (1000 * 60 * 60 * 24))
    : undefined;

  return {
    sysId: record.sys_id,
    number: record.number,
    shortDescription: extractDisplayValue(record.short_description),
    description: extractDisplayValue(record.description),
    priority: extractDisplayValue(record.priority),
    state: extractDisplayValue(record.state),
    category: extractDisplayValue(record.category),
    subcategory: extractDisplayValue(record.subcategory),
    openedAt,
    updatedOn, // NEW: Map from sys_updated_on for stale detection
    ageDays, // NEW: Calculated field for display
    assignmentGroup: extractDisplayValue(record.assignment_group),
    assignmentGroupSysId: extractSysId(record.assignment_group),
    assignedTo: extractDisplayValue(record.assigned_to),
    assignedToSysId: extractSysId(record.assigned_to),
    openedBy: extractDisplayValue(record.opened_by),
    openedBySysId: extractSysId(record.opened_by),
    callerId: extractDisplayValue(record.caller_id),
    callerIdSysId: extractSysId(record.caller_id),
    submittedBy: extractDisplayValue(record.submitted_by),
    contact: extractSysId(record.contact),
    contactName: extractDisplayValue(record.contact),
    account: extractSysId(record.account),
    accountName: extractDisplayValue(record.account),
    company: extractSysId(record.company),
    url: buildRecordUrl(instanceUrl, "sn_customerservice_case", record.sys_id),
  };
}

/**
 * Map IncidentRecord to Incident domain model
 */
export function mapIncident(record: IncidentRecord, instanceUrl: string): Incident {
  return {
    sysId: record.sys_id,
    number: record.number,
    shortDescription: extractDisplayValue(record.short_description),
    description: extractDisplayValue(record.description),
    state: extractDisplayValue(record.state),
    priority: extractDisplayValue(record.priority),
    resolvedAt: parseServiceNowDate(record.resolved_at),
    closeCode: extractDisplayValue(record.close_code),
    parent: extractSysId(record.parent),
    url: buildRecordUrl(instanceUrl, "incident", record.sys_id),
  };
}

/**
 * Map ProblemRecord to Problem domain model
 */
export function mapProblem(record: ProblemRecord, instanceUrl: string): Problem {
  return {
    sysId: record.sys_id,
    number: record.number,
    shortDescription: extractDisplayValue(record.short_description),
    description: extractDisplayValue(record.description),
    state: extractDisplayValue(record.state),
    priority: extractDisplayValue(record.priority),
    url: buildRecordUrl(instanceUrl, "problem", record.sys_id),
  };
}

/**
 * Map ConfigurationItemRecord to ConfigurationItem domain model
 */
export function mapConfigurationItem(record: ConfigurationItemRecord, instanceUrl: string): ConfigurationItem {
  return {
    sysId: record.sys_id,
    name: extractDisplayValue(record.name),
    className: extractDisplayValue(record.sys_class_name),
    fqdn: extractDisplayValue(record.fqdn),
    hostName: extractDisplayValue(record.host_name),
    ipAddresses: normalizeIpAddresses(record.ip_address),
    ownerGroup: extractDisplayValue(record.owner_group),
    supportGroup: extractDisplayValue(record.support_group),
    location: extractDisplayValue(record.location),
    environment: extractDisplayValue(record.u_environment),
    status: extractDisplayValue(record.install_status),
    description: extractDisplayValue(record.short_description),
    url: buildRecordUrl(instanceUrl, "cmdb_ci", record.sys_id),
  };
}

/**
 * Map KnowledgeArticleRecord to KnowledgeArticle domain model
 */
export function mapKnowledgeArticle(record: KnowledgeArticleRecord, instanceUrl: string): KnowledgeArticle {
  return {
    sysId: record.sys_id,
    number: record.number,
    shortDescription: extractDisplayValue(record.short_description),
    text: extractDisplayValue(record.text),
    url: buildRecordUrl(instanceUrl, "kb_knowledge", record.sys_id),
  };
}

/**
 * Map CatalogItemRecord to CatalogItem domain model
 */
export function mapCatalogItem(record: CatalogItemRecord, instanceUrl: string): CatalogItem {
  return {
    sysId: record.sys_id,
    name: extractDisplayValue(record.name),
    shortDescription: extractDisplayValue(record.short_description),
    description: extractDisplayValue(record.description),
    category: extractDisplayValue(record.category),
    active: typeof record.active === "boolean" ? record.active : record.active === "true",
    url: buildRecordUrl(instanceUrl, "sc_cat_item", record.sys_id),
  };
}

/**
 * Map TaskRecord to Task domain model
 */
export function mapTask(record: TaskRecord, instanceUrl: string): Task {
  return {
    sysId: record.sys_id,
    number: record.number,
    shortDescription: extractDisplayValue(record.short_description),
    state: extractDisplayValue(record.state),
    assignedTo: extractDisplayValue(record.assigned_to),
    parent: extractSysId(record.parent),
    url: buildRecordUrl(instanceUrl, "task", record.sys_id),
  };
}

/**
 * Map JournalEntryRecord to JournalEntry domain model
 */
export function mapJournalEntry(record: JournalEntryRecord): JournalEntry {
  return {
    sysId: record.sys_id,
    element: record.element,
    elementId: record.element_id,
    name: extractDisplayValue(record.name),
    createdOn: parseServiceNowDate(record.sys_created_on) ?? new Date(),
    createdBy: extractDisplayValue(record.sys_created_by),
    value: record.value,
  };
}

/**
 * Map ChoiceRecord to Choice domain model
 */
export function mapChoice(record: ChoiceRecord): Choice {
  return {
    label: record.label,
    value: record.value,
    sequence: record.sequence ? parseInt(record.sequence) : undefined,
    inactive: typeof record.inactive === "boolean" ? record.inactive : record.inactive === "true",
    dependentValue: record.dependent_value,
  };
}

/**
 * Map CustomerAccountRecord to CustomerAccount domain model
 */
export function mapCustomerAccount(record: CustomerAccountRecord, instanceUrl: string): CustomerAccount {
  return {
    sysId: record.sys_id,
    number: extractDisplayValue(record.number),
    name: extractDisplayValue(record.name),
    url: buildRecordUrl(instanceUrl, "customer_account", record.sys_id),
  };
}

/**
 * Map AssignmentGroupRecord to AssignmentGroup domain model
 */
export function mapAssignmentGroup(record: AssignmentGroupRecord, instanceUrl: string): AssignmentGroup {
  return {
    sysId: record.sys_id,
    name: extractDisplayValue(record.name),
    description: extractDisplayValue(record.description),
    manager: extractDisplayValue(record.manager),
    active: typeof record.active === "string" ? record.active === "true" : Boolean(record.active),
    url: buildRecordUrl(instanceUrl, "sys_user_group", record.sys_id),
  };
}
