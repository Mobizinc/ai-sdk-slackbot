/**
 * QStash Client Tests
 * Comprehensive test coverage for lib/queue/qstash-client.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the @upstash/qstash module
vi.mock('@upstash/qstash', () => ({
  Client: vi.fn().mockImplementation((config) => ({
    config: config,
    publish: vi.fn(),
    receive: vi.fn(),
    delete: vi.fn(),
  })),
}));

describe('QStash Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('createQStashClient', () => {
    it('should create client when QSTASH_TOKEN is configured', async () => {
      vi.stubEnv('QSTASH_TOKEN', 'test-token');
      
      const { createQStashClient } = await import('../lib/queue/qstash-client');
      const client = createQStashClient();
      
      expect(client).toBeDefined();
      expect(client).not.toBeNull();
    });

    it('should return null when QSTASH_TOKEN is not configured', async () => {
      const { createQStashClient } = await import('../lib/queue/qstash-client');
      const client = createQStashClient();
      
      expect(client).toBeNull();
    });

    it('should log warning when QSTASH_TOKEN is not configured', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Import fresh module to trigger the warning
      const { createQStashClient } = await import('../lib/queue/qstash-client');
      createQStashClient();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[QStash] QSTASH_TOKEN not configured - queue functionality disabled'
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('getWorkerUrl', () => {
    it('should construct URL with VERCEL_URL', async () => {
      vi.stubEnv('VERCEL_URL', 'my-app.vercel.app');
      
      const { getWorkerUrl } = await import('../lib/queue/qstash-client');
      const url = getWorkerUrl('/api/workers/process-case');
      
      expect(url).toBe('https://my-app.vercel.app/api/workers/process-case');
    });

    it('should handle VERCEL_URL with https prefix', async () => {
      vi.stubEnv('VERCEL_URL', 'https://my-app.vercel.app');
      
      const { getWorkerUrl } = await import('../lib/queue/qstash-client');
      const url = getWorkerUrl('/api/workers/process-case');
      
      expect(url).toBe('https://my-app.vercel.app/api/workers/process-case');
    });

    it('should use localhost when VERCEL_URL is not set', async () => {
      const { getWorkerUrl } = await import('../lib/queue/qstash-client');
      const url = getWorkerUrl('/api/workers/process-case');
      
      expect(url).toBe('https://localhost:3000/api/workers/process-case');
    });

    it('should handle path without leading slash', async () => {
      vi.stubEnv('VERCEL_URL', 'my-app.vercel.app');
      
      const { getWorkerUrl } = await import('../lib/queue/qstash-client');
      const url = getWorkerUrl('api/workers/process-case');
      
      expect(url).toBe('https://my-app.vercel.app/api/workers/process-case');
    });

    it('should handle empty path', async () => {
      vi.stubEnv('VERCEL_URL', 'my-app.vercel.app');
      
      const { getWorkerUrl } = await import('../lib/queue/qstash-client');
      const url = getWorkerUrl('');
      
      expect(url).toBe('https://my-app.vercel.app/');
    });

    it('should handle root path', async () => {
      vi.stubEnv('VERCEL_URL', 'my-app.vercel.app');
      
      const { getWorkerUrl } = await import('../lib/queue/qstash-client');
      const url = getWorkerUrl('/');
      
      expect(url).toBe('https://my-app.vercel.app/');
    });
  });

  describe('verifyQStashSignature', () => {
    it('should return true when signature and signing key are provided', async () => {
      const { verifyQStashSignature } = await import('../lib/queue/qstash-client');
      const result = verifyQStashSignature(
        'test-signature',
        'test-signing-key',
        'request-body'
      );
      
      expect(result).toBe(true);
    });

    it('should return false when signature is null', async () => {
      const { verifyQStashSignature } = await import('../lib/queue/qstash-client');
      const result = verifyQStashSignature(
        null,
        'test-signing-key',
        'request-body'
      );
      
      expect(result).toBe(false);
    });

    it('should return false when signature is empty', async () => {
      const { verifyQStashSignature } = await import('../lib/queue/qstash-client');
      const result = verifyQStashSignature(
        '',
        'test-signing-key',
        'request-body'
      );
      
      expect(result).toBe(false);
    });

    it('should return false when signing key is empty', async () => {
      const { verifyQStashSignature } = await import('../lib/queue/qstash-client');
      const result = verifyQStashSignature(
        'test-signature',
        '',
        'request-body'
      );
      
      expect(result).toBe(false);
    });

    it('should return false when both signature and signing key are missing', async () => {
      const { verifyQStashSignature } = await import('../lib/queue/qstash-client');
      const result = verifyQStashSignature(
        null,
        '',
        'request-body'
      );
      
      expect(result).toBe(false);
    });

    it('should work with different body contents', async () => {
      const { verifyQStashSignature } = await import('../lib/queue/qstash-client');
      const result1 = verifyQStashSignature(
        'test-signature',
        'test-signing-key',
        '{"test": "data"}'
      );
      
      const result2 = verifyQStashSignature(
        'test-signature',
        'test-signing-key',
        'different-body'
      );
      
      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });
  });

  describe('getSigningKeys', () => {
    it('should return both keys when configured', async () => {
      vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current-key');
      vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'next-key');
      
      const { getSigningKeys } = await import('../lib/queue/qstash-client');
      const keys = getSigningKeys();
      
      expect(keys).toEqual({
        current: 'current-key',
        next: 'next-key',
      });
    });

    it('should return undefined when keys are not configured', async () => {
      const { getSigningKeys } = await import('../lib/queue/qstash-client');
      const keys = getSigningKeys();
      
      expect(keys).toEqual({
        current: undefined,
        next: undefined,
      });
    });

    it('should return partial keys when only one is configured', async () => {
      vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current-key');
      
      const { getSigningKeys } = await import('../lib/queue/qstash-client');
      const keys = getSigningKeys();
      
      expect(keys).toEqual({
        current: 'current-key',
        next: undefined,
      });
    });
  });

  describe('isQStashEnabled', () => {
    it('should return true when QSTASH_TOKEN is configured', async () => {
      vi.stubEnv('QSTASH_TOKEN', 'test-token');
      
      const { isQStashEnabled } = await import('../lib/queue/qstash-client');
      const enabled = isQStashEnabled();
      
      expect(enabled).toBe(true);
    });

    it('should return false when QSTASH_TOKEN is not configured', async () => {
      const { isQStashEnabled } = await import('../lib/queue/qstash-client');
      const enabled = isQStashEnabled();
      
      expect(enabled).toBe(false);
    });

    it('should return false when QSTASH_TOKEN is empty', async () => {
      vi.stubEnv('QSTASH_TOKEN', '');
      
      const { isQStashEnabled } = await import('../lib/queue/qstash-client');
      const enabled = isQStashEnabled();
      
      expect(enabled).toBe(false);
    });
  });

  describe('getQStashClient (Singleton)', () => {
    it('should return null when QSTASH_TOKEN is not configured', async () => {
      const { getQStashClient } = await import('../lib/queue/qstash-client');
      const client = getQStashClient();
      
      expect(client).toBeNull();
    });

    it('should create client on first call when QSTASH_TOKEN is configured', async () => {
      vi.stubEnv('QSTASH_TOKEN', 'test-token');
      
      const { getQStashClient } = await import('../lib/queue/qstash-client');
      const client = getQStashClient();
      
      expect(client).toBeDefined();
      expect(client).not.toBeNull();
    });

    it('should return same instance on subsequent calls', async () => {
      vi.stubEnv('QSTASH_TOKEN', 'test-token');
      
      const { getQStashClient } = await import('../lib/queue/qstash-client');
      const client1 = getQStashClient();
      const client2 = getQStashClient();
      
      expect(client1).toBe(client2);
    });

    it('should not create new instance if already created', async () => {
      vi.stubEnv('QSTASH_TOKEN', 'test-token');
      
      const { getQStashClient } = await import('../lib/queue/qstash-client');
      const client1 = getQStashClient();
      
      // Change token after first creation
      vi.stubEnv('QSTASH_TOKEN', 'different-token');
      
      const client2 = getQStashClient();
      
      // Should still be the same instance
      expect(client1).toBe(client2);
      expect(client1).not.toBeNull();
    });

    it('should handle multiple calls without token', async () => {
      const { getQStashClient } = await import('../lib/queue/qstash-client');
      const client1 = getQStashClient();
      const client2 = getQStashClient();
      
      expect(client1).toBeNull();
      expect(client2).toBeNull();
      expect(client1).toBe(client2);
    });
  });

  describe('Integration scenarios', () => {
    it('should work together for complete QStash setup', async () => {
      vi.stubEnv('QSTASH_TOKEN', 'test-token');
      vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'current-key');
      vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'next-key');
      vi.stubEnv('VERCEL_URL', 'my-app.vercel.app');
      
      const {
        isQStashEnabled,
        getQStashClient,
        getWorkerUrl,
        getSigningKeys,
        verifyQStashSignature
      } = await import('../lib/queue/qstash-client');
      
      // Check if enabled
      expect(isQStashEnabled()).toBe(true);
      
      // Get client
      const client = getQStashClient();
      expect(client).toBeDefined();
      
      // Get worker URL
      const url = getWorkerUrl('/api/workers/test');
      expect(url).toBe('https://my-app.vercel.app/api/workers/test');
      
      // Get signing keys
      const keys = getSigningKeys();
      expect(keys).toEqual({
        current: 'current-key',
        next: 'next-key',
      });
      
      // Verify signature
      const isValid = verifyQStashSignature('signature', 'current-key', 'body');
      expect(isValid).toBe(true);
    });

    it('should handle disabled QStash gracefully', async () => {
      // No environment variables set
      const {
        isQStashEnabled,
        getQStashClient,
        getWorkerUrl,
        getSigningKeys,
        verifyQStashSignature
      } = await import('../lib/queue/qstash-client');
      
      expect(isQStashEnabled()).toBe(false);
      expect(getQStashClient()).toBeNull();
      
      const url = getWorkerUrl('/api/test');
      expect(url).toBe('https://localhost:3000/api/test');
      
      const keys = getSigningKeys();
      expect(keys).toEqual({
        current: undefined,
        next: undefined,
      });
      
      const isValid = verifyQStashSignature(null, '', 'body');
      expect(isValid).toBe(false);
    });
  });
});