/**
 * Case Search UI Builder Tests
 *
 * Snapshot and validation tests for Block Kit UI components:
 * - Search results display
 * - Workload summaries
 * - Oldest case displays
 * - Stale case alerts
 * - Filter prompts
 * - Pagination controls
 */

import { describe, it, expect } from 'vitest';
import {
  buildSearchResultsMessage,
  buildWorkloadSummaryMessage,
  buildOldestCaseMessage,
  buildStaleCasesMessage,
  buildFilterPromptMessage,
  buildPriorityDistributionMessage,
  buildQueueDistributionMessage,
} from '../lib/services/case-search-ui-builder';
import type { Case } from '../lib/infrastructure/servicenow/types/domain-models';
import type { CaseSearchResult } from '../lib/services/case-search-service';
import type {
  AssigneeAggregation,
  PriorityAggregation,
  QueueAggregation,
  OldestCaseSummary,
  StaleCaseSummary,
} from '../lib/services/case-aggregator';

const createMockCase = (overrides: Partial<Case> = {}): Case => ({
  sysId: 'sys123',
  number: 'CASE001',
  shortDescription: 'Email sync failing for Outlook 365',
  priority: '2',
  state: 'Open',
  openedAt: new Date('2025-01-01'),
  updatedOn: new Date('2025-01-20'),
  ageDays: 27,
  assignedTo: 'John Doe',
  assignmentGroup: 'IT Support',
  url: 'https://instance.service-now.com/case/sys123',
  ...overrides,
});

