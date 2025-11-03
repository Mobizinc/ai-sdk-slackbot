/**
 * Webex Contact Center Client
 *
 * Framework-agnostic utilities for interacting with the Webex Contact Center
 * Tasks and Captures APIs. Designed for reuse across services by supplying a
 * minimal configuration object (base URL, auth provider, fetch implementation).
 */

export interface WebexClientConfig {
  /** Base API URL (defaults to https://webexapis.com/v1) */
  baseUrl?: string;
  /** Organization ID (optional query parameter) */
  orgId?: string;
  /** Interaction history endpoint path */
  interactionPath?: string;
  /** Capture management endpoint path */
  capturePath?: string;
  /** Maximum task IDs per capture request */
  maxCaptureChunkSize?: number;
  /** Custom fetch implementation */
  fetchFn?: typeof fetch;
  /** Acquire an OAuth access token */
  getAccessToken: () => Promise<string>;
  /** Optional logger hook */
  logger?: {
    info?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string) => void;
  };
}

export interface WebexVoiceInteraction {
  sessionId: string;
  contactId?: string;
  direction?: string;
  ani?: string;
  dnis?: string;
  agentId?: string;
  agentName?: string;
  queueName?: string;
  startTime?: Date;
  endTime?: Date;
  durationSeconds?: number;
  wrapUpCode?: string;
  caseNumber?: string;
  recordingId?: string;
  rawPayload: Record<string, unknown>;
}

export interface FetchVoiceInteractionsParams {
  startTime: Date;
  endTime: Date;
  pageSize?: number;
}

export interface FetchVoiceInteractionsResult {
  interactions: WebexVoiceInteraction[];
  latestEndTime: Date | null;
}

export interface WebexCapture {
  id: string;
  taskId: string;
  orgId?: string;
  status?: string;
  mediaType?: string;
  format?: string;
  durationMs?: number;
  startTime?: string;
  endTime?: string;
  filepath: string;
  expiresAt?: string;
  raw: Record<string, unknown>;
}

interface WebexInteractionRecord {
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
  participants?: Array<{ role?: string; id?: string; name?: string }>;
  attributes?: Record<string, unknown>;
  recording?: { id?: string };
  [key: string]: unknown;
}

interface WebexInteractionResponse {
  items?: WebexInteractionRecord[];
  links?: { next?: string };
}

interface WebexCaptureRecord {
  id?: string;
  captureId?: string;
  taskId?: string;
  task_id?: string;
  status?: string;
  orgId?: string;
  org_id?: string;
  mediaType?: string;
  media_type?: string;
  format?: string;
  mediaFormat?: string;
  durationMs?: number;
  durationMillis?: number;
  duration?: number;
  startTime?: string;
  start_time?: string;
  endTime?: string;
  end_time?: string;
  filepath?: string;
  downloadUrl?: string;
  url?: string;
  expiresAt?: string;
  expiration?: string;
  createdTime?: string;
  [key: string]: unknown;
}

interface WebexCapturesResponse {
  items?: WebexCaptureRecord[];
  captures?: WebexCaptureRecord[];
  data?: WebexCaptureRecord[];
  links?: { next?: string };
}

export interface DownloadRecordingOptions {
  /** Optional override fetch implementation */
  fetchFn?: typeof fetch;
  /** Abort controller signal */
  signal?: AbortSignal;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Use custom access token (otherwise config getAccessToken is used) */
  accessToken?: string;
}

export interface DownloadRecordingResult {
  response: Response;
  contentType?: string | null;
  contentLength?: number;
}

export interface WebexContactCenterClient {
  fetchVoiceInteractions(
    params: FetchVoiceInteractionsParams,
  ): Promise<FetchVoiceInteractionsResult>;
  getCapturesByTaskIds(
    taskIds: string[],
    urlExpirationSeconds?: number,
  ): Promise<WebexCapture[]>;
  downloadRecording(
    url: string,
    options?: DownloadRecordingOptions,
  ): Promise<DownloadRecordingResult>;
}

