/**
 * ServiceNow Webhook Tests
 * Tests for the ServiceNow case triage webhook endpoint
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST, GET } from '../api/servicenow-webhook';
import { server } from './setup';
import { http } from 'msw';

// Mock the services
vi.mock('../lib/services/case-classifier');
vi.mock('../lib/services/business-context-service');
vi.mock('../lib/services/entity-extractor');
vi.mock('../lib/services/business-intelligence');
vi.mock('../lib/services/kb-article-search');
vi.mock('../lib/services/work-note-formatter');
vi.mock('../lib/services/azure-search');
vi.mock('../lib/tools/servicenow');

import { getCaseClassifier } from '../lib/services/case-classifier';
import { getBusinessContextService } from '../lib/services/business-context-service';
import { extractTechnicalEntities } from '../lib/services/entity-extractor';
import { analyzeBusinessIntelligence } from '../lib/services/business-intelligence';
import { searchKBArticles } from '../lib/services/kb-article-search';
import { formatWorkNote } from '../lib/services/work-note-formatter';
import { createAzureSearchService } from '../lib/services/azure-search';
import { serviceNowClient } from '../lib/tools/servicenow';

// Mock data
const mockCaseData = {
  case_number: 'CASE0010001',
  sys_id: 'sys123456789',
  short_description: 'User cannot access email',
  description: 'User reports unable to access Outlook email for the past 2 hours',
  priority: '2',
  urgency: 'High',
  state: 'New',
  assignment_group: 'IT Support',
  company: 'Acme Corp',
  company_name: 'Acme Corporation',
  current_category: 'Email Issue',
  sys_created_on: '2025-01-10T10:00:00Z',
  contact_type: 'Self-service',
  caller_id: 'user123',
};

const mockClassification = {
  category: 'Email & Collaboration',
  subcategory: 'Email Access Issue',
  confidence_score: 0.92,
  reasoning: 'User reports email access problems, clearly falls under Email & Collaboration category',
  keywords: ['email', 'outlook', 'access', 'unable'],
  quick_summary: 'User cannot access Outlook email for past 2 hours. Issue appears to be related to email authentication or connectivity. Requires immediate investigation.',
  immediate_next_steps: ['Check user account status', 'Verify email service health', 'Contact user for troubleshooting'],
  urgency_level: 'High',
};

const mockTechnicalEntities = {
  ip_addresses: [],
  systems: [],
  users: ['user123'],
  software: ['Outlook'],
  error_codes: [],
};

const mockBusinessIntelligence = {
  project_scope_detected: false,
  outside_service_hours: false,
  executive_visibility: false,
  compliance_impact: false,
  financial_impact: false,
};

const mockSimilarCases = [
  {
    case_number: 'CASE0009999',
    content: 'Outlook access denied',
    score: 0.85,
  },
];

const mockKBArticles = [
  {
    kb_number: 'KB0012345',
    title: 'How to troubleshoot Outlook access issues',
    similarity_score: 0.9,
    url: 'https://kb.example.com/outlook-troubleshoot',
  },
];

const mockWorkNote = 'AI Classification: Email & Collaboration - Email Access Issue (Confidence: 92%)';

describe('ServiceNow Webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mocks
    vi.mocked(getCaseClassifier).mockReturnValue({
      classifyCase: vi.fn().mockResolvedValue(mockClassification),
    } as any);

    vi.mocked(getBusinessContextService).mockReturnValue({
      getContextForCompany: vi.fn().mockResolvedValue({
        entityName: 'Acme Corporation',
        industry: 'Technology',
        criticality: 'High',
      }),
    } as any);

    vi.mocked(extractTechnicalEntities).mockReturnValue(mockTechnicalEntities);
    vi.mocked(analyzeBusinessIntelligence).mockResolvedValue(mockBusinessIntelligence);
    vi.mocked(searchKBArticles).mockResolvedValue(mockKBArticles);
    vi.mocked(formatWorkNote).mockReturnValue(mockWorkNote);

    vi.mocked(createAzureSearchService).mockReturnValue({
      searchSimilarCases: vi.fn().mockResolvedValue(mockSimilarCases),
    } as any);

    vi.mocked(serviceNowClient.isConfigured).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/servicenow-webhook', () => {
    it('should process a valid ServiceNow webhook request', async () => {
      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mockCaseData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.case_number).toBe('CASE0010001');
      expect(data.classification.category).toBe('Email & Collaboration');
      expect(data.classification.confidence_score).toBe(0.92);
      expect(data.servicenow_updated).toBe(true);
      expect(data.processing_time_ms).toBeGreaterThan(0);
    });

    it('should handle requests with missing optional fields', async () => {
      const minimalCaseData = {
        case_number: 'CASE0010002',
        sys_id: 'sys123456790',
        short_description: 'Password reset needed',
      };

      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(minimalCaseData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.case_number).toBe('CASE0010002');
      expect(data.classification).toBeDefined();
    });

    it('should return 400 for invalid request body', async () => {
      const invalidData = {
        case_number: 'CASE0010003',
        // Missing required sys_id and short_description
      };

      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request body');
      expect(data.details).toBeDefined();
    });

    it('should return 401 for invalid webhook signature when secret is configured', async () => {
      // Set webhook secret
      process.env.SERVICENOW_WEBHOOK_SECRET = 'test-secret';

      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Missing signature header
        },
        body: JSON.stringify(mockCaseData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid webhook signature');

      // Clean up
      delete process.env.SERVICENOW_WEBHOOK_SECRET;
    });

    it('should skip classification when disabled', async () => {
      process.env.ENABLE_CASE_CLASSIFICATION = 'false';

      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mockCaseData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.classification).toBeNull();
      expect(data.skipped).toBe(true);
      expect(data.reason).toBe('Classification disabled');

      // Clean up
      delete process.env.ENABLE_CASE_CLASSIFICATION;
    });

    it('should handle classification service errors gracefully', async () => {
      vi.mocked(getCaseClassifier).mockReturnValue({
        classifyCase: vi.fn().mockRejectedValue(new Error('AI service unavailable')),
      } as any);

      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mockCaseData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should use fallback classification
      expect(data.classification).toBeDefined();
      expect(data.classification.confidence_score).toBeLessThan(0.5);
    });

    it('should not write work notes when disabled', async () => {
      process.env.CASE_CLASSIFICATION_WRITE_NOTES = 'false';

      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mockCaseData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.servicenow_updated).toBe(false);

      // Clean up
      delete process.env.CASE_CLASSIFICATION_WRITE_NOTES;
    });

    it('should handle ServiceNow write errors gracefully', async () => {
      // Mock ServiceNow API failure
      server.use(
        http.patch('https://example.service-now.com/api/now/table/*', () => {
          return new Response(JSON.stringify({ error: 'ServiceNow API error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        })
      );

      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mockCaseData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.servicenow_updated).toBe(false);
      // Classification should still succeed
      expect(data.classification).toBeDefined();
    });

    it('should handle Azure Search errors gracefully', async () => {
      vi.mocked(createAzureSearchService).mockReturnValue({
        searchSimilarCases: vi.fn().mockRejectedValue(new Error('Azure Search unavailable')),
      } as any);

      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mockCaseData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.similar_cases).toEqual([]);
      // Other functionality should still work
      expect(data.classification).toBeDefined();
    });

    it('should handle KB search errors gracefully', async () => {
      vi.mocked(searchKBArticles).mockRejectedValue(new Error('KB search unavailable'));

      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mockCaseData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.kb_articles).toEqual([]);
      // Other functionality should still work
      expect(data.classification).toBeDefined();
    });

    it('should include all classification components in response', async () => {
      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mockCaseData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      
      // Check all components are included
      expect(data.classification.technical_entities).toEqual(mockTechnicalEntities);
      expect(data.classification.business_intelligence).toEqual(mockBusinessIntelligence);
      expect(data.similar_cases).toEqual(mockSimilarCases);
      expect(data.kb_articles).toEqual(mockKBArticles);
      
      // Check work note was formatted
      expect(formatWorkNote).toHaveBeenCalledWith({
        ...mockClassification,
        technical_entities: mockTechnicalEntities,
        business_intelligence: mockBusinessIntelligence,
        similar_cases: mockSimilarCases,
        kb_articles: mockKBArticles,
      });
    });

    it('should handle malformed JSON in request body', async () => {
      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });
  });

  describe('GET /api/servicenow-webhook', () => {
    it('should return health check information', async () => {
      const request = new Request('http://localhost:3000/api/servicenow-webhook');
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.service).toBe('ServiceNow Webhook');
      expect(data.version).toBe('1.0.0');
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('Webhook Signature Validation', () => {
    beforeEach(() => {
      process.env.SERVICENOW_WEBHOOK_SECRET = 'test-secret';
    });

    afterEach(() => {
      delete process.env.SERVICENOW_WEBHOOK_SECRET;
    });

    it('should accept requests with signature header', async () => {
      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-servicenow-signature': 'test-signature',
        },
        body: JSON.stringify(mockCaseData),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('should reject requests without signature header when secret is configured', async () => {
      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mockCaseData),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });
  });

  describe('ServiceNow Integration', () => {
    it('should use correct ServiceNow configuration', async () => {
      process.env.SERVICENOW_INSTANCE_URL = 'https://test.service-now.com';
      process.env.SERVICENOW_CASE_TABLE = 'custom_case_table';

      // Mock successful ServiceNow response
      server.use(
        http.patch('https://test.service-now.com/api/now/table/custom_case_table/*', () => {
          return new Response(JSON.stringify({ result: 'success' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        })
      );

      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mockCaseData),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Clean up
      delete process.env.SERVICENOW_INSTANCE_URL;
      delete process.env.SERVICENOW_CASE_TABLE;
    });

    it('should handle missing ServiceNow configuration', async () => {
      vi.mocked(serviceNowClient.isConfigured).mockReturnValue(false);

      const request = new Request('http://localhost:3000/api/servicenow-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mockCaseData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.servicenow_updated).toBe(false);
    });
  });
});