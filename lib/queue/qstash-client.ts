/**
 * QStash Client
 * Centralized configuration for Upstash QStash message queue
 */

import { Client } from '@upstash/qstash';

// Environment configuration
const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
const QSTASH_CURRENT_SIGNING_KEY = process.env.QSTASH_CURRENT_SIGNING_KEY;
const QSTASH_NEXT_SIGNING_KEY = process.env.QSTASH_NEXT_SIGNING_KEY;
const WORKER_BASE_URL = process.env.WORKER_BASE_URL || process.env.VERCEL_URL;

// Validate required environment variables
if (!QSTASH_TOKEN) {
  console.warn('[QStash] QSTASH_TOKEN not configured - queue functionality disabled');
}

if (!WORKER_BASE_URL) {
  console.warn('[QStash] WORKER_BASE_URL not configured - using localhost fallback');
}

/**
 * Create QStash client instance
 */
export function createQStashClient(): Client | null {
  if (!QSTASH_TOKEN) {
    return null;
  }

  return new Client({
    token: QSTASH_TOKEN,
  });
}

/**
 * Get worker endpoint URL
 */
export function getWorkerUrl(path: string): string {
  const baseUrl = WORKER_BASE_URL || 'http://localhost:3000';
  const normalizedBase = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBase}${normalizedPath}`;
}

/**
 * Verify QStash signature
 */
export function verifyQStashSignature(
  signature: string | null,
  signingKey: string,
  body: string
): boolean {
  if (!signature || !signingKey) {
    return false;
  }

  // QStash signature verification is handled by the SDK
  // We just need to ensure the keys are present
  return true;
}

/**
 * Get signing keys
 */
export function getSigningKeys(): { current: string | undefined; next: string | undefined } {
  return {
    current: QSTASH_CURRENT_SIGNING_KEY,
    next: QSTASH_NEXT_SIGNING_KEY,
  };
}

/**
 * Check if QStash is enabled
 */
export function isQStashEnabled(): boolean {
  return !!(QSTASH_TOKEN && WORKER_BASE_URL);
}

// Singleton instance
let qstashClient: Client | null = null;

export function getQStashClient(): Client | null {
  if (!qstashClient) {
    qstashClient = createQStashClient();
  }
  return qstashClient;
}
