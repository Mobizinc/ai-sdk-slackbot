import { describe, it, expect } from "vitest";
import {
  aggregateByAssignee,
  aggregateByPriority,
  aggregateByQueue,
  findOldestCases,
  findStaleCases,
} from "../lib/services/case-aggregator";
import type { Case } from "../lib/infrastructure/servicenow/types/domain-models";

function buildCase(overrides: Partial<Case> = {}): Case {
  const openedAt =
    overrides.openedAt ?? new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const updatedOn =
    overrides.updatedOn === null
      ? undefined
      : overrides.updatedOn ?? new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const assignmentGroup =
    overrides.assignmentGroup === null
      ? undefined
      : overrides.assignmentGroup ?? "Incident and Case Management";
  const assignedTo =
    overrides.assignedTo === null ? undefined : overrides.assignedTo;

  return {
    sysId: overrides.sysId ?? crypto.randomUUID(),
    number: overrides.number ?? `SCS${Math.floor(Math.random() * 1_000_0000)
      .toString()
      .padStart(7, "0")}`,
    shortDescription: overrides.shortDescription ?? "Sample case",
    description: overrides.description,
    priority: overrides.priority ?? "3",
    state: overrides.state ?? "Work in Progress",
    category: overrides.category,
    subcategory: overrides.subcategory,
    openedAt,
    updatedOn,
    ageDays: overrides.ageDays,
    assignmentGroup,
    assignmentGroupSysId: overrides.assignmentGroupSysId,
    assignedTo,
    assignedToSysId: overrides.assignedToSysId,
    openedBy: overrides.openedBy,
    openedBySysId: overrides.openedBySysId,
    callerId: overrides.callerId,
    callerIdSysId: overrides.callerIdSysId,
    submittedBy: overrides.submittedBy,
    contact: overrides.contact,
    contactName: overrides.contactName,
    account: overrides.account,
    accountName: overrides.accountName,
    company: overrides.company,
    url: overrides.url ?? "https://example.service-now.com",
  };
}

describe("Case Aggregator Service", () => {
  it("handles empty dataset gracefully", () => {
    expect(aggregateByAssignee([])).toEqual([]);
    expect(aggregateByPriority([])).toEqual([]);
    expect(aggregateByQueue([])).toEqual([]);
    expect(findOldestCases([])).toEqual([]);
    expect(findStaleCases([])).toEqual([]);
  });

  it("aggregates all cases under a single assignee correctly", () => {
    const cases: Case[] = [
      buildCase({ assignedTo: "Alice" }),
      buildCase({ assignedTo: "Alice" }),
      buildCase({ assignedTo: "Alice" }),
    ];

    const result = aggregateByAssignee(cases);

    expect(result).toHaveLength(1);
    expect(result[0].assignee).toBe("Alice");
    expect(result[0].count).toBe(3);
  });

  it("falls back to openedAt when updatedOn is missing for stale detection", () => {
    const openedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const cases: Case[] = [
      buildCase({
        number: "SCS0040001",
        openedAt,
        updatedOn: null,
      }),
    ];

    const result = findStaleCases(cases, 7);

    expect(result).toHaveLength(1);
    expect(result[0].staleDays).toBeGreaterThanOrEqual(9);
  });

  it("correctly identifies threshold edge cases", () => {
    const now = Date.now();
    const cases: Case[] = [
      buildCase({
        number: "SCS0041001",
        openedAt: new Date(now - 8 * 24 * 60 * 60 * 1000),
        updatedOn: new Date(now - 7 * 24 * 60 * 60 * 1000),
      }),
      buildCase({
        number: "SCS0041002",
        openedAt: new Date(now - 7 * 24 * 60 * 60 * 1000),
        updatedOn: new Date(now - 6.9 * 24 * 60 * 60 * 1000),
      }),
    ];

    const result = findStaleCases(cases, 7);
    expect(result.map((item) => item.case.number)).toEqual(["SCS0041001"]);
  });

  it("sorts by oldest opened date", () => {
    const oldest = buildCase({
      number: "SCS0042000",
      openedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
    });
    const newest = buildCase({
      number: "SCS0042001",
      openedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    });

    const result = findOldestCases([newest, oldest], 5);
    expect(result[0].case.number).toBe("SCS0042000");
  });

  it("groups by assignment group", () => {
    const cases: Case[] = [
      buildCase({ assignmentGroup: "Network Ops" }),
      buildCase({ assignmentGroup: "Network Ops" }),
      buildCase({ assignmentGroup: "Database Ops" }),
      buildCase({ assignmentGroup: null }),
    ];

    const result = aggregateByQueue(cases);
    expect(result.find((row) => row.queue === "Network Ops")?.count).toBe(2);
    expect(result.find((row) => row.queue === "Database Ops")?.count).toBe(1);
    expect(result.find((row) => row.queue === "Unassigned Queue")?.count).toBe(1);
  });

  it("aggregates by priority order", () => {
    const cases: Case[] = [
      buildCase({ priority: "4" }),
      buildCase({ priority: "2" }),
      buildCase({ priority: "1" }),
    ];

    const result = aggregateByPriority(cases);
    expect(result[0].priority).toBe("1");
    expect(result[1].priority).toBe("2");
  });

  it("processes 50 cases within performance budget", () => {
    const cases: Case[] = Array.from({ length: 50 }, (_, index) =>
      buildCase({
        number: `SCS50${index.toString().padStart(5, "0")}`,
        assignedTo: index % 2 === 0 ? "Alice" : "Bob",
      })
    );

    const start = performance.now();
    aggregateByAssignee(cases);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100);
  });
});
