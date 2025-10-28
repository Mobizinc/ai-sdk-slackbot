/**
 * Stale Ticket Workflow
 *
 * Interactive experience for exploring stale cases (no updates within N days)
 * with quick threshold selection and bulk notification options.
 */

import { caseSearchService, type CaseSearchFilters } from "../services/case-search-service";
import { findStaleCases, type StaleCaseSummary } from "../services/case-aggregator";
import { getSlackMessagingService } from "../services/slack-messaging";
import { getInteractiveStateManager } from "../services/interactive-state-manager";
import {
  createSectionBlock,
  createDivider,
  createButton,
  createContextBlock,
  type KnownBlock,
} from "../utils/message-styling";

const DEFAULT_THRESHOLDS = [1, 3, 7, 14, 30];
const WORKFLOW_STATE_TYPE = "stale_ticket_workflow";

interface StaleWorkflowState {
  channelId: string;
  messageTs: string;
  thresholdDays: number;
  filters?: CaseSearchFilters;
  staleCases: StaleCaseSummary[];
}

const slackMessaging = getSlackMessagingService();
const stateManager = getInteractiveStateManager();

export class StaleTicketWorkflow {
  async start(options: {
    channelId: string;
    userId: string;
    filters?: CaseSearchFilters;
    thresholdDays?: number;
  }): Promise<{ text: string; blocks: KnownBlock[] }> {
    const threshold = options.thresholdDays ?? 7;
    const searchResult = await this.fetchStaleCases(
      {
        ...options.filters,
        activeOnly: options.filters?.activeOnly ?? true,
      },
      threshold,
    );
    const filterSummary = caseSearchService.buildFilterSummary(searchResult.appliedFilters);
    const display = this.buildBlocks(
      searchResult.staleCases,
      threshold,
      filterSummary !== "No filters applied" ? filterSummary : undefined,
    );

    const message = await slackMessaging.postMessage({
      channel: options.channelId,
      text: display.text,
      blocks: display.blocks,
    });

    if (message.ts) {
      await stateManager.saveState(
        WORKFLOW_STATE_TYPE,
        options.channelId,
        message.ts,
        {
          channelId: options.channelId,
          messageTs: message.ts,
          thresholdDays: threshold,
          filters: searchResult.appliedFilters,
          staleCases: searchResult.staleCases,
        },
        { expiresInHours: 4 },
      );
    }

    return display;
  }

  async handleThresholdSelection(channelId: string, messageTs: string, thresholdDays: number): Promise<void> {
    const state = await stateManager.getState(channelId, messageTs, 'stale_ticket_workflow');
    if (!state) {
      console.warn("[StaleTicketWorkflow] State not found for threshold selection");
      return;
    }

    const filters = state.payload.filters ?? {};
    const refreshed = await this.fetchStaleCases(filters, thresholdDays);
    const filterSummary = caseSearchService.buildFilterSummary(refreshed.appliedFilters);
    const display = this.buildBlocks(
      refreshed.staleCases,
      thresholdDays,
      filterSummary !== "No filters applied" ? filterSummary : undefined,
    );

    await stateManager.updatePayload<'stale_ticket_workflow'>(channelId, messageTs, {
      thresholdDays,
      filters: refreshed.appliedFilters,
      staleCases: refreshed.staleCases,
    });

    await slackMessaging.updateMessage({
      channel: channelId,
      ts: messageTs,
      text: display.text,
      blocks: display.blocks,
    });
  }

  async notifyAssignees(channelId: string, messageTs: string): Promise<void> {
    const state = await stateManager.getState(channelId, messageTs, 'stale_ticket_workflow');
    if (!state) {
      console.warn("[StaleTicketWorkflow] State not found for notify all action");
      return;
    }

    const assignees = new Map<string, StaleCaseSummary[]>();
    for (const entry of state.payload.staleCases) {
      const key = entry.case.assignedTo ?? "Unassigned";
      const bucket = assignees.get(key);
      if (bucket) {
        bucket.push(entry);
      } else {
        assignees.set(key, [entry]);
      }
    }

    const lines = Array.from(assignees.entries()).map(([assignee, items]) => {
      const list = items
        .slice(0, 5)
        .map((item) => item.case.number)
        .join(", ");
      const more = items.length > 5 ? ` (+${items.length - 5} more)` : "";
      return `• ${assignee}: ${list}${more}`;
    });

    await slackMessaging.postToThread({
      channel: channelId,
      threadTs: messageTs,
      text: lines.length > 0
        ? `Heads up! The following assignees have stale cases:\n${lines.join("\n")}`
        : "No assignees found for stale cases.",
    });
  }

