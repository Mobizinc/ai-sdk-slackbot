/**
 * FortiManager Client
 * Central export for FortiManager HTTP client and session management
 */

export { FortiManagerHttpClient } from './http-client';
export type { FortiManagerClientConfig, RequestOptions } from './http-client';

export { FortiManagerSessionManager } from './session-manager';
export type { SessionCredentials, Session } from './session-manager';