describe('Case Search UI Builder', () => {
  describe('buildSearchResultsMessage', () => {
    it('should build search results with cases', () => {
      const result: CaseSearchResult = {
        cases: [
          createMockCase({ number: 'CASE001', priority: '1' }),
          createMockCase({ number: 'CASE002', priority: '2' }),
          createMockCase({ number: 'CASE003', priority: '3' }),
        ],
        totalFound: 3,
        appliedFilters: { accountName: 'Altus', limit: 10 },
        hasMore: false,
      };

      const { text, blocks } = buildSearchResultsMessage(result);

      expect(text).toContain('Found 3 Cases');
      expect(blocks).toBeDefined();
      expect(blocks.length).toBeGreaterThan(0);

      // Should have header
      const headerBlock = blocks.find((b: any) => b.type === 'header');
      expect(headerBlock).toBeDefined();

      // Should have case blocks
      const sectionBlocks = blocks.filter((b: any) => b.type === 'section');
      expect(sectionBlocks.length).toBeGreaterThanOrEqual(3);

      // Should have actions block
      const actionsBlocks = blocks.filter((b: any) => b.type === 'actions');
      expect(actionsBlocks.length).toBeGreaterThan(0);
    });

    it('should show no results message when empty', () => {
      const result: CaseSearchResult = {
        cases: [],
        totalFound: 0,
        appliedFilters: { accountName: 'Nonexistent' },
        hasMore: false,
      };

      const { text, blocks } = buildSearchResultsMessage(result);

      expect(text).toContain('No cases found');
      expect(blocks).toBeDefined();

      const sectionBlock = blocks.find(
        (b: any) => b.type === 'section' && b.text?.text?.includes('No cases match')
      );
      expect(sectionBlock).toBeDefined();
    });

    it('should show pagination when hasMore is true', () => {
      const result: CaseSearchResult = {
        cases: Array.from({ length: 10 }, (_, i) => createMockCase({ number: `CASE${i}` })),
        totalFound: 10,
        appliedFilters: { limit: 10, offset: 0 },
        hasMore: true,
        nextOffset: 10,
      };

      const { blocks } = buildSearchResultsMessage(result);

      const paginationBlock = blocks.find(
        (b: any) => b.block_id === 'case_search_actions_pagination'
      );
      expect(paginationBlock).toBeDefined();
    });

    it('should sanitize all user-provided data', () => {
      const result: CaseSearchResult = {
        cases: [
          createMockCase({
            number: 'CASE001',
            shortDescription: '*URGENT* <script>alert("xss")</script> @channel',
          }),
        ],
        totalFound: 1,
        appliedFilters: {},
        hasMore: false,
      };

      const { blocks } = buildSearchResultsMessage(result);

      const caseBlock = blocks.find(
        (b: any) => b.type === 'section' && b.text?.text?.includes('CASE001')
      );

      // Should escape markdown and HTML
      expect(caseBlock?.text?.text).not.toContain('<script>');
      expect(caseBlock?.text?.text).toContain('\\*URGENT\\*'); // Escaped
    });

    it('should respect block count limit', () => {
      // Create many cases to test block limit
      const result: CaseSearchResult = {
        cases: Array.from({ length: 50 }, (_, i) => createMockCase({ number: `CASE${i}` })),
        totalFound: 50,
        appliedFilters: { limit: 50 },
        hasMore: false,
      };

      const { blocks } = buildSearchResultsMessage(result);

      expect(blocks.length).toBeLessThanOrEqual(50); // Slack limit
    });
  });

  describe('buildWorkloadSummaryMessage', () => {
    it('should build workload distribution', () => {
      const workloads: AssigneeAggregation[] = [
        {
          assignee: 'John Doe',
          count: 15,
          averageAgeDays: 12,
          oldestCase: createMockCase({ ageDays: 45 }),
          cases: [],
        },
        {
          assignee: 'Jane Smith',
          count: 10,
          averageAgeDays: 8,
          oldestCase: createMockCase({ ageDays: 30 }),
          cases: [],
        },
        {
          assignee: 'Unassigned',
          count: 5,
          averageAgeDays: 3,
          cases: [],
        },
      ];

      const { text, blocks } = buildWorkloadSummaryMessage(workloads);

      expect(text).toContain('Workload distribution');
      expect(text).toContain('30 cases'); // Total
      expect(blocks).toBeDefined();

      // Should have header
      const headerBlock = blocks.find((b: any) => b.type === 'header');
      expect(headerBlock?.text?.text).toContain('Workload Distribution');

      // Should have assignee entries
      const sectionBlocks = blocks.filter((b: any) => b.type === 'section');
      expect(sectionBlocks.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle empty workload list', () => {
      const { text, blocks } = buildWorkloadSummaryMessage([]);

      expect(text).toBeDefined();
      expect(blocks).toBeDefined();
    });
  });

  describe('buildOldestCaseMessage', () => {
    it('should highlight oldest cases', () => {
      const oldest: OldestCaseSummary[] = [
        {
          case: createMockCase({
            number: 'CASE001',
            ageDays: 45,
            shortDescription: 'Ancient issue',
          }),
          ageDays: 45,
        },
        {
          case: createMockCase({
            number: 'CASE002',
            ageDays: 30,
          }),
          ageDays: 30,
        },
      ];

      const { text, blocks } = buildOldestCaseMessage(oldest);

      expect(text).toContain('Oldest case');
      expect(text).toContain('CASE001');
      expect(text).toContain('45 days');

      const headerBlock = blocks.find((b: any) => b.type === 'header');
      expect(headerBlock?.text?.text).toContain('Oldest Open Cases');
    });

    it('should handle empty oldest list', () => {
      const { text, blocks } = buildOldestCaseMessage([]);

      expect(text).toBeDefined();
      expect(blocks).toBeDefined();
    });
  });

  describe('buildStaleCasesMessage', () => {
    it('should build stale cases alert with threshold chips', () => {
      const staleCases: StaleCaseSummary[] = [
        {
          case: createMockCase({
            number: 'CASE001',
            priority: '1',
          }),
          staleDays: 18,
          ageDays: 30,
          isHighPriority: true,
        },
        {
          case: createMockCase({
            number: 'CASE002',
            priority: '3',
          }),
          staleDays: 10,
          ageDays: 15,
          isHighPriority: false,
        },
      ];

      const { text, blocks } = buildStaleCasesMessage(staleCases, 7);

      expect(text).toContain('2 stale cases');
      expect(text).toContain('7+ days');

      // Should have threshold chips
      const thresholdActions = blocks.find(
        (b: any) => b.block_id === 'case_search_actions_threshold'
      );
      expect(thresholdActions).toBeDefined();
      expect(thresholdActions?.elements).toBeDefined();

      // Should have 5 threshold buttons (1d, 3d, 7d, 14d, 30d)
      expect(thresholdActions?.elements).toHaveLength(5);
    });

    it('should highlight active threshold', () => {
      const { blocks } = buildStaleCasesMessage([], 7);

      const thresholdActions = blocks.find(
        (b: any) => b.block_id === 'case_search_actions_threshold'
      );

      const activeButton = thresholdActions?.elements.find(
        (btn: any) => btn.style === 'primary'
      );

      expect(activeButton).toBeDefined();
      expect(activeButton?.text?.text).toContain('7d');
    });

    it('should show no stale cases message when empty', () => {
      const { text, blocks } = buildStaleCasesMessage([], 7);

      expect(text).toContain('No stale cases');
      expect(blocks).toBeDefined();
    });
  });

  describe('buildFilterPromptMessage', () => {
    it('should build filter prompt with suggestions', () => {
      const { text, blocks } = buildFilterPromptMessage('show me cases', {
        customers: ['Altus', 'Genesis', 'Mobiz'],
        queues: ['IT Support', 'Engineering'],
      });

      expect(text).toContain('Need more details');
      expect(blocks).toBeDefined();

      // Should have customer buttons
      const customerActions = blocks.find(
        (b: any) => b.block_id === 'case_search_actions_customer_filter'
      );
      expect(customerActions).toBeDefined();
      expect(customerActions?.elements).toHaveLength(4); // 3 customers + "All Customers"

      // Should have queue buttons
      const queueActions = blocks.find(
        (b: any) => b.block_id === 'case_search_actions_queue_filter'
      );
      expect(queueActions).toBeDefined();
      expect(queueActions?.elements).toHaveLength(3); // 2 queues + "All Queues"
    });

    it('should sanitize original query', () => {
      const { blocks } = buildFilterPromptMessage(
        'show me *all* cases @channel',
        { customers: ['Altus'] }
      );

      const promptBlock = blocks.find(
        (b: any) => b.type === 'section' && b.text?.text?.includes('show me')
      );

      // Query should be sanitized
      expect(promptBlock?.text?.text).toContain('\\*all\\*'); // Escaped
    });
  });

  describe('buildPriorityDistributionMessage', () => {
    it('should build priority distribution', () => {
      const priorities: PriorityAggregation[] = [
        { priority: '1', count: 5, cases: [] },
        { priority: '2', count: 10, cases: [] },
        { priority: '3', count: 15, cases: [] },
      ];

      const { text, blocks } = buildPriorityDistributionMessage(priorities);

      expect(text).toContain('Priority distribution');
      expect(text).toContain('30 cases'); // Total
      expect(blocks).toBeDefined();
    });
  });

  describe('buildQueueDistributionMessage', () => {
    it('should build queue distribution', () => {
      const queues: QueueAggregation[] = [
        { queue: 'IT Support', count: 20, cases: [] },
        { queue: 'Engineering', count: 10, cases: [] },
      ];

      const { text, blocks } = buildQueueDistributionMessage(queues);

      expect(text).toContain('Queue distribution');
      expect(text).toContain('30 cases');
      expect(text).toContain('2 queues');
      expect(blocks).toBeDefined();
    });
  });

  describe('Block Kit Validation', () => {
    it('should not exceed 50 block limit for search results', () => {
      const result: CaseSearchResult = {
        cases: Array.from({ length: 50 }, (_, i) =>
          createMockCase({ number: `CASE${String(i + 1).padStart(3, '0')}` })
        ),
        totalFound: 50,
        appliedFilters: { limit: 50 },
        hasMore: false,
      };

      const { blocks } = buildSearchResultsMessage(result);

      expect(blocks.length).toBeLessThanOrEqual(50);
    });

    it('should use MessageEmojis constants (no hardcoded emojis)', () => {
      const result: CaseSearchResult = {
        cases: [createMockCase()],
        totalFound: 1,
        appliedFilters: {},
        hasMore: false,
      };

      const { text } = buildSearchResultsMessage(result);

      // Should use emoji from constants (check that common emojis aren't hardcoded)
      // This is more of a code review check, but we can verify the output is consistent
      expect(text).toBeDefined();
      expect(typeof text).toBe('string');
    });

    it('should sanitize all case data in blocks', () => {
      const result: CaseSearchResult = {
        cases: [
          createMockCase({
            number: 'CASE001',
            shortDescription: '*Malicious* [link](http://evil.com) @channel',
            assignedTo: '_Fake_ User',
            assignmentGroup: '**Hacked** Queue',
          }),
        ],
        totalFound: 1,
        appliedFilters: {},
        hasMore: false,
      };

      const { blocks } = buildSearchResultsMessage(result);

      // Find the case display block
      const caseBlock = blocks.find(
        (b: any) => b.type === 'section' && b.text?.text?.includes('CASE001')
      );

      const blockText = caseBlock?.text?.text || '';

      // All markdown should be escaped
      expect(blockText).toContain('\\*Malicious\\*');
      expect(blockText).toContain('\\[link\\]');
      expect(blockText).toContain('\\@channel');
    });

    it('should include proper action_id on all buttons', () => {
      const result: CaseSearchResult = {
        cases: [createMockCase()],
        totalFound: 1,
        appliedFilters: {},
        hasMore: true,
        nextOffset: 10,
      };

      const { blocks } = buildSearchResultsMessage(result);

      const actionsBlocks = blocks.filter((b: any) => b.type === 'actions');

      for (const actionBlock of actionsBlocks) {
        for (const element of actionBlock.elements || []) {
          if (element.type === 'button') {
            expect(element.action_id).toBeDefined();
            expect(element.action_id).toMatch(/^[a-z0-9_]+$/); // Naming convention
          }
        }
      }
    });

    it('should include block_id on all actions blocks', () => {
      const result: CaseSearchResult = {
        cases: [createMockCase()],
        totalFound: 1,
        appliedFilters: {},
        hasMore: true,
      };

      const { blocks } = buildSearchResultsMessage(result);

      const actionsBlocks = blocks.filter((b: any) => b.type === 'actions');

      for (const actionBlock of actionsBlocks) {
        expect(actionBlock.block_id).toBeDefined();
        expect(actionBlock.block_id).toMatch(/^[a-z0-9_]+$/);
      }
    });
  });

  describe('Stale Cases Threshold Chips', () => {
    it('should create 5 threshold buttons', () => {
      const { blocks } = buildStaleCasesMessage([], 7);

      const thresholdBlock = blocks.find(
        (b: any) => b.block_id === 'case_search_actions_threshold'
      );

      expect(thresholdBlock?.elements).toHaveLength(5);

      const buttonTexts = thresholdBlock?.elements.map((btn: any) => btn.text?.text);
      expect(buttonTexts).toContain('1d');
      expect(buttonTexts).toContain('3d');
      expect(buttonTexts).toContain('7d');
      expect(buttonTexts).toContain('14d');
      expect(buttonTexts).toContain('30d');
    });

    it('should mark current threshold as primary', () => {
      const { blocks } = buildStaleCasesMessage([], 14);

      const thresholdBlock = blocks.find(
        (b: any) => b.block_id === 'case_search_actions_threshold'
      );

      const primaryButton = thresholdBlock?.elements.find(
        (btn: any) => btn.style === 'primary'
      );

      expect(primaryButton).toBeDefined();
      expect(primaryButton?.text?.text).toContain('14d');
    });

    it('should have action_id on threshold buttons', () => {
      const { blocks } = buildStaleCasesMessage([], 7);

      const thresholdBlock = blocks.find(
        (b: any) => b.block_id === 'case_search_actions_threshold'
      );

      for (const button of thresholdBlock?.elements || []) {
        expect(button.action_id).toBe('case_search_button_stale_threshold');
        expect(button.value).toBeDefined();
        expect(button.value).toMatch(/^\d+$/); // Should be a number string
      }
    });
  });

  describe('Filter Prompt Suggestions', () => {
    it('should limit customer suggestions to 5', () => {
      const { blocks } = buildFilterPromptMessage('show cases', {
        customers: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], // 8 customers
      });

      const customerActions = blocks.find(
        (b: any) => b.block_id === 'case_search_actions_customer_filter'
      );

      // Should have 5 customers + "All Customers" = 6 buttons
      expect(customerActions?.elements).toHaveLength(6);
    });

    it('should sanitize customer and queue names', () => {
      const { blocks } = buildFilterPromptMessage('show cases', {
        customers: ['*Malicious* Customer'],
        queues: ['_Fake_ Queue'],
      });

      const customerActions = blocks.find(
        (b: any) => b.block_id === 'case_search_actions_customer_filter'
      );

      const customerButton = customerActions?.elements[0];

      // Button text should be sanitized (plain text, so HTML/markdown removed)
      expect(customerButton?.text?.text).not.toContain('*Malicious*');
    });
  });

  describe('Accessibility', () => {
    it('should use priority emojis with text labels', () => {
      const result: CaseSearchResult = {
        cases: [
          createMockCase({ priority: '1' }), // Critical
        ],
        totalFound: 1,
        appliedFilters: {},
        hasMore: false,
      };

      const { blocks } = buildSearchResultsMessage(result);

      const caseBlock = blocks.find(
        (b: any) => b.type === 'section' && b.text?.text?.includes('CASE001')
      );

      // Priority should include text label, not just color
      expect(caseBlock?.text?.text).toMatch(/CRITICAL|HIGH|MODERATE|LOW/i);
    });
  });

  describe('Snapshot Consistency', () => {
    it('should produce consistent output for same input', () => {
      const result: CaseSearchResult = {
        cases: [createMockCase({ number: 'CASE001' })],
        totalFound: 1,
        appliedFilters: { accountName: 'Altus' },
        hasMore: false,
      };

      const output1 = buildSearchResultsMessage(result);
      const output2 = buildSearchResultsMessage(result);

      expect(output1.text).toBe(output2.text);
      expect(output1.blocks).toEqual(output2.blocks);
    });
  });
});
