/**
 * Case Search UI Builder
 *
 * Builds Block Kit components for displaying case search results,
 * aggregations, and interactive controls.
 *
 * Features:
 * - Search result displays with pagination
 * - Workload distribution visualizations
 * - Oldest case highlights
 * - Stale case alerts
 * - Filter prompts for vague queries
 * - All using design system helpers and sanitization
 */

import type { Case } from "../infrastructure/servicenow/types/domain-models";
import type { CaseSearchFilters, CaseSearchResult } from "./case-search-service";
import type {
  AssigneeAggregation,
  PriorityAggregation,
  QueueAggregation,
  OldestCaseSummary,
  StaleCaseSummary,
} from "./case-aggregator";
import {
  createHeaderBlock,
  createSectionBlock,
  createFieldsBlock,
  createDivider,
  createContextBlock,
  createButton,
  sanitizeMrkdwn,
  sanitizePlainText,
  truncateText,
  getPriorityEmoji,
  getUrgencyIndicator,
  validateBlockCount,
  MessageEmojis,
  type KnownBlock,
} from "../utils/message-styling";

/**
 * Build search results message with summary, case list, and pagination
 */
export function buildSearchResultsMessage(result: CaseSearchResult): {
  text: string;
  blocks: KnownBlock[];
} {
  const blocks: KnownBlock[] = [];

  // Header with count
  const headerText = result.totalFound === 0
    ? `${MessageEmojis.SEARCH} No Cases Found`
    : `${MessageEmojis.SEARCH} Found ${result.totalFound} Case${result.totalFound !== 1 ? 's' : ''}`;

  blocks.push(createHeaderBlock(headerText));

  // Filter summary
  const filterSummary = buildFilterSummaryText(result.appliedFilters);
  if (filterSummary) {
    blocks.push(createContextBlock(`Filters: ${filterSummary}`));
  }

  if (result.cases.length === 0) {
    blocks.push(
      createSectionBlock("No cases match your search criteria. Try adjusting your filters."),
      createContextBlock("_Tip: Use broader filters or check if the customer/queue name is correct_")
    );

    validateBlockCount(blocks, 'message');
    return {
      text: `${MessageEmojis.SEARCH} No cases found matching criteria`,
      blocks,
    };
  }

  blocks.push(createDivider());

  // Case list (compact format) - limit to stay within block count
  const maxCases = 45; // Leave room for header, dividers, and action blocks
  const casesToShow = result.cases.slice(0, maxCases);
  
  for (const caseItem of casesToShow) {
    const caseBlock = buildCompactCaseBlock(caseItem);
    blocks.push(caseBlock);
  }

  blocks.push(createDivider());

  // Pagination controls
  if (result.hasMore || (result.appliedFilters.offset && result.appliedFilters.offset > 0)) {
    const paginationBlock = buildPaginationBlock(result);
    blocks.push(paginationBlock);
  }

  // Action buttons
  blocks.push(buildSearchActionsBlock(result));

  validateBlockCount(blocks, 'message');

  const text = `${MessageEmojis.SEARCH} Found ${result.totalFound} cases`;
  return { text, blocks };
}

/**
 * Build compact case display block
 */
function buildCompactCaseBlock(caseItem: Case): KnownBlock {
  const priorityIndicator = caseItem.priority ? getPriorityEmoji(parseInt(caseItem.priority)) : '';
  const ageText = caseItem.ageDays !== undefined ? `${caseItem.ageDays}d old` : '';
  const assigneeText = caseItem.assignedTo ? sanitizeMrkdwn(caseItem.assignedTo) : 'Unassigned';

  // Sanitize all user-provided data
  const sanitizedNumber = sanitizePlainText(caseItem.number, 50);
  const sanitizedDescription = truncateText(sanitizeMrkdwn(caseItem.shortDescription), 100);
  const sanitizedState = sanitizeMrkdwn(caseItem.state || 'Unknown');

  const text = [
    `*<${caseItem.url}|${sanitizedNumber}>* | ${priorityIndicator}`,
    sanitizedState,
    ageText && `| ${ageText}`,
    `| ${assigneeText}`,
    `\n${sanitizedDescription}`,
  ].filter(Boolean).join(' ');

  return createSectionBlock(text);
}

/**
 * Build pagination controls block
 */
