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

export interface ServiceNowIncidentResult {
  number: string;
  sys_id: string;
  short_description: string;
  state?: string;
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
  company?: string;
  company_name?: string;
  account?: string;
  account_name?: string;
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

export interface ServiceNowCatalogItem {
  sys_id: string;
  name: string;
  short_description?: string;
  description?: string;
  category?: string;
  active: boolean;
  url: string;
}

export interface ServiceNowRequestItem {
  sys_id: string;
  number: string;
  short_description?: string;
  state?: string;
  opened_at?: string;
  cat_item?: string;           // Catalog item sys_id
  cat_item_name?: string;      // Catalog item name
  request?: string;            // Parent request sys_id
  request_number?: string;     // Parent request number
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
      opened_by: openedBy,
      caller_id: callerId,
      submitted_by: extractDisplayValue(raw.submitted_by) || openedBy || callerId || undefined,
      company: typeof raw.company === 'object' && raw.company?.value ? raw.company.value : extractDisplayValue(raw.company),
      company_name: typeof raw.company === 'object' ? extractDisplayValue(raw.company?.display_value) : undefined,
      account: typeof raw.account === 'object' && raw.account?.value ? raw.account.value : extractDisplayValue(raw.account),
      account_name: typeof raw.account === 'object' ? extractDisplayValue(raw.account?.display_value) : undefined,
      url: `${config.instanceUrl}/nav_to.do?uri=${table}.do?sys_id=${sysId}`,
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
    isMajorIncident?: boolean;
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
      category: input.category,
      subcategory: input.subcategory,
      urgency: input.urgency || "3", // Default to medium urgency
      priority: input.priority || "3", // Default to medium priority
      caller_id: input.callerId,
      assignment_group: input.assignmentGroup,
      // Link to parent Case
      parent: input.caseSysId,
      // Add work notes documenting source
      work_notes: `Automatically created from Case ${input.caseNumber} via AI triage system. ITSM record type classification determined this is a service disruption requiring incident management.`,
    };

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
   * Search for catalog items
   * Retrieves Service Catalog items from ServiceNow
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

    return (data.result ?? []).map((item) => {
      const sysId = extractDisplayValue(item.sys_id);
      return {
        sys_id: sysId,
        name: extractDisplayValue(item.name) || 'Untitled',
        short_description: extractDisplayValue(item.short_description) || undefined,
        description: extractDisplayValue(item.description) || undefined,
        category: extractDisplayValue(item.category) || undefined,
        active: item.active === true || item.active === 'true',
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
      active: item.active === true || item.active === 'true',
      url: this.getCatalogItemUrl(sysId),
    } satisfies ServiceNowCatalogItem;
  }

  /**
   * Generate user-friendly URL for a catalog item
   */
  public getCatalogItemUrl(sysId: string): string {
    if (!config.instanceUrl) {
      return `[Catalog Item ${sysId}]`;
    }
    return `${config.instanceUrl}/sp?id=sc_cat_item&sys_id=${sysId}`;
  }

  /**
   * Get a request item (RITM) by number
   * Request items are instances of catalog items that users have submitted
   */
  public async getRequestItem(number: string): Promise<ServiceNowRequestItem | null> {
    const table = 'sc_req_item';
    const data = await request<{
      result: Array<any>;
    }>(
      `/api/now/table/${table}?sysparm_query=${encodeURIComponent(
        `number=${number}`
      )}&sysparm_limit=1&sysparm_display_value=all`
    );

    if (!data.result?.length) return null;

    const raw = data.result[0];
    const sysId = extractDisplayValue(raw.sys_id);

    return {
      sys_id: sysId,
      number: extractDisplayValue(raw.number),
      short_description: extractDisplayValue(raw.short_description) || undefined,
      state: extractDisplayValue(raw.state) || undefined,
      opened_at: extractDisplayValue(raw.opened_at) || undefined,
      cat_item: typeof raw.cat_item === 'object' && raw.cat_item?.value
        ? raw.cat_item.value
        : extractDisplayValue(raw.cat_item),
      cat_item_name: typeof raw.cat_item === 'object'
        ? extractDisplayValue(raw.cat_item?.display_value)
        : undefined,
      request: typeof raw.request === 'object' && raw.request?.value
        ? raw.request.value
        : extractDisplayValue(raw.request),
      request_number: typeof raw.request === 'object'
        ? extractDisplayValue(raw.request?.display_value)
        : undefined,
      url: `${config.instanceUrl}/nav_to.do?uri=${table}.do?sys_id=${sysId}`,
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
