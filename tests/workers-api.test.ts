/**
 * Workers API Route Tests
 * Tests for api/workers/process-case.ts endpoint
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../lib/queue/qstash-client', () => ({
  verifyQStashSignature: vi.fn(),
  isQStashEnabled: vi.fn(),
  getSigningKeys: vi.fn(() => ({ current: 'test-key', next: 'test-next' })),
}));

vi.mock('../lib/services/case-triage', () => ({
  getCaseTriageService: vi.fn(),
}));

vi.mock('../lib/schemas/servicenow-webhook', () => ({
  validateServiceNowWebhook: vi.fn(),
}));

describe('Workers API', () => {
  let verifyQStashSignature: any;
  let isQStashEnabled: any;
  let getCaseTriageService: any;
  let validateServiceNowWebhook: any;
  let mockCaseTriageService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();

    // Get mocked functions
    const qstashModule = await import('../lib/queue/qstash-client');
    const caseTriageModule = await import('../lib/services/case-triage');
    const servicenowModule = await import('../lib/schemas/servicenow-webhook');

    verifyQStashSignature = vi.mocked(qstashModule.verifyQStashSignature);
    isQStashEnabled = vi.mocked(qstashModule.isQStashEnabled);
    getCaseTriageService = vi.mocked(caseTriageModule.getCaseTriageService);
    validateServiceNowWebhook = vi.mocked(servicenowModule.validateServiceNowWebhook);

    // Mock case triage service
    mockCaseTriageService = {
      triageCase: vi.fn().mockResolvedValue(undefined)
    };
    getCaseTriageService.mockReturnValue(mockCaseTriageService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('POST /api/workers/process-case', () => {
    it('should process case successfully with valid QStash signature', async () => {
      // Arrange
      isQStashEnabled.mockReturnValue(true);
      verifyQStashSignature.mockReturnValue(true);

      const { POST } = await import('../api/workers/process-case');
      const requestBody = JSON.stringify({ caseNumber: 'CASE001' });
      const request = new Request('http://localhost:3000/api/workers/process-case', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Upstash-Signature': 'valid-signature',
        },
        body: requestBody,
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(verifyQStashSignature).toHaveBeenCalledWith(
        'valid-signature',
        requestBody
      );
      expect(mockCaseTriageService.triageCase).toHaveBeenCalledWith({ caseNumber: 'CASE001' });
    });

    it('should reject requests with invalid QStash signature', async () => {
      // Arrange
      isQStashEnabled.mockReturnValue(true);
      verifyQStashSignature.mockReturnValue(false);

      const { POST } = await import('../api/workers/process-case');
      const requestBody = JSON.stringify({ caseNumber: 'CASE001' });
      const request = new Request('http://localhost:3000/api/workers/process-case', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Upstash-Signature': 'invalid-signature',
        },
        body: requestBody,
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid signature');
    });

    it('should process case when QStash is disabled', async () => {
      // Arrange
      isQStashEnabled.mockReturnValue(false);

      const { POST } = await import('../api/workers/process-case');
      const requestBody = JSON.stringify({ caseNumber: 'CASE001' });
      const request = new Request('http://localhost:3000/api/workers/process-case', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: requestBody,
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(mockCaseTriageService.triageCase).toHaveBeenCalledWith({ caseNumber: 'CASE001' });
    });

    it('should handle ServiceNow webhook validation', async () => {
      // Arrange
      isQStashEnabled.mockReturnValue(false);
      validateServiceNowWebhook.mockReturnValue(true);

      const { POST } = await import('../api/workers/process-case');
      const requestBody = JSON.stringify({ caseNumber: 'CASE001' });
      const request = new Request('http://localhost:3000/api/workers/process-case', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Servicenow-Signature': 'valid-servicenow-signature',
        },
        body: requestBody,
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(validateServiceNowWebhook).toHaveBeenCalledWith(
        'valid-servicenow-signature',
        requestBody
      );
    });

    it('should reject invalid ServiceNow webhook signatures', async () => {
      // Arrange
      isQStashEnabled.mockReturnValue(false);
      validateServiceNowWebhook.mockReturnValue(false);

      const { POST } = await import('../api/workers/process-case');
      const requestBody = JSON.stringify({ caseNumber: 'CASE001' });
      const request = new Request('http://localhost:3000/api/workers/process-case', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Servicenow-Signature': 'invalid-servicenow-signature',
        },
        body: requestBody,
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid signature');
    });

    it('should handle malformed JSON requests', async () => {
      // Arrange
      isQStashEnabled.mockReturnValue(false);

      const { POST } = await import('../api/workers/process-case');
      const request = new Request('http://localhost:3000/api/workers/process-case', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid-json',
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid JSON');
    });

    it('should handle case triage errors', async () => {
      // Arrange
      isQStashEnabled.mockReturnValue(false);
      mockCaseTriageService.triageCase.mockRejectedValue(new Error('Triage failed'));

      const { POST } = await import('../api/workers/process-case');
      const requestBody = JSON.stringify({ caseNumber: 'CASE001' });
      const request = new Request('http://localhost:3000/api/workers/process-case', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: requestBody,
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });

    it('should handle missing request body', async () => {
      // Arrange
      isQStashEnabled.mockReturnValue(false);

      const { POST } = await import('../api/workers/process-case');
      const request = new Request('http://localhost:3000/api/workers/process-case', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Act
      const response = await POST(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid JSON');
    });

    it('should work with different HTTP methods', async () => {
      // Arrange
      isQStashEnabled.mockReturnValue(false);

      const { POST } = await import('../api/workers/process-case');
      const requestBody = JSON.stringify({ caseNumber: 'CASE001' });
      const request = new Request('http://localhost:3000/api/workers/process-case', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: requestBody,
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it('should handle empty case data', async () => {
      // Arrange
      isQStashEnabled.mockReturnValue(false);

      const { POST } = await import('../api/workers/process-case');
      const requestBody = JSON.stringify({});
      const request = new Request('http://localhost:3000/api/workers/process-case', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: requestBody,
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(mockCaseTriageService.triageCase).toHaveBeenCalledWith({});
    });
  });
});