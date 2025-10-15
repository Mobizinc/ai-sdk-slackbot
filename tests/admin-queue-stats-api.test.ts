/**
 * Admin Queue Stats API Route Tests
 * Tests for api/admin/queue-stats.ts endpoint
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies with proper setup
vi.mock('../lib/db/repositories/case-classification-repository', () => ({
  getCaseClassificationRepository: vi.fn(),
}));

vi.mock('../lib/queue/qstash-client', () => ({
  isQStashEnabled: vi.fn(),
  getSigningKeys: vi.fn(() => ({ current: 'test-key', next: 'test-next' })),
}));

// Global mock repository that will be used in tests
let mockRepository: any;

describe('Admin Queue Stats API', () => {
  let getCaseClassificationRepository: any;
  let isQStashEnabled: any;
  let getSigningKeys: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Get mocked functions
    const repoModule = await import('../lib/db/repositories/case-classification-repository');
    const qstashModule = await import('../lib/queue/qstash-client');
    
    getCaseClassificationRepository = vi.mocked(repoModule.getCaseClassificationRepository);
    isQStashEnabled = vi.mocked(qstashModule.isQStashEnabled);
    getSigningKeys = vi.mocked(qstashModule.getSigningKeys);
    
    // Reset mock implementations to defaults
    mockRepository.getRecentClassifications.mockResolvedValue([]);
    mockRepository.getClassificationStats.mockResolvedValue({
      totalClassifications: 0,
      averageProcessingTime: 0,
      averageConfidence: 0,
      topWorkflows: [],
    });
    isQStashEnabled.mockReturnValue(true);
    getSigningKeys.mockReturnValue({ current: 'test-key', next: 'test-next' });
  });

  // Ensure mocks are reset after each test
  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('GET /api/admin/queue-stats', () => {
    it('should return queue statistics successfully', async () => {
      // Arrange
      const mockStats7d = {
        totalClassifications: 150,
        averageProcessingTime: 2500,
        averageConfidence: 0.85,
        topWorkflows: ['default', 'hr_redirect', 'incident_creation'],
      };

      const mockStats1d = {
        totalClassifications: 25,
        averageProcessingTime: 2200,
        averageConfidence: 0.88,
        topWorkflows: ['default'],
      };

      const mockRecentClassifications = [
        {
          caseNumber: 'CASE001',
          workflowId: 'default',
          processingTimeMs: 2000,
          confidenceScore: 0.9,
          createdAt: new Date('2024-01-15T10:00:00Z'),
        },
        {
          caseNumber: 'CASE002',
          workflowId: 'hr_redirect',
          processingTimeMs: 1500,
          confidenceScore: 0.95,
          createdAt: new Date('2024-01-15T09:30:00Z'),
        },
      ];

      mockRepository.getClassificationStats
        .mockResolvedValueOnce(mockStats7d)
        .mockResolvedValueOnce(mockStats1d);
      mockRepository.getRecentClassifications.mockResolvedValue(mockRecentClassifications);

      isQStashEnabled.mockReturnValue(true);
      getSigningKeys.mockReturnValue({
        current: 'current-key',
        next: 'next-key',
      });

      const { GET } = await import('../api/admin/queue-stats');
      const request = new Request('http://localhost:3000/api/admin/queue-stats');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data).toEqual({
        queue_config: {
          async_triage_enabled: true, // ENABLE_ASYNC_TRIAGE defaults to true
          qstash_enabled: true,
          qstash_configured: true,
          worker_url: 'localhost:3000',
        },
        stats_7d: {
          total_classifications: 150,
          average_processing_time_ms: 2500,
          average_confidence: 85, // Converted to percentage
          top_workflows: ['default', 'hr_redirect', 'incident_creation'],
        },
        stats_24h: {
          total_classifications: 25,
          average_processing_time_ms: 2200,
          average_confidence: 88, // Converted to percentage
        },
        recent_performance: {
          sample_size: 2,
          avg_processing_time_ms: 1750, // (2000 + 1500) / 2
          min_processing_time_ms: 1500,
          max_processing_time_ms: 2000,
          failure_count: 0, // No failures (processingTimeMs >= 0 and confidenceScore >= 0.3)
          failure_rate: 0,
        },
        recent_classifications: [
          {
            case_number: 'CASE001',
            workflow_id: 'default',
            processing_time_ms: 2000,
            confidence_score: 90, // Converted to percentage
            classified_at: '2024-01-15T10:00:00.000Z',
            age_minutes: expect.any(Number),
          },
          {
            case_number: 'CASE002',
            workflow_id: 'hr_redirect',
            processing_time_ms: 1500,
            confidence_score: 95, // Converted to percentage
            classified_at: '2024-01-15T09:30:00.000Z',
            age_minutes: expect.any(Number),
          },
        ],
        timestamp: expect.any(String),
      });
    });

    it('should handle authentication with ADMIN_API_KEY', async () => {
      // Arrange
      vi.stubEnv('ADMIN_API_KEY', 'secret-admin-key');

      mockRepository.getClassificationStats.mockResolvedValue({
        totalClassifications: 0,
        averageProcessingTime: 0,
        averageConfidence: 0,
        topWorkflows: [],
      });
      mockRepository.getRecentClassifications.mockResolvedValue([]);

      isQStashEnabled.mockReturnValue(false);
      getSigningKeys.mockReturnValue({ current: null, next: null });

      const { GET } = await import('../api/admin/queue-stats');
      const request = new Request('http://localhost:3000/api/admin/queue-stats', {
        headers: {
          'Authorization': 'Bearer secret-admin-key',
        },
      });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it('should reject requests without proper authentication when ADMIN_API_KEY is set', async () => {
      // Arrange
      vi.stubEnv('ADMIN_API_KEY', 'secret-admin-key');

      const { GET } = await import('../api/admin/queue-stats');
      const request = new Request('http://localhost:3000/api/admin/queue-stats');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    it('should reject requests with wrong authentication token', async () => {
      // Arrange
      vi.stubEnv('ADMIN_API_KEY', 'secret-admin-key');

      const { GET } = await import('../api/admin/queue-stats');
      const request = new Request('http://localhost:3000/api/admin/queue-stats', {
        headers: {
          'Authorization': 'Bearer wrong-token',
        },
      });

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(401);
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    it('should allow requests without auth when ADMIN_API_KEY is not set', async () => {
      // Arrange
      delete process.env.ADMIN_API_KEY;

      mockRepository.getClassificationStats.mockResolvedValue({
        totalClassifications: 0,
        averageProcessingTime: 0,
        averageConfidence: 0,
        topWorkflows: [],
      });
      mockRepository.getRecentClassifications.mockResolvedValue([]);

      isQStashEnabled.mockReturnValue(false);

      const { GET } = await import('../api/admin/queue-stats');
      const request = new Request('http://localhost:3000/api/admin/queue-stats');

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it('should handle empty recent classifications gracefully', async () => {
      // Arrange
      mockRepository.getClassificationStats
        .mockResolvedValueOnce({ totalClassifications: 0, averageProcessingTime: 0, averageConfidence: 0, topWorkflows: [] })
        .mockResolvedValueOnce({ totalClassifications: 0, averageProcessingTime: 0, averageConfidence: 0, topWorkflows: [] });
      mockRepository.getRecentClassifications.mockResolvedValue([]);

      isQStashEnabled.mockReturnValue(false);
      getSigningKeys.mockReturnValue({ current: null, next: null });

      const { GET } = await import('../api/admin/queue-stats');
      const request = new Request('http://localhost:3000/api/admin/queue-stats');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.recent_performance).toEqual({
        sample_size: 0,
        avg_processing_time_ms: 0,
        min_processing_time_ms: 0,
        max_processing_time_ms: 0,
        failure_count: 0,
        failure_rate: 0,
      });
      expect(data.recent_classifications).toEqual([]);
    });

    it('should calculate failure metrics correctly', async () => {
      // Arrange
      const mockRecentClassifications = [
        {
          caseNumber: 'CASE001',
          workflowId: 'default',
          processingTimeMs: 2000,
          confidenceScore: 0.9,
          createdAt: new Date(),
        },
        {
          caseNumber: 'CASE002',
          workflowId: 'default',
          processingTimeMs: -1, // Failure indicator
          confidenceScore: 0.8,
          createdAt: new Date(),
        },
        {
          caseNumber: 'CASE003',
          workflowId: 'default',
          processingTimeMs: 1500,
          confidenceScore: 0.2, // Low confidence failure
          createdAt: new Date(),
        },
        {
          caseNumber: 'CASE004',
          workflowId: 'default',
          processingTimeMs: 3000,
          confidenceScore: 0.95,
          createdAt: new Date(),
        },
      ];

      mockRepository.getClassificationStats.mockResolvedValue({
        totalClassifications: 10,
        averageProcessingTime: 2000,
        averageConfidence: 0.8,
        topWorkflows: [],
      });
      mockRepository.getRecentClassifications.mockResolvedValue(mockRecentClassifications);

      isQStashEnabled.mockReturnValue(false);
      getSigningKeys.mockReturnValue({ current: null, next: null });

      const { GET } = await import('../api/admin/queue-stats');
      const request = new Request('http://localhost:3000/api/admin/queue-stats');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.recent_performance).toEqual({
        sample_size: 4,
        avg_processing_time_ms: 1625, // (2000 + 1500 + 3000) / 3 (excluding -1)
        min_processing_time_ms: -1,
        max_processing_time_ms: 3000,
        failure_count: 2, // CASE002 and CASE003
        failure_rate: 50, // 2/4 * 100
      });
    });

    it('should detect VERCEL_URL correctly', async () => {
      // Arrange
      vi.stubEnv('VERCEL_URL', 'my-app.vercel.app');

      mockRepository.getClassificationStats.mockResolvedValue({
        totalClassifications: 0,
        averageProcessingTime: 0,
        averageConfidence: 0,
        topWorkflows: [],
      });
      mockRepository.getRecentClassifications.mockResolvedValue([]);

      isQStashEnabled.mockReturnValue(false);
      getSigningKeys.mockReturnValue({ current: null, next: null });

      const { GET } = await import('../api/admin/queue-stats');
      const request = new Request('http://localhost:3000/api/admin/queue-stats');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.queue_config.worker_url).toBe('my-app.vercel.app');
    });

    it('should handle ENABLE_ASYNC_TRIAGE disabled', async () => {
      // Arrange
      vi.stubEnv('ENABLE_ASYNC_TRIAGE', 'false');

      mockRepository.getClassificationStats.mockResolvedValue({
        totalClassifications: 0,
        averageProcessingTime: 0,
        averageConfidence: 0,
        topWorkflows: [],
      });
      mockRepository.getRecentClassifications.mockResolvedValue([]);

      isQStashEnabled.mockReturnValue(false);
      getSigningKeys.mockReturnValue({ current: null, next: null });

      const { GET } = await import('../api/admin/queue-stats');
      const request = new Request('http://localhost:3000/api/admin/queue-stats');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.queue_config.async_triage_enabled).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      mockRepository.getClassificationStats.mockRejectedValue(new Error('Database connection failed'));

      const { GET } = await import('../api/admin/queue-stats');
      const request = new Request('http://localhost:3000/api/admin/queue-stats');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: 'Internal server error',
        message: 'Database connection failed',
      });
    });

    it('should limit recent classifications to 5 items in response', async () => {
      // Arrange
      const mockRecentClassifications = Array.from({ length: 10 }, (_, i) => ({
        caseNumber: `CASE${String(i + 1).padStart(3, '0')}`,
        workflowId: 'default',
        processingTimeMs: 1000 + i * 100,
        confidenceScore: 0.8 + (i * 0.01),
        createdAt: new Date(Date.now() - i * 60000), // 1 minute apart
      }));

      mockRepository.getClassificationStats.mockResolvedValue({
        totalClassifications: 50,
        averageProcessingTime: 2000,
        averageConfidence: 0.85,
        topWorkflows: ['default'],
      });
      mockRepository.getRecentClassifications.mockResolvedValue(mockRecentClassifications);

      isQStashEnabled.mockReturnValue(false);
      getSigningKeys.mockReturnValue({ current: null, next: null });

      const { GET } = await import('../api/admin/queue-stats');
      const request = new Request('http://localhost:3000/api/admin/queue-stats');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.recent_classifications).toHaveLength(5);
      expect(data.recent_classifications[0].case_number).toBe('CASE001'); // Most recent first
    });

    it('should round numerical values appropriately', async () => {
      // Arrange
      mockRepository.getClassificationStats.mockResolvedValue({
        totalClassifications: 100,
        averageProcessingTime: 2345.67,
        averageConfidence: 0.8567,
        topWorkflows: ['default'],
      });
      mockRepository.getRecentClassifications.mockResolvedValue([]);

      isQStashEnabled.mockReturnValue(false);
      getSigningKeys.mockReturnValue({ current: null, next: null });

      const { GET } = await import('../api/admin/queue-stats');
      const request = new Request('http://localhost:3000/api/admin/queue-stats');

      // Act
      const response = await GET(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.stats_7d.average_processing_time_ms).toBe(2346); // Rounded
      expect(data.stats_7d.average_confidence).toBe(86); // Converted to percentage and rounded
    });
  });
});