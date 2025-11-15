import { AnthropicChatService } from "./anthropic-chat";
import { caseSearchService, type CaseSearchResult } from "./case-search-service";
import { findStaleCases, type StaleCaseSummary } from "./case-aggregator";
import { getCaseRepository } from "../infrastructure/servicenow/repositories/factory";
import type { Case } from "../infrastructure/servicenow/types/domain-models";
import { getSlackMessagingService } from "./slack-messaging";
import type { SlackMessagingService } from "./slack-messaging";
import type { CaseRepository } from "../infrastructure/servicenow/repositories/case-repository.interface";
import { getServiceNowUserDirectory, ServiceNowUserDirectory } from "./service-now-user-directory";
import { setAppSetting, getAppSetting } from "./app-settings";

export interface AssignmentGroupConfig {
  assignmentGroup: string;
  slackChannel: string;
  slackChannelLabel?: string;
}

export interface FollowupGroupResult {
  assignmentGroup: string;
  slackChannel: string;
  slackChannelLabel?: string;
  totalCases: number;
  followupsPosted: number;
  summaryTs?: string;
  error?: string;
}

export interface FollowupRunSummary {
  runAt: string;
  thresholdDays: number;
  followupLimit: number;
  groups: FollowupGroupResult[];
}

interface FollowupDependencies {
  caseSearch: Pick<typeof caseSearchService, "searchWithMetadata">;
  caseRepository: Pick<CaseRepository, "getJournalEntries" | "addWorkNote">;
  slack: SlackMessagingService;
  chat: AnthropicChatService;
  userDirectory: ServiceNowUserDirectory;
  persistRunSummary?: (summary: FollowupRunSummary) => Promise<void>;
}

export interface FollowupPlan {
  summary: string;
  reminders: string[];
  questions: string[];
}

interface FollowupMessagePayload {
  fallbackText: string;
  blocks: any[];
}

const DEFAULT_THRESHOLD_DAYS = parseInt(process.env.STALE_CASE_THRESHOLD_DAYS ?? "3", 10);
const DEFAULT_FETCH_LIMIT = parseInt(process.env.STALE_CASE_FETCH_LIMIT ?? "60", 10);
const DEFAULT_FOLLOWUP_LIMIT = parseInt(process.env.STALE_CASE_FOLLOWUP_LIMIT ?? "8", 10);
const DEFAULT_JOURNAL_LIMIT = parseInt(process.env.STALE_CASE_JOURNAL_LIMIT ?? "8", 10);
const REVIEW_MODEL = process.env.STALE_CASE_REVIEW_MODEL ?? "claude-3-5-sonnet-20241022";
const STALE_CASE_FOLLOWUP_STATE_KEY = "stale_case_followup:last_run";

export const DEFAULT_ASSIGNMENT_GROUPS: AssignmentGroupConfig[] = [
  {
    assignmentGroup: process.env.STALE_CASE_NETWORK_GROUP_NAME ?? "Network Engineers",
    slackChannel: process.env.STALE_CASE_NETWORK_CHANNEL_ID ?? "C045N8WF3NE",
    slackChannelLabel: process.env.STALE_CASE_NETWORK_CHANNEL_LABEL ?? "#network-ops",
  },
  {
    assignmentGroup: process.env.STALE_CASE_ICM_GROUP_NAME ?? "Incident and Case Management",
    slackChannel: process.env.STALE_CASE_ICM_CHANNEL_ID ?? "C01FFQTMAD9",
    slackChannelLabel: process.env.STALE_CASE_ICM_CHANNEL_LABEL ?? "#incident-case-mgmt",
  },
];

export class StaleCaseFollowupService {
  private readonly thresholdDays = Math.max(DEFAULT_THRESHOLD_DAYS, 1);
  private readonly fetchLimit = Math.max(DEFAULT_FETCH_LIMIT, 5);
  private readonly followupLimit = Math.max(DEFAULT_FOLLOWUP_LIMIT, 1);
  private readonly journalLimit = Math.max(DEFAULT_JOURNAL_LIMIT, 3);

