import { describe, it, expect, vi, beforeEach } from "vitest";
import { StaleCaseFollowupService, type AssignmentGroupConfig } from "../../lib/services/stale-case-followup-service";
import type { Case } from "../../lib/infrastructure/servicenow/types/domain-models";

const buildCase = (overrides: Partial<Case> = {}): Case => ({
  sysId: overrides.sysId ?? "sys1",
  number: overrides.number ?? "SCS0001",
  shortDescription: overrides.shortDescription ?? "Sample issue",
  description: overrides.description,
  priority: overrides.priority ?? "3 - Moderate",
  impact: overrides.impact,
  state: overrides.state ?? "In Progress",
  category: overrides.category,
  subcategory: overrides.subcategory,
  openedAt: overrides.openedAt ?? new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  updatedOn: overrides.updatedOn ?? new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  assignmentGroup: overrides.assignmentGroup ?? "Network Engineers",
  assignmentGroupSysId: overrides.assignmentGroupSysId,
  assignedTo: overrides.assignedTo ?? "Owner One",
  assignedToSysId: overrides.assignedToSysId,
  openedBy: overrides.openedBy,
  openedBySysId: overrides.openedBySysId,
  callerId: overrides.callerId,
  callerIdSysId: overrides.callerIdSysId,
  submittedBy: overrides.submittedBy,
  contact: overrides.contact,
  contactName: overrides.contactName,
  contactPhone: overrides.contactPhone,
  account: overrides.account,
  accountName: overrides.accountName,
  company: overrides.company,
  companyName: overrides.companyName,
  businessService: overrides.businessService,
  location: overrides.location,
  cmdbCi: overrides.cmdbCi,
  urgency: overrides.urgency,
  sysDomain: overrides.sysDomain,
  sysDomainPath: overrides.sysDomainPath,
  url: overrides.url ?? "https://example.com/case/SCS0001",
});

describe("StaleCaseFollowupService", () => {
  const groupConfig: AssignmentGroupConfig = {
    assignmentGroup: "Network Engineers",
    slackChannel: "C123",
    slackChannelLabel: "#net-eng",
  };

  const buildDeps = () => {
    const searchMock = {
      searchWithMetadata: vi.fn(),
    };

    const caseRepoMock = {
      getJournalEntries: vi.fn(),
      addWorkNote: vi.fn(),
    };

    const slackMock = {
      postMessage: vi.fn(),
    } as any;

    const chatMock = {
      send: vi.fn(),
    } as any;

    const userDirectoryMock = {
      resolveSlackMention: vi.fn().mockResolvedValue("<@U123>"),
    } as any;

    const persistRunSummary = vi.fn().mockResolvedValue(undefined);

    return { searchMock, caseRepoMock, slackMock, chatMock, userDirectoryMock, persistRunSummary };
  };

  beforeEach(() => {
    vi.useRealTimers();
  });

  it("posts summaries and follow-ups with work notes", async () => {
    const deps = buildDeps();
    const staleCase = buildCase({ assignedTo: "Owner One" });

    deps.searchMock.searchWithMetadata.mockResolvedValue({
      cases: [staleCase],
      totalFound: 1,
      appliedFilters: {},
      hasMore: false,
    });

    deps.caseRepoMock.getJournalEntries.mockResolvedValue([
      { createdOn: new Date().toISOString(), createdBy: "system", value: "Initial note" },
    ]);

    deps.slackMock.postMessage.mockResolvedValue({ ok: true, ts: "111" });

    deps.chatMock.send.mockResolvedValue({
      outputText: JSON.stringify({
        summary: "Needs update",
        reminders: ["Share ETA"],
        questions: ["Any blockers?"],
      }),
    });

    const service = new StaleCaseFollowupService({
      caseSearch: deps.searchMock,
      caseRepository: deps.caseRepoMock,
      slack: deps.slackMock,
      chat: deps.chatMock,
      userDirectory: deps.userDirectoryMock,
      persistRunSummary: deps.persistRunSummary,
    } as any);

    const summary = await service.run([groupConfig]);

    expect(summary.groups[0].totalCases).toBe(1);
    expect(summary.groups[0].followupsPosted).toBe(1);
    expect(deps.slackMock.postMessage).toHaveBeenCalledTimes(2);
    expect(deps.caseRepoMock.addWorkNote).toHaveBeenCalledWith(
      staleCase.sysId,
      expect.stringContaining("Needs update"),
      true,
    );
    expect(deps.userDirectoryMock.resolveSlackMention).toHaveBeenCalled();
    expect(deps.persistRunSummary).toHaveBeenCalled();
  });

  it("still posts summary even when no stale cases", async () => {
    const deps = buildDeps();

    deps.searchMock.searchWithMetadata.mockResolvedValue({
      cases: [],
      totalFound: 0,
      appliedFilters: {},
      hasMore: false,
    });

    deps.caseRepoMock.getJournalEntries.mockResolvedValue([]);
    deps.slackMock.postMessage.mockResolvedValue({ ok: true, ts: "222" });
    deps.chatMock.send.mockResolvedValue({ outputText: "" });

    const service = new StaleCaseFollowupService({
      caseSearch: deps.searchMock,
      caseRepository: deps.caseRepoMock,
      slack: deps.slackMock,
      chat: deps.chatMock,
      userDirectory: deps.userDirectoryMock,
      persistRunSummary: deps.persistRunSummary,
    } as any);

    const summary = await service.run([groupConfig]);

    expect(summary.groups[0].totalCases).toBe(0);
    expect(summary.groups[0].followupsPosted).toBe(0);
    expect(deps.slackMock.postMessage).toHaveBeenCalledTimes(1);
  });
});
