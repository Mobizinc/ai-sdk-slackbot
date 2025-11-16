import { Buffer } from "node:buffer";
import { config as appConfig } from "../config";
import { featureFlags, hashUserId } from "../infrastructure/feature-flags";
import type {
  CaseRepository,
  IncidentRepository,
  KnowledgeRepository,
  ServiceCatalogRepository,
  ServiceManagementRepository,
  CMDBRepository,
  CustomerAccountRepository,
  ChoiceRepository,
  ProblemRepository,
  SPMRepository,
  RequestRepository,
  RequestedItemRepository,
  CatalogTaskRepository,
} from "../infrastructure/servicenow/repositories";
import type {
  Case,
  Incident,
  ConfigurationItem,
  Choice,
  SPMProject,
  SPMEpic,
  SPMStory,
  CreateSPMProjectInput,
  UpdateSPMProjectInput,
  SPMSearchCriteria,
  CreateConfigurationItemInput,
  CreateCIRelationshipInput,
  Request,
  RequestedItem,
  CatalogTask,
} from "../infrastructure/servicenow/types";
import {
  getCaseRepository,
  getIncidentRepository,
  getKnowledgeRepository,
  getServiceCatalogRepository,
  getCmdbRepository,
  getCustomerAccountRepository,
  getChoiceRepository,
  getProblemRepository,
  getSPMRepository,
  getRequestRepository,
  getRequestedItemRepository,
  getCatalogTaskRepository,
  type ServiceNowContext,
} from "../infrastructure/servicenow/repositories";

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

