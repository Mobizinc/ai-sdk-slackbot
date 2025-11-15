/**
 * Smoke tests for Agent Pipeline
 * Tests lib/agent/generateResponse with mocked dependencies
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateResponse } from '../../lib/agent';
import type { ChatMessage } from '../../lib/services/anthropic-chat';
import {
  setupSmokeTestEnvironment,
  mockAnthropicService,
  mockServiceNowClient,
  mockGlobalFetch,
} from './helpers';

describe('smoke: agent pipeline', () => {
  let fetchMock: ReturnType<typeof mockGlobalFetch>;

  beforeEach(() => {
    setupSmokeTestEnvironment();
    fetchMock = mockGlobalFetch();
    mockAnthropicService();
    mockServiceNowClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    fetchMock.restore();
    vi.restoreAllMocks();
  });

  describe('basic response generation', () => {
    it('should generate response for simple case query', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'Summarize case SCS0048402',
        },
      ];

      const response = await generateResponse(messages);
      
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
      expect(response).toContain('Response to: Summarize case SCS0048402');
    });

    it('should handle empty message array', async () => {
      const messages: ChatMessage[] = [];

      const response = await generateResponse(messages);
      
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });

    it('should handle multi-message conversation', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'Hello',
        },
        {
          role: 'assistant',
          content: 'Hi there! How can I help you?',
        },
        {
          role: 'user',
          content: 'Can you help with case SCS0048402?',
        },
      ];

      const response = await generateResponse(messages);
      
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });
  });

  describe('case number handling', () => {
    it('should extract and handle case numbers from messages', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'What is the status of SCS0048402 and SCS0048403?',
        },
      ];

      const response = await generateResponse(messages);
      
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
      // Should mention case processing
      expect(response).toContain('Response to:');
    });

    it('should handle messages without case numbers', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'What is the weather today?',
        },
      ];

      const response = await generateResponse(messages);
      
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });
  });

  describe('tool integration', () => {
    it('should handle messages that might trigger tools', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'Search for similar cases to SCS0048402',
        },
      ];

      const response = await generateResponse(messages);
      
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });

    it('should handle knowledge base queries', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'Find knowledge base articles about VPN connectivity',
        },
      ];

      const response = await generateResponse(messages);
      
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });
  });

  describe('error handling and resilience', () => {
    it('should handle malformed message content gracefully', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: '',
        },
      ];

      const response = await generateResponse(messages);
      
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });

    it('should handle very long messages', async () => {
      const longContent = 'A'.repeat(10000);
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: longContent,
        },
      ];

      const response = await generateResponse(messages);
      
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });

    it('should handle special characters in messages', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'Case SCS0048402 has special chars: !@#$%^&*()_+-=[]{}|;:,.<>?',
        },
      ];

      const response = await generateResponse(messages);
      
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });
  });

  describe('orchestrator integration', () => {
    it('should use the orchestrator for response generation', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'Test message for orchestrator',
        },
      ];

      const response = await generateResponse(messages);
      
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });

    it('should handle orchestrator initialization', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'First message',
        },
      ];

      const response = await generateResponse(messages);
      
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });
  });

  describe('context and options', () => {
    it('should handle updateStatus callback', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'Test with status callback',
        },
      ];

      const mockUpdateStatus = vi.fn();
      const response = await generateResponse(messages, mockUpdateStatus);
      
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });

    it('should handle options parameter', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'Test with options',
        },
      ];

      const options = {
        channelId: 'C123456',
        channelName: 'test-channel',
        threadTs: '1234567890.123456',
      };

      const response = await generateResponse(messages, undefined, options);
      
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });

    it('should handle legacy dependencies parameter', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'Test with legacy deps',
        },
      ];

      const mockDeps = {
        // Mock legacy dependencies
      };

      const response = await generateResponse(messages, undefined, undefined, mockDeps);
      
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });
  });

  describe('performance and reliability', () => {
    it('should complete response generation within reasonable time', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'Quick test message',
        },
      ];

      const startTime = Date.now();
      const response = await generateResponse(messages);
      const endTime = Date.now();
      
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle concurrent requests', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'Concurrent test message',
        },
      ];

      const promises = Array.from({ length: 3 }, () => generateResponse(messages));
      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(typeof response).toBe('string');
        expect(response.length).toBeGreaterThan(0);
      });
    });
  });
});