import { Buffer } from "node:buffer";

type ServiceNowAuthMode = "basic" | "token";

interface ServiceNowConfig {
  instanceUrl?: string;
  username?: string;
  password?: string;
  apiToken?: string;
  caseTable?: string;
  caseJournalName?: string;
  ciTable?: string;
  taskTable?: string;
}

const config: ServiceNowConfig = {
  instanceUrl: process.env.SERVICENOW_INSTANCE_URL || process.env.SERVICENOW_URL,
  username: process.env.SERVICENOW_USERNAME,
  password: process.env.SERVICENOW_PASSWORD,
  apiToken: process.env.SERVICENOW_API_TOKEN,
  caseTable:
    process.env.SERVICENOW_CASE_TABLE?.trim() || "sn_customerservice_case",
  caseJournalName:
    process.env.SERVICENOW_CASE_JOURNAL_NAME?.trim() ||
    "x_mobit_serv_case_service_case",
  ciTable: process.env.SERVICENOW_CI_TABLE?.trim() || "cmdb_ci",
  taskTable: process.env.SERVICENOW_TASK_TABLE?.trim() || "sn_customerservice_task",
};

function detectAuthMode(): ServiceNowAuthMode | null {
  if (config.username && config.password) {
    return "basic";
  }

  if (config.apiToken) {
    return "token";
  }

  return null;
}

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const mode = detectAuthMode();

  if (mode === "basic") {
    const encoded = Buffer.from(`${config.username}:${config.password}`).toString(
      "base64",
    );
    return {
      Authorization: `Basic ${encoded}`,
    };
  }

  if (mode === "token") {
    return {
      Authorization: `Bearer ${config.apiToken}`,
    };
  }

  throw new Error(
    "ServiceNow credentials are not configured. Set SERVICENOW_USERNAME/PASSWORD or SERVICENOW_API_TOKEN.",
  );
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!config.instanceUrl) {
    throw new Error(
      "ServiceNow instance URL is not configured. Set SERVICENOW_INSTANCE_URL.",
    );
  }

  const headers = {
    "content-type": "application/json",
    ...(init.headers ?? {}),
    ...(await buildAuthHeaders()),
  } as Record<string, string>;

  const response = await fetch(`${config.instanceUrl}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `ServiceNow request failed with status ${response.status}: ${body.slice(0, 500)}`,
    );
  }

  return (await response.json()) as T;
}

/**
 * Extract display value from ServiceNow field (handles both strings and objects)
 */
function extractDisplayValue(field: any): string {
  if (!field) return "";
  if (typeof field === "string") return field;
  if (typeof field === "object" && field.display_value) return field.display_value;
  if (typeof field === "object" && field.value) return field.value;
  return String(field);
}

/**
 * Extract reference sys_id from ServiceNow reference field
 * Reference fields return as { value: "sys_id", display_value: "name", link: "url" }
 */
function extractReferenceSysId(field: any): string | undefined {
  if (!field) return undefined;
  if (typeof field === "string") return field; // Already a sys_id
  if (typeof field === "object" && field.value) return field.value; // Extract sys_id from reference
  return undefined;
}

function normalizeIpAddresses(field: any): string[] {
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

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatDateForServiceNow(date: Date): string {
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export interface ServiceNowIncidentResult {
  number: string;
  sys_id: string;
  short_description: string;
  state?: string;
  url: string;
}

export interface ServiceNowIncidentSummary {
  sys_id: string;
  number: string;
  short_description?: string;
  state?: string;
  resolved_at?: string;
  close_code?: string;
  parent?: string;
  url: string;
}

export interface ServiceNowKnowledgeSearchInput {
  query: string;
  limit?: number;
}

export interface ServiceNowKnowledgeArticle {
  number: string;
  short_description: string;
  url: string;
  sys_id: string;
}

export interface ServiceNowCaseResult {
  sys_id: string;
  number: string;
  short_description?: string;
  description?: string;
  priority?: string;
  state?: string;
  category?: string;
  subcategory?: string;
  opened_at?: string;
  assignment_group?: string;
  assigned_to?: string;
  opened_by?: string;
  caller_id?: string;
  submitted_by?: string;
  contact?: string; // Reference to customer_contact table (sys_id)
  account?: string; // Reference to customer_account table (sys_id)
  url?: string;
}

export interface ServiceNowCaseJournalEntry {
  sys_id: string;
  element: string;
  element_id: string;
  name?: string;
  sys_created_on: string;
  sys_created_by: string;
  value?: string;
}

export interface ServiceNowCatalogItem {
  sys_id: string;
  name: string;
  short_description?: string;
  description?: string;
  category?: string;
  active: boolean;
  url: string;
}

export interface ServiceNowConfigurationItem {
  sys_id: string;
  name: string;
  sys_class_name?: string;
  fqdn?: string;
  host_name?: string;
  ip_addresses: string[];
  owner_group?: string;
  support_group?: string;
  location?: string;
  environment?: string;
  status?: string;
  description?: string;
  url: string;
}

export interface ServiceNowCaseSummary {
  sys_id: string;
  number: string;
  short_description?: string;
  priority?: string;
  state?: string;
  account?: string;
  company?: string;
  opened_at?: string;
  updated_on?: string;
  url: string;
}

export interface ServiceNowBusinessService {
  sys_id: string;
  name: string;
  description?: string;
  parent?: string;
  url: string;
}

export interface ServiceNowServiceOffering {
  sys_id: string;
  name: string;
  description?: string;
  parent?: string;
  parent_name?: string;
  url: string;
}

export interface ServiceNowWorkNote {
  sys_id: string;
  element_id: string;
  value: string;
  sys_created_on: string;
  sys_created_by?: string;
}

export interface ServiceNowApplicationService {
  sys_id: string;
  name: string;
  description?: string;
  parent?: string;
  parent_name?: string;
  url: string;
}

export interface ServiceNowCustomerAccount {
  sys_id: string;
  number: string;
  name: string;
  url: string;
}

export class ServiceNowClient {
  public isConfigured(): boolean {
    return Boolean(config.instanceUrl && detectAuthMode());
  }

  public async getIncident(number: string): Promise<ServiceNowIncidentResult | null> {
    const data = await request<{
      result: Array<ServiceNowIncidentResult & { sys_id: string }>;
    }>(`/api/now/table/incident?number=${encodeURIComponent(number)}`);

    if (!data.result?.length) return null;

    const incident = data.result[0];
    return {
      ...incident,
      url: `${config.instanceUrl}/nav_to.do?uri=incident.do?sys_id=${incident.sys_id}`,
    };
  }

  public async getResolvedIncidents(options: {
    limit?: number;
    olderThanMinutes?: number;
    requireParentCase?: boolean;
    requireEmptyCloseCode?: boolean;
  } = {}): Promise<ServiceNowIncidentSummary[]> {
    const limit = options.limit ?? 50;
    const queryParts: string[] = ["state=6", "active=true"];

    if (options.requireParentCase !== false) {
      queryParts.push("parentISNOTEMPTY");
    }

    if (options.requireEmptyCloseCode !== false) {
      queryParts.push("close_codeISEMPTY");
    }

    if (options.olderThanMinutes && options.olderThanMinutes > 0) {
      queryParts.push(`resolved_atRELATIVELE@minute@ago@${Math.floor(options.olderThanMinutes)}`);
    }

    const query = queryParts.join("^");
    const fields = [
      "sys_id",
      "number",
      "short_description",
      "state",
      "resolved_at",
      "close_code",
      "parent",
    ];

    const data = await request<{
      result: Array<Record<string, any>>;
    }>(
      `/api/now/table/incident?sysparm_query=${encodeURIComponent(query)}&sysparm_fields=${fields.join(
        ",",
      )}&sysparm_display_value=all&sysparm_limit=${limit}`,
    );

    const incidents = data.result ?? [];

    return incidents.map((record) => {
      const sysId = extractDisplayValue(record.sys_id);
      return {
        sys_id: sysId,
        number: extractDisplayValue(record.number),
        short_description: extractDisplayValue(record.short_description) || undefined,
        state: extractDisplayValue(record.state) || undefined,
        resolved_at: extractDisplayValue(record.resolved_at) || undefined,
        close_code: extractDisplayValue(record.close_code) || undefined,
        parent: extractDisplayValue(record.parent) || undefined,
        url: `${config.instanceUrl}/nav_to.do?uri=incident.do?sys_id=${sysId}`,
      } satisfies ServiceNowIncidentSummary;
    });
  }

  public async searchKnowledge(
    input: ServiceNowKnowledgeSearchInput,
  ): Promise<ServiceNowKnowledgeArticle[]> {
    const limit = input.limit ?? 3;
    const data = await request<{
      result: Array<{
        number: string;
        short_description: string;
        sys_id: string;
      }>;
    }>(
      `/api/now/table/kb_knowledge?sysparm_query=ORDERBYDESCsys_updated_on^textLIKE${encodeURIComponent(
        input.query,
      )}&sysparm_limit=${limit}`,
    );

    return data.result.map((article) => ({
      ...article,
      url: `${config.instanceUrl}/nav_to.do?uri=kb_knowledge.do?sys_id=${article.sys_id}`,
    }));
  }

  public async getCase(number: string): Promise<ServiceNowCaseResult | null> {
    const table = config.caseTable ?? "sn_customerservice_case";
    const data = await request<{
      result: Array<any>;
    }>(
      `/api/now/table/${table}?sysparm_query=${encodeURIComponent(
        `number=${number}`,
      )}&sysparm_limit=1&sysparm_display_value=all`,
    );

    if (!data.result?.length) return null;

    const raw = data.result[0];

    // Extract display values for all fields that might be objects
    const sysId = extractDisplayValue(raw.sys_id);
    const openedBy = extractDisplayValue(raw.opened_by);
    const callerId = extractDisplayValue(raw.caller_id);

    return {
      sys_id: sysId,
      number: raw.number,
      short_description: extractDisplayValue(raw.short_description),
      description: extractDisplayValue(raw.description),
      priority: extractDisplayValue(raw.priority),
      state: extractDisplayValue(raw.state),
      category: extractDisplayValue(raw.category),
      subcategory: extractDisplayValue(raw.subcategory),
      opened_at: extractDisplayValue(raw.opened_at),
      assignment_group: extractDisplayValue(raw.assignment_group),
      assigned_to: extractDisplayValue(raw.assigned_to),
      opened_by: openedBy,
      caller_id: callerId,
      submitted_by: extractDisplayValue(raw.submitted_by) || openedBy || callerId || undefined,
      url: `${config.instanceUrl}/nav_to.do?uri=${table}.do?sys_id=${sysId}`,
    };
  }

  public async getCaseBySysId(sysId: string): Promise<ServiceNowCaseResult | null> {
    const table = config.caseTable ?? "sn_customerservice_case";
    const data = await request<{
      result: Array<any>;
    }>(
      `/api/now/table/${table}?sysparm_query=${encodeURIComponent(
        `sys_id=${sysId}`,
      )}&sysparm_limit=1&sysparm_display_value=all`,
    );

    if (!data.result?.length) return null;

    const raw = data.result[0];

    return {
      sys_id: extractDisplayValue(raw.sys_id),
      number: extractDisplayValue(raw.number),
      short_description: extractDisplayValue(raw.short_description),
      description: extractDisplayValue(raw.description),
      priority: extractDisplayValue(raw.priority),
      state: extractDisplayValue(raw.state),
      category: extractDisplayValue(raw.category),
      subcategory: extractDisplayValue(raw.subcategory),
      opened_at: extractDisplayValue(raw.opened_at),
      assignment_group: extractDisplayValue(raw.assignment_group),
      assigned_to: extractDisplayValue(raw.assigned_to),
      opened_by: extractDisplayValue(raw.opened_by),
      caller_id: extractDisplayValue(raw.caller_id),
      submitted_by: extractDisplayValue(raw.submitted_by),
      contact: extractReferenceSysId(raw.contact), // Extract contact sys_id
      account: extractReferenceSysId(raw.account), // Extract account sys_id
      url: `${config.instanceUrl}/nav_to.do?uri=${table}.do?sys_id=${extractDisplayValue(
        raw.sys_id,
      )}`,
    };
  }

  public async getCaseJournal(
    caseSysId: string,
    { limit = 20 }: { limit?: number } = {},
  ): Promise<ServiceNowCaseJournalEntry[]> {
    const journalName = config.caseJournalName;
    const queryParts = [`element_id=${caseSysId}`];
    if (journalName) {
      queryParts.push(`name=${journalName}`);
    }
    const query = `${queryParts.join("^")}^ORDERBYDESCsys_created_on`;

    const data = await request<{
      result: ServiceNowCaseJournalEntry[];
    }>(
      `/api/now/table/sys_journal_field?sysparm_query=${encodeURIComponent(
        query,
      )}&sysparm_limit=${limit}&sysparm_fields=${encodeURIComponent(
        "sys_id,element,element_id,name,sys_created_on,sys_created_by,value",
      )}`,
    );

    return data.result ?? [];
  }

  public async searchConfigurationItems(
    input: { name?: string; ipAddress?: string; sysId?: string; limit?: number },
  ): Promise<ServiceNowConfigurationItem[]> {
    const table = config.ciTable ?? "cmdb_ci";
    const limit = input.limit ?? 5;

    const queryGroups: string[] = [];

    if (input.sysId) {
      queryGroups.push(`sys_id=${input.sysId}`);
    }

    if (input.name) {
      const nameQuery = input.name.trim();
      if (nameQuery) {
        queryGroups.push(
          `nameLIKE${nameQuery}^ORfqdnLIKE${nameQuery}^ORu_fqdnLIKE${nameQuery}^ORhost_nameLIKE${nameQuery}`,
        );
      }
    }

    if (input.ipAddress) {
      const ipQuery = input.ipAddress.trim();
      if (ipQuery) {
        queryGroups.push(
          `ip_addressLIKE${ipQuery}^ORu_ip_addressLIKE${ipQuery}^ORfqdnLIKE${ipQuery}`,
        );
      }
    }

    if (!queryGroups.length) {
      throw new Error(
        "Provide at least one of: name, ipAddress, or sysId to search configuration items.",
      );
    }

    const query = queryGroups.join("^");

    const data = await request<{
      result: Array<Record<string, any>>;
    }>(
      `/api/now/table/${table}?sysparm_query=${encodeURIComponent(
        query,
      )}&sysparm_display_value=all&sysparm_limit=${limit}`,
    );

    const items = data.result ?? [];

    return items.map((item) => {
      const sysId = extractDisplayValue(item.sys_id);
      const name =
        extractDisplayValue(item.name) ||
        extractDisplayValue(item.fqdn) ||
        extractDisplayValue(item.u_fqdn) ||
        extractDisplayValue(item.host_name) ||
        sysId;

      return {
        sys_id: sysId,
        name,
        sys_class_name: extractDisplayValue(item.sys_class_name) || undefined,
        fqdn: extractDisplayValue(item.fqdn) || extractDisplayValue(item.u_fqdn) || undefined,
        host_name: extractDisplayValue(item.host_name) || undefined,
        ip_addresses: normalizeIpAddresses(item.ip_address ?? item.u_ip_address),
        owner_group: extractDisplayValue(item.owner) || extractDisplayValue(item.support_group) || undefined,
        support_group: extractDisplayValue(item.support_group) || undefined,
        location: extractDisplayValue(item.location) || undefined,
        environment: extractDisplayValue(item.u_environment) || undefined,
        status:
          extractDisplayValue(item.install_status) ||
          extractDisplayValue(item.status) ||
          undefined,
        description:
          extractDisplayValue(item.short_description) ||
          extractDisplayValue(item.description) ||
          undefined,
        url: `${config.instanceUrl}/nav_to.do?uri=${table}.do?sys_id=${sysId}`,
      } satisfies ServiceNowConfigurationItem;
    });
  }

  public async searchCustomerCases(
    input: {
      accountName?: string;
      companyName?: string;
      query?: string;
      limit?: number;
      activeOnly?: boolean;
    },
  ): Promise<ServiceNowCaseSummary[]> {
    const table = config.caseTable ?? "sn_customerservice_case";
    const limit = input.limit ?? 5;

    const queryParts: string[] = ["ORDERBYDESCopened_at"];

    if (input.accountName) {
      queryParts.push(`account.nameLIKE${input.accountName}`);
    }

    if (input.companyName) {
      queryParts.push(`company.nameLIKE${input.companyName}`);
    }

    if (input.query) {
      queryParts.push(`short_descriptionLIKE${input.query}`);
    }

    if (input.activeOnly) {
      queryParts.push("active=true");
    }

    const query = queryParts.join("^");

    const data = await request<{
      result: Array<Record<string, any>>;
    }>(
      `/api/now/table/${table}?sysparm_query=${encodeURIComponent(
        query,
      )}&sysparm_display_value=all&sysparm_limit=${limit}`,
    );

    return (data.result ?? []).map((record) => {
      const sysId = extractDisplayValue(record.sys_id);
      return {
        sys_id: sysId,
        number: extractDisplayValue(record.number),
        short_description: extractDisplayValue(record.short_description) || undefined,
        priority: extractDisplayValue(record.priority) || undefined,
        state: extractDisplayValue(record.state) || undefined,
        account: extractDisplayValue(record.account) || undefined,
        company: extractDisplayValue(record.company) || undefined,
        opened_at: extractDisplayValue(record.opened_at) || undefined,
        updated_on: extractDisplayValue(record.sys_updated_on) || undefined,
        url: `${config.instanceUrl}/nav_to.do?uri=${table}.do?sys_id=${sysId}`,
      } satisfies ServiceNowCaseSummary;
    });
  }

  /**
   * Add work note to a case
   */
  public async addCaseWorkNote(
    sysId: string,
    workNote: string,
    workNotes: boolean = true
  ): Promise<void> {
    const table = config.caseTable ?? "sn_customerservice_case";
    const endpoint = `/api/now/table/${table}/${sysId}`;

    const payload = workNotes ? 
      { work_notes: workNote } : 
      { comments: workNote };

    await request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Update case fields
   */
  public async updateCase(
    sysId: string,
    updates: Record<string, any>
  ): Promise<void> {
    const table = config.caseTable ?? "sn_customerservice_case";
    const endpoint = `/api/now/table/${table}/${sysId}`;

    await request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  /**
   * Add comment to case (visible to customer)
   */
  public async addCaseComment(
    sysId: string,
    comment: string
  ): Promise<void> {
    await this.addCaseWorkNote(sysId, comment, false);
  }

  public async addIncidentWorkNote(
    incidentSysId: string,
    workNote: string,
  ): Promise<void> {
    const endpoint = `/api/now/table/incident/${incidentSysId}`;

    await request(endpoint, {
      method: "PATCH",
      body: JSON.stringify({ work_notes: workNote }),
    });
  }

  public async getVoiceWorkNotesSince(options: {
    since: Date;
    limit?: number;
  }): Promise<ServiceNowWorkNote[]> {
    const sinceString = formatDateForServiceNow(options.since);
    const limit = options.limit ?? 200;

    const queryParts = [
      "element=work_notes",
      `sys_created_on>=${sinceString}`,
      "valueLIKECall",
      "valueLIKESession ID",
    ];

    const query = queryParts.join("^");

    const data = await request<{
      result: Array<Record<string, any>>;
    }>(
      `/api/now/table/sys_journal_field?sysparm_query=${encodeURIComponent(
        query,
      )}&sysparm_limit=${limit}&sysparm_display_value=all&sysparm_fields=sys_id,element_id,value,sys_created_on,sys_created_by`,
    );

    return (data.result ?? []).map((row) => ({
      sys_id: extractDisplayValue(row.sys_id),
      element_id: extractDisplayValue(row.element_id),
      value: extractDisplayValue(row.value) || "",
      sys_created_on: extractDisplayValue(row.sys_created_on) || "",
      sys_created_by: extractDisplayValue(row.sys_created_by) || undefined,
    }));
  }

  public async closeIncident(
    incidentSysId: string,
    options: {
      closeCode?: string;
      closeNotes?: string;
      additionalUpdates?: Record<string, unknown>;
    } = {},
  ): Promise<void> {
    const endpoint = `/api/now/table/incident/${incidentSysId}`;

    const payload: Record<string, unknown> = {
      state: "7", // Closed
      active: false,
      close_code: options.closeCode ?? "Solved Remotely (Permanently)",
      close_notes:
        options.closeNotes ??
        "Automatically closed after remaining in Resolved state during scheduled incident audit.",
      ...options.additionalUpdates,
    };

    await request(endpoint, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Create Incident from Case
   * Implements ITSM best practice: service disruptions become Incident records
   *
   * Original: Issue #9 - AI-Driven Incident Creation from Cases
   */
  public async createIncidentFromCase(input: {
    caseSysId: string;
    caseNumber: string;
    category?: string;
    subcategory?: string;
    shortDescription: string;
    description?: string;
    urgency?: string;
    priority?: string;
    callerId?: string;
    assignmentGroup?: string;
    assignedTo?: string;
    isMajorIncident?: boolean;
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
  }): Promise<{
    incident_number: string;
    incident_sys_id: string;
    incident_url: string;
  }> {
    const table = "incident";

    // Build incident payload
    const payload: Record<string, any> = {
      short_description: input.shortDescription,
      description: input.description || input.shortDescription,
      urgency: input.urgency || "3", // Default to medium urgency
      priority: input.priority || "3", // Default to medium priority
      caller_id: input.callerId,
      assignment_group: input.assignmentGroup,
      // Link to parent Case
      parent: input.caseSysId,
      // Add work notes documenting source
      work_notes: `Automatically created from Case ${input.caseNumber} via AI triage system. ITSM record type classification determined this is a service disruption requiring incident management.`,
    };

    // Only set category/subcategory if provided (avoid sending undefined which can clear fields)
    if (input.category) {
      payload.category = input.category;
    }
    if (input.subcategory) {
      payload.subcategory = input.subcategory;
    }

    // Add assigned_to if provided (user explicitly assigned to case)
    if (input.assignedTo) {
      payload.assigned_to = input.assignedTo;
    }

    // Add company/account context (prevents orphaned incidents)
    if (input.company) {
      payload.company = input.company;
    }
    if (input.account) {
      payload.account = input.account;
    }
    if (input.businessService) {
      payload.business_service = input.businessService;
    }
    if (input.location) {
      payload.location = input.location;
    }

    // Add contact information
    if (input.contact) {
      payload.contact = input.contact;
    }
    if (input.contactType) {
      payload.contact_type = input.contactType;
    }
    if (input.openedBy) {
      payload.opened_by = input.openedBy;
    }

    // Add technical context
    if (input.cmdbCi) {
      payload.cmdb_ci = input.cmdbCi;
    }

    // Add multi-tenancy / domain separation
    if (input.sysDomain) {
      payload.sys_domain = input.sysDomain;
    }
    if (input.sysDomainPath) {
      payload.sys_domain_path = input.sysDomainPath;
    }

    // Set severity for major incidents
    if (input.isMajorIncident) {
      payload.severity = "1"; // SEV-1 for major incidents
      payload.impact = "1"; // High impact
    }

    // Create incident via ServiceNow Table API
    const response = await request<{ result: any }>(
      `/api/now/table/${table}`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );

    const incident = response.result;

    console.log(
      `[ServiceNow] Created ${input.isMajorIncident ? 'MAJOR ' : ''}` +
      `Incident ${incident.number} from Case ${input.caseNumber}`
    );

    return {
      incident_number: incident.number,
      incident_sys_id: incident.sys_id,
      incident_url: `${config.instanceUrl}/nav_to.do?uri=incident.do?sys_id=${incident.sys_id}`
    };
  }

  /**
   * Create Problem from Case
   * Implements ITSM best practice: recurring issues requiring root cause analysis become Problem records
   *
   * Problems differ from Incidents:
   * - Incidents: Unplanned service disruptions requiring immediate restoration
   * - Problems: Root cause investigations for recurring/potential incidents
   */
  public async createProblemFromCase(input: {
    caseSysId: string;
    caseNumber: string;
    category?: string;
    subcategory?: string;
    shortDescription: string;
    description?: string;
    urgency?: string;
    priority?: string;
    callerId?: string;
    assignmentGroup?: string;
    assignedTo?: string;
    firstReportedBy?: string;
    // Company/Account context (prevents orphaned problems)
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
  }): Promise<{
    problem_number: string;
    problem_sys_id: string;
    problem_url: string;
  }> {
    const table = "problem";

    // Build problem payload
    const payload: Record<string, any> = {
      short_description: input.shortDescription,
      description: input.description || input.shortDescription,
      urgency: input.urgency || "3", // Default to medium urgency
      priority: input.priority || "3", // Default to medium priority
      caller_id: input.callerId,
      assignment_group: input.assignmentGroup,
      // Link to parent Case
      parent: input.caseSysId,
      // Add work notes documenting source
      work_notes: `Automatically created from Case ${input.caseNumber} via AI triage system. ITSM record type classification determined this requires root cause analysis via problem management.`,
    };

    // Only set category/subcategory if provided (avoid sending undefined which can clear fields)
    if (input.category) {
      payload.category = input.category;
    }
    if (input.subcategory) {
      payload.subcategory = input.subcategory;
    }

    // Add assigned_to if provided (user explicitly assigned to case)
    if (input.assignedTo) {
      payload.assigned_to = input.assignedTo;
    }

    // Add first_reported_by_task if provided (task that first reported this problem)
    if (input.firstReportedBy) {
      payload.first_reported_by_task = input.firstReportedBy;
    }

    // Add company/account context (prevents orphaned problems)
    if (input.company) {
      payload.company = input.company;
    }
    if (input.account) {
      payload.account = input.account;
    }
    if (input.businessService) {
      payload.business_service = input.businessService;
    }
    if (input.location) {
      payload.location = input.location;
    }

    // Add contact information
    if (input.contact) {
      payload.contact = input.contact;
    }
    if (input.contactType) {
      payload.contact_type = input.contactType;
    }
    if (input.openedBy) {
      payload.opened_by = input.openedBy;
    }

    // Add technical context
    if (input.cmdbCi) {
      payload.cmdb_ci = input.cmdbCi;
    }

    // Add multi-tenancy / domain separation
    if (input.sysDomain) {
      payload.sys_domain = input.sysDomain;
    }
    if (input.sysDomainPath) {
      payload.sys_domain_path = input.sysDomainPath;
    }

    // Create problem via ServiceNow Table API
    const response = await request<{ result: any }>(
      `/api/now/table/${table}`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );

    const problem = response.result;

    console.log(
      `[ServiceNow] Created Problem ${problem.number} from Case ${input.caseNumber}`
    );

    return {
      problem_number: problem.number,
      problem_sys_id: problem.sys_id,
      problem_url: `${config.instanceUrl}/nav_to.do?uri=problem.do?sys_id=${problem.sys_id}`
    };
  }

  /**
   * Fetch choice list values from ServiceNow sys_choice table
   *
   * This retrieves the available dropdown/select values for a specific field,
   * such as categories, subcategories, priorities, etc.
   *
   * Original: api/app/services/servicenow_api_client.py:101-182
   */
  public async getChoiceList(input: {
    table: string;
    element: string;
    includeInactive?: boolean;
  }): Promise<Array<{
    label: string;
    value: string;
    sequence: number;
    inactive: boolean;
    dependent_value?: string;
  }>> {
    const { table, element, includeInactive = false } = input;

    // Build query to filter by table and element
    const queryParts = [`name=${table}`, `element=${element}`];
    if (!includeInactive) {
      queryParts.push('inactive=false');
    }

    const query = queryParts.join('^');

    const data = await request<{
      result: Array<{
        label: string;
        value: string;
        sequence: string | number;
        inactive: string | boolean;
        dependent_value?: string;
      }>;
    }>(
      `/api/now/table/sys_choice?sysparm_query=${encodeURIComponent(query)}&sysparm_fields=label,value,sequence,inactive,dependent_value&sysparm_limit=1000`
    );

    const choices = data.result ?? [];

    // Deduplicate choices (ServiceNow may return exact duplicates)
    const seenKeys = new Set<string>();
    const uniqueChoices: Array<{
      label: string;
      value: string;
      sequence: number;
      inactive: boolean;
      dependent_value?: string;
    }> = [];

    for (const choice of choices) {
      const depVal = choice.dependent_value || '';
      const key = `${choice.value}:${depVal}`;

      if (!seenKeys.has(key)) {
        seenKeys.add(key);

        // Parse sequence to number
        let sequence = 0;
        if (choice.sequence) {
          const seqStr = String(choice.sequence).trim();
          sequence = seqStr ? parseInt(seqStr, 10) || 0 : 0;
        }

        // Parse inactive to boolean
        const inactive = choice.inactive === true || choice.inactive === 'true' || choice.inactive === '1';

        uniqueChoices.push({
          label: choice.label,
          value: choice.value,
          sequence,
          inactive,
          dependent_value: choice.dependent_value,
        });
      }
    }

    // Sort by sequence for proper display order
    uniqueChoices.sort((a, b) => a.sequence - b.sequence);

    return uniqueChoices;
  }

  /**
   * Get catalog items from Service Catalog
   */
  public async getCatalogItems(input: {
    category?: string;
    keywords?: string[];
    active?: boolean;
    limit?: number;
  }): Promise<ServiceNowCatalogItem[]> {
    const limit = input.limit ?? 10;
    const queryParts: string[] = [];

    // Filter by active status (default to active only)
    if (input.active !== false) {
      queryParts.push('active=true');
    }

    // Filter by category
    if (input.category) {
      queryParts.push(`category.nameLIKE${input.category}`);
    }

    // Keyword search in name and short description
    if (input.keywords && input.keywords.length > 0) {
      const keywordQuery = input.keywords
        .map(keyword => `nameLIKE${keyword}^ORshort_descriptionLIKE${keyword}`)
        .join('^OR');
      queryParts.push(`(${keywordQuery})`);
    }

    const query = queryParts.length > 0 ? queryParts.join('^') : 'active=true';

    const data = await request<{
      result: Array<Record<string, any>>;
    }>(
      `/api/now/table/sc_cat_item?sysparm_query=${encodeURIComponent(
        query
      )}&sysparm_display_value=all&sysparm_limit=${limit}&sysparm_fields=sys_id,name,short_description,description,category,active,order`
    );

    return data.result.map((item) => {
      const sysId = extractDisplayValue(item.sys_id);
      return {
        sys_id: sysId,
        name: extractDisplayValue(item.name) || 'Untitled',
        short_description: extractDisplayValue(item.short_description) || undefined,
        description: extractDisplayValue(item.description) || undefined,
        category: extractDisplayValue(item.category) || undefined,
        active: extractDisplayValue(item.active) === 'true',
        url: this.getCatalogItemUrl(sysId),
      } satisfies ServiceNowCatalogItem;
    });
  }

  /**
   * Get a specific catalog item by name
   */
  public async getCatalogItemByName(name: string): Promise<ServiceNowCatalogItem | null> {
    const data = await request<{
      result: Array<Record<string, any>>;
    }>(
      `/api/now/table/sc_cat_item?sysparm_query=${encodeURIComponent(
        `name=${name}`
      )}&sysparm_display_value=all&sysparm_limit=1&sysparm_fields=sys_id,name,short_description,description,category,active,order`
    );

    if (!data.result || data.result.length === 0) {
      return null;
    }

    const item = data.result[0];
    const sysId = extractDisplayValue(item.sys_id);

    return {
      sys_id: sysId,
      name: extractDisplayValue(item.name) || 'Untitled',
      short_description: extractDisplayValue(item.short_description) || undefined,
      description: extractDisplayValue(item.description) || undefined,
      category: extractDisplayValue(item.category) || undefined,
      active: extractDisplayValue(item.active) === 'true',
      url: this.getCatalogItemUrl(sysId),
    };
  }

  /**
   * Get URL for catalog item
   */
  private getCatalogItemUrl(sysId: string): string {
    return `${config.instanceUrl}/sp?id=sc_cat_item&sys_id=${sysId}`;
  }

  /**
   * Get Business Service by name (READ-ONLY)
   * Used by LLM for service classification - does not create records
   */
  public async getBusinessService(name: string): Promise<ServiceNowBusinessService | null> {
    const data = await request<{
      result: Array<Record<string, any>>;
    }>(
      `/api/now/table/cmdb_ci_service_business?sysparm_query=${encodeURIComponent(
        `name=${name}`
      )}&sysparm_display_value=all&sysparm_limit=1`
    );

    if (!data.result || data.result.length === 0) {
      return null;
    }

    const service = data.result[0];
    const sysId = extractDisplayValue(service.sys_id);

    return {
      sys_id: sysId,
      name: extractDisplayValue(service.name),
      description: extractDisplayValue(service.description) || undefined,
      parent: extractDisplayValue(service.parent) || undefined,
      url: `${config.instanceUrl}/nav_to.do?uri=cmdb_ci_service_business.do?sys_id=${sysId}`,
    };
  }

  /**
   * Get Service Offering by name (READ-ONLY)
   * Used by LLM for service classification - does not create records
   */
  public async getServiceOffering(name: string): Promise<ServiceNowServiceOffering | null> {
    const data = await request<{
      result: Array<Record<string, any>>;
    }>(
      `/api/now/table/service_offering?sysparm_query=${encodeURIComponent(
        `name=${name}`
      )}&sysparm_display_value=all&sysparm_limit=1`
    );

    if (!data.result || data.result.length === 0) {
      return null;
    }

    const offering = data.result[0];
    const sysId = extractDisplayValue(offering.sys_id);

    // Extract parent sys_id (value) and parent name (display_value)
    let parentSysId: string | undefined;
    let parentName: string | undefined;
    if (offering.parent) {
      if (typeof offering.parent === 'object') {
        parentSysId = offering.parent.value || undefined;
        parentName = offering.parent.display_value || undefined;
      } else if (typeof offering.parent === 'string') {
        parentSysId = offering.parent;
        parentName = offering.parent;
      }
    }

    // Extract description, handling object format
    let description: string | undefined;
    if (offering.description) {
      if (typeof offering.description === 'string') {
        description = offering.description || undefined;
      } else if (typeof offering.description === 'object' && offering.description.display_value) {
        description = offering.description.display_value || undefined;
      } else if (typeof offering.description === 'object' && offering.description.value) {
        description = offering.description.value || undefined;
      }
    }

    return {
      sys_id: sysId,
      name: extractDisplayValue(offering.name),
      description,
      parent: parentSysId,
      parent_name: parentName,
      url: `${config.instanceUrl}/nav_to.do?uri=service_offering.do?sys_id=${sysId}`,
    };
  }

  /**
   * Get Application Service by name (READ-ONLY)
   * Used by LLM for service classification - does not create records
   */
  public async getApplicationService(name: string): Promise<ServiceNowApplicationService | null> {
    const data = await request<{
      result: Array<Record<string, any>>;
    }>(
      `/api/now/table/cmdb_ci_service_discovered?sysparm_query=${encodeURIComponent(
        `name=${name}`
      )}&sysparm_display_value=all&sysparm_limit=1`
    );

    if (!data.result || data.result.length === 0) {
      return null;
    }

    const service = data.result[0];
    const sysId = extractDisplayValue(service.sys_id);

    // Extract parent sys_id (value) and parent name (display_value)
    let parentSysId: string | undefined;
    let parentName: string | undefined;
    if (service.parent) {
      if (typeof service.parent === 'object') {
        parentSysId = service.parent.value || undefined;
        parentName = service.parent.display_value || undefined;
      } else if (typeof service.parent === 'string') {
        parentSysId = service.parent;
        parentName = service.parent;
      }
    }

    // Extract description, handling object format
    let description: string | undefined;
    if (service.description) {
      if (typeof service.description === 'string') {
        description = service.description || undefined;
      } else if (typeof service.description === 'object' && service.description.display_value) {
        description = service.description.display_value || undefined;
      } else if (typeof service.description === 'object' && service.description.value) {
        description = service.description.value || undefined;
      }
    }

    return {
      sys_id: sysId,
      name: extractDisplayValue(service.name),
      description,
      parent: parentSysId,
      parent_name: parentName,
      url: `${config.instanceUrl}/nav_to.do?uri=cmdb_ci_service_discovered.do?sys_id=${sysId}`,
    };
  }

  /**
   * Get Application Services for a company (READ-ONLY)
   * Returns list of application services linked to a company
   * Optionally filter by parent service offering (e.g., "Application Administration")
   */
  public async getApplicationServicesForCompany(input: {
    companySysId: string;
    parentServiceOffering?: string;
    limit?: number;
  }): Promise<Array<{ name: string; sys_id: string; parent_name?: string }>> {
    const limit = input.limit ?? 100;

    // Build query to filter by company
    const queryParts = [`company=${input.companySysId}`];

    // If parent service offering is specified, filter by it
    if (input.parentServiceOffering) {
      queryParts.push(`parent.name=${input.parentServiceOffering}`);
    }

    const query = queryParts.join('^');

    try {
      const data = await request<{
        result: Array<Record<string, any>>;
      }>(
        `/api/now/table/cmdb_ci_service_discovered?sysparm_query=${encodeURIComponent(
          query
        )}&sysparm_display_value=all&sysparm_limit=${limit}&sysparm_fields=sys_id,name,parent`
      );

      if (!data.result || data.result.length === 0) {
        return [];
      }

      return data.result.map((service) => {
        const sysId = extractDisplayValue(service.sys_id);
        const name = extractDisplayValue(service.name);

        // Extract parent name
        let parentName: string | undefined;
        if (service.parent) {
          if (typeof service.parent === 'object' && service.parent.display_value) {
            parentName = service.parent.display_value;
          } else if (typeof service.parent === 'string') {
            parentName = service.parent;
          }
        }

        return {
          sys_id: sysId,
          name,
          parent_name: parentName,
        };
      });
    } catch (error) {
      console.error(`[ServiceNow] Error fetching application services for company:`, error);
      return [];
    }
  }

  /**
   * Get Customer Account by number (READ-ONLY)
   * Used to query customer account information
   */
  public async getCustomerAccount(number: string): Promise<ServiceNowCustomerAccount | null> {
    const data = await request<{
      result: Array<Record<string, any>>;
    }>(
      `/api/now/table/customer_account?sysparm_query=${encodeURIComponent(
        `number=${number}`
      )}&sysparm_display_value=all&sysparm_limit=1`
    );

    if (!data.result || data.result.length === 0) {
      return null;
    }

    const account = data.result[0];
    const sysId = extractDisplayValue(account.sys_id);

    return {
      sys_id: sysId,
      number: extractDisplayValue(account.number),
      name: extractDisplayValue(account.name),
      url: `${config.instanceUrl}/nav_to.do?uri=customer_account.do?sys_id=${sysId}`,
    };
  }

  /**
   * Fetch all categories and subcategories for a ServiceNow table
   */
  public async getCategoriesForTable(table: string = 'sn_customerservice_case'): Promise<{
    categories: string[];
    subcategories: string[];
    categoryDetails: Array<any>;
    subcategoryDetails: Array<any>;
  }> {
    try {
      const categories = await this.getChoiceList({ table, element: 'category' });
      const subcategories = await this.getChoiceList({ table, element: 'subcategory' });

      return {
        categories: categories.map(c => c.label),
        subcategories: subcategories.map(c => c.label),
        categoryDetails: categories,
        subcategoryDetails: subcategories,
      };
    } catch (error) {
      console.error('Failed to fetch categories from ServiceNow:', error);
      // Return fallback categories
      return {
        categories: [
          'User Access Management',
          'Networking',
          'Application Support',
          'Infrastructure',
          'Security',
          'Database',
          'Hardware',
          'Email & Collaboration',
          'Telephony',
          'Cloud Services',
        ],
        subcategories: [],
        categoryDetails: [],
        subcategoryDetails: [],
      };
    }
  }

  /**
   * Create a child task for a case
   */
  public async createChildTask(input: {
    caseSysId: string;
    caseNumber: string;
    description: string;
    assignmentGroup?: string;
    shortDescription?: string;
    priority?: string;
  }): Promise<{
    sys_id: string;
    number: string;
    url: string;
  }> {
    const table = config.taskTable ?? "sn_customerservice_task";
    const endpoint = `/api/now/table/${table}`;

    // Build task payload
    const payload: Record<string, any> = {
      parent: input.caseSysId, // Link to parent case
      short_description: input.shortDescription || `CMDB Asset Creation Task for ${input.caseNumber}`,
      description: input.description,
      state: "1", // New state
      priority: input.priority || "4", // Medium priority by default
    };

    // Add assignment group if provided
    if (input.assignmentGroup) {
      payload.assignment_group = input.assignmentGroup;
    }

    const data = await request<{
      result: Array<{
        sys_id: string;
        number: string;
      }>;
    }>(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!data.result?.length) {
      throw new Error('Failed to create child task: No response from ServiceNow');
    }

    const task = data.result[0];
    return {
      sys_id: task.sys_id,
      number: task.number,
      url: `${config.instanceUrl}/nav_to.do?uri=${table}.do?sys_id=${task.sys_id}`,
    };
  }

  /**
   * Create a phone call interaction record in ServiceNow
   */
  public async createPhoneInteraction(input: {
    caseSysId: string;
    caseNumber: string;
    channel: string;
    direction?: string;
    phoneNumber?: string;
    sessionId: string;
    startTime: Date;
    endTime: Date;
    durationSeconds?: number;
    agentName?: string;
    queueName?: string;
    summary?: string;
    notes?: string;
  }): Promise<{
    interaction_sys_id: string;
    interaction_number: string;
    interaction_url: string;
  }> {
    const table = "interaction";
    const endpoint = `/api/now/table/${table}`;

    // Fetch case to get contact and account references
    const caseData = await this.getCaseBySysId(input.caseSysId);
    if (!caseData) {
      throw new Error(`Case not found: ${input.caseNumber} (${input.caseSysId})`);
    }

    // Build interaction payload with correct ServiceNow field names
    const payload: Record<string, any> = {
      // Required field
      type: 'phone',

      // Interaction details
      direction: input.direction || 'inbound', // Default to 'inbound' if not provided
      caller_phone_number: input.phoneNumber || '', // Can be empty if not provided

      // CRITICAL: Link to parent case using the 'parent' field
      // This is THE field that makes interactions appear in the case's related list!
      parent: input.caseSysId, // Direct reference to the case record

      // Context fields for metadata (do NOT create UI relationship)
      context_table: config.caseTable, // e.g., 'x_mobit_serv_case_service_case'
      context_document: input.caseSysId, // Case sys_id

      // Channel metadata provides alternative linking method
      channel_metadata_table: config.caseTable,
      channel_metadata_document: input.caseSysId,

      // CRITICAL: Customer contact and account from case
      // These fields link the interaction to the customer contact and account
      contact: caseData.contact || undefined, // Reference to customer_contact table
      account: caseData.account || undefined, // Reference to customer_account table

      // Timing - use correct field names
      opened_at: formatDateForServiceNow(input.startTime), // Not 'start_time'
      closed_at: formatDateForServiceNow(input.endTime),   // Not 'end_time'

      // Metadata
      short_description: input.summary || `Phone call - ${input.direction || 'unknown'} - ${input.sessionId}`,
      work_notes: input.notes || `Call Session ID: ${input.sessionId}\nDuration: ${input.durationSeconds ?? 'N/A'} seconds${input.agentName ? `\nAgent: ${input.agentName}` : ''}${input.queueName ? `\nQueue: ${input.queueName}` : ''}`,

      // Status - Use 'closed_complete' instead of 'closed' (which is invalid)
      state: 'closed_complete', // Valid closed state for completed interactions
    };

    // Add duration if provided (in seconds)
    if (input.durationSeconds !== undefined) {
      payload.duration = input.durationSeconds;
    }

    const data = await request<{
      result: {
        sys_id: string;
        number: string;
      };
    }>(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!data.result) {
      throw new Error('Failed to create phone interaction: No response from ServiceNow');
    }

    return {
      interaction_sys_id: data.result.sys_id,
      interaction_number: data.result.number,
      interaction_url: `${config.instanceUrl}/nav_to.do?uri=interaction.do?sys_id=${data.result.sys_id}`,
    };
  }
}

export const serviceNowClient = new ServiceNowClient();

/**
 * Convenience function to add work note
 */
export async function addCaseWorkNote(
  sysId: string,
  workNote: string,
  workNotes: boolean = true
): Promise<void> {
  await serviceNowClient.addCaseWorkNote(sysId, workNote, workNotes);
}