function buildPaginationBlock(result: CaseSearchResult): KnownBlock {
  const currentOffset = result.appliedFilters.offset || 0;
  const limit = result.appliedFilters.limit || 10;
  const showing = `Showing ${currentOffset + 1}-${currentOffset + result.cases.length}`;

  const buttons = [];

  // Previous button
  if (currentOffset > 0) {
    const prevOffset = Math.max(0, currentOffset - limit);
    buttons.push(
      createButton({
        text: `${MessageEmojis.LINK} Previous`,
        actionId: "case_search_button_prev_page",
        value: encodeSimplePaginationState({ ...result.appliedFilters, offset: prevOffset }),
      })
    );
  }

  // Next button
  if (result.hasMore) {
    buttons.push(
      createButton({
        text: `Next ${MessageEmojis.LINK}`,
        actionId: "case_search_button_next_page",
        value: encodeSimplePaginationState({ ...result.appliedFilters, offset: result.nextOffset }),
      })
    );
  }

  return {
    type: "actions",
    block_id: "case_search_actions_pagination",
    elements: buttons,
  };
}

/**
 * Build action buttons block
 */
function buildSearchActionsBlock(result: CaseSearchResult): KnownBlock {
  return {
    type: "actions",
    block_id: "case_search_actions_main",
    elements: [
      createButton({
        text: `${MessageEmojis.REFRESH} Refresh`,
        actionId: "case_search_button_refresh",
        value: encodeSimplePaginationState(result.appliedFilters),
      }),
      createButton({
        text: `${MessageEmojis.LINK} View All in ServiceNow`,
        actionId: "case_search_button_view_all",
        url: buildServiceNowSearchUrl(result.appliedFilters),
      }),
    ],
  };
}

/**
 * Build workload summary display
 */
export function buildWorkloadSummaryMessage(workloads: AssigneeAggregation[]): {
  text: string;
  blocks: KnownBlock[];
} {
  const blocks: KnownBlock[] = [];

  const totalCases = workloads.reduce((sum, w) => sum + w.count, 0);

  blocks.push(
    createHeaderBlock(`${MessageEmojis.PROJECT} Workload Distribution`),
    createContextBlock(`Total: ${totalCases} cases across ${workloads.length} assignee${workloads.length !== 1 ? 's' : ''}`)
  );

  blocks.push(createDivider());

  // Top assignees (limit to 10 for display)
  const topWorkloads = workloads.slice(0, 10);

  for (const workload of topWorkloads) {
    const sanitizedAssignee = sanitizeMrkdwn(workload.assignee);
    const avgAge = Math.round(workload.averageAgeDays);
    const oldestAge = workload.oldestCase?.ageDays || 0;

    const text = [
      `*${sanitizedAssignee}* - ${workload.count} case${workload.count !== 1 ? 's' : ''}`,
      `\nAvg age: ${avgAge}d`,
      oldestAge > 0 && `| Oldest: ${oldestAge}d`,
    ].filter(Boolean).join(' ');

    blocks.push(createSectionBlock(text));
  }

  if (workloads.length > 10) {
    blocks.push(
      createContextBlock(`_Showing top 10 of ${workloads.length} assignees_`)
    );
  }

  validateBlockCount(blocks, 'message');

  return {
    text: `${MessageEmojis.PROJECT} Workload distribution: ${totalCases} cases across ${workloads.length} assignees`,
    blocks,
  };
}

/**
 * Build oldest case display
 */
export function buildOldestCaseMessage(oldest: OldestCaseSummary[]): {
  text: string;
  blocks: KnownBlock[];
} {
  const blocks: KnownBlock[] = [];

  blocks.push(
    createHeaderBlock(`${MessageEmojis.CLOCK} Oldest Open Cases`),
    createContextBlock(`Found ${oldest.length} oldest case${oldest.length !== 1 ? 's' : ''}`)
  );

  blocks.push(createDivider());

  for (const item of oldest) {
    const c = item.case;
    const sanitizedNumber = sanitizePlainText(c.number, 50);
    const sanitizedDesc = truncateText(sanitizeMrkdwn(c.shortDescription), 150);
    const priorityIndicator = c.priority ? getPriorityEmoji(parseInt(c.priority)) : '';
    const assignee = c.assignedTo ? sanitizeMrkdwn(c.assignedTo) : 'Unassigned';

    blocks.push(
      createSectionBlock(
        `*<${c.url}|${sanitizedNumber}>* - ${item.ageDays} days old\n` +
        `${priorityIndicator} | ${assignee} | ${sanitizedDesc}`
      )
    );
  }

  validateBlockCount(blocks, 'message');

  return {
    text: `${MessageEmojis.CLOCK} Oldest case: ${oldest[0]?.case.number} (${oldest[0]?.ageDays} days old)`,
    blocks,
  };
}

