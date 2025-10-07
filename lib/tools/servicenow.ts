import { Buffer } from "node:buffer";

type ServiceNowAuthMode = "basic" | "token";

interface ServiceNowConfig {
  instanceUrl?: string;
  username?: string;
  password?: string;
  apiToken?: string;
  caseTable?: string;
  caseJournalName?: string;
}

const config: ServiceNowConfig = {
  instanceUrl: process.env.SERVICENOW_INSTANCE_URL,
  username: process.env.SERVICENOW_USERNAME,
  password: process.env.SERVICENOW_PASSWORD,
  apiToken: process.env.SERVICENOW_API_TOKEN,
  caseTable:
    process.env.SERVICENOW_CASE_TABLE?.trim() || "sn_customerservice_case",
  caseJournalName:
    process.env.SERVICENOW_CASE_JOURNAL_NAME?.trim() ||
    "x_mobit_serv_case_service_case",
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
  assignment_group?: unknown;
  assigned_to?: unknown;
  opened_by?: unknown;
  caller_id?: unknown;
  submitted_by?: string;
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
      result: Array<ServiceNowCaseResult & {
        opened_by?: { display_value?: string } | string;
        caller_id?: { display_value?: string } | string;
        submitted_by?: string;
      }>;
    }>(
      `/api/now/table/${table}?sysparm_query=${encodeURIComponent(
        `number=${number}`,
      )}&sysparm_limit=1&sysparm_display_value=all`,
    );

    if (!data.result?.length) return null;

    const caseRecord = data.result[0];
    const openedBy =
      typeof caseRecord.opened_by === "string"
        ? caseRecord.opened_by
        : caseRecord.opened_by?.display_value;
    const caller =
      typeof caseRecord.caller_id === "string"
        ? caseRecord.caller_id
        : caseRecord.caller_id?.display_value;
    return {
      ...caseRecord,
      opened_by: caseRecord.opened_by,
      caller_id: caseRecord.caller_id,
      submitted_by: caseRecord.submitted_by ?? openedBy ?? caller ?? undefined,
      url: `${config.instanceUrl}/nav_to.do?uri=${table}.do?sys_id=${caseRecord.sys_id}`,
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
}

export const serviceNowClient = new ServiceNowClient();