  constructor(private readonly deps: FollowupDependencies = {
    caseSearch: caseSearchService,
    caseRepository: getCaseRepository(),
    slack: getSlackMessagingService(),
    chat: AnthropicChatService.getInstance(),
    userDirectory: getServiceNowUserDirectory(),
    persistRunSummary: async (summary) => {
      await setAppSetting(STALE_CASE_FOLLOWUP_STATE_KEY, JSON.stringify(summary));
    },
  }) {}

  async run(groups: AssignmentGroupConfig[]): Promise<FollowupRunSummary> {
    const results: FollowupGroupResult[] = [];

    for (const group of groups) {
      try {
        const result = await this.processGroup(group);
        results.push(result);
      } catch (error) {
        console.error(`[StaleCaseFollowup] Failed processing group ${group.assignmentGroup}`, error);
        results.push({
          assignmentGroup: group.assignmentGroup,
          slackChannel: group.slackChannel,
          slackChannelLabel: group.slackChannelLabel,
          totalCases: 0,
          followupsPosted: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const summary: FollowupRunSummary = {
      runAt: new Date().toISOString(),
      thresholdDays: this.thresholdDays,
      followupLimit: this.followupLimit,
      groups: results,
    };

    try {
      await this.deps.persistRunSummary?.(summary);
    } catch (error) {
      console.warn("[StaleCaseFollowup] Failed to persist summary", error);
    }

    return summary;
  }

  private async processGroup(config: AssignmentGroupConfig): Promise<FollowupGroupResult> {
    const staleSummaries = await this.fetchStaleCases(config.assignmentGroup);

    const summaryMessage = this.buildSummaryMessage(config.assignmentGroup, staleSummaries);
    const summaryResponse = await this.deps.slack.postMessage({
      channel: config.slackChannel,
      text: summaryMessage.fallbackText,
      blocks: summaryMessage.blocks,
    });

    const threadTs = summaryResponse.ts;
    let followupsPosted = 0;

    const followupTargets = staleSummaries.slice(0, this.followupLimit);
    for (const summary of followupTargets) {
      try {
        const plan = await this.buildFollowupPlan(summary);
        const mention = await this.deps.userDirectory.resolveSlackMention(summary.case);
        const ownerLabel = mention ?? summary.case.assignedTo ?? "Unassigned";
        const followupMessage = this.buildFollowupMessage(summary, plan, config, ownerLabel);
        await this.deps.slack.postMessage({
          channel: config.slackChannel,
          text: followupMessage.fallbackText,
          blocks: followupMessage.blocks,
          threadTs,
        });

        await this.recordWorkNote(summary.case, plan, config);
        followupsPosted += 1;
      } catch (error) {
        console.error(`[StaleCaseFollowup] Failed follow-up for ${summary.case.number}`, error);
      }
    }

    return {
      assignmentGroup: config.assignmentGroup,
      slackChannel: config.slackChannel,
      slackChannelLabel: config.slackChannelLabel,
      totalCases: staleSummaries.length,
      followupsPosted,
      summaryTs: summaryResponse.ts,
    };
  }

  private async fetchStaleCases(assignmentGroup: string): Promise<StaleCaseSummary[]> {
    const cutoff = new Date(Date.now() - this.thresholdDays * 24 * 60 * 60 * 1000);
    const result: CaseSearchResult = await this.deps.caseSearch.searchWithMetadata({
      assignmentGroup,
      activeOnly: true,
      updatedBefore: cutoff.toISOString(),
      sortBy: "updated_on",
      sortOrder: "asc",
      limit: this.fetchLimit,
    });

    const staleSummaries = findStaleCases(result.cases, this.thresholdDays);
    return staleSummaries;
  }

  private buildSummaryMessage(assignmentGroup: string, cases: StaleCaseSummary[]): FollowupMessagePayload {
    const header = `*${assignmentGroup}:* ${cases.length} case(s) have been idle for ≥ ${this.thresholdDays} days`;
    const buckets = this.formatBuckets(cases);
    const keyObservations = this.buildObservations(cases);
    const caseList = this.buildCaseList(cases);

    const components = [header, buckets, keyObservations, caseList].filter(Boolean).join("\n\n");

    const blocks: any[] = [
      {
        type: "section",
        text: { type: "mrkdwn", text: header },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: buckets || "_No stale tickets detected._" },
      },
    ];

    if (keyObservations) {
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Key observations*\n${keyObservations}` } });
    }

    if (caseList) {
      blocks.push({ type: "section", text: { type: "mrkdwn", text: caseList } });
    }

    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Automated digest • ${new Date().toLocaleString("en-US", { timeZone: "UTC" })} UTC`,
        },
      ],
    });

    return {
      fallbackText: components,
      blocks,
    };
  }

