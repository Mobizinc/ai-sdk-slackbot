import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { NewCallInteraction } from "../db/schema";
import {
  createWebexClient,
  type WebexContactCenterClient,
  type WebexVoiceInteraction,
  type WebexCapture,
  WebexContactCenterError,
  type DownloadRecordingOptions as BaseDownloadOptions,
} from "../../packages/webex-contact-center";

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_URL_EXPIRATION_SECONDS = 3600;

// Lazy environment readers
const getWebexClientId = () => process.env.WEBEX_CC_CLIENT_ID;
const getWebexClientSecret = () => process.env.WEBEX_CC_CLIENT_SECRET;
const getWebexRefreshToken = () => process.env.WEBEX_CC_REFRESH_TOKEN;
const getWebexAccessToken = () => process.env.WEBEX_CC_ACCESS_TOKEN;
const getWebexBaseUrl = () =>
  (process.env.WEBEX_CC_BASE_URL || "https://webexapis.com/v1").replace(/\/$/, "");
const getWebexOrgId = () => process.env.WEBEX_CC_ORG_ID;
const getWebexInteractionPath = () =>
  process.env.WEBEX_CC_INTERACTION_PATH || "contactCenter/interactionHistory";
const getWebexCapturePath = () =>
  process.env.WEBEX_CC_CAPTURE_PATH || "contactCenter/captureManagement/captures";
const getWebexCaptureChunkSize = () => {
  const raw = process.env.WEBEX_CC_CAPTURE_CHUNK_SIZE;
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? undefined : parsed;
};

let clientSingleton: WebexContactCenterClient | null = null;

function getLogger() {
  return {
    info: (message: string) => console.log(message),
    warn: (message: string) => console.warn(message),
    error: (message: string) => console.error(message),
  };
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
  const direct = getWebexAccessToken();
  if (direct) return direct;
  return exchangeRefreshToken();
}

function getClient(): WebexContactCenterClient {
  if (!clientSingleton) {
    clientSingleton = createWebexClient({
      baseUrl: getWebexBaseUrl(),
      orgId: getWebexOrgId(),
      interactionPath: getWebexInteractionPath(),
      capturePath: getWebexCapturePath(),
      maxCaptureChunkSize: getWebexCaptureChunkSize(),
      getAccessToken,
      logger: getLogger(),
    });
  }
  return clientSingleton;
}

function toNewCallInteraction(record: WebexVoiceInteraction): NewCallInteraction {
  const startTime = record.startTime;
  const endTime = record.endTime;

  return {
    sessionId: record.sessionId,
    contactId: record.contactId,
    caseNumber: record.caseNumber,
    direction: record.direction,
    ani: record.ani,
    dnis: record.dnis,
    agentId: record.agentId,
    agentName: record.agentName,
    queueName: record.queueName,
    startTime,
    endTime,
    durationSeconds: record.durationSeconds,
    wrapUpCode: record.wrapUpCode,
    recordingId: record.recordingId,
    transcriptStatus: "pending",
    rawPayload: record.rawPayload,
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
  const client = getClient();
  const result = await client.fetchVoiceInteractions({
    startTime: params.startTime,
    endTime: params.endTime,
    pageSize: params.pageSize ?? DEFAULT_PAGE_SIZE,
  });

  return {
    interactions: result.interactions.map(toNewCallInteraction),
    latestEndTime: result.latestEndTime,
  };
}

export type { WebexCapture } from "../../packages/webex-contact-center";

export async function getCapturesByTaskIds(
  taskIds: string[],
  urlExpirationSeconds = DEFAULT_URL_EXPIRATION_SECONDS,
): Promise<WebexCapture[]> {
  const client = getClient();
  return client.getCapturesByTaskIds(taskIds, urlExpirationSeconds);
}

export interface RecordingDownloadOptions extends BaseDownloadOptions {
  /**
   * Progress callback invoked with the cumulative bytes written and optional total size.
   */
  onProgress?: (downloadedBytes: number, totalBytes?: number) => void;
}

export async function downloadRecording(
  url: string,
  destinationPath: string,
  options: RecordingDownloadOptions = {},
): Promise<number> {
  const client = getClient();
  const { response, contentLength } = await client.downloadRecording(url, options);

  if (!response.body) {
    throw new WebexContactCenterError("Recording download response did not include a body stream");
  }

  const totalBytes = contentLength;
  let downloadedBytes = 0;

  const progress = new Transform({
    transform(chunk, _encoding, callback) {
      downloadedBytes += chunk.length;
      options.onProgress?.(downloadedBytes, totalBytes);
      callback(null, chunk);
    },
  });

  const readable = Readable.fromWeb(response.body as unknown as ReadableStream<Uint8Array>);
  const outputStream = createWriteStream(destinationPath);

  await pipeline(readable, progress, outputStream);
  return downloadedBytes;
}

export const __private = {
  resetClient() {
    clientSingleton = null;
  },
};
