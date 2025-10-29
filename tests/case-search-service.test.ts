/**
 * Case Search Service Tests
 *
 * Unit tests for CaseSearchService covering:
 * - Filter combinations
 * - Sorting accuracy
 * - Pagination metadata
 * - Error handling
 * - Edge cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CaseSearchService } from '../lib/services/case-search-service';
import type { Case } from '../lib/infrastructure/servicenow/types/domain-models';

// Mock the repository
vi.mock('../lib/infrastructure/servicenow/repositories/factory', () => ({
  getCaseRepository: () => ({
    search: vi.fn(),
  }),
}));

describe('CaseSearchService', () => {
  let service: CaseSearchService;
  let mockRepository: any;

  const createMockCase = (overrides: Partial<Case> = {}): Case => ({
    sysId: 'sys123',
    number: 'CASE001',
    shortDescription: 'Test case',
    priority: '2',
    state: 'Open',
    openedAt: new Date('2025-01-01'),
    updatedOn: new Date('2025-01-15'),
    ageDays: 27,
    assignedTo: 'John Doe',
    assignmentGroup: 'IT Support',
    url: 'https://instance.service-now.com/case/sys123',
    ...overrides,
  });

  beforeEach(() => {
    service = new CaseSearchService();
    mockRepository = (service as any).caseRepository;
  });

  describe('searchWithMetadata', () => {
    it('should return results with pagination metadata', async () => {
      const mockCases = [
        createMockCase({ number: 'CASE001' }),
        createMockCase({ number: 'CASE002' }),
        createMockCase({ number: 'CASE003' }),
      ];

      mockRepository.search.mockResolvedValue(mockCases);

      const result = await service.searchWithMetadata({
        accountName: 'Altus',
        limit: 10,
        offset: 0,
      });

      expect(result.cases).toHaveLength(3);
      expect(result.totalFound).toBe(3);
      expect(result.hasMore).toBe(false);
      expect(result.nextOffset).toBeUndefined();
      expect(result.appliedFilters.accountName).toBe('Altus');
    });

    it('should indicate hasMore when hitting limit', async () => {
      const mockCases = Array.from({ length: 10 }, (_, i) =>
        createMockCase({ number: `CASE${String(i + 1).padStart(3, '0')}` })
      );

      mockRepository.search.mockResolvedValue(mockCases);

      const result = await service.searchWithMetadata({
        limit: 10,
      });

      expect(result.hasMore).toBe(true);
      expect(result.nextOffset).toBe(10);
    });

    it('should handle pagination offset correctly', async () => {
      const mockCases = [
        createMockCase({ number: 'CASE011' }),
        createMockCase({ number: 'CASE012' }),
      ];

      mockRepository.search.mockResolvedValue(mockCases);

      const result = await service.searchWithMetadata({
        limit: 10,
        offset: 10,
      });

      expect(result.totalFound).toBe(12); // offset + cases.length
      expect(result.cases).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });

    it('should apply default limit of 10', async () => {
      mockRepository.search.mockResolvedValue([]);

      await service.searchWithMetadata({});

      expect(mockRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 })
      );
    });

    it('should cap limit at 50', async () => {
      mockRepository.search.mockResolvedValue([]);

      await service.searchWithMetadata({ limit: 100 });

      expect(mockRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });

    it('should handle search errors gracefully', async () => {
      mockRepository.search.mockRejectedValue(new Error('ServiceNow unavailable'));

      const result = await service.searchWithMetadata({
        accountName: 'Altus',
      });

      expect(result.cases).toEqual([]);
      expect(result.totalFound).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should pass all filters to repository', async () => {
      mockRepository.search.mockResolvedValue([]);

      await service.searchWithMetadata({
        accountName: 'Altus',
        companyName: 'Altus Group',
        assignmentGroup: 'IT Support',
        assignedTo: 'John Doe',
        priority: '1',
        state: 'Open',
        query: 'email sync',
        openedAfter: '2025-01-01',
        openedBefore: '2025-01-31',
        updatedBefore: '2025-01-15',
        activeOnly: true,
        sortBy: 'opened_at',
        sortOrder: 'asc',
      });

      expect(mockRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          accountName: 'Altus',
          companyName: 'Altus Group',
          assignmentGroup: 'IT Support',
          assignedTo: 'John Doe',
          priority: '1',
          state: 'Open',
          query: 'email sync',
          openedAfter: expect.any(Date),
          openedBefore: expect.any(Date),
          updatedBefore: expect.any(Date),
          activeOnly: true,
          sortBy: 'opened_at',
          sortOrder: 'asc',
        })
      );
    });
  });

  describe('findStaleCases', () => {
    it('should find cases with no updates in 7 days', async () => {
      const staleCases = [
        createMockCase({
          number: 'CASE001',
          updatedOn: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        }),
        createMockCase({
          number: 'CASE002',
          updatedOn: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
        }),
      ];

      mockRepository.search.mockResolvedValue(staleCases);

      const result = await service.findStaleCases(7, 25);

      expect(result).toHaveLength(2);
      expect(mockRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          updatedBefore: expect.any(Date),
          activeOnly: true,
          sortBy: 'updated_on',
          sortOrder: 'asc',
          limit: 25,
        })
      );
    });

    it('should use custom stale threshold', async () => {
      mockRepository.search.mockResolvedValue([]);

      await service.findStaleCases(14, 25);

      const call = mockRepository.search.mock.calls[0][0];
      const updatedBefore = call.updatedBefore as Date;
      const expectedThreshold = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

      // Allow 1 second tolerance for test execution time
      expect(Math.abs(updatedBefore.getTime() - expectedThreshold.getTime())).toBeLessThan(1000);
    });
  });

  describe('findOldestCases', () => {
    it('should return oldest open cases', async () => {
      const oldestCases = [
        createMockCase({
          number: 'CASE001',
          openedAt: new Date('2024-01-01'),
          ageDays: 392,
        }),
        createMockCase({
          number: 'CASE002',
          openedAt: new Date('2024-06-01'),
          ageDays: 241,
        }),
      ];

      mockRepository.search.mockResolvedValue(oldestCases);

      const result = await service.findOldestCases(10);

      expect(result).toHaveLength(2);
      expect(mockRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          activeOnly: true,
          sortBy: 'opened_at',
          sortOrder: 'asc',
          limit: 10,
        })
      );
    });
  });

  describe('buildFilterSummary', () => {
    it('should build human-readable filter summary', () => {
      const summary = service.buildFilterSummary({
        accountName: 'Altus',
        assignmentGroup: 'IT Support',
        priority: '1',
        state: 'Open',
      });

      expect(summary).toContain('Customer: Altus');
      expect(summary).toContain('Queue: IT Support');
      expect(summary).toContain('Priority: 1');
      expect(summary).toContain('State: Open');
    });

    it('should handle empty filters', () => {
      const summary = service.buildFilterSummary({});

      expect(summary).toBe('No filters applied');
    });

    it('should format date filters', () => {
      const summary = service.buildFilterSummary({
        openedAfter: '2025-01-01',
        openedBefore: '2025-01-31',
      });

      expect(summary).toContain('Opened after:');
      expect(summary).toContain('Opened before:');
    });

    it('should handle keyword filter', () => {
      const summary = service.buildFilterSummary({
        query: 'email sync issue',
      });

      expect(summary).toContain('Keyword: "email sync issue"');
    });
  });

  describe('search (legacy method)', () => {
    it('should return cases array for backward compatibility', async () => {
      const mockCases = [
        createMockCase({ number: 'CASE001' }),
        createMockCase({ number: 'CASE002' }),
      ];

      mockRepository.search.mockResolvedValue(mockCases);

      const result = await service.search({ accountName: 'Altus' });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].number).toBe('CASE001');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty result set', async () => {
      mockRepository.search.mockResolvedValue([]);

      const result = await service.searchWithMetadata({
        accountName: 'NonexistentCustomer',
      });

      expect(result.cases).toEqual([]);
      expect(result.totalFound).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should handle invalid date strings gracefully', async () => {
      mockRepository.search.mockResolvedValue([]);

      await service.searchWithMetadata({
        openedAfter: 'invalid-date',
      });

      expect(mockRepository.search).toHaveBeenCalledWith(
        expect.objectContaining({
          openedAfter: undefined, // Invalid date should be undefined
        })
      );
    });

    it('should handle repository returning null/undefined', async () => {
      mockRepository.search.mockResolvedValue(null);

      const result = await service.searchWithMetadata({});

      // Should not crash, should return empty result
      expect(result.cases).toBeDefined();
    });
  });
});