  private buildFollowupMessage(
    summary: StaleCaseSummary,
    plan: FollowupPlan,
    config: AssignmentGroupConfig,
    ownerLabel: string,
  ): FollowupMessagePayload {
    const caseLink = summary.case.url ? `<${summary.case.url}|${summary.case.number}>` : summary.case.number;
    const header = `*${caseLink}* — ${summary.case.shortDescription ?? "No description"}`;

    const bodyLines = [
      `_Owner:_ ${ownerLabel} | _Priority:_ ${summary.case.priority ?? "n/a"} | _State:_ ${summary.case.state ?? "n/a"}`,
      `_Age:_ ${summary.ageDays}d • _Last update:_ ${summary.staleDays}d ago • _Queue:_ ${summary.case.assignmentGroup ?? "> n/a"}`,
      `\n*Summary:* ${plan.summary}`,
      plan.reminders.length ? `*Next actions:*\n${plan.reminders.map((item) => `• ${item}`).join("\n")}` : "",
      plan.questions.length ? `*Questions for ${ownerLabel}:*\n${plan.questions.map((q) => `• ${q}`).join("\n")}` : "",
    ].filter(Boolean);

    const blocks = [
      { type: "section", text: { type: "mrkdwn", text: header } },
      { type: "section", text: { type: "mrkdwn", text: bodyLines.join("\n") } },
      { type: "context", elements: [{ type: "mrkdwn", text: `Posted in ${config.slackChannelLabel ?? config.slackChannel}` }] },
    ];

    return {
      fallbackText: `${header}\n${bodyLines.join("\n")}`,
      blocks,
    };
  }

  private async buildFollowupPlan(summary: StaleCaseSummary): Promise<FollowupPlan> {
    try {
      const journals = summary.case.sysId
        ? await this.deps.caseRepository.getJournalEntries(summary.case.sysId, { limit: this.journalLimit })
        : [];

      const prompt = this.composePrompt(summary, journals ?? []);
      const response = await this.deps.chat.send({
        model: REVIEW_MODEL,
        maxTokens: 600,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You are a senior engineer performing case audits. Return tight JSON with keys summary (string), reminders (array of actionable bullet strings), questions (array of short owner-facing questions).",
          },
          { role: "user", content: prompt },
        ],
      });

