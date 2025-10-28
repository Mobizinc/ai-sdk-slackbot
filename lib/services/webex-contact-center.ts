import type { NewCallInteraction } from "../db/schema";

const DEFAULT_WEBEX_BASE_URL = "https://webexapis.com/v1";
const DEFAULT_PAGE_SIZE = 100;

// Lazy getters for environment variables to support dotenv loading
// These functions read from process.env at runtime instead of module load time
const getWebexClientId = () => process.env.WEBEX_CC_CLIENT_ID;
const getWebexClientSecret = () => process.env.WEBEX_CC_CLIENT_SECRET;
const getWebexRefreshToken = () => process.env.WEBEX_CC_REFRESH_TOKEN;
const getWebexAccessToken = () => process.env.WEBEX_CC_ACCESS_TOKEN;
const getWebexBaseUrl = () => (process.env.WEBEX_CC_BASE_URL || DEFAULT_WEBEX_BASE_URL).replace(/\/$/, "");
const getWebexOrgId = () => process.env.WEBEX_CC_ORG_ID;
const getWebexInteractionPath = () => process.env.WEBEX_CC_INTERACTION_PATH || "contactCenter/interactionHistory";

// Legacy constants for backward compatibility (deprecated - use getters)
const WEBEX_CLIENT_ID = getWebexClientId();
const WEBEX_CLIENT_SECRET = getWebexClientSecret();
const WEBEX_REFRESH_TOKEN = getWebexRefreshToken();
const WEBEX_ACCESS_TOKEN = getWebexAccessToken();
const WEBEX_BASE_URL = getWebexBaseUrl();
const WEBEX_ORG_ID = getWebexOrgId();
const WEBEX_INTERACTION_PATH = getWebexInteractionPath();

type WebexInteractionRecord = {
  sessionId: string;
  contactId?: string;
  mediaType?: string;
  direction?: string;
  ani?: string;
  dnis?: string;
  startTime?: string;
  endTime?: string;
  queueName?: string;
  wrapUpCode?: string;
  participants?: Array<{
    role?: string;
    id?: string;
    name?: string;
  }>;
  attributes?: Record<string, unknown>;
  recording?: {
    id?: string;
  };
  [key: string]: unknown;
};

type WebexInteractionResponse = {
  items?: WebexInteractionRecord[];
  links?: {
    next?: string;
  };
};

class WebexContactCenterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebexContactCenterError";
  }
}

async function exchangeRefreshToken(): Promise<string> {
  const clientId = getWebexClientId();
  const clientSecret = getWebexClientSecret();
  const refreshToken = getWebexRefreshToken();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new WebexContactCenterError(
      "WEBEX contact center refresh flow requires WEBEX_CC_CLIENT_ID, WEBEX_CC_CLIENT_SECRET, and WEBEX_CC_REFRESH_TOKEN",
    );
  }

  const tokenEndpoint =
    process.env.WEBEX_CC_TOKEN_URL || "https://webexapis.com/v1/access_token";

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new WebexContactCenterError(
      `Failed to exchange refresh token: ${response.status} ${text}`,
    );
  }

  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new WebexContactCenterError("Missing access_token in Webex response");
  }

  return json.access_token;
}

async function getAccessToken(): Promise<string> {
  const accessToken = getWebexAccessToken();
  if (accessToken) {
    return accessToken;
  }

  return exchangeRefreshToken();
}

function extractCaseNumber(record: WebexInteractionRecord): string | undefined {
  const attributes = record.attributes || {};
  const possibleKeys = [
    "caseNumber",
    "CaseNumber",
    "CASE_NUMBER",
    "case_number",
    "servicenow_case",
  ];

  for (const key of possibleKeys) {
    const value = attributes[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function pickAgentParticipant(record: WebexInteractionRecord) {
  const participants = record.participants || [];
  const agent =
    participants.find((p) => p.role?.toLowerCase() === "agent") ||
    participants.find((p) => p.role?.toLowerCase() === "user");
  return agent ?? null;
}

function toNewCallInteraction(record: WebexInteractionRecord): NewCallInteraction | null {
  if (!record.sessionId) {
    return null;
  }

  const agent = pickAgentParticipant(record);
  const startTime = record.startTime ? new Date(record.startTime) : undefined;
  const endTime = record.endTime ? new Date(record.endTime) : undefined;
  const durationSeconds =
    startTime && endTime ? Math.round((endTime.getTime() - startTime.getTime()) / 1000) : undefined;

  return {
    sessionId: record.sessionId,
    contactId: record.contactId,
    caseNumber: extractCaseNumber(record),
    direction: record.direction,
    ani: record.ani,
    dnis: record.dnis,
    agentId: agent?.id,
    agentName: agent?.name,
    queueName: record.queueName,
    startTime,
    endTime,
    durationSeconds,
    wrapUpCode: record.wrapUpCode,
    recordingId: record.recording?.id,
    transcriptStatus: "pending",
    rawPayload: record as Record<string, unknown>,
    syncedAt: new Date(),
  };
}

export interface FetchInteractionsParams {
  startTime: Date;
  endTime: Date;
  pageSize?: number;
}

export interface FetchInteractionsResult {
  interactions: NewCallInteraction[];
  latestEndTime: Date | null;
}

export async function fetchVoiceInteractions(
  params: FetchInteractionsParams,
): Promise<FetchInteractionsResult> {
  const accessToken = await getAccessToken();

  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const interactions: NewCallInteraction[] = [];
  let latestEndTime: Date | null = null;
  let nextUrl: string | null = buildInitialUrl(params, pageSize);

  while (nextUrl) {
    console.log(`[Webex API] GET ${nextUrl}`);

    const res = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[Webex API] Response: ${res.status} ${res.statusText}`);
      throw new WebexContactCenterError(
        `Failed to retrieve Webex interactions: ${res.status} ${text}`,
      );
    }

    console.log(`[Webex API] Response: ${res.status} ${res.statusText}`);

    const payload = (await res.json()) as WebexInteractionResponse;
    const items = payload.items ?? [];

    for (const item of items) {
      const mapped = toNewCallInteraction(item);
      if (!mapped) continue;

      interactions.push(mapped);

      if (mapped.endTime) {
        if (!latestEndTime || mapped.endTime > latestEndTime) {
          latestEndTime = mapped.endTime;
        }
      }
    }

    nextUrl = payload.links?.next ?? null;
  }

  return { interactions, latestEndTime };
}

function buildInitialUrl(params: FetchInteractionsParams, pageSize: number): string {
  const baseUrl = getWebexBaseUrl();
  const interactionPath = getWebexInteractionPath();
  const orgId = getWebexOrgId();

  const url = new URL(`${baseUrl}/${interactionPath}`);
  url.searchParams.set("mediaType", "telephony");
  url.searchParams.set("startTime", params.startTime.toISOString());
  url.searchParams.set("endTime", params.endTime.toISOString());
  url.searchParams.set("pageSize", String(pageSize));
  if (orgId) {
    url.searchParams.set("orgId", orgId);
  }

  return url.toString();
}
