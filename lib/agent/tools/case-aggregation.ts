/**
 * Case Aggregation Tool
 *
 * Provides workload summaries, oldest ticket reports, and stale ticket analysis
 * by leveraging the CaseSearchService and case aggregation helpers.
 */

import { z } from "zod";
import {
  aggregateByAssignee,
  aggregateByPriority,
  aggregateByQueue,
  findOldestCases,
  findStaleCases,
  type AssigneeAggregation,
  type PriorityAggregation,
  type QueueAggregation,
  type OldestCaseSummary,
  type StaleCaseSummary,
} from "../../services/case-aggregator";
import { caseSearchService, type CaseSearchFilters } from "../../services/case-search-service";
import {
  createDivider,
  createSectionBlock,
  createContextBlock,
  createButton,
  type KnownBlock,
} from "../../utils/message-styling";
import { createTool, type AgentToolFactoryParams } from "./shared";

export const aggregationTypes = [
  "by_assignee",
  "by_priority",
  "by_queue",
  "oldest_tickets",
  "stale_tickets",
] as const;

export type AggregationType = (typeof aggregationTypes)[number];

export interface CaseAggregationInput {
  aggregationType: AggregationType;
  filters?: CaseSearchFilters;
  limit?: number;
  staleDays?: number;
}

const filtersSchema = z.object({
  accountName: z.string().optional(),
  companyName: z.string().optional(),
  query: z.string().optional(),
  assignmentGroup: z.string().optional(),
  assignedTo: z.string().optional(),
  priority: z.string().optional(),
  state: z.string().optional(),
  openedAfter: z.string().optional(),
  openedBefore: z.string().optional(),
  updatedAfter: z.string().optional(),
  updatedBefore: z.string().optional(),
  activeOnly: z.boolean().optional(),
  sortBy: z.enum(["opened_at", "priority", "updated_on", "state"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
});

const caseAggregationInputSchema = z.object({
  aggregationType: z.enum(aggregationTypes),
  filters: filtersSchema.optional(),
  limit: z.number().min(1).max(50).optional(),
  staleDays: z.number().min(1).max(365).optional(),
});

interface AggregationDisplay {
  text: string;
  blocks: KnownBlock[];
}

function formatAssigneeAggregation(data: AssigneeAggregation[]): AggregationDisplay {
  if (data.length === 0) {
    return {
      text: "No open cases were found for the requested filters.",
      blocks: [
        createSectionBlock("*No open cases found matching the requested filters.*"),
      ],
    };
  }

  const lines = data.map((entry, index) => {
    const badge = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "•";
    const oldestText = entry.oldestCase
      ? ` (oldest ${entry.oldestCase.number}, ${entry.averageAgeDays}d avg age)`
      : "";
    return `${badge} *${entry.assignee}* — ${entry.count} case(s)${oldestText}`;
  });

  return {
    text: "Open case workload by assignee",
    blocks: [
      createSectionBlock("*Workload by Assignee*"),
      createDivider(),
      ...lines.map((line) => createSectionBlock(line)),
      createDivider(),
      createContextBlock("Sorted by highest case volume"),
    ],
  };
}

function formatPriorityAggregation(data: PriorityAggregation[]): AggregationDisplay {
  if (data.length === 0) {
    return {
      text: "No open cases were found for the requested filters.",
      blocks: [
        createSectionBlock("*No open cases found matching the requested filters.*"),
      ],
    };
  }

  const lines = data.map((entry) => {
    const label = entry.priority === "1"
      ? "Critical"
      : entry.priority === "2"
      ? "High"
      : entry.priority === "3"
      ? "Moderate"
      : entry.priority === "4"
      ? "Low"
      : entry.priority ?? "Unknown";

    return `• *${label}* — ${entry.count} case(s)`;
  });

  return {
    text: "Priority distribution for open cases",
    blocks: [
      createSectionBlock("*Priority Breakdown*"),
      createDivider(),
      ...lines.map((line) => createSectionBlock(line)),
    ],
  };
}

function formatQueueAggregation(data: QueueAggregation[]): AggregationDisplay {
  if (data.length === 0) {
    return {
      text: "No open cases were found for the requested filters.",
      blocks: [
        createSectionBlock("*No open cases found matching the requested filters.*"),
      ],
    };
  }

  const lines = data.map((entry) => `• *${entry.queue}* — ${entry.count} case(s)`);

  return {
    text: "Queue distribution for open cases",
    blocks: [
      createSectionBlock("*Queue Distribution*"),
      createDivider(),
      ...lines.map((line) => createSectionBlock(line)),
      createDivider(),
      createContextBlock("Highlighting assignment groups handling current workload"),
    ],
  };
}

function formatOldestCases(data: OldestCaseSummary[], limit: number): AggregationDisplay {
  if (data.length === 0) {
    return {
      text: "No cases available to calculate oldest tickets.",
      blocks: [
        createSectionBlock("*No open cases were found for the requested filters.*"),
      ],
    };
  }

  const lines = data.slice(0, limit).map((entry) => {
    const caseLink = entry.case.url
      ? `<${entry.case.url}|${entry.case.number}>`
      : entry.case.number;
    const owner = entry.case.assignedTo ? ` • Assigned to ${entry.case.assignedTo}` : "";
    const queue = entry.case.assignmentGroup ? ` • ${entry.case.assignmentGroup}` : "";
    return `• ${caseLink} — ${entry.ageDays}d old${owner}${queue}`;
  });

  return {
    text: `Oldest ${Math.min(limit, data.length)} open cases`,
    blocks: [
      createSectionBlock(`*Oldest ${Math.min(limit, data.length)} Open Cases*`),
      createDivider(),
      ...lines.map((line) => createSectionBlock(line)),
    ],
  };
}

function formatStaleCases(data: StaleCaseSummary[], threshold: number): AggregationDisplay {
  if (data.length === 0) {
    return {
      text: `No cases have been idle for ${threshold} day(s) with the current filters.`,
      blocks: [
        createSectionBlock(`*No stale cases detected in the last ${threshold} day(s).*`),
      ],
    };
  }

  const lines = data.slice(0, 20).map((entry) => {
    const caseLink = entry.case.url
      ? `<${entry.case.url}|${entry.case.number}>`
      : entry.case.number;
    const priority = entry.case.priority ? `P${entry.case.priority}` : "Unk";
    const owner = entry.case.assignedTo ? ` • ${entry.case.assignedTo}` : " • Unassigned";
    const badge = entry.isHighPriority ? "⚠️" : "•";
    return `${badge} ${caseLink} — ${entry.staleDays}d stale (${priority})${owner}`;
  });

  return {
    text: `Cases without updates for ${threshold} day(s)`,
    blocks: [
      createSectionBlock(`*Stale Cases (≥ ${threshold} day(s) without updates)*`),
      createDivider(),
      ...lines.map((line) => createSectionBlock(line)),
      createDivider(),
      createContextBlock("⚠️ High priority items are flagged for urgency"),
      {
        type: "actions",
        elements: [
          createButton({
            text: "Notify all assignees",
            actionId: "stale_cases_notify_assignees",
            value: JSON.stringify({
              action: "notify_assignees",
              threshold,
            }),
          }),
        ],
      },
    ],
  };
}

function buildAggregationDisplay(
  result:
    | AssigneeAggregation[]
    | PriorityAggregation[]
    | QueueAggregation[]
    | OldestCaseSummary[]
    | StaleCaseSummary[],
  aggregationType: AggregationType,
  extras: { limit?: number; staleDays?: number } = {},
): AggregationDisplay {
  switch (aggregationType) {
    case "by_assignee":
      return formatAssigneeAggregation(result as AssigneeAggregation[]);
    case "by_priority":
      return formatPriorityAggregation(result as PriorityAggregation[]);
    case "by_queue":
      return formatQueueAggregation(result as QueueAggregation[]);
    case "oldest_tickets":
      return formatOldestCases(result as OldestCaseSummary[], extras.limit ?? 10);
    case "stale_tickets":
      return formatStaleCases(result as StaleCaseSummary[], extras.staleDays ?? 7);
    default:
      return {
        text: "No aggregation available.",
        blocks: [createSectionBlock("*No aggregation available.*")],
      };
  }
}

export function createCaseAggregationTool(params: AgentToolFactoryParams) {
  const { updateStatus } = params;

  return createTool({
    name: "case_aggregation",
    description:
      "Generates workload summaries and case health reports (by assignee, priority, queue, oldest, stale). Use this tool when you need to understand team workload, identify aging tickets, or highlight stale cases.",
    inputSchema: caseAggregationInputSchema,
    execute: async (input: CaseAggregationInput) => {
      const { aggregationType, limit, staleDays } = input;
      const filters: CaseSearchFilters = {
        ...input.filters,
        activeOnly: input.filters?.activeOnly ?? true,
      };

      updateStatus?.("is gathering case metrics...");

      const searchResult = await caseSearchService.searchWithMetadata({
        ...filters,
        limit: filters.limit ?? Math.max(limit ?? 50, 50),
      });
      const cases = searchResult.cases;

      let result:
        | AssigneeAggregation[]
        | PriorityAggregation[]
        | QueueAggregation[]
        | OldestCaseSummary[]
        | StaleCaseSummary[];

      switch (aggregationType) {
        case "by_assignee":
          result = aggregateByAssignee(cases);
          break;
        case "by_priority":
          result = aggregateByPriority(cases);
          break;
        case "by_queue":
          result = aggregateByQueue(cases);
          break;
        case "oldest_tickets":
          result = findOldestCases(cases, limit ?? 10);
          break;
        case "stale_tickets":
          result = findStaleCases(cases, staleDays ?? 7);
          break;
        default:
          result = [];
          break;
      }

      const display = buildAggregationDisplay(result, aggregationType, {
        limit,
        staleDays,
      });

      const filterSummary = caseSearchService.buildFilterSummary(searchResult.appliedFilters);
      if (filterSummary !== "No filters applied") {
        display.blocks.push(createContextBlock(`Filters: ${filterSummary}`));
      }

      if (searchResult.hasMore) {
        display.blocks.push(
          createContextBlock("Only the first page of results is shown. Refine filters or page for more.")
        );
      }

      return {
        result,
        display,
        metadata: {
          totalFound: searchResult.totalFound,
          hasMore: searchResult.hasMore,
          nextOffset: searchResult.nextOffset,
        },
      };
    },
  });
}
