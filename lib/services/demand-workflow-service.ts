import { config } from "../config";
import type { DemandRequest, FinalSummary } from "../strategy/types";

export interface DemandSchema {
  servicePillars: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  technologyPartners: string[];
  targetMarkets: Array<{
    id: string;
    industry: string;
    priority: "high" | "medium" | "low";
    description?: string;
  }>;
  companyMetrics?: {
    strategicPriorities?: string[];
  };
  promptTemplates?: Record<string, string>;
}

export interface WorkflowQuestion {
  id: string;
  text: string;
}

export interface WorkflowMetadata {
  analysis?: {
    score?: number;
    issues?: string[];
    highlights?: string[];
    recommendations?: string[];
  };
  conversation?: Array<{
    role: "assistant" | "user";
    content: string;
    timestamp?: string;
  }>;
  answeredQuestions?: Record<string, string>;
  [key: string]: unknown;
}

export interface WorkflowApiResponse {
  sessionId: string;
  status: "needs_clarification" | "complete" | "error";
  questions?: WorkflowQuestion[];
  summary?: FinalSummary | null;
  response?: string | null;
  metadata?: WorkflowMetadata;
  error?: {
    message: string;
    code?: string;
  } | null;
}

export type DemandRequestPayload = DemandRequest & {
  expectedROI: string;
  roiDetails?: string;
  timeline: string;
  resourcesNeeded: string;
  teamSize: number;
  targetIndustry?: string;
  partnerTechnologies?: string[];
  deliveryOptimization?: boolean;
};

const SCHEMA_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let cachedSchema:
  | {
      data: DemandSchema;
      expiresAt: number;
    }
  | null = null;

function getBaseUrl(): string {
  const baseUrl = config.demandApiBaseUrl?.trim();
  if (!baseUrl) {
    throw new Error("Demand API base URL is not configured. Set DEMAND_API_BASE_URL.");
  }
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function getApiKey(): string {
  const apiKey = config.demandApiKey?.trim();
  if (!apiKey) {
    throw new Error("Demand API key is not configured. Set DEMAND_API_KEY.");
  }
  return apiKey;
}

async function demandFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();
  const url = path.startsWith("http")
    ? path
    : `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    ...(init.headers as Record<string, string>),
  };

  if (!headers["content-type"] && init.body) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let errorMessage = `Demand API request failed (${response.status})`;
    try {
      const errorData = await response.json();
      if (typeof errorData?.error === "string") {
        errorMessage = errorData.error;
      } else if (typeof errorData?.message === "string") {
        errorMessage = errorData.message;
      }
    } catch {
      const text = await response.text();
      if (text) {
        errorMessage = text;
      }
    }
    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

export async function fetchDemandSchema(
  forceRefresh = false,
): Promise<DemandSchema> {
  if (
    !forceRefresh &&
    cachedSchema &&
    cachedSchema.expiresAt > Date.now()
  ) {
    return cachedSchema.data;
  }

  const data = await demandFetch<DemandSchema>("/api/demand/schema", {
    method: "GET",
  });

  cachedSchema = {
    data,
    expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS,
  };

  return data;
}

export async function analyzeDemandRequest(
  request: DemandRequestPayload,
): Promise<WorkflowApiResponse> {
  return demandFetch<WorkflowApiResponse>("/api/analyze", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function clarifyDemandRequest(
  payload: {
    sessionId: string;
    questionId?: string;
    answer: string;
  },
): Promise<WorkflowApiResponse> {
  return demandFetch<WorkflowApiResponse>("/api/clarify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function finalizeDemandRequest(
  sessionId: string,
): Promise<WorkflowApiResponse> {
  return demandFetch<WorkflowApiResponse>("/api/finalize", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}
