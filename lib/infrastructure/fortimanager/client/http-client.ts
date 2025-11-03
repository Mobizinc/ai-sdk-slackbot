/**
 * FortiManager HTTP Client
 *
 * Low-level HTTP client for FortiManager JSON-RPC API
 * Handles authentication, requests, retries, and error handling
 */

import { FortiManagerSessionManager, type SessionCredentials } from './session-manager';
import type { FortiManagerResponse, FortiManagerErrorResponse } from '../types/api-responses';

export interface FortiManagerClientConfig {
  url: string;
  username?: string;
  password?: string;
  apiKey?: string;           // API token for Bearer auth (FortiManager 7.2.2+)
  defaultTimeout?: number;   // milliseconds
  maxRetries?: number;
  retryDelay?: number;       // base delay in milliseconds
}

export interface RequestOptions {
  timeout?: number;
  skipRetry?: boolean;
}

/**
 * FortiManager HTTP Client
 * Handles low-level JSON-RPC operations with session management
 */
export class FortiManagerHttpClient {
  private readonly sessionManager: FortiManagerSessionManager | null = null;
  private readonly config: FortiManagerClientConfig & { defaultTimeout: number; maxRetries: number; retryDelay: number };
  private requestIdCounter = 0;
  private readonly useApiKey: boolean;

  constructor(config: FortiManagerClientConfig) {
    // Validate config
    if (!config.url) {
      throw new Error('FortiManager URL is required');
    }

    // Check authentication method
    this.useApiKey = !!config.apiKey;

    if (!this.useApiKey && (!config.username || !config.password)) {
      throw new Error('FortiManager credentials are required (apiKey OR username+password)');
    }

    // Initialize session manager only for username/password auth
    if (!this.useApiKey && config.username && config.password) {
      const sessionCredentials: SessionCredentials = {
        url: config.url,
        username: config.username,
        password: config.password
      };

      this.sessionManager = new FortiManagerSessionManager(sessionCredentials);
    }

    this.config = {
      url: config.url,
      apiKey: config.apiKey,
      username: config.username,
      password: config.password,
      defaultTimeout: config.defaultTimeout ?? 30000,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000
    };
  }

  /**
   * Make a GET request (retrieve data)
   * @param url - API endpoint path (e.g., "/dvmdb/device")
   * @param fields - Optional fields to retrieve
   * @param options - Optional request options
   */
  async get<T = any>(
    url: string,
    fields?: string[],
    options?: RequestOptions
  ): Promise<FortiManagerResponse<T>> {
    const params: any = { url };

    if (fields && fields.length > 0) {
      params.fields = fields;
    }

    return this.request<T>('get', params, options);
  }

  /**
   * Make a SET request (update data)
   * @param url - API endpoint path
   * @param data - Data to set
   * @param options - Optional request options
   */
  async set<T = any>(
    url: string,
    data: any,
    options?: RequestOptions
  ): Promise<FortiManagerResponse<T>> {
    return this.request<T>('set', { url, data }, options);
  }

  /**
   * Make an EXEC request (execute operation)
   * @param url - API endpoint path
   * @param data - Optional data for operation
   * @param options - Optional request options
   */
  async exec<T = any>(
    url: string,
    data?: any,
    options?: RequestOptions
  ): Promise<FortiManagerResponse<T>> {
    const params: any = { url };
    if (data) {
      params.data = data;
    }

    return this.request<T>('exec', params, options);
  }

  /**
   * Make a raw JSON-RPC request
   * @param method - JSON-RPC method (get, set, exec, update)
   * @param params - Request parameters
   * @param options - Optional request options
   */
  private async request<T = any>(
    method: string,
    params: any,
    options?: RequestOptions
  ): Promise<FortiManagerResponse<T>> {
    const maxRetries = options?.skipRetry ? 0 : this.config.maxRetries;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeRequest<T>(method, params, options);
      } catch (error: any) {
        lastError = error;

        // Check if error is retryable
        if (attempt < maxRetries && this.isRetryableError(error)) {
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          console.log(`⚠️  Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
          await this.sleep(delay);
          continue;
        }

        // Non-retryable error or max retries reached
        throw error;
      }
    }

    throw lastError || new Error('Request failed after all retries');
  }

  /**
   * Execute a single JSON-RPC request
   */
  private async executeRequest<T = any>(
    method: string,
    params: any,
    options?: RequestOptions
  ): Promise<FortiManagerResponse<T>> {
    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    let sessionToken: string | null = null;

    // Handle authentication
    if (this.useApiKey && this.config.apiKey) {
      // Use API token authentication (FortiManager 7.2.2+)
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    } else if (this.sessionManager) {
      // Use session-based authentication
      sessionToken = await this.sessionManager.getSessionToken();
    }

    // Build JSON-RPC request
    const requestId = ++this.requestIdCounter;
    const payload: any = {
      id: requestId,
      method,
      params: [params]
    };

    // Add session token if using session auth
    if (sessionToken) {
      payload.session = sessionToken;
    }

    // Execute HTTP request
    const timeout = options?.timeout ?? this.config.defaultTimeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Handle self-signed certificates (common with FortiManager)
      const https = await import('https');
      const agent = new https.Agent({
        rejectUnauthorized: false
      });

      const response = await fetch(`${this.config.url}/jsonrpc`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
        // @ts-ignore
        agent
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: FortiManagerResponse<T> = await response.json();

      // Check for API-level errors
      if (data.result?.[0]?.status?.code !== 0) {
        const errorMsg = data.result?.[0]?.status?.message || 'Unknown error';
        const errorCode = data.result?.[0]?.status?.code;

        // -11 = No permission for the resource (not session expired!)
        // -401 = Session expired/unauthorized
        if (errorCode === -401) {
          console.log('Session expired, clearing session...');
          if (this.sessionManager) {
            this.sessionManager.clearSession();
          }
          throw new Error(`Session expired: ${errorMsg}`);
        }

        throw new Error(`FortiManager API error (${errorCode}): ${errorMsg}`);
      }

      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }

      throw error;
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Network errors
    if (message.includes('network') || message.includes('timeout') || message.includes('econnrefused')) {
      return true;
    }

    // Session errors (will trigger re-login)
    if (message.includes('session expired') || message.includes('unauthorized')) {
      return true;
    }

    // HTTP 5xx errors
    if (message.includes('http 5')) {
      return true;
    }

    return false;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Logout and cleanup
   */
  async disconnect(): Promise<void> {
    if (this.sessionManager) {
      await this.sessionManager.logout();
    }
  }

  /**
   * Get base URL
   */
  getBaseUrl(): string {
    return this.config.url;
  }
}
