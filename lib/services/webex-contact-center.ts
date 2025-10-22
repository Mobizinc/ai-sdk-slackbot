import type { NewCallInteraction } from "../db/schema";

const DEFAULT_WEBEX_BASE_URL = "https://webexapis.com/v1";
const DEFAULT_PAGE_SIZE = 100;

const WEBEX_CLIENT_ID = process.env.WEBEX_CC_CLIENT_ID;
const WEBEX_CLIENT_SECRET = process.env.WEBEX_CC_CLIENT_SECRET;
const WEBEX_REFRESH_TOKEN = process.env.WEBEX_CC_REFRESH_TOKEN;
const WEBEX_ACCESS_TOKEN = process.env.WEBEX_CC_ACCESS_TOKEN;
const WEBEX_BASE_URL = (process.env.WEBEX_CC_BASE_URL || DEFAULT_WEBEX_BASE_URL).replace(/\/$/, "");
const WEBEX_ORG_ID = process.env.WEBEX_CC_ORG_ID;
const WEBEX_INTERACTION_PATH =
  process.env.WEBEX_CC_INTERACTION_PATH || "contactCenter/interactionHistory";

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
  if (!WEBEX_CLIENT_ID || !WEBEX_CLIENT_SECRET || !WEBEX_REFRESH_TOKEN) {
    throw new WebexContactCenterError(
      "WEBEX contact center refresh flow requires WEBEX_CC_CLIENT_ID, WEBEX_CC_CLIENT_SECRET, and WEBEX_CC_REFRESH_TOKEN",
    );
  }

  const tokenEndpoint =
    process.env.WEBEX_CC_TOKEN_URL || "https://webexapis.com/v1/access_token";

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: WEBEX_CLIENT_ID,
    client_secret: WEBEX_CLIENT_SECRET,
    refresh_token: WEBEX_REFRESH_TOKEN,
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
  if (WEBEX_ACCESS_TOKEN) {
    return WEBEX_ACCESS_TOKEN;
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
    const res = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new WebexContactCenterError(
        `Failed to retrieve Webex interactions: ${res.status} ${text}`,
      );
    }

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
  const url = new URL(`${WEBEX_BASE_URL}/${WEBEX_INTERACTION_PATH}`);
  url.searchParams.set("mediaType", "telephony");
  url.searchParams.set("startTime", params.startTime.toISOString());
  url.searchParams.set("endTime", params.endTime.toISOString());
  url.searchParams.set("pageSize", String(pageSize));
  if (WEBEX_ORG_ID) {
    url.searchParams.set("orgId", WEBEX_ORG_ID);
  }

  return url.toString();
}