/**
 * Build stale cases alert
 */
export function buildStaleCasesMessage(
  staleCases: StaleCaseSummary[],
  thresholdDays: number
): {
  text: string;
  blocks: KnownBlock[];
} {
  const blocks: KnownBlock[] = [];

  const criticalCount = staleCases.filter((s) => s.isHighPriority).length;

  blocks.push(
    createHeaderBlock(`${MessageEmojis.WARNING} Stale Cases (${thresholdDays}+ days)`),
    createContextBlock(
      `Found ${staleCases.length} stale case${staleCases.length !== 1 ? 's' : ''}` +
      (criticalCount > 0 ? ` | ${criticalCount} critical/high priority` : '')
    )
  );

  blocks.push(createDivider());

  // Show top 10 stale cases
  const topStale = staleCases.slice(0, 10);

  for (const item of topStale) {
    const c = item.case;
    const sanitizedNumber = sanitizePlainText(c.number, 50);
    const sanitizedDesc = truncateText(sanitizeMrkdwn(c.shortDescription), 100);
    const priorityIndicator = c.priority ? getPriorityEmoji(parseInt(c.priority)) : '';
    const assignee = c.assignedTo ? sanitizeMrkdwn(c.assignedTo) : 'Unassigned';
    const criticalFlag = item.isHighPriority ? `${MessageEmojis.HIGH_PRIORITY} CRITICAL` : '';

    blocks.push(
      createSectionBlock(
        `${criticalFlag} *<${c.url}|${sanitizedNumber}>* - ${item.staleDays}d stale\n` +
        `${priorityIndicator} | ${assignee} | ${sanitizedDesc}`
      )
    );
  }

  if (staleCases.length > 10) {
    blocks.push(createContextBlock(`_Showing top 10 of ${staleCases.length} stale cases_`));
  }

  // Threshold adjustment chips
  blocks.push(createDivider());
  blocks.push(buildThresholdChipsBlock(thresholdDays));

  validateBlockCount(blocks, 'message');

  return {
    text: `${MessageEmojis.WARNING} Found ${staleCases.length} stale cases (no updates in ${thresholdDays}+ days)`,
    blocks,
  };
}

/**
 * Build threshold selection chips
 */
function buildThresholdChipsBlock(currentThreshold: number): KnownBlock {
  const thresholds = [1, 3, 7, 14, 30];

  const buttons = thresholds.map((days) => {
    const isActive = days === currentThreshold;
    return createButton({
      text: isActive ? `✓ ${days}d` : `${days}d`,
      actionId: "case_search_button_stale_threshold",
      value: String(days),
      style: isActive ? "primary" : undefined,
    });
  });

  return {
    type: "actions",
    block_id: "case_search_actions_threshold",
    elements: buttons,
  };
}

/**
 * Build filter prompt for vague queries
 */
export function buildFilterPromptMessage(
  originalQuery: string,
  suggestions: {
    customers?: string[];
    queues?: string[];
  }
): {
  text: string;
  blocks: KnownBlock[];
} {
  const blocks: KnownBlock[] = [];

  blocks.push(
    createHeaderBlock(`${MessageEmojis.QUESTION} Need More Details`),
    createSectionBlock(
      `I couldn't find active cases matching "${sanitizeMrkdwn(originalQuery)}".\n\n` +
      `Try one of these filters to refine the search:`
    )
  );

  blocks.push(createDivider());

  // Customer options
  if (suggestions.customers && suggestions.customers.length > 0) {
    blocks.push(createSectionBlock("*Select Customer:*"));

    const customerButtons = suggestions.customers.slice(0, 5).map((customer) =>
      createButton({
        text: sanitizePlainText(customer, 30),
        actionId: "case_search_button_filter_customer",
        value: customer,
      })
    );

    customerButtons.push(
      createButton({
        text: "All Customers",
        actionId: "case_search_button_filter_customer",
        value: "*",
      })
    );

    blocks.push({
      type: "actions",
      block_id: "case_search_actions_customer_filter",
      elements: customerButtons,
    });
  }

  // Queue options
  if (suggestions.queues && suggestions.queues.length > 0) {
    blocks.push(createSectionBlock("*Select Queue:*"));

    const queueButtons = suggestions.queues.slice(0, 5).map((queue) =>
      createButton({
        text: sanitizePlainText(queue, 30),
        actionId: "case_search_button_filter_queue",
        value: queue,
      })
    );

    queueButtons.push(
      createButton({
        text: "All Queues",
        actionId: "case_search_button_filter_queue",
        value: "*",
      })
    );

    blocks.push({
      type: "actions",
      block_id: "case_search_actions_queue_filter",
      elements: queueButtons,
    });
  }

  validateBlockCount(blocks, 'message');

  return {
    text: `${MessageEmojis.QUESTION} Need more details for your search`,
    blocks,
  };
}

