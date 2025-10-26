/**
 * ServiceNow HTTP Client
 *
 * Low-level HTTP client for ServiceNow REST API with:
 * - Authentication (Basic and Bearer token)
 * - Retry logic with exponential backoff
 * - Error handling and mapping
 * - Request/response logging
 */

import { Buffer } from "node:buffer";
import type { ServiceNowTableResponse } from "../types/api-responses";
import {
  ServiceNowError,
  ServiceNowConfigError,
  ServiceNowTimeoutError,
  parseServiceNowError,
} from "../errors";

export type ServiceNowAuthMode = "basic" | "token";

export interface ServiceNowClientConfig {
  instanceUrl: string;
  username?: string;
  password?: string;
  apiToken?: string;
  defaultTimeout?: number; // milliseconds
  maxRetries?: number;
  retryDelay?: number; // base delay in milliseconds
}

export interface RequestOptions extends RequestInit {
  timeout?: number;
  skipRetry?: boolean;
}

/**
 * Internal configuration with required properties
 */
interface InternalConfig {
  instanceUrl: string;
  username?: string;
  password?: string;
  apiToken?: string;
  defaultTimeout: number;
  maxRetries: number;
  retryDelay: number;
}

/**
 * ServiceNow HTTP Client
 * Handles low-level HTTP operations with retry, auth, and error handling
 */
export class ServiceNowHttpClient {
  private readonly config: InternalConfig;

  constructor(config: ServiceNowClientConfig) {
    // Validate config
    if (!config.instanceUrl) {
      throw new ServiceNowConfigError("ServiceNow instance URL is required");
    }

    const authMode = this.detectAuthMode(config);
    if (!authMode) {
      throw new ServiceNowConfigError(
        "ServiceNow credentials are required. Provide either username/password or apiToken",
      );
    }

    this.config = {
      instanceUrl: config.instanceUrl.replace(/\/$/, ""), // Remove trailing slash
      username: config.username,
      password: config.password,
      apiToken: config.apiToken,
      defaultTimeout: config.defaultTimeout ?? 30000, // 30 seconds
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000, // 1 second
    };
  }

  /**
   * Detect authentication mode from config
   */
  private detectAuthMode(config: ServiceNowClientConfig): ServiceNowAuthMode | null {
    if (config.username && config.password) {
      return "basic";
    }
    if (config.apiToken) {
      return "token";
    }
    return null;
  }

  /**
   * Build authentication headers
   */
  private buildAuthHeaders(): Record<string, string> {
    if (this.config.username && this.config.password) {
      const encoded = Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64");
      return {
        Authorization: `Basic ${encoded}`,
      };
    }

    if (this.config.apiToken) {
      return {
        Authorization: `Bearer ${this.config.apiToken}`,
      };
    }

    throw new ServiceNowConfigError("No valid authentication credentials found");
  }

  /**
   * Execute HTTP request with retry logic
   */
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = `${this.config.instanceUrl}${path}`;
    const timeout = options.timeout ?? this.config.defaultTimeout;
    const skipRetry = options.skipRetry ?? false;

    let lastError: Error | undefined;
    const maxAttempts = skipRetry ? 1 : this.config.maxRetries + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Add delay for retry attempts
        if (attempt > 0) {
          const delay = this.calculateRetryDelay(attempt);
          await this.sleep(delay);
        }

        const response = await this.executeRequest<T>(url, options, timeout);
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on certain error types
        if (
          error instanceof ServiceNowError &&
          !this.shouldRetry(error, attempt, maxAttempts)
        ) {
          throw error;
        }

        // Log retry attempt
        if (attempt < maxAttempts - 1) {
          console.error(
            `[ServiceNow HTTP] Request failed (attempt ${attempt + 1}/${maxAttempts}), retrying...`,
            {
              path,
              error: error instanceof Error ? error.message : String(error),
            },
          );
        }
      }
    }

    // All retries exhausted
    throw new ServiceNowError(
      `Request failed after ${maxAttempts} attempts: ${lastError?.message}`,
      undefined,
      path,
      lastError,
    );
  }

  /**
   * Execute a single HTTP request with timeout
   */
  private async executeRequest<T>(
    url: string,
    options: RequestOptions,
    timeout: number,
  ): Promise<T> {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...this.buildAuthHeaders(),
      ...(options.headers ?? {}),
    };

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle non-OK responses
      if (!response.ok) {
        const body = await response.text();
        throw parseServiceNowError(response, url, body);
      }

      // Parse and return JSON response
      const data = (await response.json()) as T;
      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort (timeout)
      if (error instanceof Error && error.name === "AbortError") {
        throw new ServiceNowTimeoutError(
          `Request timed out after ${timeout}ms`,
          url,
          error,
        );
      }

      // Re-throw ServiceNow errors
      if (error instanceof ServiceNowError) {
        throw error;
      }

      // Wrap other errors
      throw new ServiceNowError(
        `Request failed: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        url,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Determine if request should be retried based on error type
   */
  private shouldRetry(error: ServiceNowError, attempt: number, maxAttempts: number): boolean {
    // Don't retry if we've exhausted attempts
    if (attempt >= maxAttempts - 1) {
      return false;
    }

    // Retry on timeout, service unavailable, and rate limit errors
    if (
      error.name === "ServiceNowTimeoutError" ||
      error.name === "ServiceNowServiceUnavailableError" ||
      error.name === "ServiceNowRateLimitError"
    ) {
      return true;
    }

    // Retry on 5xx errors
    if (error.statusCode && error.statusCode >= 500) {
      return true;
    }

    // Don't retry on 4xx errors (client errors)
    return false;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff: delay * (2 ^ attempt) with jitter
    const exponentialDelay = this.config.retryDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    return exponentialDelay + jitter;
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * GET request
   */
  async get<T>(path: string, params?: Record<string, any>, options?: RequestOptions): Promise<ServiceNowTableResponse<T>> {
    const queryString = params ? this.buildQueryString(params) : "";
    const fullPath = queryString ? `${path}?${queryString}` : path;
    return this.request<ServiceNowTableResponse<T>>(fullPath, { ...options, method: "GET" });
  }

  /**
   * POST request
   */
  async post<T>(path: string, body: any, options?: RequestOptions): Promise<ServiceNowTableResponse<T>> {
    return this.request<ServiceNowTableResponse<T>>(path, {
      ...options,
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * PUT request
   */
  async put<T>(path: string, body: any, options?: RequestOptions): Promise<ServiceNowTableResponse<T>> {
    return this.request<ServiceNowTableResponse<T>>(path, {
      ...options,
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  /**
   * PATCH request
   */
  async patch<T>(path: string, body: any, options?: RequestOptions): Promise<ServiceNowTableResponse<T>> {
    return this.request<ServiceNowTableResponse<T>>(path, {
      ...options,
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  /**
   * DELETE request
   */
  async delete<T>(path: string, options?: RequestOptions): Promise<void> {
    await this.request<void>(path, { ...options, method: "DELETE" });
  }

  /**
   * Build query string from parameters
   */
  private buildQueryString(params: Record<string, any>): string {
    const entries = Object.entries(params)
      .filter(([_, value]) => value !== undefined && value !== null)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return value.map((v) => `${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`).join("&");
        }
        return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
      });
    return entries.join("&");
  }

  /**
   * Get instance URL (useful for building record URLs)
   */
  getInstanceUrl(): string {
    return this.config.instanceUrl;
  }
}
