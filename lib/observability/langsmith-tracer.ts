/**
 * LangSmith Tracer Configuration
 *
 * Centralized LangSmith client initialization, configuration, and helpers.
 * Provides utilities for trace sanitization, sampling, and metadata management.
 */

import { Client } from "langsmith";
import { config } from "../config";

let langsmithClient: Client | null = null;

/**
 * Check if LangSmith tracing is enabled based on configuration
 */
export function isTracingEnabled(): boolean {
  const hasApiKey = !!(config.langsmithApiKey || process.env.LANGSMITH_API_KEY?.trim());
  const configAllowsTracing = config.langsmithTracingEnabled !== false;
  const envAllowsTracing = (process.env.LANGSMITH_TRACING ?? 'true').toLowerCase() === 'true';

  return hasApiKey && configAllowsTracing && envAllowsTracing;
}

/**
 * Get or create LangSmith client instance
 */
export function getLangSmithClient(): Client | null {
  if (!isTracingEnabled()) {
    return null;
  }

  if (!langsmithClient) {
    const apiKey = config.langsmithApiKey || process.env.LANGSMITH_API_KEY;
    const apiUrl = config.langsmithEndpoint || process.env.LANGSMITH_API_URL;
    const project = config.langsmithProject || process.env.LANGSMITH_PROJECT || 'default';

    if (!apiKey) {
      console.warn('[LangSmith] Tracing enabled but API key not found');
      return null;
    }

    try {
      langsmithClient = new Client({
        apiKey,
        apiUrl,
      });

      console.log(`[LangSmith] Client initialized for project: ${project}`);
    } catch (error) {
      console.error('[LangSmith] Failed to initialize client:', error);
      return null;
    }
  }

  return langsmithClient;
}

/**
 * Get LangSmith project name
 */
export function getLangSmithProject(): string {
  return config.langsmithProject || process.env.LANGSMITH_PROJECT || 'default';
}

/**
 * Sanitize sensitive data from trace inputs/outputs
 */
export function sanitizeForTracing(data: any): any {
  if (!data) return data;

  // If it's a primitive, return as-is
  if (typeof data !== 'object') return data;

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(sanitizeForTracing);
  }

  // Handle objects
  const sanitized: any = {};
  const sensitiveKeys = [
    'apiKey',
    'api_key',
    'password',
    'token',
    'secret',
    'auth',
    'authorization',
    'cookie',
    'session',
    'credentials',
  ];

  for (const [key, value] of Object.entries(data)) {
    const keyLower = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(sk => keyLower.includes(sk));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForTracing(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Create trace metadata with standard fields
 */
export interface TraceMetadata {
  channelId?: string;
  threadTs?: string;
  userId?: string;
  messageId?: string;
  caseNumber?: string;
  caseNumbers?: string[];
  requestId?: string;
  environment?: string;
  [key: string]: any;
}

export function createTraceMetadata(metadata: TraceMetadata): Record<string, any> {
  const baseMetadata: Record<string, any> = {
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  };

  // Add all provided metadata
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined && value !== null) {
      baseMetadata[key] = value;
    }
  }

  return sanitizeForTracing(baseMetadata);
}

/**
 * Create trace tags for filtering and searching
 */
export interface TraceTags {
  component?: string;
  operation?: string;
  service?: string;
  version?: string;
  [key: string]: string | undefined;
}

export function createTraceTags(tags: TraceTags): Record<string, string> {
  const baseTags: Record<string, string> = {
    service: 'slack-ai-agent',
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
  };

  // Add all provided tags
  for (const [key, value] of Object.entries(tags)) {
    if (value !== undefined && value !== null) {
      baseTags[key] = String(value);
    }
  }

  return baseTags;
}

/**
 * Should sample this trace (for high-volume scenarios)
 * Returns true if the trace should be recorded
 */
export function shouldSampleTrace(samplingRate: number = 1.0): boolean {
  if (samplingRate >= 1.0) return true;
  if (samplingRate <= 0) return false;

  return Math.random() < samplingRate;
}

/**
 * Generate a unique trace/run ID
 */
export function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Reset the client (for testing)
 */
export function __resetLangSmithClient(): void {
  langsmithClient = null;
}
