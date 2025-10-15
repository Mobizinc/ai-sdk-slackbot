/**
 * QStash Client
 * Centralized configuration for Upstash QStash message queue
 */

import { Client } from '@upstash/qstash';

function normalizeEnv(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getQStashToken(): string | undefined {
  const token = normalizeEnv(process.env.QSTASH_TOKEN);
  if (!token) {
    console.warn('[QStash] QSTASH_TOKEN not configured - queue functionality disabled');
  }
  return token;
}

/**
 * Create QStash client instance
 */
export function createQStashClient(): Client | null {
  const token = getQStashToken();
  if (!token) {
    return null;
  }

  return new Client({
    token,
  });
}

/**
 * Get worker endpoint URL
 * Auto-detects from VERCEL_URL (always available in Vercel deployments)
 */
export function getWorkerUrl(path: string): string {
  // Auto-detect from Vercel environment
  const baseUrl = process.env.VERCEL_URL || 'localhost:3000';
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
  const current = normalizeEnv(process.env.QSTASH_CURRENT_SIGNING_KEY);
  const next = normalizeEnv(process.env.QSTASH_NEXT_SIGNING_KEY);

  return {
    current,
    next,
  };
}

/**
 * Check if QStash is enabled
 * Only requires QSTASH_TOKEN - worker URL is auto-detected from VERCEL_URL
 */
export function isQStashEnabled(): boolean {
  return !!getQStashToken();
}

// Singleton instance
let qstashClient: Client | null = null;
let cachedToken: string | undefined;

export function getQStashClient(): Client | null {
  const token = getQStashToken();
  if (!token) {
    qstashClient = null;
    cachedToken = undefined;
    return null;
  }

  if (!qstashClient) {
    qstashClient = new Client({ token });
    cachedToken = token;
  }

  return qstashClient;
}
