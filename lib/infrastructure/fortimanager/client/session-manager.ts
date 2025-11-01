/**
 * FortiManager Session Manager
 *
 * Manages authentication sessions with FortiManager API
 * Handles login, logout, and session token management
 */

import type { LoginResponse } from '../types/api-responses';

export interface SessionCredentials {
  url: string;
  username: string;
  password: string;
}

export interface Session {
  token: string;
  expiresAt?: number;  // Optional expiration timestamp
  createdAt: number;
}

/**
 * FortiManager Session Manager
 * Handles session lifecycle for FortiManager JSON-RPC API
 */
export class FortiManagerSessionManager {
  private session: Session | null = null;
  private readonly credentials: SessionCredentials;
  private readonly baseUrl: string;

  constructor(credentials: SessionCredentials) {
    this.credentials = credentials;
    this.baseUrl = credentials.url.replace(/\/$/, ''); // Remove trailing slash
  }

  /**
   * Get current session token
   * Automatically logs in if no valid session exists
   */
  async getSessionToken(): Promise<string> {
    // Check if we have a valid session
    if (this.session && this.isSessionValid()) {
      return this.session.token;
    }

    // Login to get new session
    await this.login();

    if (!this.session) {
      throw new Error('Failed to establish FortiManager session');
    }

    return this.session.token;
  }

  /**
   * Login to FortiManager
   * Establishes a new session
   */
  async login(): Promise<void> {
    console.log(`Logging in to FortiManager: ${this.baseUrl}`);

    const loginPayload = {
      id: 1,
      method: 'exec',
      params: [{
        url: 'sys/login/user',  // No leading slash
        data: [{                 // Array format
          user: this.credentials.username,
          passwd: this.credentials.password
        }]
      }],
      session: null,
      verbose: 1
    };

    try {
      // Note: FortiManager often uses self-signed certificates
      // In Node.js, we need to use the https module with rejectUnauthorized: false
      const https = await import('https');
      const agent = new https.Agent({
        rejectUnauthorized: false // Accept self-signed certificates
      });

      const response = await fetch(`${this.baseUrl}/jsonrpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(loginPayload),
        // @ts-ignore - agent is valid for node-fetch
        agent
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: LoginResponse = await response.json();

      // Check for API-level errors
      if (data.result?.[0]?.status?.code !== 0) {
        const errorMsg = data.result?.[0]?.status?.message || 'Unknown error';
        const errorCode = data.result?.[0]?.status?.code;
        console.error(`FortiManager API error code: ${errorCode}`);
        throw new Error(`FortiManager login failed: ${errorMsg}`);
      }

      // Extract session token from Set-Cookie header or response
      const setCookieHeader = response.headers.get('set-cookie');
      let sessionToken: string | null = null;

      if (setCookieHeader) {
        // Parse session token from cookie
        const match = setCookieHeader.match(/ccsrftoken[^=]*=([^;]+)/i);
        if (match) {
          sessionToken = match[1];
        }
      }

      // If no token in cookie, check response body (some versions return it differently)
      if (!sessionToken && data.result?.[0]) {
        // Some FortiManager versions return session in result
        sessionToken = (data.result[0] as any).session || null;
      }

      if (!sessionToken) {
        throw new Error('No session token received from FortiManager');
      }

      // Store session
      this.session = {
        token: sessionToken,
        createdAt: Date.now()
      };

      console.log('✅ FortiManager login successful');
    } catch (error: any) {
      console.error('❌ FortiManager login failed:', error.message);
      console.error('Error details:', {
        code: error.code,
        cause: error.cause,
        type: error.constructor.name
      });
      throw new Error(`FortiManager login failed: ${error.message}${error.cause ? ` (${error.cause})` : ''}`);
    }
  }

  /**
   * Logout from FortiManager
   * Closes the current session
   */
  async logout(): Promise<void> {
    if (!this.session) {
      return; // No active session
    }

    console.log('Logging out from FortiManager...');

    const logoutPayload = {
      id: 1,
      method: 'exec',
      params: [{
        url: '/sys/logout'
      }],
      session: this.session.token
    };

    try {
      const https = await import('https');
      const agent = new https.Agent({
        rejectUnauthorized: false
      });

      await fetch(`${this.baseUrl}/jsonrpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(logoutPayload),
        // @ts-ignore
        agent
      });

      console.log('✅ FortiManager logout successful');
    } catch (error: any) {
      console.error('⚠️  FortiManager logout failed:', error.message);
      // Don't throw - logout is best effort
    } finally {
      this.session = null;
    }
  }

  /**
   * Check if current session is valid
   * Sessions typically expire after inactivity or have max lifetime
   */
  private isSessionValid(): boolean {
    if (!this.session) {
      return false;
    }

    // Check expiration if set
    if (this.session.expiresAt && Date.now() > this.session.expiresAt) {
      return false;
    }

    // Session is valid (or we assume it is until API tells us otherwise)
    return true;
  }

  /**
   * Clear current session
   * Used when session is known to be invalid
   */
  clearSession(): void {
    this.session = null;
  }

  /**
   * Get base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
}