  private async fetchStaleCases(
    filters: CaseSearchFilters,
    thresholdDays: number,
  ): Promise<{ staleCases: StaleCaseSummary[]; appliedFilters: CaseSearchFilters }> {
    const thresholdDate = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);
    const effectiveFilters: CaseSearchFilters = {
      ...filters,
      updatedBefore: filters.updatedBefore ?? thresholdDate.toISOString(),
      sortBy: filters.sortBy ?? "updated_on",
      sortOrder: filters.sortOrder ?? "asc",
      limit: filters.limit ?? 100,
    };

    const searchResult = await caseSearchService.searchWithMetadata(effectiveFilters);
    const staleCases = findStaleCases(searchResult.cases, thresholdDays);

    return {
      staleCases,
      appliedFilters: searchResult.appliedFilters,
    };
  }

  private buildBlocks(
    data: StaleCaseSummary[],
    thresholdDays: number,
    filterSummary?: string,
  ): { text: string; blocks: KnownBlock[] } {
    const baseBlocks: KnownBlock[] = [
      createSectionBlock(`*Stale Cases (≥ ${thresholdDays} day(s) without updates)*`),
      createDivider(),
    ];

    if (data.length === 0) {
      const blocks: KnownBlock[] = [
        ...baseBlocks,
        createSectionBlock("_No stale tickets detected with the current filters._"),
        this.buildThresholdActions(thresholdDays),
      ];

      if (filterSummary) {
        blocks.push(createContextBlock(`Filters: ${filterSummary}`));
      }

      return {
        text: `No stale cases found for ${thresholdDays} day(s) threshold.`,
        blocks,
      };
    }

    const rows = data.slice(0, 15).map((entry) => {
      const badge = entry.isHighPriority ? "⚠️" : "•";
      const queue = entry.case.assignmentGroup ? ` • ${entry.case.assignmentGroup}` : "";
      const owner = entry.case.assignedTo ? ` • ${entry.case.assignedTo}` : " • Unassigned";
      const link = entry.case.url ? `<${entry.case.url}|${entry.case.number}>` : entry.case.number;
      return createSectionBlock(
        `${badge} ${link} — ${entry.staleDays}d stale (${entry.ageDays}d old)${owner}${queue}`,
      );
    });

    const blocks: KnownBlock[] = [
      ...baseBlocks,
      ...rows,
      createDivider(),
      this.buildThresholdActions(thresholdDays),
      createContextBlock(
        "Use the buttons above to adjust the stale threshold. High priority items are flagged with ⚠️",
      ),
    ];

    if (filterSummary) {
      blocks.push(createContextBlock(`Filters: ${filterSummary}`));
    }

    return {
      text: `Found ${data.length} stale case(s) for threshold ${thresholdDays} day(s).`,
      blocks,
    };
  }

  private buildThresholdActions(currentThreshold: number): KnownBlock {
    return {
      type: "actions",
      elements: [
        ...DEFAULT_THRESHOLDS.map((threshold) =>
          createButton({
            text: `${threshold}d${threshold === currentThreshold ? " • active" : ""}`,
            actionId: "stale_cases_threshold_select",
            value: JSON.stringify({
              action: "update_threshold",
              threshold,
            }),
            style: threshold === currentThreshold ? "primary" : undefined,
          }),
        ),
        createButton({
          text: "Notify all assignees",
          actionId: "stale_cases_notify_assignees",
          value: JSON.stringify({
            action: "notify_assignees",
            threshold: currentThreshold,
          }),
        }),
      ],
    };
  }
}

export const staleTicketWorkflow = new StaleTicketWorkflow();
