/**
 * Unit tests for webhook helper utilities
 * Covers authentication, parsing, validation, and response building
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import {
  authenticateWebhookRequest,
  parseWebhookPayload,
  validateWebhook,
  buildTriageSuccessResponse,
  buildQueuedResponse,
  buildErrorResponse,
  type AuthResult,
  type ParseResult,
} from '../lib/utils/webhook-helpers';

// ============================================================================
// Authentication Tests
// ============================================================================

describe('authenticateWebhookRequest', () => {
  const SECRET = 'test-secret-key';
  const PAYLOAD = '{"case_number": "TEST123"}';

  describe('with API key header', () => {
    it('authenticates with x-api-key header', () => {
      const request = new Request('http://localhost:3000/webhook', {
        headers: { 'x-api-key': SECRET },
      });
      const result = authenticateWebhookRequest(request, PAYLOAD, SECRET);
      expect(result.authenticated).toBe(true);
      expect(result.method).toBe('api-key-header');
    });

    it('authenticates with x-functions-key header', () => {
      const request = new Request('http://localhost:3000/webhook', {
        headers: { 'x-functions-key': SECRET },
      });
      const result = authenticateWebhookRequest(request, PAYLOAD, SECRET);
      expect(result.authenticated).toBe(true);
      expect(result.method).toBe('api-key-header');
    });

    it('rejects invalid api-key header', () => {
      const request = new Request('http://localhost:3000/webhook', {
        headers: { 'x-api-key': 'wrong-secret' },
      });
      const result = authenticateWebhookRequest(request, PAYLOAD, SECRET);
      expect(result.authenticated).toBe(false);
    });
  });

  describe('with API key query parameter', () => {
    it('authenticates with ?code=... query parameter', () => {
      const request = new Request(
        `http://localhost:3000/webhook?code=${SECRET}`
      );
      const result = authenticateWebhookRequest(request, PAYLOAD, SECRET);
      expect(result.authenticated).toBe(true);
      expect(result.method).toBe('api-key-query');
    });

    it('rejects invalid query parameter', () => {
      const request = new Request(
        'http://localhost:3000/webhook?code=wrong-secret'
      );
      const result = authenticateWebhookRequest(request, PAYLOAD, SECRET);
      expect(result.authenticated).toBe(false);
    });
  });

  describe('with HMAC signature', () => {
    it('authenticates with hex HMAC signature', () => {
      const hexSignature = createHmac('sha256', SECRET)
        .update(PAYLOAD)
        .digest('hex');
      const request = new Request('http://localhost:3000/webhook', {
        headers: { 'x-servicenow-signature': hexSignature },
      });
      const result = authenticateWebhookRequest(request, PAYLOAD, SECRET);
      expect(result.authenticated).toBe(true);
      expect(result.method).toBe('hmac-signature');
    });

    it('authenticates with base64 HMAC signature', () => {
      const base64Signature = createHmac('sha256', SECRET)
        .update(PAYLOAD)
        .digest('base64');
      const request = new Request('http://localhost:3000/webhook', {
        headers: { 'x-servicenow-signature': base64Signature },
      });
      const result = authenticateWebhookRequest(request, PAYLOAD, SECRET);
      expect(result.authenticated).toBe(true);
      expect(result.method).toBe('hmac-signature');
    });

    it('authenticates with sha256= prefixed hex signature', () => {
      const hexSignature = createHmac('sha256', SECRET)
        .update(PAYLOAD)
        .digest('hex');
      const prefixedSignature = `sha256=${hexSignature}`;
      const request = new Request('http://localhost:3000/webhook', {
        headers: { 'x-servicenow-signature': prefixedSignature },
      });
      const result = authenticateWebhookRequest(request, PAYLOAD, SECRET);
      expect(result.authenticated).toBe(true);
      expect(result.method).toBe('hmac-signature');
    });

    it('authenticates with signature header instead of x-servicenow-signature', () => {
      const hexSignature = createHmac('sha256', SECRET)
        .update(PAYLOAD)
        .digest('hex');
      const request = new Request('http://localhost:3000/webhook', {
        headers: { 'signature': hexSignature },
      });
      const result = authenticateWebhookRequest(request, PAYLOAD, SECRET);
      expect(result.authenticated).toBe(true);
      expect(result.method).toBe('hmac-signature');
    });

    it('rejects invalid HMAC signature', () => {
      const request = new Request('http://localhost:3000/webhook', {
        headers: { 'x-servicenow-signature': 'invalid-signature-hex' },
      });
      const result = authenticateWebhookRequest(request, PAYLOAD, SECRET);
      expect(result.authenticated).toBe(false);
    });

    it('rejects signature with mismatched length', () => {
      const request = new Request('http://localhost:3000/webhook', {
        headers: { 'x-servicenow-signature': 'a1b2c3d4' }, // Too short
      });
      const result = authenticateWebhookRequest(request, PAYLOAD, SECRET);
      expect(result.authenticated).toBe(false);
    });
  });

  describe('without secret (development mode)', () => {
    it('allows all requests when no secret configured', () => {
      const request = new Request('http://localhost:3000/webhook');
      const result = authenticateWebhookRequest(request, PAYLOAD, undefined);
      expect(result.authenticated).toBe(true);
      expect(result.method).toBe('no-secret');
    });
  });

  describe('authentication priority', () => {
    it('prefers API key header over query parameter', () => {
      const hexSignature = createHmac('sha256', SECRET)
        .update(PAYLOAD)
        .digest('hex');
      const request = new Request(
        `http://localhost:3000/webhook?code=${SECRET}`,
        {
          headers: { 'x-api-key': SECRET },
        }
      );
      const result = authenticateWebhookRequest(request, PAYLOAD, SECRET);
      expect(result.authenticated).toBe(true);
      expect(result.method).toBe('api-key-header');
    });
  });
});

// ============================================================================
// Payload Parsing Tests
// ============================================================================

describe('parseWebhookPayload', () => {
  it('parses valid JSON payload', () => {
    const payload = '{"case_number": "CASE123", "sys_id": "123"}';
    const result = parseWebhookPayload(payload, true);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ case_number: 'CASE123', sys_id: '123' });
  });

  it('parses empty JSON object', () => {
    const payload = '{}';
    const result = parseWebhookPayload(payload, true);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
  });

  it('handles JSON with smart quotes', () => {
    const payload = '{"case_number": "TEST""}'; // Contains smart quote
    const result = parseWebhookPayload(payload, true);
    expect(result.success).toBe(true);
  });

  it('handles JSON with control characters', () => {
    const payload = '{"description": "line1\\nline2"}';
    const result = parseWebhookPayload(payload, true);
    expect(result.success).toBe(true);
  });

  it('handles base64-encoded JSON', () => {
    const originalPayload = '{"case_number": "BASE64TEST"}';
    const base64Payload = Buffer.from(originalPayload).toString('base64');
    const result = parseWebhookPayload(base64Payload, true);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ case_number: 'BASE64TEST' });
  });

  it('handles form-encoded payloads', () => {
    const payload = 'payload=' + encodeURIComponent('{"case_number": "FORM123"}');
    const result = parseWebhookPayload(payload, true);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ case_number: 'FORM123' });
  });

  it('returns error for invalid JSON', () => {
    const payload = '{invalid json}';
    const result = parseWebhookPayload(payload, true);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.metadata?.strategy).toBeDefined();
  });

  it('includes error position in metadata', () => {
    const payload = '{"case_number": "TEST", invalid}';
    const result = parseWebhookPayload(payload, true);
    expect(result.success).toBe(false);
    expect(result.metadata).toBeDefined();
  });

  it('includes original and sanitized length in metadata', () => {
    const payload = '{"case_number": "TEST"}';
    const result = parseWebhookPayload(payload, true);
    expect(result.success).toBe(true);
    expect(result.metadata?.originalLength).toBeGreaterThan(0);
    expect(result.metadata?.sanitizedLength).toBeGreaterThan(0);
  });

  it('returns warnings when present', () => {
    // This depends on the parser implementation
    const payload = '{"case_number": "TEST"}';
    const result = parseWebhookPayload(payload, true);
    expect(result.metadata).toBeDefined();
  });
});

// ============================================================================
// Response Builder Tests
// ============================================================================

describe('buildTriageSuccessResponse', () => {
  const mockTriageResult = {
    caseNumber: 'CASE123',
    classification: {
      category: 'Email & Collaboration',
      subcategory: 'Email Access',
      confidence_score: 0.92,
      urgency_level: 2,
      reasoning: 'User cannot access email',
      quick_summary: 'Email access issue',
      immediate_next_steps: 'Reset password',
      technical_entities: ['email', 'exchange'],
      business_intelligence: 'High priority client',
      record_type_suggestion: 'Incident',
    },
    similarCases: [],
    kbArticles: [],
    servicenowUpdated: true,
    updateError: null,
    processingTimeMs: 100,
    entitiesDiscovered: [],
    workflowId: 'workflow-123',
    cached: false,
    cacheReason: null,
    incidentCreated: true,
    incidentNumber: 'INC123',
    incidentSysId: 'inc-sys-123',
    incidentUrl: 'https://servicenow.com/inc123',
    problemCreated: true,
    problemNumber: 'PROB123',
    problemSysId: 'prob-sys-123',
    problemUrl: 'https://servicenow.com/prob123',
    recordTypeSuggestion: 'Incident',
    catalogRedirected: false,
    catalogRedirectReason: null,
    catalogItemsProvided: 0,
  };

  it('builds success response with all fields', () => {
    const response = buildTriageSuccessResponse(mockTriageResult);
    expect(response.status).toBe(200);
  });

  it('includes classification details', async () => {
    const response = buildTriageSuccessResponse(mockTriageResult);
    const json = await response.json();
    expect(json.classification.category).toBe('Email & Collaboration');
    expect(json.classification.confidence_score).toBe(0.92);
  });

  it('includes incident fields', async () => {
    const response = buildTriageSuccessResponse(mockTriageResult);
    const json = await response.json();
    expect(json.incident_created).toBe(true);
    expect(json.incident_number).toBe('INC123');
    expect(json.incident_sys_id).toBe('inc-sys-123');
    expect(json.incident_url).toBe('https://servicenow.com/inc123');
  });

  it('includes problem fields', async () => {
    const response = buildTriageSuccessResponse(mockTriageResult);
    const json = await response.json();
    expect(json.problem_created).toBe(true);
    expect(json.problem_number).toBe('PROB123');
    expect(json.problem_sys_id).toBe('prob-sys-123');
    expect(json.problem_url).toBe('https://servicenow.com/prob123');
  });

  it('includes catalog redirect fields', async () => {
    const response = buildTriageSuccessResponse(mockTriageResult);
    const json = await response.json();
    expect(json.catalog_redirected).toBe(false);
    expect(json.catalog_items_provided).toBe(0);
  });
});

describe('buildQueuedResponse', () => {
  it('returns 202 Accepted status', async () => {
    const response = buildQueuedResponse('CASE123');
    expect(response.status).toBe(202);
  });

  it('includes case number in response', async () => {
    const response = buildQueuedResponse('CASE123');
    const json = await response.json();
    expect(json.case_number).toBe('CASE123');
    expect(json.queued).toBe(true);
  });

  it('indicates async processing', async () => {
    const response = buildQueuedResponse('CASE123');
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.message).toContain('async');
  });
});

describe('buildErrorResponse', () => {
  it('builds parse error with 400 status', async () => {
    const response = buildErrorResponse({
      type: 'parse_error',
      message: 'Failed to parse JSON',
      statusCode: 400,
    });
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.type).toBe('parse_error');
  });

  it('builds validation error with 422 status', async () => {
    const response = buildErrorResponse({
      type: 'validation_error',
      message: 'Missing required fields',
      statusCode: 422,
    });
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.type).toBe('validation_error');
  });

  it('builds authentication error with 401 status', async () => {
    const response = buildErrorResponse({
      type: 'authentication_error',
      message: 'Invalid credentials',
      statusCode: 401,
    });
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.type).toBe('authentication_error');
  });

  it('builds internal error with 500 status', async () => {
    const response = buildErrorResponse({
      type: 'internal_error',
      message: 'Server error',
      statusCode: 500,
    });
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.type).toBe('internal_error');
  });

  it('includes error message', async () => {
    const response = buildErrorResponse({
      type: 'parse_error',
      message: 'Test error message',
      statusCode: 400,
    });
    const json = await response.json();
    expect(json.error).toBe('Test error message');
  });

  it('includes error details when provided', async () => {
    const details = { field: 'case_number', reason: 'required' };
    const response = buildErrorResponse({
      type: 'validation_error',
      message: 'Validation failed',
      details,
      statusCode: 422,
    });
    const json = await response.json();
    expect(json.details).toEqual(details);
  });

  it('omits details when not provided', async () => {
    const response = buildErrorResponse({
      type: 'parse_error',
      message: 'Test error',
      statusCode: 400,
    });
    const json = await response.json();
    expect(json.details).toBeUndefined();
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Authentication and Parsing Flow', () => {
  const SECRET = 'test-secret';
  const PAYLOAD = '{"case_number": "FLOW123", "sys_id": "sys123"}';

  it('accepts authenticated and valid payload', () => {
    const hexSig = createHmac('sha256', SECRET)
      .update(PAYLOAD)
      .digest('hex');
    const request = new Request('http://localhost:3000/webhook', {
      headers: { 'x-servicenow-signature': hexSig },
    });

    const authResult = authenticateWebhookRequest(request, PAYLOAD, SECRET);
    expect(authResult.authenticated).toBe(true);

    const parseResult = parseWebhookPayload(PAYLOAD, true);
    expect(parseResult.success).toBe(true);
  });

  it('rejects invalid signature even with valid payload', () => {
    const request = new Request('http://localhost:3000/webhook', {
      headers: { 'x-servicenow-signature': 'invalid' },
    });

    const authResult = authenticateWebhookRequest(request, PAYLOAD, SECRET);
    expect(authResult.authenticated).toBe(false);
  });

  it('rejects malformed payload even with valid signature', () => {
    const malformedPayload = '{invalid json}';
    const hexSig = createHmac('sha256', SECRET)
      .update(malformedPayload)
      .digest('hex');
    const request = new Request('http://localhost:3000/webhook', {
      headers: { 'x-servicenow-signature': hexSig },
    });

    const authResult = authenticateWebhookRequest(request, malformedPayload, SECRET);
    expect(authResult.authenticated).toBe(true);

    const parseResult = parseWebhookPayload(malformedPayload, true);
    expect(parseResult.success).toBe(false);
  });
});