function normalize(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Type guard to check if a value is a plain object (not null, not an array)
 */
function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const serviceNowConfig: ServiceNowConfig = {
  instanceUrl: normalize(appConfig.servicenowInstanceUrl || appConfig.servicenowUrl),
  username: normalize(appConfig.servicenowUsername),
  password: normalize(appConfig.servicenowPassword),
  apiToken: normalize(appConfig.servicenowApiToken),
  caseTable: (appConfig.servicenowCaseTable || "sn_customerservice_case").trim(),
  caseJournalName: (appConfig.servicenowCaseJournalName || "x_mobit_serv_case_service_case").trim(),
  ciTable: (appConfig.servicenowCiTable || "cmdb_ci").trim(),
  taskTable: (appConfig.servicenowTaskTable || "sn_customerservice_task").trim(),
};

const SERVER_CLASS_EXPANSION = [
  "cmdb_ci_server",
  "cmdb_ci_computer",
  "cmdb_ci_win_server",
  "cmdb_ci_unix_server",
  "cmdb_ci_linux_server",
  "cmdb_ci_mainframe",
  "cmdb_ci_vm_instance",
  "cmdb_ci_virtual_machine",
  "cmdb_ci_cloud_host",
];

function expandClassNames(className?: string): string[] | null {
  if (!className) return null;
  if (className === "cmdb_ci_server" || className === "cmdb_ci_computer") {
    return SERVER_CLASS_EXPANSION;
  }
  return [className];
}

function detectAuthMode(): ServiceNowAuthMode | null {
  if (serviceNowConfig.username && serviceNowConfig.password) {
    return "basic";
  }

  if (serviceNowConfig.apiToken) {
    return "token";
  }

  return null;
}

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const mode = detectAuthMode();

  if (mode === "basic") {
    const encoded = Buffer.from(`${serviceNowConfig.username}:${serviceNowConfig.password}`).toString(
      "base64",
    );
    return {
      Authorization: `Basic ${encoded}`,
    };
  }

  if (mode === "token") {
    return {
      Authorization: `Bearer ${serviceNowConfig.apiToken}`,
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
  if (!serviceNowConfig.instanceUrl) {
    throw new Error(
      "ServiceNow instance URL is not configured. Set SERVICENOW_INSTANCE_URL.",
    );
  }

  const headers = {
    "content-type": "application/json",
    ...(init.headers ?? {}),
    ...(await buildAuthHeaders()),
  } as Record<string, string>;

  const url = `${serviceNowConfig.instanceUrl}${path}`;
  const method = (init.method || "GET").toUpperCase();

  // Log the HTTP request
  console.log(`[ServiceNow HTTP] ${method} ${url}`);
  const startTime = Date.now();

  const response = await fetch(url, {
    ...init,
    headers,
  });

  const duration = Date.now() - startTime;

  if (!response.ok) {
    console.error(`[ServiceNow HTTP] Response: ${response.status} ${response.statusText} (${duration}ms)`);
    const body = await response.text();
    throw new Error(
      `ServiceNow request failed with status ${response.status}: ${body.slice(0, 500)}`,
    );
  }

  // Log successful response
  console.log(`[ServiceNow HTTP] Response: ${response.status} ${response.statusText} (${duration}ms)`);

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

function sanitizeText(value?: string | null | any): string | undefined {
  if (!value) return undefined;

  // Handle ServiceNow display_value objects
  const stringValue = typeof value === 'object' && value.display_value
    ? value.display_value
    : typeof value === 'string'
    ? value
    : String(value);

  const cleaned = stringValue
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?p>/gi, "\n")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\r?\n+/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length ? cleaned : undefined;
}

function formatJournalEntries(entries: ServiceNowCaseJournalEntry[], limit = 5): string | undefined {
  if (!entries.length) {
    return undefined;
  }

  const lines: string[] = [];
  for (const entry of entries.slice(0, limit)) {
    const sanitized = sanitizeText(entry.value) ?? "(no content)";
    let when = "recent";
    if (entry.sys_created_on) {
      const date = new Date(entry.sys_created_on);
      if (!Number.isNaN(date.getTime())) {
        when = date.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
      }
    }
    const author = entry.sys_created_by || "unknown";
    lines.push(`• ${when} – ${author}: ${sanitized}`);
  }

  return lines.join("\n");
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
  description?: string;
  state?: string;
  priority?: string;
  assigned_to?: string;
  assignment_group?: string;
  company?: string;
  caller_id?: string;
  category?: string;
  subcategory?: string;
  business_service?: string;
  cmdb_ci?: string;
  sys_created_on?: string;
  sys_updated_on?: string;
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
  impact?: string;
  state?: string;
  category?: string;
  subcategory?: string;
  opened_at?: string;
  assignment_group?: string;
  assignment_group_sys_id?: string;
  assigned_to?: string;
  assigned_to_sys_id?: string;
  opened_by?: string;
  opened_by_sys_id?: string;
  caller_id?: string;
  caller_id_sys_id?: string;
  submitted_by?: string;
  contact?: string; // Reference to customer_contact table (sys_id)
  contact_phone?: string;
  contact_type?: string;
  account?: string; // Reference to customer_account table (sys_id)
  company?: string; // Reference to customer_account/company table (sys_id)
  company_name?: string;
  business_service?: string;
  location?: string;
  cmdb_ci?: string;
  urgency?: string;
  sys_domain?: string;
  sys_domain_path?: string;
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
  company?: string;
  company_name?: string;
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
  /**
   * New repository pattern implementation (lazy-loaded)
   * Used for gradual migration via feature flags
   */
  private caseRepository: CaseRepository | null = null;
  private incidentRepository: IncidentRepository | null = null;
  private knowledgeRepository: KnowledgeRepository | null = null;
  private catalogRepository: (ServiceCatalogRepository & ServiceManagementRepository) | null = null;
  private cmdbRepository: CMDBRepository | null = null;
  private customerAccountRepository: CustomerAccountRepository | null = null;
  private choiceRepository: ChoiceRepository | null = null;
  private problemRepository: ProblemRepository | null = null;
  private spmRepository: SPMRepository | null = null;
  private requestRepository: RequestRepository | null = null;
  private requestedItemRepository: RequestedItemRepository | null = null;
  private catalogTaskRepository: CatalogTaskRepository | null = null;

  /**
   * Get or initialize the case repository
   */
  private getCaseRepo(): CaseRepository {
    if (!this.caseRepository) {
      this.caseRepository = getCaseRepository();
    }
    return this.caseRepository;
  }

  /**
   * Get or initialize the incident repository
   */
  private getIncidentRepo(): IncidentRepository {
    if (!this.incidentRepository) {
      this.incidentRepository = getIncidentRepository();
    }
    return this.incidentRepository;
  }

  /**
   * Get or initialize the knowledge repository
   */
  private getKnowledgeRepo(): KnowledgeRepository {
    if (!this.knowledgeRepository) {
      this.knowledgeRepository = getKnowledgeRepository();
    }
    return this.knowledgeRepository;
  }

  /**
   * Get or initialize the service catalog repository
   */
  private getCatalogRepo(): ServiceCatalogRepository & ServiceManagementRepository {
    if (!this.catalogRepository) {
      this.catalogRepository = getServiceCatalogRepository();
    }
    return this.catalogRepository;
  }

  private getCmdbRepo(): CMDBRepository {
    if (!this.cmdbRepository) {
      this.cmdbRepository = getCmdbRepository();
    }
    return this.cmdbRepository;
  }

  private mapDomainCi(item: ConfigurationItem): ServiceNowConfigurationItem {
    return {
      sys_id: item.sysId,
      name: item.name,
      sys_class_name: item.className,
      fqdn: item.fqdn,
      host_name: item.hostName,
      ip_addresses: item.ipAddresses,
      company: item.company,
      company_name: item.companyName,
      owner_group: item.ownerGroup,
      support_group: item.supportGroup,
      location: item.location,
      environment: item.environment,
      status: item.status,
      description: item.description,
      url: item.url,
    };
  }

  private getCustomerAccountRepo(): CustomerAccountRepository {
    if (!this.customerAccountRepository) {
      this.customerAccountRepository = getCustomerAccountRepository();
    }
    return this.customerAccountRepository;
  }

  private getChoiceRepo(): ChoiceRepository {
    if (!this.choiceRepository) {
      this.choiceRepository = getChoiceRepository();
    }
    return this.choiceRepository;
  }

  private getProblemRepo(): ProblemRepository {
    if (!this.problemRepository) {
      this.problemRepository = getProblemRepository();
    }
    return this.problemRepository;
  }

  /**
   * Get or initialize the SPM repository
   */
  private getSPMRepo(): SPMRepository {
    if (!this.spmRepository) {
      this.spmRepository = getSPMRepository();
    }
    return this.spmRepository;
  }

  /**
   * Get or initialize the Request repository
   */
  private getRequestRepo(): RequestRepository {
    if (!this.requestRepository) {
      this.requestRepository = getRequestRepository();
    }
    return this.requestRepository;
  }

  /**
   * Get or initialize the RequestedItem repository
   */
  private getRequestedItemRepo(): RequestedItemRepository {
    if (!this.requestedItemRepository) {
      this.requestedItemRepository = getRequestedItemRepository();
    }
    return this.requestedItemRepository;
  }

  /**
   * Get or initialize the CatalogTask repository
   */
  private getCatalogTaskRepo(): CatalogTaskRepository {
    if (!this.catalogTaskRepository) {
      this.catalogTaskRepository = getCatalogTaskRepository();
    }
    return this.catalogTaskRepository;
  }

  /**
   * Convert new Case domain model to legacy ServiceNowCaseResult format
   */
  private toDomainModelToLegacyFormat(case_: Case): ServiceNowCaseResult {
    // Safely convert dates to ISO strings with error handling
    let openedAtIso: string | undefined;
    try {
      openedAtIso = case_.openedAt?.toISOString();
    } catch (error) {
      console.warn(`[ServiceNow] Invalid opened_at date for case ${case_.number}`, {
        openedAt: case_.openedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      openedAtIso = undefined;
    }

    return {
      sys_id: case_.sysId,
      number: case_.number,
      short_description: case_.shortDescription,
      description: case_.description,
      priority: case_.priority,
      impact: case_.impact,
      state: case_.state,
      category: case_.category,
      subcategory: case_.subcategory,
      opened_at: openedAtIso,
      assignment_group: case_.assignmentGroup,
      assignment_group_sys_id: case_.assignmentGroupSysId,
      assigned_to: case_.assignedTo,
      assigned_to_sys_id: case_.assignedToSysId,
      opened_by: case_.openedBy,
      opened_by_sys_id: case_.openedBySysId,
      caller_id: case_.callerId,
      caller_id_sys_id: case_.callerIdSysId,
      submitted_by: case_.submittedBy,
      contact: case_.contact,
      contact_phone: case_.contactPhone,
      account: case_.account,
      company: case_.company,
      company_name: case_.companyName,
      business_service: case_.businessService,
      location: case_.location,
      cmdb_ci: case_.cmdbCi,
      urgency: case_.urgency,
      sys_domain: case_.sysDomain,
      sys_domain_path: case_.sysDomainPath,
      url: case_.url,
    };
  }

  /**
   * Convert new Incident domain model to legacy ServiceNowIncidentResult format
   */
  private incidentToLegacyFormat(incident: Incident): ServiceNowIncidentResult {
    return {
      sys_id: incident.sysId,
      number: incident.number,
      short_description: incident.shortDescription,
      description: incident.description,
      state: incident.state,
      priority: incident.priority,
      assigned_to: incident.assignedTo,
      assignment_group: incident.assignmentGroup,
      company: incident.company,
      caller_id: incident.callerId,
      category: incident.category,
      subcategory: incident.subcategory,
      business_service: incident.businessService,
      cmdb_ci: incident.cmdbCi,
      sys_created_on: incident.sysCreatedOn?.toISOString(),
      sys_updated_on: incident.sysUpdatedOn?.toISOString(),
      url: incident.url,
    };
  }

  /**
   * Convert new Incident domain model to legacy ServiceNowIncidentSummary format
   */
  private incidentToLegacySummaryFormat(incident: Incident): ServiceNowIncidentSummary {
    return {
      sys_id: incident.sysId,
      number: incident.number,
      short_description: incident.shortDescription,
      state: incident.state,
      resolved_at: incident.resolvedAt?.toISOString(),
      close_code: incident.closeCode,
      parent: incident.parent,
      url: incident.url,
    };
  }

  public isConfigured(): boolean {
    return Boolean(serviceNowConfig.instanceUrl && detectAuthMode());
  }

  public async getIncident(
    number: string,
    context?: ServiceNowContext,
  ): Promise<ServiceNowIncidentResult | null> {
    // Feature flag: Decide whether to use new repository pattern or legacy implementation
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    // Log which path is being used
    console.log(`[ServiceNow] getIncident using ${useNewPath ? "NEW" : "OLD"} path`, {
      number,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    if (useNewPath) {
      // NEW PATH: Use repository pattern
      try {
        const incidentRepo = this.getIncidentRepo();
        const incident = await incidentRepo.findByNumber(number);

        if (!incident) {
          console.log(`[ServiceNow] NEW path: Incident not found`, { number });
          return null;
        }

        const result = this.incidentToLegacyFormat(incident);
        console.log(`[ServiceNow] NEW path: Successfully retrieved incident`, {
          number,
          sysId: result.sys_id,
        });
        return result;
      } catch (error) {
        // Log error but don't crash - fall back to old path
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          number,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to OLD path below
      }
    }

    // OLD PATH: Legacy implementation (or fallback from error)
    console.log(`[ServiceNow] OLD path: Using legacy implementation`, { number });

    const data = await request<{
      result: Array<ServiceNowIncidentResult & { sys_id: string }>;
    }>(`/api/now/table/incident?number=${encodeURIComponent(number)}`);

    if (!data.result?.length) {
      console.log(`[ServiceNow] OLD path: Incident not found`, { number });
      return null;
    }

    const incident = data.result[0];
    const result = {
      ...incident,
      url: `${serviceNowConfig.instanceUrl}/nav_to.do?uri=incident.do?sys_id=${incident.sys_id}`,
    };

    console.log(`[ServiceNow] OLD path: Successfully retrieved incident`, {
      number,
      sysId: result.sys_id,
    });

    return result;
  }

  public async getResolvedIncidents(
    options: {
      limit?: number;
      olderThanMinutes?: number;
      requireParentCase?: boolean;
      requireEmptyCloseCode?: boolean;
    } = {},
    context?: ServiceNowContext,
  ): Promise<ServiceNowIncidentSummary[]> {
    // Feature flag: Decide whether to use new repository pattern or legacy implementation
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    // Log which path is being used
    console.log(`[ServiceNow] getResolvedIncidents using ${useNewPath ? "NEW" : "OLD"} path`, {
      limit: options.limit,
      olderThanMinutes: options.olderThanMinutes,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    if (useNewPath) {
      // NEW PATH: Use repository pattern
      try {
        const incidentRepo = this.getIncidentRepo();
        const incidents = await incidentRepo.findResolved(options);

        const summaries = incidents.map((incident) => this.incidentToLegacySummaryFormat(incident));

        console.log(`[ServiceNow] NEW path: Successfully retrieved resolved incidents`, {
          count: summaries.length,
        });

        return summaries;
      } catch (error) {
        // Log error but don't crash - fall back to old path
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to OLD path below
      }
    }

    // OLD PATH: Legacy implementation (or fallback from error)
    console.log(`[ServiceNow] OLD path: Using legacy implementation`);

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

    const result = incidents.map((record) => {
      const sysId = extractDisplayValue(record.sys_id);
      return {
        sys_id: sysId,
        number: extractDisplayValue(record.number),
        short_description: extractDisplayValue(record.short_description) || undefined,
        state: extractDisplayValue(record.state) || undefined,
        resolved_at: extractDisplayValue(record.resolved_at) || undefined,
        close_code: extractDisplayValue(record.close_code) || undefined,
        parent: extractDisplayValue(record.parent) || undefined,
        url: `${serviceNowConfig.instanceUrl}/nav_to.do?uri=incident.do?sys_id=${sysId}`,
      } satisfies ServiceNowIncidentSummary;
    });

    console.log(`[ServiceNow] OLD path: Successfully retrieved resolved incidents`, {
      count: result.length,
    });

    return result;
  }

  public async getIncidentsByParent(
    parentSysId: string,
    options: { includeResolved?: boolean; includeClosed?: boolean } = {},
    context?: ServiceNowContext,
  ): Promise<ServiceNowIncidentSummary[]> {
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    console.log(`[ServiceNow] getIncidentsByParent using ${useNewPath ? "NEW" : "OLD"} path`, {
      parentSysId,
      includeResolved: options.includeResolved,
      includeClosed: options.includeClosed,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    if (useNewPath) {
      try {
        const incidentRepo = this.getIncidentRepo();
        const incidents = await incidentRepo.findByParent(parentSysId);
        let summaries = incidents.map((incident) => this.incidentToLegacySummaryFormat(incident));

        if (!options.includeResolved) {
          summaries = summaries.filter((incident) => incident.state !== "6" && incident.state?.toLowerCase() !== "resolved");
        }

        if (!options.includeClosed) {
          summaries = summaries.filter((incident) => incident.state !== "7" && incident.state?.toLowerCase() !== "closed");
        }

        return summaries;
      } catch (error) {
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          parentSysId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const queryParts = [`parent=${parentSysId}`];
    if (!options.includeResolved && !options.includeClosed) {
      queryParts.push("stateNOT IN6,7");
    } else {
      if (!options.includeResolved) {
        queryParts.push("state!=6");
      }
      if (!options.includeClosed) {
        queryParts.push("state!=7");
      }
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
      )}&sysparm_display_value=all`,
    );

    const incidents = (data.result ?? []).map((record) => {
      const sysId = extractDisplayValue(record.sys_id);
      return {
        sys_id: sysId,
        number: extractDisplayValue(record.number),
        short_description: extractDisplayValue(record.short_description) || undefined,
        state: extractDisplayValue(record.state) || undefined,
        resolved_at: extractDisplayValue(record.resolved_at) || undefined,
        close_code: extractDisplayValue(record.close_code) || undefined,
        parent: extractDisplayValue(record.parent) || undefined,
        url: `${serviceNowConfig.instanceUrl}/nav_to.do?uri=incident.do?sys_id=${sysId}`,
      } satisfies ServiceNowIncidentSummary;
    });

    return incidents.filter((incident) => {
      if (!options.includeResolved && (incident.state === "6" || incident.state?.toLowerCase() === "resolved")) {
        return false;
      }
      if (!options.includeClosed && (incident.state === "7" || incident.state?.toLowerCase() === "closed")) {
        return false;
      }
      return true;
    });
  }

  public async searchKnowledge(
    input: ServiceNowKnowledgeSearchInput,
    context?: ServiceNowContext,
  ): Promise<ServiceNowKnowledgeArticle[]> {
    // Feature flag: Decide whether to use new repository pattern or legacy implementation
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    // Log which path is being used
    console.log(`[ServiceNow] searchKnowledge using ${useNewPath ? "NEW" : "OLD"} path`, {
      query: input.query,
      limit: input.limit,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    if (useNewPath) {
      // NEW PATH: Use repository pattern
      try {
        const knowledgeRepo = this.getKnowledgeRepo();
        const articles = await knowledgeRepo.search(input.query, input.limit ?? 3);

        // Convert to legacy format
        const legacyArticles: ServiceNowKnowledgeArticle[] = articles.map((article) => ({
          number: article.number,
          short_description: article.shortDescription,
          sys_id: article.sysId,
          url: article.url,
        }));

        console.log(`[ServiceNow] NEW path: Successfully searched knowledge articles`, {
          query: input.query,
          found: legacyArticles.length,
        });

        return legacyArticles;
      } catch (error) {
        // Log error but don't crash - fall back to old path
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          query: input.query,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to OLD path below
      }
    }

    // OLD PATH: Legacy implementation (or fallback from error)
    console.log(`[ServiceNow] OLD path: Using legacy implementation`, { query: input.query });

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

    const result = data.result.map((article) => ({
      ...article,
      url: `${serviceNowConfig.instanceUrl}/nav_to.do?uri=kb_knowledge.do?sys_id=${article.sys_id}`,
    }));

    console.log(`[ServiceNow] OLD path: Successfully searched knowledge articles`, {
      query: input.query,
      found: result.length,
    });

    return result;
  }

  public async getCase(
    number: string,
    context?: ServiceNowContext,
  ): Promise<ServiceNowCaseResult | null> {
    // Feature flag: Decide whether to use new repository pattern or legacy implementation
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    // Log which path is being used (critical for monitoring rollout)
    console.log(`[ServiceNow] getCase using ${useNewPath ? "NEW" : "OLD"} path`, {
      number,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    if (useNewPath) {
      // NEW PATH: Use repository pattern
      try {
        const caseRepo = this.getCaseRepo();
        const case_ = await caseRepo.findByNumber(number);

        if (!case_) {
          console.log(`[ServiceNow] NEW path: Case not found`, { number });
          return null;
        }

        const result = this.toDomainModelToLegacyFormat(case_);
        console.log(`[ServiceNow] NEW path: Successfully retrieved case`, {
          number,
          sysId: result.sys_id,
        });
        return result;
      } catch (error) {
        // Log error but don't crash - fall back to old path
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          number,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to OLD path below
      }
    }

    // OLD PATH: Legacy implementation (or fallback from error)
    console.log(`[ServiceNow] OLD path: Using legacy implementation`, { number });

    const table = serviceNowConfig.caseTable ?? "sn_customerservice_case";
    const data = await request<{
      result: Array<any>;
    }>(
      `/api/now/table/${table}?sysparm_query=${encodeURIComponent(
        `number=${number}`,
      )}&sysparm_limit=1&sysparm_display_value=all`,
    );

    if (!data.result?.length) {
      console.log(`[ServiceNow] OLD path: Case not found`, { number });
      return null;
    }

    const raw = data.result[0];

    // Extract display values for all fields that might be objects
    const sysId = extractDisplayValue(raw.sys_id);
    const openedBy = extractDisplayValue(raw.opened_by);
    const callerId = extractDisplayValue(raw.caller_id);

    const result = {
      sys_id: sysId,
      number: raw.number,
      short_description: extractDisplayValue(raw.short_description),
      description: extractDisplayValue(raw.description),
      priority: extractDisplayValue(raw.priority),
      impact: extractDisplayValue(raw.impact),
      urgency: extractDisplayValue(raw.urgency),
      state: extractDisplayValue(raw.state),
      category: extractDisplayValue(raw.category),
      subcategory: extractDisplayValue(raw.subcategory),
      opened_at: extractDisplayValue(raw.opened_at),
      assignment_group: extractDisplayValue(raw.assignment_group),
      assignment_group_sys_id: extractReferenceSysId(raw.assignment_group),
      assigned_to: extractDisplayValue(raw.assigned_to),
      assigned_to_sys_id: extractReferenceSysId(raw.assigned_to),
      opened_by: openedBy,
      opened_by_sys_id: extractReferenceSysId(raw.opened_by),
      caller_id: callerId,
      caller_id_sys_id: extractReferenceSysId(raw.caller_id),
      submitted_by: extractDisplayValue(raw.submitted_by) || openedBy || callerId || undefined,
      contact: extractReferenceSysId(raw.contact),
      contact_phone: extractDisplayValue(raw.u_contact_phone || raw.contact_phone),
      contact_type: extractDisplayValue(raw.contact_type),
      account: extractReferenceSysId(raw.account),
      company: extractReferenceSysId(raw.company),
      company_name: extractDisplayValue(raw.company),
      business_service: extractReferenceSysId(raw.business_service),
      location: extractReferenceSysId(raw.location),
      cmdb_ci: extractReferenceSysId(raw.cmdb_ci),
      url: `${serviceNowConfig.instanceUrl}/nav_to.do?uri=${table}.do?sys_id=${sysId}`,
    };

    console.log(`[ServiceNow] OLD path: Successfully retrieved case`, {
      number,
      sysId: result.sys_id,
    });

    return result;
  }

  public async getCaseBySysId(
    sysId: string,
    context?: ServiceNowContext,
  ): Promise<ServiceNowCaseResult | null> {
    // Feature flag: Decide whether to use new repository pattern or legacy implementation
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    // Log which path is being used (critical for monitoring rollout)
    console.log(`[ServiceNow] getCaseBySysId using ${useNewPath ? "NEW" : "OLD"} path`, {
      sysId,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    if (useNewPath) {
      // NEW PATH: Use repository pattern
      try {
        const caseRepo = this.getCaseRepo();
        const case_ = await caseRepo.findBySysId(sysId);

        if (!case_) {
          console.log(`[ServiceNow] NEW path: Case not found`, { sysId });
          return null;
        }

        const result = this.toDomainModelToLegacyFormat(case_);
        console.log(`[ServiceNow] NEW path: Successfully retrieved case`, {
          sysId,
          number: result.number,
        });
        return result;
      } catch (error) {
        // Log error but don't crash - fall back to old path
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          sysId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to OLD path below
      }
    }

    // OLD PATH: Legacy implementation (or fallback from error)
    console.log(`[ServiceNow] OLD path: Using legacy implementation`, { sysId });

    const table = serviceNowConfig.caseTable ?? "sn_customerservice_case";
    const data = await request<{
      result: Array<any>;
    }>(
      `/api/now/table/${table}?sysparm_query=${encodeURIComponent(
        `sys_id=${sysId}`,
      )}&sysparm_limit=1&sysparm_display_value=all`,
    );

    if (!data.result?.length) {
      console.log(`[ServiceNow] OLD path: Case not found`, { sysId });
      return null;
    }

    const raw = data.result[0];

    const result = {
      sys_id: extractDisplayValue(raw.sys_id),
      number: extractDisplayValue(raw.number),
      short_description: extractDisplayValue(raw.short_description),
      description: extractDisplayValue(raw.description),
      priority: extractDisplayValue(raw.priority),
      impact: extractDisplayValue(raw.impact),
      urgency: extractDisplayValue(raw.urgency),
      state: extractDisplayValue(raw.state),
      category: extractDisplayValue(raw.category),
      subcategory: extractDisplayValue(raw.subcategory),
      opened_at: extractDisplayValue(raw.opened_at),
      assignment_group: extractDisplayValue(raw.assignment_group),
      assignment_group_sys_id: extractReferenceSysId(raw.assignment_group),
      assigned_to: extractDisplayValue(raw.assigned_to),
      assigned_to_sys_id: extractReferenceSysId(raw.assigned_to),
      opened_by: extractDisplayValue(raw.opened_by),
      opened_by_sys_id: extractReferenceSysId(raw.opened_by),
      caller_id: extractDisplayValue(raw.caller_id),
      caller_id_sys_id: extractReferenceSysId(raw.caller_id),
      submitted_by: extractDisplayValue(raw.submitted_by),
      contact: extractReferenceSysId(raw.contact), // Extract contact sys_id
      contact_phone: extractDisplayValue(raw.u_contact_phone || raw.contact_phone),
      contact_type: extractDisplayValue(raw.contact_type),
      account: extractReferenceSysId(raw.account), // Extract account sys_id
      company: extractReferenceSysId(raw.company),
      company_name: extractDisplayValue(raw.company),
      business_service: extractReferenceSysId(raw.business_service),
      location: extractReferenceSysId(raw.location),
      cmdb_ci: extractReferenceSysId(raw.cmdb_ci),
      sys_domain: extractReferenceSysId(raw.sys_domain),
      sys_domain_path: extractDisplayValue(raw.sys_domain_path),
      url: `${serviceNowConfig.instanceUrl}/nav_to.do?uri=${table}.do?sys_id=${extractDisplayValue(
        raw.sys_id,
      )}`,
    };

    console.log(`[ServiceNow] OLD path: Successfully retrieved case`, {
      sysId,
      number: result.number,
    });

    return result;
  }

  /**
   * Get Service Catalog Request by number (REQ prefix)
   */
  public async getRequest(
    number: string,
    context?: ServiceNowContext,
  ): Promise<Request | null> {
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    console.log(`[ServiceNow] getRequest using ${useNewPath ? "NEW" : "OLD"} path`, {
      number,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    if (useNewPath) {
      try {
        const requestRepo = this.getRequestRepo();
        const request = await requestRepo.findByNumber(number);

        if (!request) {
          console.log(`[ServiceNow] NEW path: Request not found`, { number });
          return null;
        }

        console.log(`[ServiceNow] NEW path: Successfully retrieved request`, {
          number,
          sysId: request.sysId,
        });
        return request;
      } catch (error) {
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          number,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to OLD path below
      }
    }

    // OLD PATH: Direct Table API call
    console.log(`[ServiceNow] OLD path: Using legacy implementation`, { number });

    const data = await request<{ result: Array<any> }>(
      `/api/now/table/sc_request?sysparm_query=${encodeURIComponent(
        `number=${number}`,
      )}&sysparm_limit=1&sysparm_display_value=all`,
    );

    if (!data.result?.length) {
      console.log(`[ServiceNow] OLD path: Request not found`, { number });
      return null;
    }

    const raw = data.result[0];
    const sysId = extractDisplayValue(raw.sys_id);

    // Map to Request domain model
    const result: Request = {
      sysId,
      number: extractDisplayValue(raw.number) ?? number,
      shortDescription: extractDisplayValue(raw.short_description) ?? '',
      description: extractDisplayValue(raw.description),
      requestedFor: extractReferenceSysId(raw.requested_for),
      requestedForName: extractDisplayValue(raw.requested_for),
      requestedBy: extractReferenceSysId(raw.requested_by),
      requestedByName: extractDisplayValue(raw.requested_by),
      state: extractDisplayValue(raw.state),
      priority: extractDisplayValue(raw.priority),
      openedAt: raw.opened_at ? new Date(extractDisplayValue(raw.opened_at) ?? '') : undefined,
      closedAt: raw.closed_at ? new Date(extractDisplayValue(raw.closed_at) ?? '') : undefined,
      dueDate: raw.due_date ? new Date(extractDisplayValue(raw.due_date) ?? '') : undefined,
      stage: extractDisplayValue(raw.stage),
      approvalState: extractDisplayValue(raw.approval),
      deliveryAddress: extractDisplayValue(raw.delivery_address),
      specialInstructions: extractDisplayValue(raw.special_instructions),
      price: raw.price ? parseFloat(extractDisplayValue(raw.price) ?? '0') : undefined,
      url: `${serviceNowConfig.instanceUrl}/nav_to.do?uri=sc_request.do?sys_id=${sysId}`,
    };

    console.log(`[ServiceNow] OLD path: Successfully retrieved request`, {
      number,
      sysId: result.sysId,
    });

    return result;
  }

  /**
   * Get Requested Item by number (RITM prefix)
   */
  public async getRequestedItem(
    number: string,
    context?: ServiceNowContext,
  ): Promise<RequestedItem | null> {
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    console.log(`[ServiceNow] getRequestedItem using ${useNewPath ? "NEW" : "OLD"} path`, {
      number,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    if (useNewPath) {
      try {
        const ritmRepo = this.getRequestedItemRepo();
        const ritm = await ritmRepo.findByNumber(number);

        if (!ritm) {
          console.log(`[ServiceNow] NEW path: Requested item not found`, { number });
          return null;
        }

        console.log(`[ServiceNow] NEW path: Successfully retrieved requested item`, {
          number,
          sysId: ritm.sysId,
        });
        return ritm;
      } catch (error) {
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          number,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to OLD path below
      }
    }

    // OLD PATH: Direct Table API call
    console.log(`[ServiceNow] OLD path: Using legacy implementation`, { number });

    const data = await request<{ result: Array<any> }>(
      `/api/now/table/sc_req_item?sysparm_query=${encodeURIComponent(
        `number=${number}`,
      )}&sysparm_limit=1&sysparm_display_value=all`,
    );

    if (!data.result?.length) {
      console.log(`[ServiceNow] OLD path: Requested item not found`, { number });
      return null;
    }

    const raw = data.result[0];
    const sysId = extractDisplayValue(raw.sys_id);

    // Map to RequestedItem domain model
    const result: RequestedItem = {
      sysId,
      number: extractDisplayValue(raw.number) ?? number,
      shortDescription: extractDisplayValue(raw.short_description) ?? '',
      description: extractDisplayValue(raw.description),
      request: extractReferenceSysId(raw.request),
      requestNumber: extractDisplayValue(raw.request),
      catalogItem: extractReferenceSysId(raw.cat_item),
      catalogItemName: extractDisplayValue(raw.cat_item),
      state: extractDisplayValue(raw.state),
      stage: extractDisplayValue(raw.stage),
      openedAt: raw.opened_at ? new Date(extractDisplayValue(raw.opened_at) ?? '') : undefined,
      closedAt: raw.closed_at ? new Date(extractDisplayValue(raw.closed_at) ?? '') : undefined,
      dueDate: raw.due_date ? new Date(extractDisplayValue(raw.due_date) ?? '') : undefined,
      assignedTo: extractReferenceSysId(raw.assigned_to),
      assignedToName: extractDisplayValue(raw.assigned_to),
      assignmentGroup: extractReferenceSysId(raw.assignment_group),
      assignmentGroupName: extractDisplayValue(raw.assignment_group),
      quantity: raw.quantity ? parseInt(extractDisplayValue(raw.quantity) ?? '1', 10) : undefined,
      price: raw.price ? parseFloat(extractDisplayValue(raw.price) ?? '0') : undefined,
      url: `${serviceNowConfig.instanceUrl}/nav_to.do?uri=sc_req_item.do?sys_id=${sysId}`,
    };

    console.log(`[ServiceNow] OLD path: Successfully retrieved requested item`, {
      number,
      sysId: result.sysId,
    });

    return result;
  }

  /**
   * Get Catalog Task by number (SCTASK prefix)
   */
  public async getCatalogTask(
    number: string,
    context?: ServiceNowContext,
  ): Promise<CatalogTask | null> {
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    console.log(`[ServiceNow] getCatalogTask using ${useNewPath ? "NEW" : "OLD"} path`, {
      number,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    if (useNewPath) {
      try {
        const taskRepo = this.getCatalogTaskRepo();
        const task = await taskRepo.findByNumber(number);

        if (!task) {
          console.log(`[ServiceNow] NEW path: Catalog task not found`, { number });
          return null;
        }

        console.log(`[ServiceNow] NEW path: Successfully retrieved catalog task`, {
          number,
          sysId: task.sysId,
        });
        return task;
      } catch (error) {
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          number,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to OLD path below
      }
    }

    // OLD PATH: Direct Table API call
    console.log(`[ServiceNow] OLD path: Using legacy implementation`, { number });

    const data = await request<{ result: Array<any> }>(
      `/api/now/table/sc_task?sysparm_query=${encodeURIComponent(
        `number=${number}`,
      )}&sysparm_limit=1&sysparm_display_value=all`,
    );

    if (!data.result?.length) {
      console.log(`[ServiceNow] OLD path: Catalog task not found`, { number });
      return null;
    }

    const raw = data.result[0];
    const sysId = extractDisplayValue(raw.sys_id);

    // Map to CatalogTask domain model
    const result: CatalogTask = {
      sysId,
      number: extractDisplayValue(raw.number) ?? number,
      shortDescription: extractDisplayValue(raw.short_description) ?? '',
      description: extractDisplayValue(raw.description),
      requestItem: extractReferenceSysId(raw.request_item),
      requestItemNumber: extractDisplayValue(raw.request_item),
      request: extractReferenceSysId(raw.request),
      requestNumber: extractDisplayValue(raw.request),
      state: extractDisplayValue(raw.state),
      active: raw.active === 'true' || raw.active === true,
      openedAt: raw.opened_at ? new Date(extractDisplayValue(raw.opened_at) ?? '') : undefined,
      closedAt: raw.closed_at ? new Date(extractDisplayValue(raw.closed_at) ?? '') : undefined,
      dueDate: raw.due_date ? new Date(extractDisplayValue(raw.due_date) ?? '') : undefined,
      assignedTo: extractReferenceSysId(raw.assigned_to),
      assignedToName: extractDisplayValue(raw.assigned_to),
      assignmentGroup: extractReferenceSysId(raw.assignment_group),
      assignmentGroupName: extractDisplayValue(raw.assignment_group),
      priority: extractDisplayValue(raw.priority),
      workNotes: extractDisplayValue(raw.work_notes),
      closeNotes: extractDisplayValue(raw.close_notes),
      url: `${serviceNowConfig.instanceUrl}/nav_to.do?uri=sc_task.do?sys_id=${sysId}`,
    };

    console.log(`[ServiceNow] OLD path: Successfully retrieved catalog task`, {
      number,
      sysId: result.sysId,
    });

    return result;
  }

  public async getCaseJournal(
    caseSysId: string,
    { limit = 20 }: { limit?: number } = {},
    context?: ServiceNowContext,
  ): Promise<ServiceNowCaseJournalEntry[]> {
    // Feature flag: Decide whether to use new repository pattern or legacy implementation
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    // Log which path is being used
    console.log(`[ServiceNow] getCaseJournal using ${useNewPath ? "NEW" : "OLD"} path`, {
      caseSysId,
      limit,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    if (useNewPath) {
      // NEW PATH: Use repository pattern
      try {
        const caseRepo = this.getCaseRepo();
        const journalName = serviceNowConfig.caseJournalName;

        const entries = await caseRepo.getJournalEntries(caseSysId, {
          limit,
          journalName,
        });

        // Convert repository format to legacy ServiceNowCaseJournalEntry format
        const legacyEntries: ServiceNowCaseJournalEntry[] = entries.map((entry) => ({
          sys_id: entry.sysId,
          element: entry.element,
          element_id: entry.elementId,
          name: entry.name,
          sys_created_on: entry.createdOn,
          sys_created_by: entry.createdBy,
          value: entry.value,
        }));

        console.log(`[ServiceNow] NEW path: Successfully retrieved journal entries`, {
          caseSysId,
          count: legacyEntries.length,
        });

        return legacyEntries;
      } catch (error) {
        // Log error but don't crash - fall back to old path
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          caseSysId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to OLD path below
      }
    }

    // OLD PATH: Legacy implementation (or fallback from error)
    console.log(`[ServiceNow] OLD path: Using legacy implementation`, { caseSysId });

    const journalName = serviceNowConfig.caseJournalName;
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

    console.log(`[ServiceNow] OLD path: Successfully retrieved journal entries`, {
      caseSysId,
      count: data.result?.length ?? 0,
    });

    return data.result ?? [];
  }

  public async searchConfigurationItems(
    input: {
      name?: string;
      ipAddress?: string;
      sysId?: string;
      className?: string;
      company?: string;
      operationalStatus?: string;
      location?: string;
      ownerGroup?: string;
      environment?: string;
      limit?: number;
    },
    context?: ServiceNowContext,
  ): Promise<ServiceNowConfigurationItem[]> {
    const limit = input.limit ?? 10;

    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    console.log(`[ServiceNow] searchConfigurationItems using ${useNewPath ? "NEW" : "OLD"} path`, {
      name: input.name,
      ipAddress: input.ipAddress,
      sysId: input.sysId,
      className: input.className,
      company: input.company,
      operationalStatus: input.operationalStatus,
      location: input.location,
      ownerGroup: input.ownerGroup,
      environment: input.environment,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    if (useNewPath) {
      try {
        const cmdbRepo = this.getCmdbRepo();
        const criteria = {
          name: input.name,
          ipAddress: input.ipAddress,
          sysId: input.sysId,
          className: input.className,
          company: input.company,
          operationalStatus: input.operationalStatus,
          location: input.location,
          ownerGroup: input.ownerGroup,
          environment: input.environment,
          limit,
        };

        const items = await cmdbRepo.search(criteria);

        return items.map((item: ConfigurationItem) => this.mapDomainCi(item));
      } catch (error) {
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          name: input.name,
          error: error instanceof Error ? error.message : String(error),
        });
        // fall through to legacy implementation
      }
    }

    const table = serviceNowConfig.ciTable ?? "cmdb_ci";

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

    const expandedClassNames = expandClassNames(input.className);
    if (expandedClassNames?.length) {
      if (expandedClassNames.length === 1) {
        queryGroups.push(`sys_class_name=${expandedClassNames[0]}`);
      } else {
        queryGroups.push(
          expandedClassNames.map((cls) => `sys_class_name=${cls}`).join("^OR"),
        );
      }
    }

    if (input.company) {
      queryGroups.push(`company.nameLIKE${input.company}`);
    }

    if (input.operationalStatus) {
      queryGroups.push(`operational_status=${input.operationalStatus}`);
    }

    if (input.location) {
      queryGroups.push(`locationLIKE${input.location}`);
    }

    if (input.ownerGroup) {
      queryGroups.push(`ownerLIKE${input.ownerGroup}`);
    }

    if (input.environment) {
      queryGroups.push(`u_environment=${input.environment}`);
    }

    if (!queryGroups.length) {
      throw new Error(
        "At least one search criterion must be provided: name, ipAddress, sysId, className, company, location, ownerGroup, environment, or operationalStatus.",
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

      const mapped = {
        sys_id: sysId,
        name,
        sys_class_name: extractDisplayValue(item.sys_class_name) || undefined,
        fqdn: extractDisplayValue(item.fqdn) || extractDisplayValue(item.u_fqdn) || undefined,
        host_name: extractDisplayValue(item.host_name) || undefined,
        ip_addresses: normalizeIpAddresses(item.ip_address ?? item.u_ip_address),
        company: extractReferenceSysId(item.company) || undefined,
        company_name: extractDisplayValue(item.company) || undefined,
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
        url: `${serviceNowConfig.instanceUrl}/nav_to.do?uri=${table}.do?sys_id=${sysId}`,
      } satisfies ServiceNowConfigurationItem;
      return mapped;
    });
  }

  public async createConfigurationItem(
    input: CreateConfigurationItemInput,
    context?: ServiceNowContext,
  ): Promise<ServiceNowConfigurationItem> {
    if (!input.className?.trim()) {
      throw new Error("className is required to create a configuration item.");
    }
    if (!input.name?.trim()) {
      throw new Error("name is required to create a configuration item.");
    }

    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    console.log(`[ServiceNow] createConfigurationItem using ${useNewPath ? "NEW" : "OLD"} path`, {
      className: input.className,
      name: input.name,
      company: input.company,
      environment: input.environment,
    });

    if (useNewPath) {
      try {
        const cmdbRepo = this.getCmdbRepo();
        const created = await cmdbRepo.create(input);
        return this.mapDomainCi(created);
      } catch (error) {
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          className: input.className,
          name: input.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const table = input.className.trim();
    const payload: Record<string, any> = {
      name: input.name,
      short_description: input.shortDescription,
      ip_address: input.ipAddress,
      u_environment: input.environment,
      owner: input.ownerGroup,
      support_group: input.supportGroup,
      location: input.location,
      operational_status: input.status,
      install_status: input.installStatus,
      company: input.company,
    };

    if (input.attributes) {
      for (const [key, value] of Object.entries(input.attributes)) {
        if (value !== undefined && value !== null && value !== "") {
          payload[key] = value;
        }
      }
    }

    for (const key of Object.keys(payload)) {
      if (
        payload[key] === undefined ||
        payload[key] === null ||
        payload[key] === ""
      ) {
        delete payload[key];
      }
    }

    const data = await request<{
      result: Array<Record<string, any>> | Record<string, any>;
    }>(`/api/now/table/${table}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const record = Array.isArray(data.result) ? data.result[0] : data.result;
    if (!record?.sys_id) {
      throw new Error("ServiceNow did not return a sys_id for the created CI.");
    }

    const createdItems = await this.searchConfigurationItems(
      { sysId: record.sys_id, className: input.className, limit: 1 },
      context,
    );

    if (createdItems.length > 0) {
      return createdItems[0];
    }

    return {
      sys_id: record.sys_id,
      name: input.name,
      sys_class_name: input.className,
      ip_addresses: input.ipAddress ? [input.ipAddress] : [],
      environment: input.environment,
      location: input.location,
      owner_group: input.ownerGroup,
      support_group: input.supportGroup,
      status: input.status,
      description: input.shortDescription,
      company: input.company,
      company_name: input.company,
      url: `${serviceNowConfig.instanceUrl}/nav_to.do?uri=${table}.do?sys_id=${record.sys_id}`,
    };
  }

  public async getCIRelationships(
    input: {
      ciSysId: string;
      relationshipType?: string;
      limit?: number;
    },
    context?: ServiceNowContext,
  ): Promise<ServiceNowConfigurationItem[]> {
    const limit = input.limit ?? 50;
    const maxLimit = 100;
    const effectiveLimit = Math.min(limit, maxLimit);

    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    console.log(`[ServiceNow] getCIRelationships using ${useNewPath ? "NEW" : "OLD"} path`, {
      ciSysId: input.ciSysId,
      relationshipType: input.relationshipType,
      limit: effectiveLimit,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    if (useNewPath) {
      try {
        const cmdbRepo = this.getCmdbRepo();
        const relatedCIs = await cmdbRepo.getRelatedCIs(
          input.ciSysId,
          input.relationshipType,
        );

        // Limit results
        const limitedCIs = relatedCIs.slice(0, effectiveLimit);

        return limitedCIs.map((item) => this.mapDomainCi(item));
      } catch (error) {
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          ciSysId: input.ciSysId,
          error: error instanceof Error ? error.message : String(error),
        });
        // fall through to legacy implementation
      }
    }

    // Legacy implementation - direct API call
    const queryParts = [`parent=${input.ciSysId}^ORchild=${input.ciSysId}`];

    if (input.relationshipType) {
      queryParts.push(`type.name=${input.relationshipType}`);
    }

    const query = queryParts.join("^");

    const data = await request<{
      result: Array<Record<string, any>>;
    }>(
      `/api/now/table/cmdb_rel_ci?sysparm_query=${encodeURIComponent(
        query,
      )}&sysparm_display_value=all&sysparm_limit=${effectiveLimit}`,
    );

    const relationships = data.result ?? [];

    // Extract related CI sys_ids (get the "other" CI in each relationship)
    const relatedCISysIds = relationships
      .map((rel) => {
        const parentSysId = extractDisplayValue(rel.parent);
        const childSysId = extractDisplayValue(rel.child);
        return parentSysId === input.ciSysId ? childSysId : parentSysId;
      })
      .filter(Boolean);

    // Deduplicate sys_ids
    const uniqueSysIds = Array.from(new Set(relatedCISysIds));

    // Fetch full CI details for each related CI (with circular reference protection)
    const relatedCIs: ServiceNowConfigurationItem[] = [];
    const visitedSysIds = new Set<string>([input.ciSysId]); // Track visited to prevent circular references

    for (const sysId of uniqueSysIds.slice(0, effectiveLimit)) {
      if (visitedSysIds.has(sysId)) {
        console.log(`[ServiceNow] Skipping circular reference to CI: ${sysId}`);
        continue;
      }

      try {
        visitedSysIds.add(sysId);
        const ciResults = await this.searchConfigurationItems(
          { sysId, limit: 1 },
          context,
        );

        if (ciResults.length > 0) {
          relatedCIs.push(ciResults[0]);
        }
      } catch (error) {
        console.warn(`[ServiceNow] Failed to fetch related CI ${sysId}:`, error);
        // Continue with other relationships
      }
    }

    return relatedCIs;
  }

  public async createCIRelationship(
    input: CreateCIRelationshipInput,
    context?: ServiceNowContext,
  ): Promise<{ sys_id: string }> {
    if (!input.parentSysId || !input.childSysId) {
      throw new Error("parentSysId and childSysId are required to create a CI relationship.");
    }

    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    console.log(`[ServiceNow] createCIRelationship using ${useNewPath ? "NEW" : "OLD"} path`, {
      parent: input.parentSysId,
      child: input.childSysId,
      relationshipType: input.relationshipType,
    });

    if (useNewPath) {
      try {
        const cmdbRepo = this.getCmdbRepo();
        const result = await cmdbRepo.createRelationship({
          parentSysId: input.parentSysId,
          childSysId: input.childSysId,
          relationshipType: input.relationshipType,
        });
        return { sys_id: result.sysId };
      } catch (error) {
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          parent: input.parentSysId,
          child: input.childSysId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const payload: Record<string, any> = {
      parent: input.parentSysId,
      child: input.childSysId,
    };

    if (input.relationshipType) {
      payload.type = input.relationshipType;
    }

    const data = await request<{
      result: Array<Record<string, any>> | Record<string, any>;
    }>("/api/now/table/cmdb_rel_ci", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const record = Array.isArray(data.result) ? data.result[0] : data.result;
    if (!record?.sys_id) {
      throw new Error("Failed to create CI relationship in ServiceNow.");
    }

    return { sys_id: record.sys_id };
  }

  public async searchCustomerCases(
    input: {
      accountName?: string;
      companyName?: string;
      query?: string;
      limit?: number;
      activeOnly?: boolean;
      priority?: string;
      state?: string;
      assignmentGroup?: string;
      assignedTo?: string;
      openedAfter?: string;
      openedBefore?: string;
      sysDomain?: string;
      includeChildDomains?: boolean;
      sortBy?: 'opened_at' | 'priority' | 'updated_on' | 'state';
      sortOrder?: 'asc' | 'desc';
    },
    context?: ServiceNowContext,
  ): Promise<ServiceNowCaseSummary[]> {
    // Feature flag: Decide whether to use new repository pattern or legacy implementation
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    // Log which path is being used
    console.log(`[ServiceNow] searchCustomerCases using ${useNewPath ? "NEW" : "OLD"} path`, {
      accountName: input.accountName,
      companyName: input.companyName,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    if (useNewPath) {
      // NEW PATH: Use repository pattern
      try {
        const caseRepo = this.getCaseRepo();

        // Map input to CaseSearchCriteria
        const criteria: any = {
          accountName: input.accountName,
          companyName: input.companyName,
          query: input.query,
          limit: input.limit ?? 25,
          activeOnly: input.activeOnly,
          priority: input.priority,
          state: input.state,
          assignmentGroup: input.assignmentGroup,
          assignedTo: input.assignedTo,
          sysDomain: input.sysDomain,
          includeChildDomains: input.includeChildDomains,
          sortBy: input.sortBy,
          sortOrder: input.sortOrder,
        };

        // Convert date strings to Date objects
        if (input.openedAfter) {
          criteria.openedAfter = new Date(input.openedAfter);
        }
        if (input.openedBefore) {
          criteria.openedBefore = new Date(input.openedBefore);
        }

        const { cases } = await caseRepo.search(criteria);

        // Convert Case[] to ServiceNowCaseSummary[]
        const summaries: ServiceNowCaseSummary[] = cases.map((case_) => ({
          sys_id: case_.sysId,
          number: case_.number,
          short_description: case_.shortDescription,
          priority: case_.priority,
          state: case_.state,
          account: case_.account,
          company: case_.company,
          opened_at: case_.openedAt?.toISOString(),
          updated_on: undefined, // Not in Case model currently
          url: case_.url,
        }));

        console.log(`[ServiceNow] NEW path: Successfully searched cases`, {
          found: summaries.length,
          accountName: input.accountName,
        });

        return summaries;
      } catch (error) {
        // Log error but don't crash - fall back to old path
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          accountName: input.accountName,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to OLD path below
      }
    }

    // OLD PATH: Legacy implementation (or fallback from error)
    console.log(`[ServiceNow] OLD path: Using legacy implementation`, {
      accountName: input.accountName,
    });

    const table = serviceNowConfig.caseTable ?? "sn_customerservice_case";
    const limit = input.limit ?? 25; // Increased default from 5 to 25

    const queryParts: string[] = [];

    // Sort configuration
    const sortField = input.sortBy || 'opened_at';
    const sortDirection = input.sortOrder === 'asc' ? '' : 'DESC';
    queryParts.push(`ORDERBY${sortDirection}${sortField}`);

    // Filter conditions
    if (input.accountName) {
      queryParts.push(`account.nameLIKE${input.accountName}`);
    }

    if (input.companyName) {
      queryParts.push(`company.nameLIKE${input.companyName}`);
    }

    if (input.query) {
      queryParts.push(`short_descriptionLIKE${input.query}^ORdescriptionLIKE${input.query}`);
    }

    if (input.priority) {
      queryParts.push(`priority=${input.priority}`);
    }

    if (input.state) {
      queryParts.push(`state=${input.state}`);
    }

    if (input.assignmentGroup) {
      queryParts.push(`assignment_group.nameLIKE${input.assignmentGroup}`);
    }

    if (input.assignedTo) {
      queryParts.push(`assigned_to.nameLIKE${input.assignedTo}`);
    }

    if (input.openedAfter) {
      queryParts.push(`opened_at>${input.openedAfter}`);
    }

    if (input.openedBefore) {
      queryParts.push(`opened_at<${input.openedBefore}`);
    }

    // Active/closed filter
    if (input.activeOnly !== undefined) {
      queryParts.push(`active=${input.activeOnly ? 'true' : 'false'}`);
    }

    // If no filters specified (only sort parameter), default to active cases only
    if (queryParts.length === 1 && queryParts[0].startsWith('ORDERBY')) { // Only sort parameter
      queryParts.push('active=true');
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
        url: `${serviceNowConfig.instanceUrl}/nav_to.do?uri=${table}.do?sys_id=${sysId}`,
      } satisfies ServiceNowCaseSummary;
    });
  }

  /**
   * Add work note to a case
   */
  public async addCaseWorkNote(
    sysId: string,
    workNote: string,
    workNotes: boolean = true,
    context?: ServiceNowContext,
  ): Promise<void> {
    // Feature flag: Decide whether to use new repository pattern or legacy implementation
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    // Log which path is being used (critical for monitoring rollout)
    console.log(`[ServiceNow] addCaseWorkNote using ${useNewPath ? "NEW" : "OLD"} path`, {
      sysId,
      isInternal: workNotes,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    if (useNewPath) {
      // NEW PATH: Use repository pattern
      try {
        const caseRepo = this.getCaseRepo();
        await caseRepo.addWorkNote(sysId, workNote, workNotes);

        console.log(`[ServiceNow] NEW path: Successfully added work note`, {
          sysId,
          isInternal: workNotes,
        });
        return;
      } catch (error) {
        // Check if it's a 404-related error
        const is404Error = error instanceof Error &&
          (error.message.includes('404') ||
           error.message.includes('not found') ||
           error.message.includes('Not Found'));

        if (is404Error) {
          // Don't fall back to OLD path if it's a 404 - the OLD path will also fail
          console.error(`[ServiceNow] NEW path: Record not found (404) - skipping OLD path fallback`, {
            sysId,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }

        // For other errors, fall back to OLD path
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          sysId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to OLD path below
      }
    }

    // OLD PATH: Legacy implementation (or fallback from error)
    console.log(`[ServiceNow] OLD path: Using legacy implementation`, { sysId });

    const table = serviceNowConfig.caseTable ?? "sn_customerservice_case";
    const endpoint = `/api/now/table/${table}/${sysId}`;

    const payload = workNotes ?
      { work_notes: workNote } :
      { comments: workNote };

    try {
      await request(endpoint, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      console.log(`[ServiceNow] OLD path: Successfully added work note`, { sysId });
    } catch (error) {
      // Check if it's a 404-related error
      const is404Error = error instanceof Error &&
        (error.message.includes('404') ||
         error.message.includes('not found') ||
         error.message.includes('Not Found') ||
         error.message.includes('No Record found'));

      if (is404Error) {
        console.error(`[ServiceNow] OLD path: Record not found (404) - record may not exist or ACL restricts access`, {
          sysId,
          table,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Re-throw the error to let the caller handle it
      throw error;
    }
  }

  /**
   * Update case fields
   */
  public async updateCase(
    sysId: string,
    updates: Record<string, any>,
    context?: ServiceNowContext,
  ): Promise<void> {
    // Feature flag: Decide whether to use new repository pattern or legacy implementation
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    // Check if updates contain only repository-supported fields
    const supportedFields = ['shortDescription', 'description', 'priority', 'state', 'category', 'subcategory', 'assignmentGroup', 'assignedTo',
                              'short_description', 'assignment_group', 'assigned_to']; // Include both camelCase and snake_case
    const updateKeys = Object.keys(updates);
    const hasUnsupportedFields = updateKeys.some(key => !supportedFields.includes(key));

    // Log which path is being used
    console.log(`[ServiceNow] updateCase using ${useNewPath && !hasUnsupportedFields ? "NEW" : "OLD"} path`, {
      sysId,
      fields: updateKeys,
      hasUnsupportedFields,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    if (useNewPath && !hasUnsupportedFields) {
      // NEW PATH: Use repository pattern (only if all fields are supported)
      try {
        const caseRepo = this.getCaseRepo();

        // Map snake_case to camelCase for repository
        const typedUpdates: any = {};
        if (updates.short_description) typedUpdates.shortDescription = updates.short_description;
        if (updates.description) typedUpdates.description = updates.description;
        if (updates.priority) typedUpdates.priority = updates.priority;
        if (updates.state) typedUpdates.state = updates.state;
        if (updates.category) typedUpdates.category = updates.category;
        if (updates.subcategory) typedUpdates.subcategory = updates.subcategory;
        if (updates.assignment_group) typedUpdates.assignmentGroup = updates.assignment_group;
        if (updates.assigned_to) typedUpdates.assignedTo = updates.assigned_to;

        await caseRepo.update(sysId, typedUpdates);

        console.log(`[ServiceNow] NEW path: Successfully updated case`, { sysId, fields: updateKeys });
        return;
      } catch (error) {
        // Log error but don't crash - fall back to old path
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          sysId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to OLD path below
      }
    }

    // OLD PATH: Legacy implementation (or fallback from error, or unsupported fields)
    if (hasUnsupportedFields) {
      console.log(`[ServiceNow] OLD path: Using legacy (unsupported fields: ${updateKeys.filter(k => !supportedFields.includes(k)).join(', ')})`, { sysId });
    } else {
      console.log(`[ServiceNow] OLD path: Using legacy implementation`, { sysId });
    }

    const table = serviceNowConfig.caseTable ?? "sn_customerservice_case";
    const endpoint = `/api/now/table/${table}/${sysId}`;

    await request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });

    console.log(`[ServiceNow] OLD path: Successfully updated case`, { sysId });
  }

  /**
   * Add comment to case (visible to customer)
   */
  public async addCaseComment(
    sysId: string,
    comment: string,
    context?: ServiceNowContext,
  ): Promise<void> {
    await this.addCaseWorkNote(sysId, comment, false, context);
  }

  public async addIncidentWorkNote(
    incidentSysId: string,
    workNote: string,
    context?: ServiceNowContext,
  ): Promise<void> {
    // Feature flag: Decide whether to use new repository pattern or legacy implementation
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    // Log which path is being used
    console.log(`[ServiceNow] addIncidentWorkNote using ${useNewPath ? "NEW" : "OLD"} path`, {
      incidentSysId,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    if (useNewPath) {
      // NEW PATH: Use repository pattern
      try {
        const incidentRepo = this.getIncidentRepo();
        await incidentRepo.addWorkNote(incidentSysId, workNote);

        console.log(`[ServiceNow] NEW path: Successfully added incident work note`, { incidentSysId });
        return;
      } catch (error) {
        // Log error but don't crash - fall back to old path
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          incidentSysId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to OLD path below
      }
    }

    // OLD PATH: Legacy implementation (or fallback from error)
    console.log(`[ServiceNow] OLD path: Using legacy implementation`, { incidentSysId });

    const endpoint = `/api/now/table/incident/${incidentSysId}`;

    await request(endpoint, {
      method: "PATCH",
      body: JSON.stringify({ work_notes: workNote }),
    });

    console.log(`[ServiceNow] OLD path: Successfully added incident work note`, { incidentSysId });
  }

  public async getVoiceWorkNotesSince(
    options: {
      since: Date;
      limit?: number;
    },
  ): Promise<ServiceNowWorkNote[]> {
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
    context?: ServiceNowContext,
  ): Promise<void> {
    // Feature flag: Decide whether to use new repository pattern or legacy implementation
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    // Check if additionalUpdates has non-standard fields
    const hasAdditionalUpdates = options.additionalUpdates && Object.keys(options.additionalUpdates).length > 0;

    // Log which path is being used
    console.log(`[ServiceNow] closeIncident using ${useNewPath && !hasAdditionalUpdates ? "NEW" : "OLD"} path`, {
      incidentSysId,
      hasAdditionalUpdates,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    if (useNewPath && !hasAdditionalUpdates) {
      // NEW PATH: Use repository pattern (only if no additional updates)
      try {
        const incidentRepo = this.getIncidentRepo();
        await incidentRepo.close(
          incidentSysId,
          options.closeCode ?? "Solved Remotely (Permanently)",
          options.closeNotes ?? "Automatically closed after remaining in Resolved state during scheduled incident audit.",
        );

        console.log(`[ServiceNow] NEW path: Successfully closed incident`, { incidentSysId });
        return;
      } catch (error) {
        // Log error but don't crash - fall back to old path
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          incidentSysId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to OLD path below
      }
    }

    // OLD PATH: Legacy implementation (or fallback from error, or has additional updates)
    if (hasAdditionalUpdates) {
      console.log(`[ServiceNow] OLD path: Using legacy (has additional updates)`, { incidentSysId });
    } else {
      console.log(`[ServiceNow] OLD path: Using legacy implementation`, { incidentSysId });
    }

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

    console.log(`[ServiceNow] OLD path: Successfully closed incident`, { incidentSysId });
  }

  /**
   * Update Incident fields
   * Used by incident enrichment workflow to add metadata and CI links
   */
  public async updateIncident(
    incidentSysId: string,
    updates: Record<string, unknown>,
  ): Promise<void> {
    const endpoint = `/api/now/table/incident/${incidentSysId}`;

    await request(endpoint, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });

    console.log(`[ServiceNow] Successfully updated incident ${incidentSysId}`, {
      fields: Object.keys(updates),
    });
  }

  /**
   * Get Incident Work Notes (Journal Entries)
   * Retrieves work_notes journal entries for incident enrichment analysis
   */
  public async getIncidentWorkNotes(
    incidentSysId: string,
    options: { limit?: number } = {},
  ): Promise<ServiceNowCaseJournalEntry[]> {
    const limit = options.limit || 100;
    const endpoint = `/api/now/table/sys_journal_field?element_id=${incidentSysId}&element=work_notes&ORDERBYDESCsys_created_on&sysparm_limit=${limit}`;

    const data = await request<{
      result: Array<{
        sys_id: { display_value: string; value: string } | string;
        element_id: { display_value: string; value: string } | string;
        value: { display_value: string; value: string } | string;
        sys_created_on: { display_value: string; value: string } | string;
        sys_created_by: { display_value: string; value: string } | string;
      }>;
    }>(endpoint);

    const extractDisplayValue = (
      field:
        | string
        | { display_value: string; value: string }
        | null
        | undefined,
    ): string => {
      if (!field) return "";
      if (typeof field === "string") return field;
      return field.display_value || field.value || "";
    };

    return (data.result ?? []).map((row) => ({
      sys_id: extractDisplayValue(row.sys_id),
      element: "work_notes",
      element_id: extractDisplayValue(row.element_id),
      value: extractDisplayValue(row.value) || "",
      sys_created_on: extractDisplayValue(row.sys_created_on) || "",
      sys_created_by: extractDisplayValue(row.sys_created_by) || "",
    }));
  }

  /**
   * Link CI (Configuration Item) to Incident
   * Updates the cmdb_ci field with the matched CI sys_id
   */
  public async linkCiToIncident(
    incidentSysId: string,
    ciSysId: string,
  ): Promise<void> {
    const endpoint = `/api/now/table/incident/${incidentSysId}`;

    await request(endpoint, {
      method: "PATCH",
      body: JSON.stringify({
        cmdb_ci: ciSysId,
      }),
    });

    console.log(`[ServiceNow] Linked CI ${ciSysId} to incident ${incidentSysId}`);
  }

  private async getIncidentSourceContext(
    caseSysId: string,
    context?: ServiceNowContext,
  ): Promise<{
    caseRecord: ServiceNowCaseResult | null;
    journalEntries: ServiceNowCaseJournalEntry[];
  }> {
    try {
      const [caseRecord, journalEntries] = await Promise.all([
        this.getCaseBySysId(caseSysId, context),
        this.getCaseJournal(caseSysId, { limit: 5 }, context),
      ]);

      return {
        caseRecord,
        journalEntries: journalEntries ?? [],
      };
    } catch (error) {
      console.error("[ServiceNow] Failed to gather incident source context:", error);
      return {
        caseRecord: null,
        journalEntries: [],
      };
    }
  }

  /**
   * Create Incident from Case
   * Implements ITSM best practice: service disruptions become Incident records
   *
   * Original: Issue #9 - AI-Driven Incident Creation from Cases
   */
  public async createIncidentFromCase(
    input: {
      caseSysId: string;
      caseNumber: string;
      category?: string;
      subcategory?: string;
      shortDescription: string;
      description?: string;
      urgency?: string;
      priority?: string;
      impact?: string;
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
    },
    context?: ServiceNowContext,
  ): Promise<{
    incident_number: string;
    incident_sys_id: string;
    incident_url: string;
  }> {
    // Feature flag: Decide whether to use new repository pattern or legacy implementation
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    // Log which path is being used
    console.log(`[ServiceNow] createIncidentFromCase using ${useNewPath ? "NEW" : "OLD"} path`, {
      caseNumber: input.caseNumber,
      isMajorIncident: input.isMajorIncident,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    const { caseRecord, journalEntries } = await this.getIncidentSourceContext(
      input.caseSysId,
      context,
    );

    const assignmentGroupId =
      input.assignmentGroup ?? caseRecord?.assignment_group_sys_id ?? undefined;
    const assignmentGroupName = caseRecord?.assignment_group;
    const assignedToId = input.assignedTo ?? caseRecord?.assigned_to_sys_id ?? undefined;
    const assignedToName = caseRecord?.assigned_to;
    const callerId =
      input.callerId ??
      caseRecord?.caller_id_sys_id ??
      caseRecord?.caller_id ??
      undefined;
    const urgency = input.urgency ?? caseRecord?.urgency;
    const impact = input.impact ?? caseRecord?.impact;
    const priority = input.priority ?? caseRecord?.priority;
    const businessService = input.businessService ?? caseRecord?.business_service;
    const location = input.location ?? caseRecord?.location;
    const cmdbCi = input.cmdbCi ?? caseRecord?.cmdb_ci;
    const company = input.company ?? caseRecord?.company;
    const account = input.account ?? caseRecord?.account;
    const contact = input.contact ?? caseRecord?.contact;
    const contactType = input.contactType ?? caseRecord?.contact_type;
    const openedBy =
      input.openedBy ??
      caseRecord?.opened_by_sys_id ??
      caseRecord?.opened_by ??
      undefined;

    const shortDescription =
      sanitizeText(caseRecord?.short_description) ??
      sanitizeText(input.shortDescription) ??
      input.shortDescription;
    const detailedDescription =
      sanitizeText(caseRecord?.description ?? input.description) ?? shortDescription;

    const journalSummary = formatJournalEntries(journalEntries);

    const workNoteSections: string[] = [
      `Incident automatically created from Case ${input.caseNumber}.`,
    ];

    if (shortDescription) {
      workNoteSections.push(`Case Summary: ${shortDescription}`);
    }

    if (detailedDescription && detailedDescription !== shortDescription) {
      workNoteSections.push(`Case Description: ${detailedDescription}`);
    }

    const assignmentDetails: string[] = [];
    if (assignmentGroupName) assignmentDetails.push(`Group: ${assignmentGroupName}`);
    if (assignedToName) assignmentDetails.push(`Assigned To: ${assignedToName}`);
    if (assignmentDetails.length) {
      workNoteSections.push(`Assignment: ${assignmentDetails.join(" | ")}`);
    }

    const priorityDetails: string[] = [];
    if (priority) priorityDetails.push(`Priority ${priority}`);
    if (urgency) priorityDetails.push(`Urgency ${urgency}`);
    if (impact) priorityDetails.push(`Impact ${impact}`);
    if (priorityDetails.length) {
      workNoteSections.push(priorityDetails.join(" • "));
    }

    if (caseRecord?.company_name) {
      workNoteSections.push(`Customer: ${caseRecord.company_name}`);
    }

    if (journalSummary) {
      workNoteSections.push(`Recent Case Activity:\n${journalSummary}`);
    }

    const workNotes = workNoteSections.join("\n\n");
    const customerFacingNotes = `We converted case ${input.caseNumber} into an incident for deeper investigation. We'll continue to post updates here.`;

    if (useNewPath) {
      // NEW PATH: Use repository pattern
      try {
        const caseRepo = this.getCaseRepo();

        // Map input to CreateIncidentInput
        const incidentInput: any = {
          shortDescription,
          description: detailedDescription,
          caller: callerId,
          category: input.category ?? caseRecord?.category,
          subcategory: input.subcategory ?? caseRecord?.subcategory,
          urgency,
          priority,
          impact,
          assignmentGroup: assignmentGroupId,
          assignedTo: assignedToId,
          company,
          account,
          businessService,
          location,
          contact,
          contactType,
          openedBy,
          cmdbCi,
          sysDomain: input.sysDomain ?? caseRecord?.sys_domain,
          sysDomainPath: input.sysDomainPath ?? caseRecord?.sys_domain_path,
          isMajorIncident: input.isMajorIncident,
          workNotes,
          customerNotes: customerFacingNotes,
        };

        const incident = await caseRepo.createIncidentFromCase(input.caseSysId, incidentInput);

        console.log(`[ServiceNow] NEW path: Successfully created incident`, {
          caseNumber: input.caseNumber,
          incidentNumber: incident.number,
          incidentSysId: incident.sysId,
        });

        return {
          incident_number: incident.number,
          incident_sys_id: incident.sysId,
          incident_url: incident.url,
        };
      } catch (error) {
        // Log error but don't crash - fall back to old path
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          caseNumber: input.caseNumber,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to OLD path below
      }
    }

    // OLD PATH: Legacy implementation (or fallback from error)
    console.log(`[ServiceNow] OLD path: Using legacy implementation`, {
      caseNumber: input.caseNumber,
    });

    const table = "incident";

    // Build incident payload
    const payload: Record<string, any> = {
      short_description: shortDescription,
      description: detailedDescription,
      urgency: urgency || "3", // Default to medium urgency
      impact: impact,
      priority: priority || "3", // Default to medium priority
      caller_id: callerId,
      assignment_group: assignmentGroupId,
      assigned_to: assignedToId,
      // Link to parent Case
      parent: input.caseSysId,
      // Add work notes documenting source and recent activity
      work_notes: workNotes,
      comments: customerFacingNotes,
    };

    // Only set category/subcategory if provided (avoid sending undefined which can clear fields)
    if (input.category || caseRecord?.category) {
      payload.category = input.category ?? caseRecord?.category;
    }
    if (input.subcategory || caseRecord?.subcategory) {
      payload.subcategory = input.subcategory ?? caseRecord?.subcategory;
    }

    // Add company/account context (prevents orphaned incidents)
    if (company) {
      payload.company = company;
    }
    if (account) {
      payload.account = account;
    }
    if (businessService) {
      payload.business_service = businessService;
    }
    if (location) {
      payload.location = location;
    }

    // Add contact information
    if (contact) {
      payload.contact = contact;
    }
    if (contactType) {
      payload.contact_type = contactType;
    }
    if (openedBy) {
      payload.opened_by = openedBy;
    }

    // Add technical context
    if (cmdbCi) {
      payload.cmdb_ci = cmdbCi;
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
      incident_url: `${serviceNowConfig.instanceUrl}/nav_to.do?uri=incident.do?sys_id=${incident.sys_id}`
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
  public async createProblemFromCase(
    input: {
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
    },
    context?: ServiceNowContext,
  ): Promise<{
    problem_number: string;
    problem_sys_id: string;
    problem_url: string;
  }> {
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    console.log(`[ServiceNow] createProblemFromCase using ${useNewPath ? "NEW" : "OLD"} path`, {
      caseNumber: input.caseNumber,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    if (useNewPath) {
      try {
        const problemRepo = this.getProblemRepo();
        const problem = await problemRepo.createFromCase(input.caseSysId, {
          shortDescription: input.shortDescription,
          description: input.description,
          category: input.category,
          subcategory: input.subcategory,
          urgency: input.urgency,
          priority: input.priority,
          caller: input.callerId,
          assignmentGroup: input.assignmentGroup,
          assignedTo: input.assignedTo,
          firstReportedBy: input.firstReportedBy,
          company: input.company,
          account: input.account,
          businessService: input.businessService,
          location: input.location,
          contact: input.contact,
          contactType: input.contactType,
          openedBy: input.openedBy,
          cmdbCi: input.cmdbCi,
          sysDomain: input.sysDomain,
          sysDomainPath: input.sysDomainPath,
           caseNumber: input.caseNumber,
        });

        return {
          problem_number: problem.number,
          problem_sys_id: problem.sysId,
          problem_url: problem.url,
        };
      } catch (error) {
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          caseNumber: input.caseNumber,
          error: error instanceof Error ? error.message : String(error),
        });
        // fall back to legacy implementation
      }
    }

    const table = "problem";

    const payload: Record<string, any> = {
      short_description: input.shortDescription,
      description: input.description || input.shortDescription,
      urgency: input.urgency || "3",
      priority: input.priority || "3",
      caller_id: input.callerId,
      assignment_group: input.assignmentGroup,
      parent: input.caseSysId,
      work_notes: `Automatically created from Case ${input.caseNumber} via AI triage system. ITSM record type classification determined this requires root cause analysis via problem management.`,
    };

    if (input.category) {
      payload.category = input.category;
    }
    if (input.subcategory) {
      payload.subcategory = input.subcategory;
    }
    if (input.assignedTo) {
      payload.assigned_to = input.assignedTo;
    }
    if (input.firstReportedBy) {
      payload.first_reported_by_task = input.firstReportedBy;
    }
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
    if (input.contact) {
      payload.contact = input.contact;
    }
    if (input.contactType) {
      payload.contact_type = input.contactType;
    }
    if (input.openedBy) {
      payload.opened_by = input.openedBy;
    }
    if (input.cmdbCi) {
      payload.cmdb_ci = input.cmdbCi;
    }
    if (input.sysDomain) {
      payload.sys_domain = input.sysDomain;
    }
    if (input.sysDomainPath) {
      payload.sys_domain_path = input.sysDomainPath;
    }

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
      problem_url: `${serviceNowConfig.instanceUrl}/nav_to.do?uri=problem.do?sys_id=${problem.sys_id}`
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
  public async getChoiceList(
    input: {
      table: string;
      element: string;
      includeInactive?: boolean;
    },
    context?: ServiceNowContext,
  ): Promise<Array<{
    label: string;
    value: string;
    sequence: number;
    inactive: boolean;
    dependent_value?: string;
  }>> {
    const { table, element, includeInactive = false } = input;

    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    console.log(`[ServiceNow] getChoiceList using ${useNewPath ? "NEW" : "OLD"} path`, {
      table,
      element,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    if (useNewPath) {
      try {
        const choiceRepo = this.getChoiceRepo();
        const choices = await choiceRepo.list({
          table,
          element,
          includeInactive,
        });

        return choices.map((choice: Choice) => ({
          label: choice.label,
          value: choice.value,
          sequence: choice.sequence ?? 0,
          inactive: choice.inactive ?? false,
          dependent_value: choice.dependentValue,
        }));
      } catch (error) {
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          table,
          element,
          error: error instanceof Error ? error.message : String(error),
        });
        // fall back to legacy path
      }
    }

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
  public async getCatalogItems(
    input: {
      category?: string;
      keywords?: string[];
      active?: boolean;
      limit?: number;
    },
    context?: ServiceNowContext,
  ): Promise<ServiceNowCatalogItem[]> {
    // Feature flag
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    console.log(`[ServiceNow] getCatalogItems using ${useNewPath ? "NEW" : "OLD"} path`, {
      category: input.category,
      keywordCount: input.keywords?.length,
      featureEnabled: useNewPath,
    });

    if (useNewPath) {
      try {
        const catalogRepo = this.getCatalogRepo();
        const items = await catalogRepo.search({
          category: input.category,
          keywords: input.keywords,
          active: input.active,
          limit: input.limit,
        });

        const legacyItems: ServiceNowCatalogItem[] = items.map((item) => ({
          sys_id: item.sysId,
          name: item.name,
          short_description: item.shortDescription,
          description: item.description,
          category: item.category,
          active: item.active,
          url: item.url,
        }));

        console.log(`[ServiceNow] NEW path: Successfully searched catalog items`, {
          found: legacyItems.length,
        });

        return legacyItems;
      } catch (error) {
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // OLD PATH
    console.log(`[ServiceNow] OLD path: Using legacy implementation`);

    const limit = input.limit ?? 10;
    const queryParts: string[] = [];

    if (input.active !== false) {
      queryParts.push('active=true');
    }

    if (input.category) {
      queryParts.push(`category.nameLIKE${input.category}`);
    }

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
  public async getCatalogItemByName(
    name: string,
    context?: ServiceNowContext,
  ): Promise<ServiceNowCatalogItem | null> {
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    console.log(`[ServiceNow] getCatalogItemByName using ${useNewPath ? "NEW" : "OLD"} path`, { name });

    if (useNewPath) {
      try {
        const catalogRepo = this.getCatalogRepo();
        const item = await catalogRepo.findByName(name);

        if (!item) {
          console.log(`[ServiceNow] NEW path: Catalog item not found`, { name });
          return null;
        }

        const result: ServiceNowCatalogItem = {
          sys_id: item.sysId,
          name: item.name,
          short_description: item.shortDescription,
          description: item.description,
          category: item.category,
          active: item.active,
          url: item.url,
        };

        console.log(`[ServiceNow] NEW path: Found catalog item`, { name, sysId: item.sysId });
        return result;
      } catch (error) {
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // OLD PATH
    console.log(`[ServiceNow] OLD path: Using legacy implementation`, { name });

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
    return `${serviceNowConfig.instanceUrl}/sp?id=sc_cat_item&sys_id=${sysId}`;
  }

  /**
   * Get Business Service by name (READ-ONLY)
   * Used by LLM for service classification - does not create records
   */
  public async getBusinessService(
    name: string,
  ): Promise<ServiceNowBusinessService | null> {
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
      url: `${serviceNowConfig.instanceUrl}/nav_to.do?uri=cmdb_ci_service_business.do?sys_id=${sysId}`,
    };
  }

  /**
   * Get Service Offering by name (READ-ONLY)
   * Used by LLM for service classification - does not create records
   */
  public async getServiceOffering(
    name: string,
    context?: ServiceNowContext,
  ): Promise<ServiceNowServiceOffering | null> {
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    console.log(`[ServiceNow] getServiceOffering using ${useNewPath ? "NEW" : "OLD"} path`, { name });

    if (useNewPath) {
      try {
        const catalogRepo = this.getCatalogRepo();
        const offering = await catalogRepo.findServiceOfferingByName(name);

        if (!offering) {
          console.log(`[ServiceNow] NEW path: Service offering not found`, { name });
          return null;
        }

        // Convert to legacy format (repository returns simpler format)
        const result: ServiceNowServiceOffering = {
          sys_id: offering.sysId,
          name: offering.name,
          description: undefined, // Not in repository response
          parent: undefined, // Not in repository response
          parent_name: undefined, // Not in repository response
          url: offering.url,
        };

        console.log(`[ServiceNow] NEW path: Found service offering`, { name, sysId: offering.sysId });
        return result;
      } catch (error) {
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // OLD PATH
    console.log(`[ServiceNow] OLD path: Using legacy implementation`, { name });

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
      if (isPlainObject(offering.parent)) {
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
      } else if (isPlainObject(offering.description) && offering.description.display_value) {
        description = offering.description.display_value || undefined;
      } else if (isPlainObject(offering.description) && offering.description.value) {
        description = offering.description.value || undefined;
      }
    }

    return {
      sys_id: sysId,
      name: extractDisplayValue(offering.name),
      description,
      parent: parentSysId,
      parent_name: parentName,
      url: `${serviceNowConfig.instanceUrl}/nav_to.do?uri=service_offering.do?sys_id=${sysId}`,
    };
  }

  /**
   * Get Application Service by name (READ-ONLY)
   * Used by LLM for service classification - does not create records
   */
  public async getApplicationService(
    name: string,
  ): Promise<ServiceNowApplicationService | null> {
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
      if (isPlainObject(service.parent)) {
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
      } else if (isPlainObject(service.description) && service.description.display_value) {
        description = service.description.display_value || undefined;
      } else if (isPlainObject(service.description) && service.description.value) {
        description = service.description.value || undefined;
      }
    }

    return {
      sys_id: sysId,
      name: extractDisplayValue(service.name),
      description,
      parent: parentSysId,
      parent_name: parentName,
      url: `${serviceNowConfig.instanceUrl}/nav_to.do?uri=cmdb_ci_service_discovered.do?sys_id=${sysId}`,
    };
  }

  /**
   * Get Application Services for a company (READ-ONLY)
   * Returns list of application services linked to a company
   * Optionally filter by parent service offering (e.g., "Application Administration")
   */
  public async getApplicationServicesForCompany(
    input: {
      companySysId: string;
      parentServiceOffering?: string;
      limit?: number;
    },
    context?: ServiceNowContext,
  ): Promise<Array<{ name: string; sys_id: string; parent_name?: string }>> {
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    console.log(`[ServiceNow] getApplicationServicesForCompany using ${useNewPath ? "NEW" : "OLD"} path`, {
      companySysId: input.companySysId,
      parentServiceOffering: input.parentServiceOffering,
    });

    if (useNewPath) {
      try {
        const catalogRepo = this.getCatalogRepo();
        const services = await catalogRepo.findApplicationServicesByCompany(input.companySysId, {
          parentServiceOffering: input.parentServiceOffering,
          limit: input.limit,
        });

        const result = services.map((service) => ({
          name: service.name,
          sys_id: service.sysId,
          parent_name: service.parentName,
        }));

        console.log(`[ServiceNow] NEW path: Found application services`, {
          companySysId: input.companySysId,
          count: result.length,
        });

        return result;
      } catch (error) {
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          companySysId: input.companySysId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // OLD PATH
    console.log(`[ServiceNow] OLD path: Using legacy implementation`, {
      companySysId: input.companySysId,
    });

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
          if (isPlainObject(service.parent) && service.parent.display_value) {
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
  public async getCustomerAccount(
    number: string,
    context?: ServiceNowContext,
  ): Promise<ServiceNowCustomerAccount | null> {
    const useNewPath = featureFlags.useServiceNowRepositories({
      userId: context?.userId,
      channelId: context?.channelId,
      userIdHash: context?.userId ? hashUserId(context.userId) : undefined,
    });

    console.log(`[ServiceNow] getCustomerAccount using ${useNewPath ? "NEW" : "OLD"} path`, {
      number,
      featureEnabled: useNewPath,
      userId: context?.userId,
      channelId: context?.channelId,
    });

    if (useNewPath) {
      try {
        const accountRepo = this.getCustomerAccountRepo();
        const account = await accountRepo.findByNumber(number);
        if (!account) {
          return null;
        }

        return {
          sys_id: account.sysId,
          number: account.number,
          name: account.name,
          url: account.url,
        };
      } catch (error) {
        console.error(`[ServiceNow] NEW path ERROR - falling back to OLD path`, {
          number,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall back to legacy implementation
      }
    }

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
      url: `${serviceNowConfig.instanceUrl}/nav_to.do?uri=customer_account.do?sys_id=${sysId}`,
    };
  }

  /**
   * Fetch all categories and subcategories for a ServiceNow table
   */
  public async getCategoriesForTable(
    table: string = 'sn_customerservice_case',
    context?: ServiceNowContext,
  ): Promise<{
    categories: string[];
    subcategories: string[];
    categoryDetails: Array<any>;
    subcategoryDetails: Array<any>;
  }> {
    try {
      const categories = await this.getChoiceList({ table, element: 'category' }, context);
      const subcategories = await this.getChoiceList({ table, element: 'subcategory' }, context);

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
  public async createChildTask(
    input: {
      caseSysId: string;
      caseNumber: string;
      description: string;
      assignmentGroup?: string;
      shortDescription?: string;
      priority?: string;
    },
  ): Promise<{
    sys_id: string;
    number: string;
    url: string;
  }> {
    const table = serviceNowConfig.taskTable ?? "sn_customerservice_task";
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
      url: `${serviceNowConfig.instanceUrl}/nav_to.do?uri=${table}.do?sys_id=${task.sys_id}`,
    };
  }

  /**
   * Create a phone call interaction record in ServiceNow
   */
  public async createPhoneInteraction(
    input: {
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
    },
  ): Promise<{
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
      context_table: serviceNowConfig.caseTable, // e.g., 'x_mobit_serv_case_service_case'
      context_document: input.caseSysId, // Case sys_id

      // Channel metadata provides alternative linking method
      channel_metadata_table: serviceNowConfig.caseTable,
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
      interaction_url: `${serviceNowConfig.instanceUrl}/nav_to.do?uri=interaction.do?sys_id=${data.result.sys_id}`,
    };
  }

  /**
   * Get attachments for a ServiceNow record (case, incident, etc.)
   * Used for multimodal tool results to include screenshots and diagrams
   */
  public async getAttachments(
    tableName: string,
    recordSysId: string,
    limit: number = 5
  ): Promise<Array<{
    sys_id: string;
    file_name: string;
    content_type: string;
    size_bytes: number;
    download_url: string;
  }>> {
    interface AttachmentResponse {
      result: Array<{
        sys_id: string;
        file_name: string;
        content_type: string;
        size_bytes: string;
        download_link?: string;
      }>;
    }

    const params = new URLSearchParams({
      sysparm_query: `table_name=${tableName}^table_sys_id=${recordSysId}`,
      sysparm_limit: limit.toString(),
      sysparm_fields: "sys_id,file_name,content_type,size_bytes,download_link",
    });

    const response = await request<AttachmentResponse>(`/api/now/attachment?${params.toString()}`);

    return (response.result || []).map((attachment) => ({
      sys_id: attachment.sys_id,
      file_name: attachment.file_name,
      content_type: attachment.content_type,
      size_bytes: parseInt(attachment.size_bytes, 10),
      download_url: attachment.download_link || `${serviceNowConfig.instanceUrl}/api/now/attachment/${attachment.sys_id}/file`,
    }));
  }

  /**
   * Download an attachment file from ServiceNow
   * Returns the file content as a Buffer for processing (e.g., base64 encoding for images)
   */
  public async downloadAttachment(sysId: string): Promise<Buffer> {
    if (!serviceNowConfig.instanceUrl) {
      throw new Error("ServiceNow instance URL is not configured");
    }

    const url = `${serviceNowConfig.instanceUrl}/api/now/attachment/${sysId}/file`;
    const headers = await buildAuthHeaders();

    const response = await fetch(url, {
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to download attachment: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Add work note to a change request
   */
  public async addChangeWorkNote(changeSysId: string, workNote: string): Promise<void> {
    try {
      const path = `/api/now/table/change_request/${changeSysId}`;
      await request<{ result: Record<string, any> }>(path, {
        method: "PATCH",
        body: JSON.stringify({
          work_notes: workNote,
        }),
      });

      console.log(`[ServiceNow] Added work note to change: ${changeSysId}`);
    } catch (error) {
      console.error(`[ServiceNow] Error adding work note to change ${changeSysId}:`, error);
      throw error;
    }
  }

  /**
   * Get change request details
   */
  public async getChangeDetails(changeSysId: string): Promise<Record<string, any> | null> {
    try {
      const path = `/api/now/table/change_request/${changeSysId}?sysparm_fields=sys_id,number,short_description,state,assignment_group,assigned_to,description`;
      const response = await request<{ result: Record<string, any> }>(path);
      return response.result || null;
    } catch (error) {
      console.error(`[ServiceNow] Error fetching change details ${changeSysId}:`, error);
      return null;
    }
  }

  /**
   * Get catalog item details
   */
  public async getCatalogItem(catalogItemSysId: string): Promise<Record<string, any> | null> {
    try {
      const path = `/api/now/table/sc_cat_item/${catalogItemSysId}?sysparm_fields=sys_id,name,short_description,description,category,active,workflow,workflow_start`;
      const response = await request<{ result: Record<string, any> }>(path);
      return response.result || null;
    } catch (error) {
      console.error(
        `[ServiceNow] Error fetching catalog item ${catalogItemSysId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Get LDAP server configuration
   */
  public async getLDAPServer(ldapServerSysId: string): Promise<Record<string, any> | null> {
    try {
      const path = `/api/now/table/cmdb_ci_ldap_server/${ldapServerSysId}?sysparm_fields=sys_id,name,listener_enabled,mid_server,urls,paging_enabled`;
      const response = await request<{ result: Record<string, any> }>(path);
      return response.result || null;
    } catch (error) {
      console.error(`[ServiceNow] Error fetching LDAP server ${ldapServerSysId}:`, error);
      return null;
    }
  }

  /**
   * Get MID server details
   */
  public async getMIDServer(midServerSysId: string): Promise<Record<string, any> | null> {
    try {
      const path = `/api/now/table/ecc_agent/${midServerSysId}?sysparm_fields=sys_id,name,status,capabilities,last_check_in,version`;
      const response = await request<{ result: Record<string, any> }>(path);
      return response.result || null;
    } catch (error) {
      console.error(`[ServiceNow] Error fetching MID server ${midServerSysId}:`, error);
      return null;
    }
  }

  /**
   * Get workflow details
   */
  public async getWorkflow(workflowSysId: string): Promise<Record<string, any> | null> {
    try {
      const path = `/api/now/table/wf_workflow/${workflowSysId}?sysparm_fields=sys_id,name,published,checked_out,scoped_app,description`;
      const response = await request<{ result: Record<string, any> }>(path);
      return response.result || null;
    } catch (error) {
      console.error(`[ServiceNow] Error fetching workflow ${workflowSysId}:`, error);
      return null;
    }
  }

  /**
   * Get clone information for an instance
   * Checks when the target instance was last cloned from source
   */
  public async getCloneInfo(
    targetInstance: string = 'mobizuat',
    sourceInstance: string = 'mobizprod'
  ): Promise<{
    last_clone_date?: string;
    clone_age_days?: number;
    source_instance?: string;
    target_instance?: string;
    state?: string;
  } | null> {
    try {
      const path = `/api/now/table/clone_instance?sysparm_display_value=all&sysparm_limit=50&sysparm_fields=clone_date,completed,scheduled,sys_created_on,source_instance,target_instance,state`;
      const response = await request<{ result: Array<Record<string, any>> }>(path);

      if (!response.result || response.result.length === 0) {
        return null;
      }

      const normalize = (value: unknown) => (value ?? "").toString().toLowerCase();
      const targetNeedle = normalize(targetInstance);
      const sourceNeedle = normalize(sourceInstance);

      const match = response.result.find((clone) => {
        const targetDisplay = normalize(clone.target_instance?.display_value);
        const targetValue = normalize(clone.target_instance?.value);
        const sourceDisplay = normalize(clone.source_instance?.display_value);
        const sourceValue = normalize(clone.source_instance?.value);
        const targetMatches =
          targetNeedle.length === 0 ||
          targetDisplay.includes(targetNeedle) ||
          targetValue.includes(targetNeedle);
        const sourceMatches =
          sourceNeedle.length === 0 ||
          sourceDisplay.includes(sourceNeedle) ||
          sourceValue.includes(sourceNeedle);
        return targetMatches && sourceMatches;
      });

      if (!match) {
        return null;
      }

      const extractField = (record: Record<string, any>, field: string): string | undefined => {
        const raw = record?.[field];
        if (!raw || raw === "") return undefined;
        if (typeof raw === "string") return raw || undefined;
        if (typeof raw === "object") {
          return raw.value || raw.display_value || undefined;
        }
        return undefined;
      };

      const cloneDateRaw =
        extractField(match, "clone_date") ||
        extractField(match, "completed") ||
        extractField(match, "scheduled") ||
        extractField(match, "sys_created_on") ||
        extractField(match, "sys_updated_on");

      const cloneDate = cloneDateRaw ? new Date(cloneDateRaw) : null;
      const now = new Date();
      const ageDays =
        cloneDate && !Number.isNaN(cloneDate.getTime())
          ? Math.floor((now.getTime() - cloneDate.getTime()) / (1000 * 60 * 60 * 24))
          : undefined;

      return {
        last_clone_date: cloneDateRaw,
        clone_age_days: ageDays,
        source_instance: extractField(match.source_instance ?? {}, "display_value") || extractField(match.source_instance ?? {}, "value"),
        target_instance: extractField(match.target_instance ?? {}, "display_value") || extractField(match.target_instance ?? {}, "value"),
        state: extractField(match.state ?? {}, "value") || extractField(match.state ?? {}, "display_value"),
      };
    } catch (error) {
      console.error(`[ServiceNow] Error fetching clone info for ${targetInstance}:`, error);
      return null;
    }
  }

  /**
   * Get Standard Change Template metadata
   * Fetches template version details, associated record producer, and optional catalog item info
   */
  public async getTemplateMetadata(templateVersionSysId: string): Promise<{
    version?: Record<string, any>;
    producer?: {
      sys_id?: string;
      name?: string;
      short_description?: string;
      description?: string;
      owner?: string;
      category?: string;
      workflow?: string;
      active?: boolean;
      catalog_item?: string;
    };
    catalog_item?: {
      sys_id?: string;
      name?: string;
      workflow?: string;
      active?: boolean;
      category?: string;
      owner?: string;
    };
    workflow?: string;
    last_updated?: string;
    published?: boolean;
    active?: boolean;
    description?: string;
  } | null> {
    try {
      const versionFields = [
        "sys_id",
        "name",
        "sys_updated_on",
        "percent_successful",
        "closed_change_count",
        "unsuccessful_change_count",
        "std_change_producer",
        "description",
      ];

      const versionData = await this.fetchTableRecord("std_change_producer_version", templateVersionSysId, versionFields);

      if (!versionData) {
        console.warn(`[ServiceNow] Template metadata not found for: ${templateVersionSysId}`);
        return null;
      }

      let producerData: Record<string, any> | null = null;
      if (versionData.std_change_producer?.value) {
        const producerFields = [
          "sys_id",
          "name",
          "short_description",
          "description",
          "owner",
          "category",
          "workflow",
          "active",
          "catalog_item",
          "published_ref",
          "sys_updated_on",
        ];
        producerData = await this.fetchTableRecord(
          "std_change_record_producer",
          versionData.std_change_producer.value,
          producerFields
        );
      }

      let catalogItemData: Record<string, any> | null = null;
      const catalogSysId = producerData?.catalog_item?.value || producerData?.catalog_item;
      if (catalogSysId) {
        const catalogFields = ["sys_id", "name", "active", "workflow", "category", "owner"];
        catalogItemData = await this.fetchTableRecord("sc_cat_item", catalogSysId, catalogFields);
      }

      const toBoolean = (value: any): boolean | undefined => {
        if (typeof value === "boolean") return value;
        if (typeof value === "string") {
          const normalised = value.toLowerCase();
          if (normalised === "true") return true;
          if (normalised === "false") return false;
        }
        return undefined;
      };

      const resolveReference = (value: any): string | undefined => {
        if (!value) return undefined;
        if (typeof value === "string") return value;
        return value.display_value || value.value || undefined;
      };

      const rawValue = (value: any): any => {
        if (value === null || value === undefined) {
          return undefined;
        }
        if (typeof value === "object") {
          if (Object.prototype.hasOwnProperty.call(value, "value")) {
            return value.value;
          }
          if (Object.prototype.hasOwnProperty.call(value, "display_value")) {
            return value.display_value;
          }
        }
        return value;
      };

      return {
        version: {
          sys_id: rawValue(versionData.sys_id),
          name: rawValue(versionData.name),
          last_updated: rawValue(versionData.sys_updated_on),
          percent_successful: rawValue(versionData.percent_successful),
          closed_change_count: rawValue(versionData.closed_change_count),
          unsuccessful_change_count: rawValue(versionData.unsuccessful_change_count),
        },
        producer: producerData
          ? {
              sys_id: rawValue(producerData.sys_id),
              name: rawValue(producerData.name),
              short_description: rawValue(producerData.short_description),
              description: rawValue(producerData.description),
              owner: resolveReference(producerData.owner),
              category: resolveReference(producerData.category),
              workflow: resolveReference(producerData.workflow),
              active: toBoolean(producerData.active),
              catalog_item: catalogSysId,
            }
          : undefined,
        catalog_item: catalogItemData
          ? {
              sys_id: rawValue(catalogItemData.sys_id),
              name: rawValue(catalogItemData.name),
              workflow: resolveReference(catalogItemData.workflow),
              active: toBoolean(catalogItemData.active),
              category: resolveReference(catalogItemData.category),
              owner: resolveReference(catalogItemData.owner),
            }
          : undefined,
        workflow:
          resolveReference(producerData?.workflow) ||
          resolveReference(catalogItemData?.workflow),
        last_updated: rawValue(versionData.sys_updated_on) || rawValue(producerData?.sys_updated_on),
        description: rawValue(producerData?.description) || rawValue(versionData.description),
        active: toBoolean(producerData?.active),
        published: producerData?.published_ref ? true : undefined,
      };
    } catch (error) {
      console.error(`[ServiceNow] Error fetching template metadata ${templateVersionSysId}:`, error);
      return null;
    }
  }

  /**
   * Get CMDB Configuration Item details
   * Fetches CI class, owner, environment, and relationships
   */
  public async getCMDBDetails(ciSysId: string): Promise<{
    class?: string;
    owner?: string;
    environment?: string;
    relationships?: Array<{
      type: string;
      target: string;
    }>;
    status?: string;
    operational_status?: string;
    business_criticality?: string;
  } | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8-second guard

    try {
      // Use table API to get CI details (more reliable than CMDB API which requires className)
      const tablePath = `/api/now/table/cmdb_ci/${ciSysId}?sysparm_fields=sys_id,sys_class_name,owned_by,environment,install_status,operational_status,business_criticality`;
      const tableResponse = await request<{ result: Record<string, any> }>(tablePath, {
        signal: controller.signal
      });

      if (!tableResponse.result) {
        console.warn(`[ServiceNow] CMDB CI not found: ${ciSysId}`);
        return null;
      }

      const data = tableResponse.result;

      // Try to fetch relationships using cmdb_rel_ci table
      let relationships: Array<{ type: string; target: string }> = [];
      try {
        // Query the relationship table for this CI, requesting display values
        const relPath = `/api/now/table/cmdb_rel_ci?sysparm_query=parent=${ciSysId}^ORchild=${ciSysId}&sysparm_limit=10&sysparm_fields=parent,child,type&sysparm_display_value=all`;
        const relResponse = await request<{ result: Array<Record<string, any>> }>(relPath, {
          signal: controller.signal
        });

        if (relResponse.result && Array.isArray(relResponse.result)) {
          relationships = relResponse.result.map(rel => {
            // Extract the parent and child sys_ids from the reference objects
            const parentSysId = rel.parent?.value || rel.parent;
            const childSysId = rel.child?.value || rel.child;

            // Determine which CI is the "other" one in the relationship
            return {
              type: rel.type?.value || rel.type?.display_value || rel.type || 'unknown',
              target: parentSysId === ciSysId ? childSysId : parentSysId
            };
          });
        }
      } catch (error) {
        console.warn(`[ServiceNow] Could not fetch CI relationships`, error);
        // Relationships are optional, continue without them
      }

      return {
        class: data.sys_class_name || data.className,
        owner: data.owned_by?.value || data.owned_by,
        environment: data.environment?.value || data.environment,
        relationships,
        status: data.install_status?.value || data.install_status,
        operational_status: data.operational_status?.value || data.operational_status,
        business_criticality: data.business_criticality?.value || data.business_criticality
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error(`[ServiceNow] CMDB CI fetch timed out after 8s: ${ciSysId}`);
      } else {
        console.error(`[ServiceNow] Error fetching CMDB CI ${ciSysId}:`, error);
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchTableRecord(
    table: string,
    sysId: string,
    fields?: string[]
  ): Promise<Record<string, any> | null> {
    const params = new URLSearchParams({
      sysparm_display_value: "all",
    });

    if (fields && fields.length > 0) {
      params.set("sysparm_fields", fields.join(","));
    }

    const path = `/api/now/table/${table}/${sysId}?${params.toString()}`;
    const response = await this.requestWithTimeout<{ result: Record<string, any> }>(
      path,
      `${table}:${sysId}`
    );

    return response?.result ?? null;
  }

  private async requestWithTimeout<T>(
    path: string,
    operation: string,
    timeoutMs: number = 8000
  ): Promise<T | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await request<T>(path, { signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error(`[ServiceNow] ${operation} fetch timed out after ${timeoutMs}ms`);
      } else {
        console.error(`[ServiceNow] Error during ${operation}:`, error);
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * ============================================
   * SPM (Service Portfolio Management) Methods
   * ============================================
   */

  /**
   * Get an SPM project by number
   * @param number - Project number (e.g., "PRJ0001234")
   * @param context - Optional ServiceNow context
   */
  public async getSPMProject(number: string, context?: ServiceNowContext): Promise<SPMProject | null> {
    try {
      const repo = this.getSPMRepo();
      const project = await repo.findByNumber(number);
      return project;
    } catch (error) {
      console.error(`[ServiceNow] Error fetching SPM project ${number}:`, error);
      throw error;
    }
  }

  /**
   * Get an SPM project by sys_id
   * @param sysId - Project sys_id
   * @param context - Optional ServiceNow context
   */
  public async getSPMProjectBySysId(sysId: string, context?: ServiceNowContext): Promise<SPMProject | null> {
    try {
      const repo = this.getSPMRepo();
      const project = await repo.findBySysId(sysId);
      return project;
    } catch (error) {
      console.error(`[ServiceNow] Error fetching SPM project by sys_id ${sysId}:`, error);
      throw error;
    }
  }

  /**
   * Search for SPM projects matching criteria
   * @param criteria - Search criteria
   * @param context - Optional ServiceNow context
   */
  public async searchSPMProjects(
    criteria: SPMSearchCriteria,
    context?: ServiceNowContext,
  ): Promise<{ projects: SPMProject[]; totalCount: number }> {
    try {
      const repo = this.getSPMRepo();
      const result = await repo.search(criteria);
      return result;
    } catch (error) {
      console.error(`[ServiceNow] Error searching SPM projects:`, error);
      throw error;
    }
  }

  /**
   * Get SPM projects by state
   * @param state - Project state (e.g., "-3" for Work in Progress)
   * @param limit - Maximum number of results
   * @param context - Optional ServiceNow context
   */
  public async getSPMProjectsByState(
    state: string,
    limit?: number,
    context?: ServiceNowContext,
  ): Promise<SPMProject[]> {
    try {
      const repo = this.getSPMRepo();
      const projects = await repo.findByState(state, limit);
      return projects;
    } catch (error) {
      console.error(`[ServiceNow] Error fetching SPM projects by state ${state}:`, error);
      throw error;
    }
  }

  /**
   * Get SPM projects by assignment
   * @param assignedTo - User sys_id or user name
   * @param assignmentGroup - Group sys_id or group name
   * @param context - Optional ServiceNow context
   */
  public async getSPMProjectsByAssignment(
    assignedTo?: string,
    assignmentGroup?: string,
    context?: ServiceNowContext,
  ): Promise<SPMProject[]> {
    try {
      const repo = this.getSPMRepo();
      const projects = await repo.findByAssignment(assignedTo, assignmentGroup);
      return projects;
    } catch (error) {
      console.error(`[ServiceNow] Error fetching SPM projects by assignment:`, error);
      throw error;
    }
  }

  /**
   * Get active SPM projects (not closed/cancelled)
   * @param limit - Maximum number of results
   * @param context - Optional ServiceNow context
   */
  public async getActiveSPMProjects(limit?: number, context?: ServiceNowContext): Promise<SPMProject[]> {
    try {
      const repo = this.getSPMRepo();
      const projects = await repo.findActive(limit);
      return projects;
    } catch (error) {
      console.error(`[ServiceNow] Error fetching active SPM projects:`, error);
      throw error;
    }
  }

  /**
   * Create a new SPM project
   * @param input - Project creation input
   * @param context - Optional ServiceNow context
   */
  public async createSPMProject(
    input: CreateSPMProjectInput,
    context?: ServiceNowContext,
  ): Promise<SPMProject> {
    try {
      const repo = this.getSPMRepo();
      const project = await repo.create(input);
      console.log(`[ServiceNow] Created SPM project ${project.number} (${project.sysId})`);
      return project;
    } catch (error) {
      console.error(`[ServiceNow] Error creating SPM project:`, error);
      throw error;
    }
  }

  /**
   * Update an existing SPM project
   * @param sysId - Project sys_id
   * @param updates - Project updates
   * @param context - Optional ServiceNow context
   */
  public async updateSPMProject(
    sysId: string,
    updates: UpdateSPMProjectInput,
    context?: ServiceNowContext,
  ): Promise<SPMProject> {
    try {
      const repo = this.getSPMRepo();
      const project = await repo.update(sysId, updates);
      console.log(`[ServiceNow] Updated SPM project ${project.number} (${sysId})`);
      return project;
    } catch (error) {
      console.error(`[ServiceNow] Error updating SPM project ${sysId}:`, error);
      throw error;
    }
  }

  /**
   * Add a work note to an SPM project
   * @param sysId - Project sys_id
   * @param note - Work note text
   * @param isInternal - If true, adds internal work note; if false, adds comment
   * @param context - Optional ServiceNow context
   */
  public async addSPMProjectWorkNote(
    sysId: string,
    note: string,
    isInternal: boolean = true,
    context?: ServiceNowContext,
  ): Promise<void> {
    try {
      const repo = this.getSPMRepo();
      await repo.addWorkNote(sysId, note, isInternal);
      console.log(`[ServiceNow] Added work note to SPM project ${sysId}`);
    } catch (error) {
      console.error(`[ServiceNow] Error adding work note to SPM project ${sysId}:`, error);
      throw error;
    }
  }

  /**
   * Get epics for an SPM project
   * @param projectSysId - Project sys_id
   * @param context - Optional ServiceNow context
   */
  public async getSPMProjectEpics(projectSysId: string, context?: ServiceNowContext): Promise<SPMEpic[]> {
    try {
      const repo = this.getSPMRepo();
      const epics = await repo.findRelatedEpics(projectSysId);
      return epics;
    } catch (error) {
      console.error(`[ServiceNow] Error fetching epics for project ${projectSysId}:`, error);
      throw error;
    }
  }

  /**
   * Get stories for an SPM project (via epics)
   * @param projectSysId - Project sys_id
   * @param context - Optional ServiceNow context
   */
  public async getSPMProjectStories(projectSysId: string, context?: ServiceNowContext): Promise<SPMStory[]> {
    try {
      const repo = this.getSPMRepo();
      const stories = await repo.findRelatedStories(projectSysId);
      return stories;
    } catch (error) {
      console.error(`[ServiceNow] Error fetching stories for project ${projectSysId}:`, error);
      throw error;
    }
  }

  /**
   * Close an SPM project
   * @param sysId - Project sys_id
   * @param complete - If true, marks as complete; if false, marks as incomplete
   * @param closeNotes - Optional close notes
   * @param context - Optional ServiceNow context
   */
  public async closeSPMProject(
    sysId: string,
    complete: boolean = true,
    closeNotes?: string,
    context?: ServiceNowContext,
  ): Promise<SPMProject> {
    try {
      const repo = this.getSPMRepo();
      const project = await repo.close(sysId, complete, closeNotes);
      console.log(`[ServiceNow] Closed SPM project ${project.number} (${sysId}) as ${complete ? 'complete' : 'incomplete'}`);
      return project;
    } catch (error) {
      console.error(`[ServiceNow] Error closing SPM project ${sysId}:`, error);
      throw error;
    }
  }
}

export const serviceNowClient = new ServiceNowClient();

/**
 * Convenience function to add work note
 */
export async function addCaseWorkNote(
  sysId: string,
  workNote: string,
  workNotes: boolean = true,
  context?: ServiceNowContext,
): Promise<void> {
  await serviceNowClient.addCaseWorkNote(sysId, workNote, workNotes, context);
}