      const parsed = this.parsePlan(response.outputText ?? "");
      if (parsed) {
        return parsed;
      }
    } catch (error) {
      console.error(`[StaleCaseFollowup] LLM review error for ${summary.case.number}`, error);
    }

    return this.buildFallbackPlan(summary);
  }

  private composePrompt(summary: StaleCaseSummary, journals: Array<{ createdOn: string; createdBy: string; value?: string }>): string {
    const caseDetails = [
      `Case: ${summary.case.number}`,
      `Title: ${summary.case.shortDescription ?? "n/a"}`,
      `Priority: ${summary.case.priority ?? "n/a"}`,
      `State: ${summary.case.state ?? "n/a"}`,
      `Assignment Group: ${summary.case.assignmentGroup ?? "n/a"}`,
      `Assignee: ${summary.case.assignedTo ?? "Unassigned"}`,
      `Age days: ${summary.ageDays ?? "n/a"}`,
      `Days since update: ${summary.staleDays}`,
    ].join("\n");

    const journalDigest = journals
      .map((entry) => {
        const timestamp = new Date(entry.createdOn).toISOString();
        const value = this.truncate(entry.value ?? "", 400);
        return `- [${timestamp}] ${entry.createdBy}: ${value}`;
      })
      .join("\n");

    return `${caseDetails}\n\nRecent journal/notes:\n${journalDigest || "(no journal entries)"}\n\nReturn JSON.`;
  }

  private parsePlan(text: string): FollowupPlan | null {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }
      const payload = JSON.parse(jsonMatch[0]);
      if (typeof payload.summary !== "string") {
        return null;
      }
      const reminders = Array.isArray(payload.reminders)
        ? payload.reminders.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
      const questions = Array.isArray(payload.questions)
        ? payload.questions.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
        : [];

      return {
        summary: payload.summary.trim(),
        reminders,
        questions,
      };
    } catch (error) {
      console.warn("[StaleCaseFollowup] Failed to parse LLM payload", error);
      return null;
    }
  }

  private buildFallbackPlan(summary: StaleCaseSummary): FollowupPlan {
    const shortDescription = summary.case.shortDescription ?? "No description";
    return {
      summary: `${shortDescription} has been idle for ${summary.staleDays} day(s). Please confirm status or next steps.`,
      reminders: [
        "Review the most recent work note and share an update in ServiceNow",
        "Confirm ownership or reassign if blocked",
      ],
      questions: ["Any blockers preventing progress?", "What is the next concrete action and ETA?"],
    };
  }

  private async recordWorkNote(caseItem: Case, plan: FollowupPlan, config: AssignmentGroupConfig): Promise<void> {
    if (!caseItem.sysId) {
      return;
    }

    const noteLines = [
      `AI follow-up posted to ${config.slackChannelLabel ?? config.slackChannel}.`,
      `Summary: ${plan.summary}`,
      plan.reminders.length ? `Actions: ${plan.reminders.join("; ")}` : undefined,
    ].filter(Boolean);

    try {
      await this.deps.caseRepository.addWorkNote(caseItem.sysId, noteLines.join("\n"), true);
    } catch (error) {
      console.error(`[StaleCaseFollowup] Failed to add work note for ${caseItem.number}`, error);
    }
  }

  private formatBuckets(cases: StaleCaseSummary[]): string {
    if (cases.length === 0) {
      return "_No stale tickets detected._";
    }

    const buckets: Record<string, StaleCaseSummary[]> = {
      "3-5 days": [],
      "6-10 days": [],
      "11+ days": [],
    };

    for (const entry of cases) {
      if (entry.staleDays <= 5) {
        buckets["3-5 days"].push(entry);
      } else if (entry.staleDays <= 10) {
        buckets["6-10 days"].push(entry);
      } else {
        buckets["11+ days"].push(entry);
      }
    }

    return Object.entries(buckets)
      .map(([label, items]) => `${label}: ${items.length}`)
      .join(" | ");
  }

  private buildObservations(cases: StaleCaseSummary[]): string {
    if (cases.length === 0) {
      return "";
    }

    const ownerCounts = new Map<string, number>();
    for (const entry of cases) {
      const owner = entry.case.assignedTo ?? "Unassigned";
      ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
    }

    const topOwners = Array.from(ownerCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([owner, count]) => `• ${owner}: ${count}/${cases.length} cases`)
      .join("\n");

    const oldest = cases[0];

    const lines = [topOwners];
    if (oldest) {
      const link = oldest.case.url ? `<${oldest.case.url}|${oldest.case.number}>` : oldest.case.number;
      lines.push(`• Oldest: ${link} (${oldest.staleDays}d stale, ${oldest.ageDays}d old)`);
    }

    return lines.filter(Boolean).join("\n");
  }

  private buildCaseList(cases: StaleCaseSummary[]): string {
    if (cases.length === 0) {
      return "";
    }

    const rows = cases.slice(0, 6).map((entry) => {
      const link = entry.case.url ? `<${entry.case.url}|${entry.case.number}>` : entry.case.number;
      return `• ${link} (${entry.staleDays}d stale) — ${entry.case.shortDescription ?? "No description"} | ${entry.case.assignedTo ?? "Unassigned"}`;
    });

    if (cases.length > 6) {
      rows.push(`… ${cases.length - 6} more case(s) not listed`);
    }

    return `*Stale cases snapshot*\n${rows.join("\n")}`;
  }

  private truncate(value: string, max: number): string {
    if (!value || value.length <= max) {
      return value;
    }
    return `${value.slice(0, max - 3)}...`;
  }
}

export async function getStaleCaseFollowupSummary(): Promise<FollowupRunSummary | null> {
  const stored = await getAppSetting(STALE_CASE_FOLLOWUP_STATE_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored);
    if (parsed && parsed.runAt && Array.isArray(parsed.groups)) {
      return parsed as FollowupRunSummary;
    }
  } catch (error) {
    console.warn("[StaleCaseFollowup] Failed to parse stored summary", error);
  }

  return null;
}