/**
 * Build priority distribution display
 */
export function buildPriorityDistributionMessage(priorities: PriorityAggregation[]): {
  text: string;
  blocks: KnownBlock[];
} {
  const blocks: KnownBlock[] = [];

  const totalCases = priorities.reduce((sum, p) => sum + p.count, 0);

  blocks.push(
    createHeaderBlock(`${MessageEmojis.PROJECT} Priority Distribution`),
    createContextBlock(`Total: ${totalCases} cases`)
  );

  blocks.push(createDivider());

  for (const priority of priorities) {
    const emoji = getPriorityEmoji(parseInt(priority.priority));
    const percentage = Math.round((priority.count / totalCases) * 100);
    const progressBar = '█'.repeat(Math.floor(percentage / 5)); // Visual bar

    blocks.push(
      createSectionBlock(
        `${emoji} - ${priority.count} case${priority.count !== 1 ? 's' : ''} (${percentage}%)\n` +
        `${progressBar}`
      )
    );
  }

  validateBlockCount(blocks, 'message');

  return {
    text: `${MessageEmojis.PROJECT} Priority distribution: ${totalCases} cases`,
    blocks,
  };
}

/**
 * Build queue distribution display
 */
export function buildQueueDistributionMessage(queues: QueueAggregation[]): {
  text: string;
  blocks: KnownBlock[];
} {
  const blocks: KnownBlock[] = [];

  const totalCases = queues.reduce((sum, q) => sum + q.count, 0);

  blocks.push(
    createHeaderBlock(`${MessageEmojis.PROJECT} Queue Distribution`),
    createContextBlock(`Total: ${totalCases} cases across ${queues.length} queue${queues.length !== 1 ? 's' : ''}`)
  );

  blocks.push(createDivider());

  const topQueues = queues.slice(0, 10);

  for (const queue of topQueues) {
    const sanitizedQueue = sanitizeMrkdwn(queue.queue);

    blocks.push(
      createSectionBlock(
        `*${sanitizedQueue}* - ${queue.count} case${queue.count !== 1 ? 's' : ''}`
      )
    );
  }

  if (queues.length > 10) {
    blocks.push(createContextBlock(`_Showing top 10 of ${queues.length} queues_`));
  }

  validateBlockCount(blocks, 'message');

  return {
    text: `${MessageEmojis.PROJECT} Queue distribution: ${totalCases} cases across ${queues.length} queues`,
    blocks,
  };
}

/**
 * Build filter summary text
 */
function buildFilterSummaryText(filters: CaseSearchFilters): string {
  const parts: string[] = [];

  if (filters.accountName) parts.push(`Customer: ${sanitizePlainText(filters.accountName, 30)}`);
  if (filters.assignmentGroup) parts.push(`Queue: ${sanitizePlainText(filters.assignmentGroup, 30)}`);
  if (filters.assignedTo) parts.push(`Assignee: ${sanitizePlainText(filters.assignedTo, 30)}`);
  if (filters.priority) parts.push(`Priority: ${filters.priority}`);
  if (filters.state) parts.push(`State: ${filters.state}`);
  if (filters.query) parts.push(`Keyword: "${sanitizePlainText(filters.query, 30)}"`);

  return parts.join(' | ');
}

/**
 * Simple encoding for pagination state (for button values)
 */
function encodeSimplePaginationState(filters: CaseSearchFilters): string {
  // Simplified state for button value (max 75 chars)
  const simple = {
    c: filters.accountName?.substring(0, 20),
    q: filters.assignmentGroup?.substring(0, 20),
    p: filters.priority,
    s: filters.state,
    o: filters.offset || 0,
    l: filters.limit || 10,
  };

  try {
    return btoa(JSON.stringify(simple));
  } catch {
    // Fallback if encoding fails
    return JSON.stringify({ o: filters.offset || 0 });
  }
}

/**
 * Build ServiceNow search URL with filters
 */
function buildServiceNowSearchUrl(filters: CaseSearchFilters): string {
  // TODO: Build actual ServiceNow search URL with query params
  // For now, return base case list URL
  const instanceUrl = process.env.SERVICENOW_INSTANCE_URL || 'https://mobiz.service-now.com';
  return `${instanceUrl}/sn_customerservice_case_list.do`;
}
