import type { NewCallInteraction } from "../db/schema";

// Webex Contact Center API configuration
// API Base: https://api.wxcc-us1.cisco.com (US region)
// Other regions: wxcc-eu1, wxcc-eu2, wxcc-anz1, wxcc-ca1, wxcc-jp1, wxcc-sg1
const DEFAULT_WEBEX_BASE_URL = "https://api.wxcc-us1.cisco.com";
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGINATION_PAGES = 100; // Prevent infinite loops
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

const WEBEX_CLIENT_ID = process.env.WEBEX_CC_CLIENT_ID;
const WEBEX_CLIENT_SECRET = process.env.WEBEX_CC_CLIENT_SECRET;
const WEBEX_REFRESH_TOKEN = process.env.WEBEX_CC_REFRESH_TOKEN;
const WEBEX_ACCESS_TOKEN = process.env.WEBEX_CC_ACCESS_TOKEN;
const WEBEX_BASE_URL = (process.env.WEBEX_CC_BASE_URL || DEFAULT_WEBEX_BASE_URL).replace(/\/$/, "");
const WEBEX_ORG_ID = process.env.WEBEX_CC_ORG_ID;
const WEBEX_TASKS_PATH = process.env.WEBEX_CC_TASKS_PATH || "v1/tasks";

type WebexInteractionRecord = {
  id: string;
  attributes: {
    owner?: {
      id?: string;
      name?: string;
    };
    queue?: {
      id?: string;
      name?: string;
    };
    channelType?: string;
    status?: string;
    createdTime?: number;
    lastUpdatedTime?: number;
    captureRequested?: boolean;
    origin?: string;
    destination?: string;
    direction?: string;
    wrapUpCode?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type WebexInteractionResponse = {
  data?: WebexInteractionRecord[];
  meta?: {
    orgId?: string;
  };
  links?: {
    next?: string;
  };
};

// Captures API types for recording download
export type CaptureRecord = {
  id: string;
  taskId: string;
  filepath: string; // Signed download URL
  startTime?: number;
  endTime?: number;
  durationMs?: number;
  format?: string;
  status?: string;
};

type CapturesResponse = {
  data?: CaptureRecord[];
  meta?: {
    orgId?: string;
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
  const attributes = record.attributes;
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

function extractAgentInfo(record: WebexInteractionRecord) {
  return record.attributes.owner ?? null;
}

function toNewCallInteraction(record: WebexInteractionRecord): NewCallInteraction | null {
  if (!record.id) {
    return null;
  }

  const attrs = record.attributes;
  const agent = extractAgentInfo(record);
  const startTime = attrs.createdTime ? new Date(attrs.createdTime) : undefined;
  const endTime = attrs.lastUpdatedTime ? new Date(attrs.lastUpdatedTime) : undefined;
  const durationSeconds =
    startTime && endTime ? Math.round((endTime.getTime() - startTime.getTime()) / 1000) : undefined;

  return {
    sessionId: record.id,
    contactId: record.id,
    caseNumber: extractCaseNumber(record),
    direction: attrs.direction,
    ani: attrs.origin,
    dnis: attrs.destination,
    agentId: agent?.id,
    agentName: agent?.name,
    queueName: attrs.queue?.name,
    startTime,
    endTime,
    durationSeconds,
    wrapUpCode: attrs.wrapUpCode,
    recordingId: attrs.captureRequested ? record.id : undefined,
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
  let pageCount = 0;

  while (nextUrl) {
    // Pagination limit to prevent infinite loops
    pageCount++;
    if (pageCount > MAX_PAGINATION_PAGES) {
      console.warn(
        `[Webex CC] Reached max pagination limit (${MAX_PAGINATION_PAGES} pages). ` +
        `Stopping to prevent infinite loop. Collected ${interactions.length} interactions so far.`
      );
      break;
    }

    // Create AbortController for request timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const text = await res.text();
        throw new WebexContactCenterError(
          `Failed to retrieve Webex interactions (page ${pageCount}): ${res.status} ${text}`,
        );
      }

      const payload = (await res.json()) as WebexInteractionResponse;
      const items = payload.data ?? [];

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
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle timeout errors
      if (error instanceof Error && error.name === 'AbortError') {
        throw new WebexContactCenterError(
          `Request timeout after ${REQUEST_TIMEOUT_MS}ms on page ${pageCount}`
        );
      }

      throw error;
    }
  }

  console.log(
    `[Webex CC] Fetched ${interactions.length} interactions across ${pageCount} page(s)`
  );

  return { interactions, latestEndTime };
}

function buildInitialUrl(params: FetchInteractionsParams, pageSize: number): string {
  const url = new URL(`${WEBEX_BASE_URL}/${WEBEX_TASKS_PATH}`);

  // Convert dates to epoch milliseconds (Webex Contact Center API requirement)
  url.searchParams.set("from", String(params.startTime.getTime()));
  url.searchParams.set("to", String(params.endTime.getTime()));

  // Channel type for voice interactions
  url.searchParams.set("channelType", "telephony");

  // Page size for pagination
  url.searchParams.set("pageSize", String(pageSize));

  // Organization ID (required for multi-tenant environments)
  if (WEBEX_ORG_ID) {
    url.searchParams.set("orgId", WEBEX_ORG_ID);
  }

  return url.toString();
}

/**
 * Retrieve recording metadata (including download URL) for given task IDs
 * Uses the Webex Contact Center Captures API
 *
 * @param taskIds - Array of task/session IDs to fetch recordings for
 * @param urlExpirationSeconds - How long the signed download URL should be valid (default: 3600 = 1 hour)
 * @returns Array of capture records with download URLs
 */
export async function getCapturesByTaskIds(
  taskIds: string[],
  urlExpirationSeconds = 3600
): Promise<CaptureRecord[]> {
  if (!taskIds || taskIds.length === 0) {
    return [];
  }

  if (!WEBEX_ORG_ID) {
    throw new WebexContactCenterError("WEBEX_CC_ORG_ID is required for Captures API");
  }

  const accessToken = await getAccessToken();

  // Build request URL
  const url = new URL(`${WEBEX_BASE_URL}/v1/captures`);
  url.searchParams.set("orgId", WEBEX_ORG_ID);
  url.searchParams.set("taskIds", taskIds.join(","));
  url.searchParams.set("urlExpiration", String(urlExpirationSeconds));

  console.log(`[Webex Captures] Fetching recordings for ${taskIds.length} task(s)`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text();

      // Handle 404 gracefully - means no recordings exist for these tasks
      if (res.status === 404) {
        console.log(`[Webex Captures] No recordings found for task IDs: ${taskIds.join(", ")}`);
        return [];
      }

      throw new WebexContactCenterError(
        `Failed to retrieve Webex captures: ${res.status} ${text}`
      );
    }

    const payload = (await res.json()) as CapturesResponse;
    const captures = payload.data ?? [];

    console.log(`[Webex Captures] Retrieved ${captures.length} recording(s)`);

    return captures;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new WebexContactCenterError(
        `Captures API request timeout after ${REQUEST_TIMEOUT_MS}ms`
      );
    }

    throw error;
  }
}

/**
 * Download a recording file from a signed URL
 *
 * @param filepath - Signed download URL from Captures API
 * @param outputPath - Local file path to save the recording (e.g., '/tmp/recording-123.mp3')
 * @returns File size in bytes
 */
export async function downloadRecording(
  filepath: string,
  outputPath: string
): Promise<number> {
  console.log(`[Webex Recording] Downloading from: ${filepath}`);
  console.log(`[Webex Recording] Saving to: ${outputPath}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS * 3); // 90 seconds for large files

  try {
    const res = await fetch(filepath, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new WebexContactCenterError(
        `Failed to download recording: ${res.status} ${res.statusText}`
      );
    }

    // Get file as buffer
    const buffer = await res.arrayBuffer();

    // Save to file (Node.js only)
    const fs = await import("fs/promises");
    await fs.writeFile(outputPath, Buffer.from(buffer));

    console.log(`[Webex Recording] Downloaded ${buffer.byteLength} bytes`);

    return buffer.byteLength;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new WebexContactCenterError(
        `Recording download timeout after ${REQUEST_TIMEOUT_MS * 3}ms`
      );
    }

    throw error;
  }
}