const DEFAULT_BASE_URL = "https://webexapis.com/v1";
const DEFAULT_INTERACTION_PATH = "contactCenter/interactionHistory";
const DEFAULT_CAPTURE_PATH = "contactCenter/captureManagement/captures";
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_CHUNK = 25;

export class WebexContactCenterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebexContactCenterError";
  }
}

export function createWebexClient(config: WebexClientConfig): WebexContactCenterClient {
  const fetchImpl = config.fetchFn ?? fetch;
  const logger = {
    info: config.logger?.info ?? (() => undefined),
    warn: config.logger?.warn ?? (() => undefined),
    error: config.logger?.error ?? (() => undefined),
  };

  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const interactionPath = config.interactionPath ?? DEFAULT_INTERACTION_PATH;
  const capturePath = config.capturePath ?? DEFAULT_CAPTURE_PATH;
  const orgId = config.orgId;
  const maxChunk = Math.max(
    1,
    Math.min(config.maxCaptureChunkSize ?? DEFAULT_MAX_CHUNK, DEFAULT_MAX_CHUNK),
  );

  async function authorizedFetch(url: string | URL, init?: RequestInit): Promise<Response> {
    const token = await config.getAccessToken();
    const finalUrl = typeof url === "string" ? url : url.toString();

    logger.info?.(`[Webex API] ${init?.method ?? "GET"} ${finalUrl}`);

    const response = await fetchImpl(finalUrl, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });

    logger.info?.(`[Webex API] Response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new WebexContactCenterError(
        `Webex API request failed: ${response.status} ${response.statusText} ${text}`,
      );
    }

    return response;
  }

  async function fetchVoiceInteractionsInternal(
    params: FetchVoiceInteractionsParams,
  ): Promise<FetchVoiceInteractionsResult> {
    const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
    const interactions: WebexVoiceInteraction[] = [];
    let latestEndTime: Date | null = null;

    let nextUrl: string | null = buildInteractionUrl(
      baseUrl,
      interactionPath,
      orgId,
      params.startTime,
      params.endTime,
      pageSize,
    );

    while (nextUrl) {
      const response = await authorizedFetch(nextUrl);
      const payload = (await response.json()) as WebexInteractionResponse;
      const items = payload.items ?? [];

      for (const record of items) {
        const mapped = toVoiceInteraction(record);
        if (!mapped) continue;
        interactions.push(mapped);
        if (mapped.endTime && (!latestEndTime || mapped.endTime > latestEndTime)) {
          latestEndTime = mapped.endTime;
        }
      }

      nextUrl = payload.links?.next ?? null;
    }

    return { interactions, latestEndTime };
  }

  async function getCapturesByTaskIdsInternal(
    taskIds: string[],
    urlExpirationSeconds = 3600,
  ): Promise<WebexCapture[]> {
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return [];
    }

    const uniqueTaskIds = Array.from(new Set(taskIds.filter(Boolean)));
    if (uniqueTaskIds.length === 0) {
      return [];
    }

    const captures: WebexCapture[] = [];
    for (const chunk of chunkArray(uniqueTaskIds, maxChunk)) {
      const url = new URL(`${baseUrl}/${capturePath}`);
      chunk.forEach((id) => url.searchParams.append("taskId", id));
      if (orgId) {
        url.searchParams.set("orgId", orgId);
      }
      if (urlExpirationSeconds > 0) {
        url.searchParams.set("expirationSeconds", String(urlExpirationSeconds));
      }
      url.searchParams.set("includeFilepath", "true");

      const response = await authorizedFetch(url);
      const payload = (await response.json().catch(() => ({}))) as WebexCapturesResponse;
      const records =
        payload.items ??
        payload.captures ??
        payload.data ??
        ([] as WebexCaptureRecord[]);

      for (const record of records) {
        const mapped = toCapture(record);
        if (mapped) {
          captures.push(mapped);
        }
      }
    }

    return captures;
  }

  async function downloadRecordingInternal(
    url: string,
    options: DownloadRecordingOptions = {},
  ): Promise<DownloadRecordingResult> {
    const headers = {
      ...(options.headers ?? {}),
    };

    if (!headers.Authorization) {
      const token = options.accessToken ?? (await config.getAccessToken());
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await (options.fetchFn ?? fetchImpl)(url, {
      method: "GET",
      headers,
      signal: options.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new WebexContactCenterError(
        `Failed to download Webex recording: ${response.status} ${response.statusText} ${text}`,
      );
    }

    const lengthHeader = response.headers.get("content-length");
    const contentLength = lengthHeader ? Number(lengthHeader) : undefined;

    return {
      response,
      contentType: response.headers.get("content-type"),
      contentLength,
    };
  }

  return {
    fetchVoiceInteractions: fetchVoiceInteractionsInternal,
    getCapturesByTaskIds: getCapturesByTaskIdsInternal,
    downloadRecording: downloadRecordingInternal,
  };
}

function buildInteractionUrl(
  baseUrl: string,
  interactionPath: string,
  orgId: string | undefined,
  startTime: Date,
  endTime: Date,
  pageSize: number,
): string {
  const url = new URL(`${baseUrl}/${interactionPath}`);
  url.searchParams.set("mediaType", "telephony");
  url.searchParams.set("startTime", startTime.toISOString());
  url.searchParams.set("endTime", endTime.toISOString());
  url.searchParams.set("pageSize", String(pageSize));
  if (orgId) {
    url.searchParams.set("orgId", orgId);
  }
  return url.toString();
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    result.push(items.slice(i, i + chunkSize));
  }
  return result;
}

function toVoiceInteraction(record: WebexInteractionRecord): WebexVoiceInteraction | null {
  if (!record.sessionId) return null;

  const participants = record.participants ?? [];
  const agent =
    participants.find((p) => p.role?.toLowerCase() === "agent") ??
    participants.find((p) => p.role?.toLowerCase() === "user") ??
    null;

  const start = record.startTime ? safeDate(record.startTime) : undefined;
  const end = record.endTime ? safeDate(record.endTime) : undefined;
  const durationSeconds =
    start && end ? Math.round((end.getTime() - start.getTime()) / 1000) : undefined;

  return {
    sessionId: record.sessionId,
    contactId: record.contactId,
    direction: record.direction,
    ani: record.ani,
    dnis: record.dnis,
    agentId: agent?.id,
    agentName: agent?.name,
    queueName: record.queueName,
    startTime: start,
    endTime: end,
    durationSeconds,
    wrapUpCode: record.wrapUpCode,
    caseNumber: extractCaseNumber(record),
    recordingId: record.recording?.id,
    rawPayload: record as Record<string, unknown>,
  };
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

function toCapture(record: WebexCaptureRecord | null | undefined): WebexCapture | null {
  if (!record) return null;

  const id = String(record.id ?? record.captureId ?? "").trim();
  const taskId = String(record.taskId ?? record.task_id ?? "").trim();
  const filepath = String(record.filepath ?? record.downloadUrl ?? record.url ?? "").trim();

  if (!id || !taskId || !filepath) {
    return null;
  }

  const durationMs =
    record.durationMs ??
    record.durationMillis ??
    (typeof record.duration === "number" ? record.duration : undefined);

  return {
    id,
    taskId,
    orgId: record.orgId ?? record.org_id,
    status: record.status,
    mediaType: record.mediaType ?? record.media_type,
    format: record.format ?? record.mediaFormat,
    durationMs: typeof durationMs === "number" ? durationMs : undefined,
    startTime: record.startTime ?? record.start_time ?? record.createdTime,
    endTime: record.endTime ?? record.end_time,
    filepath,
    expiresAt: record.expiresAt ?? record.expiration,
    raw: record as Record<string, unknown>,
  };
}

function safeDate(value: string): Date | undefined {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
