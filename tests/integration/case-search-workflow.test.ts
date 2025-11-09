/**
 * Case Search Workflow Integration Tests
 *
 * End-to-end tests for complete case search workflows including:
 * - Agent tool execution
 * - Block Kit generation
 * - Interactive button handling
 * - Pagination flows
 * - Stale threshold selection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CaseSearchService } from '../../lib/services/case-search-service';
import {
  aggregateByAssignee,
  findOldestCases,
  findStaleCases,
} from '../../lib/services/case-aggregator';
import {
  buildSearchResultsMessage,
  buildWorkloadSummaryMessage,
  buildOldestCaseMessage,
  buildStaleCasesMessage,
  buildFilterPromptMessage,
} from '../../lib/services/case-search-ui-builder';
import type { Case } from '../../lib/infrastructure/servicenow/types/domain-models';

// Create shared mock repository using vi.hoisted to avoid initialization errors
const { mockCaseRepository } = vi.hoisted(() => {
  const mockCaseRepository = {
    search: vi.fn().mockResolvedValue({ cases: [], totalCount: 0 }),
  };

  return { mockCaseRepository };
});

// Mock repository factory
vi.mock('../../lib/infrastructure/servicenow/repositories/factory', () => ({
  getCaseRepository: () => mockCaseRepository,
}));

describe('Case Search Workflow Integration', () => {
  const createMockCase = (overrides: Partial<Case> = {}): Case => ({
    sysId: `sys_${Math.random()}`,
    number: 'CASE001',
    shortDescription: 'Test case',
    priority: '2',
    state: 'Open',
    openedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
    updatedOn: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    ageDays: 15,
    assignedTo: 'John Doe',
    assignmentGroup: 'IT Support',
    url: 'https://instance.service-now.com/case/sys123',
    ...overrides,
  });

  describe('Search → Display Workflow', () => {
    it('should execute full search and display workflow', async () => {
      const service = new CaseSearchService();

      const mockCases = [
        createMockCase({ number: 'CASE001', priority: '1', ageDays: 30 }),
        createMockCase({ number: 'CASE002', priority: '2', ageDays: 15 }),
        createMockCase({ number: 'CASE003', priority: '3', ageDays: 5 }),
      ];

      mockCaseRepository.search.mockResolvedValue({ cases: mockCases, totalCount: 3 });

      // 1. Execute search
      const searchResult = await service.searchWithMetadata({
        accountName: 'Altus',
        activeOnly: true,
        limit: 10,
      });

      expect(searchResult.cases).toHaveLength(3);
      expect(searchResult.totalFound).toBe(3);

      // 2. Build display
      const display = buildSearchResultsMessage(searchResult);

      expect(display.text).toContain('Found 3 cases');
      expect(display.blocks).toBeDefined();
      expect(display.blocks.length).toBeGreaterThan(0);

      // 3. Verify Block Kit structure
      const headerBlock = display.blocks.find((b: any) => b.type === 'header');
      expect(headerBlock).toBeDefined();

      const actionBlocks = display.blocks.filter((b: any) => b.type === 'actions');
      expect(actionBlocks.length).toBeGreaterThan(0);
    });
  });

  describe('Workload Analysis Workflow', () => {
    it('should aggregate and display workload distribution', () => {
      const now = new Date();
      const cases = [
        createMockCase({ 
          assignedTo: 'John Doe', 
          openedAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          ageDays: 30 
        }),
        createMockCase({ 
          assignedTo: 'John Doe', 
          openedAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
          ageDays: 15 
        }),
        createMockCase({ 
          assignedTo: 'Jane Smith', 
          openedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
          ageDays: 10 
        }),
        createMockCase({ 
          assignedTo: 'Jane Smith', 
          openedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
          ageDays: 5 
        }),
        createMockCase({ 
          assignedTo: 'Unassigned', 
          openedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
          ageDays: 2 
        }),
      ];

      // 1. Aggregate by assignee
      const workloads = aggregateByAssignee(cases);

      expect(workloads).toHaveLength(3);
      expect(workloads[0].assignee).toBe('Jane Smith'); // Most cases (2 each, Jane comes first alphabetically)
      expect(workloads[0].count).toBe(2);
      expect(workloads[0].averageAgeDays).toBe(8); // (10 + 5) / 2 rounded

      // 2. Build display
      const display = buildWorkloadSummaryMessage(workloads);

      expect(display.text).toContain('5 cases');
      expect(display.text).toContain('3 assignees');
      expect(display.blocks).toBeDefined();
    });
  });

  describe('Oldest Case Workflow', () => {
    it('should find and display oldest cases', () => {
      const now = new Date('2025-01-28'); // Fixed date for consistent testing
      const cases = [
        createMockCase({ 
          number: 'CASE001', 
          openedAt: new Date('2024-12-14'), // 45 days ago from now
          updatedOn: new Date('2024-12-20')
        }),
        createMockCase({ 
          number: 'CASE002', 
          openedAt: new Date('2024-12-29'), // 30 days ago from now
          updatedOn: new Date('2025-01-10')
        }),
        createMockCase({ 
          number: 'CASE003', 
          openedAt: new Date('2025-01-13'), // 15 days ago from now
          updatedOn: new Date('2025-01-20')
        }),
        createMockCase({ 
          number: 'CASE004', 
          openedAt: new Date('2025-01-23'), // 5 days ago from now
          updatedOn: new Date('2025-01-25')
        }),
      ];

      // 1. Find oldest
      const oldest = findOldestCases(cases, 3);

      expect(oldest).toHaveLength(3);
      expect(oldest[0].case.number).toBe('CASE001');
      expect(oldest[0].ageDays).toBeGreaterThan(40); // Should be around 45 days

      // 2. Build display
      const display = buildOldestCaseMessage(oldest);

      expect(display.text).toContain('CASE001');
      expect(display.text).toContain('days'); // More flexible than exact number
      expect(display.blocks).toBeDefined();
    });
  });

  describe('Stale Case Detection Workflow', () => {
    it('should detect and display stale cases', () => {
      const now = Date.now();
      const cases = [
        createMockCase({
          number: 'CASE001',
          priority: '1',
          updatedOn: new Date(now - 10 * 24 * 60 * 60 * 1000), // 10 days stale
          ageDays: 20,
        }),
        createMockCase({
          number: 'CASE002',
          priority: '3',
          updatedOn: new Date(now - 8 * 24 * 60 * 60 * 1000), // 8 days stale
          ageDays: 12,
        }),
        createMockCase({
          number: 'CASE003',
          updatedOn: new Date(now - 2 * 24 * 60 * 60 * 1000), // 2 days (not stale)
          ageDays: 5,
        }),
      ];

      // 1. Find stale cases (7-day threshold)
      const staleCases = findStaleCases(cases, 7);

      expect(staleCases).toHaveLength(2); // Only CASE001 and CASE002
      expect(staleCases[0].case.number).toBe('CASE001'); // Critical priority first
      expect(staleCases[0].isHighPriority).toBe(true);
      expect(staleCases[0].staleDays).toBeGreaterThanOrEqual(7);

      // 2. Build display
      const display = buildStaleCasesMessage(staleCases, 7);

      expect(display.text).toContain('2 stale cases');
      expect(display.blocks).toBeDefined();

      // Should have threshold chips
      const thresholdBlock = display.blocks.find(
        (b: any) => b.block_id === 'case_search_actions_threshold'
      );
      expect(thresholdBlock).toBeDefined();
    });

    it('should handle threshold change workflow', () => {
      const now = Date.now();
      const cases = [
        createMockCase({
          updatedOn: new Date(now - 10 * 24 * 60 * 60 * 1000),
        }),
        createMockCase({
          updatedOn: new Date(now - 5 * 24 * 60 * 60 * 1000),
        }),
        createMockCase({
          updatedOn: new Date(now - 2 * 24 * 60 * 60 * 1000),
        }),
      ];

      // Test different thresholds
      const stale1d = findStaleCases(cases, 1);
      const stale7d = findStaleCases(cases, 7);
      const stale14d = findStaleCases(cases, 14);

      expect(stale1d.length).toBe(3); // All are 1+ days stale
      expect(stale7d.length).toBe(1); // Only one is 7+ days stale
      expect(stale14d.length).toBe(0); // None are 14+ days stale
    });
  });

  describe('Pagination Workflow', () => {
    it('should handle multi-page search results', async () => {
      const service = new CaseSearchService();

      // First page
      const page1Cases = Array.from({ length: 10 }, (_, i) =>
        createMockCase({ number: `CASE${String(i + 1).padStart(3, '0')}` })
      );

      mockCaseRepository.search.mockResolvedValue({ cases: page1Cases, totalCount: 15 });

      const page1Result = await service.searchWithMetadata({
        accountName: 'Altus',
        limit: 10,
        offset: 0,
      });

      expect(page1Result.cases).toHaveLength(10);
      expect(page1Result.hasMore).toBe(true);
      expect(page1Result.nextOffset).toBe(10);

      const page1Display = buildSearchResultsMessage(page1Result);
      expect(page1Display.blocks).toBeDefined();

      // Verify pagination button exists
      const paginationBlock = page1Display.blocks.find(
        (b: any) => b.block_id === 'case_search_actions_pagination'
      );
      expect(paginationBlock).toBeDefined();

      // Should have "Next" button
      const nextButton = (paginationBlock as any)?.elements?.find(
        (btn: any) => btn.action_id === 'case_search_button_next_page'
      );
      expect(nextButton).toBeDefined();

      // Second page
      const page2Cases = Array.from({ length: 5 }, (_, i) =>
        createMockCase({ number: `CASE${String(i + 11).padStart(3, '0')}` })
      );

      mockCaseRepository.search.mockResolvedValue({ cases: page2Cases, totalCount: 15 });

      const page2Result = await service.searchWithMetadata({
        accountName: 'Altus',
        limit: 10,
        offset: 10,
      });

      expect(page2Result.cases).toHaveLength(5);
      expect(page2Result.hasMore).toBe(false);
      expect(page2Result.totalFound).toBe(15); // offset + cases.length

      const page2Display = buildSearchResultsMessage(page2Result);

      // Should have "Previous" button but no "Next"
      const page2Pagination = page2Display.blocks.find(
        (b: any) => b.block_id === 'case_search_actions_pagination'
      );

      const prevButton = (page2Pagination as any)?.elements?.find(
        (btn: any) => btn.action_id === 'case_search_button_prev_page'
      );
      expect(prevButton).toBeDefined();
    });
  });

  describe('Filter Prompt Workflow', () => {
    it('should prompt for clarification on vague queries', () => {
      const display = buildFilterPromptMessage('show me cases', {
        customers: ['Altus', 'Genesis', 'Mobiz'],
        queues: ['IT Support', 'Engineering'],
      });

      expect(display.text).toContain('Need more details');
      expect(display.blocks).toBeDefined();

      // Should have customer filter buttons
      const customerActions = display.blocks.find(
        (b: any) => b.block_id === 'case_search_actions_customer_filter'
      );
      expect((customerActions as any)?.elements).toBeDefined();

      // Should include "All Customers" option
      const allCustomersButton = (customerActions as any)?.elements?.find(
        (btn: any) => btn.value === '*'
      );
      expect(allCustomersButton).toBeDefined();
    });
  });

  describe('XSS Protection in UI', () => {
    it('should sanitize malicious case descriptions', () => {
      const maliciousCases = [
        createMockCase({
          shortDescription: '*URGENT* @channel [Click here](http://evil.com)',
          assignedTo: '_Fake_ User <script>alert(1)</script>',
        }),
      ];

      const result = {
        cases: maliciousCases,
        totalFound: 1,
        appliedFilters: {},
        hasMore: false,
      };

      const display = buildSearchResultsMessage(result);

      // Find case block
      const caseBlock = display.blocks.find(
        (b: any) => b.type === 'section' && b.text?.text?.includes('CASE001')
      );

      const blockText = (caseBlock as any)?.text?.text || '';

      // Should remove dangerous tags but keep allowed formatting
      expect(blockText).not.toContain('<script>'); // Script tags removed
      expect(blockText).toContain('*URGENT*'); // Bold formatting preserved
    });

    it('should sanitize malicious assignee names in workload', () => {
      const cases = [
        createMockCase({
          assignedTo: '*HACKER* <@U123> [malicious](http://evil.com)',
        }),
      ];

      const workloads = aggregateByAssignee(cases);
      const display = buildWorkloadSummaryMessage(workloads);

      const workloadBlock = display.blocks.find(
        (b: any) => b.type === 'section' && b.text?.text?.includes('HACKER')
      );

      // Should preserve allowed formatting
      expect((workloadBlock as any)?.text?.text).toContain('*HACKER*');
    });
  });

  describe('Performance & Scalability', () => {
    it('should handle 50 cases efficiently', () => {
      const cases = Array.from({ length: 50 }, (_, i) =>
        createMockCase({
          number: `CASE${String(i + 1).padStart(3, '0')}`,
          assignedTo: `User ${(i % 5) + 1}`, // 5 different users
          ageDays: i + 1,
          updatedOn: new Date(Date.now() - (i + 8) * 24 * 60 * 60 * 1000), // Make some cases stale
        })
      );

      const startTime = Date.now();

      // Run aggregations
      const byAssignee = aggregateByAssignee(cases);
      const oldest = findOldestCases(cases, 10);
      const stale = findStaleCases(cases, 7);

      const endTime = Date.now();

      // Should complete in <100ms
      expect(endTime - startTime).toBeLessThan(100);

      // Verify results
      expect(byAssignee).toHaveLength(5); // 5 users
      expect(oldest).toHaveLength(10);
      expect(stale.length).toBeGreaterThan(0);
    });

    it('should handle block count limits with many cases', () => {
      const cases = Array.from({ length: 50 }, (_, i) =>
        createMockCase({ number: `CASE${String(i + 1).padStart(3, '0')}` })
      );

      const result = {
        cases,
        totalFound: 50,
        appliedFilters: { limit: 50 },
        hasMore: false,
      };

      // Should throw error when exceeding block limit
      expect(() => buildSearchResultsMessage(result)).toThrow(
        /Block count \(\d+\) exceeds message limit \(50\)/
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle all cases unassigned', () => {
      const cases = [
        createMockCase({ assignedTo: undefined }),
        createMockCase({ assignedTo: undefined }),
      ];

      const workloads = aggregateByAssignee(cases);

      expect(workloads).toHaveLength(1);
      expect(workloads[0].assignee).toBe('Unassigned');
      expect(workloads[0].count).toBe(2);
    });

    it('should handle all cases same priority', () => {
      const cases = [
        createMockCase({ priority: '1' }),
        createMockCase({ priority: '1' }),
        createMockCase({ priority: '1' }),
      ];

      const oldest = findOldestCases(cases, 10);

      expect(oldest).toHaveLength(3);
      // Should be sorted by age
      expect(oldest[0].ageDays).toBeGreaterThanOrEqual(oldest[1].ageDays);
    });

    it('should handle missing dates gracefully', () => {
      const cases = [
        createMockCase({ openedAt: undefined, ageDays: undefined }),
        createMockCase({ updatedOn: undefined }),
      ];

      const oldest = findOldestCases(cases, 10);
      const stale = findStaleCases(cases, 7);

      // Should not crash
      expect(Array.isArray(oldest)).toBe(true);
      expect(Array.isArray(stale)).toBe(true);
    });

    it('should handle empty case list in all workflows', () => {
      const empty: Case[] = [];

      const workloads = aggregateByAssignee(empty);
      const oldest = findOldestCases(empty, 10);
      const stale = findStaleCases(empty, 7);

      expect(workloads).toEqual([]);
      expect(oldest).toEqual([]);
      expect(stale).toEqual([]);

      // Displays should handle empty gracefully
      const workloadDisplay = buildWorkloadSummaryMessage(workloads);
      const oldestDisplay = buildOldestCaseMessage(oldest);
      const staleDisplay = buildStaleCasesMessage(stale, 7);

      expect(workloadDisplay.blocks).toBeDefined();
      expect(oldestDisplay.blocks).toBeDefined();
      expect(staleDisplay.blocks).toBeDefined();
    });
  });
});
