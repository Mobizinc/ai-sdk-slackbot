/**
 * Case Aggregator Service
 *
 * Provides reusable aggregation helpers for ServiceNow case datasets.
 * Supports workload distribution, priority breakdown, queue analysis,
 * and aging/staleness calculations for ops dashboards.
 */

import type { Case } from "../infrastructure/servicenow/types/domain-models";

export interface AssigneeAggregation {
  assignee: string;
  count: number;
  averageAgeDays: number;
  oldestCase?: Case;
  cases: Case[];
}

export interface PriorityAggregation {
  priority: string;
  count: number;
  cases: Case[];
}

export interface QueueAggregation {
  queue: string;
  count: number;
  cases: Case[];
}

export interface OldestCaseSummary {
  case: Case;
  ageDays: number;
}

export interface StaleCaseSummary {
  case: Case;
  staleDays: number;
  ageDays: number;
  isHighPriority: boolean;
}

/**
 * Calculate number of days since the case was opened.
 */
export function calculateAgeDays(openedAt?: Date): number {
  if (!openedAt) {
    return 0;
  }

  const diff = Date.now() - openedAt.getTime();
  return diff > 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0;
}

/**
 * Calculate number of days since the case was last updated.
 */
export function calculateStaleDays(updatedOn?: Date): number {
  if (!updatedOn) {
    return 0;
  }

  const diff = Date.now() - updatedOn.getTime();
  return diff > 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0;
}

/**
 * Sort cases by age (oldest first).
 * Returns a new array (does not mutate original).
 */
export function sortByAge(cases: Case[]): Case[] {
  return [...cases].sort((a, b) => {
    const ageA = calculateAgeDays(a.openedAt);
    const ageB = calculateAgeDays(b.openedAt);
    return ageB - ageA;
  });
}

/**
 * Generic groupBy utility.
 */
export function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();

  for (const item of items) {
    const key = keyFn(item);
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      map.set(key, [item]);
    }
  }

  return map;
}

/**
 * Aggregate cases by assignee (workload distribution).
 */
export function aggregateByAssignee(cases: Case[]): AssigneeAggregation[] {
  if (cases.length === 0) {
    return [];
  }

  const groups = groupBy(cases, (item) =>
    item.assignedTo && item.assignedTo.trim().length > 0 ? item.assignedTo : "Unassigned"
  );

  const results: AssigneeAggregation[] = [];

  for (const [assignee, items] of groups.entries()) {
    const ages = items.map((c) => calculateAgeDays(c.openedAt));
    const averageAge = ages.length === 0 ? 0 : Math.round(ages.reduce((sum, val) => sum + val, 0) / ages.length);

    const oldestCase = sortByAge(items)[0];

    results.push({
      assignee,
      count: items.length,
      averageAgeDays: averageAge,
      oldestCase,
      cases: items,
    });
  }

  return results.sort((a, b) => b.count - a.count || a.assignee.localeCompare(b.assignee));
}

/**
 * Aggregate cases by priority.
 */
export function aggregateByPriority(cases: Case[]): PriorityAggregation[] {
  if (cases.length === 0) {
    return [];
  }

  const groups = groupBy(cases, (item) => (item.priority && item.priority.trim().length > 0 ? item.priority : "Unknown"));
  const results: PriorityAggregation[] = [];

  for (const [priority, items] of groups.entries()) {
    results.push({
      priority,
      count: items.length,
      cases: items,
    });
  }

  const priorityRank = new Map<string, number>([
    ["1", 1],
    ["2", 2],
    ["3", 3],
    ["4", 4],
    ["5", 5],
  ]);

  return results.sort((a, b) => {
    const rankA = priorityRank.get(a.priority) ?? Number.MAX_SAFE_INTEGER;
    const rankB = priorityRank.get(b.priority) ?? Number.MAX_SAFE_INTEGER;

    if (rankA !== rankB) {
      return rankA - rankB;
    }

    return b.count - a.count;
  });
}

/**
 * Aggregate cases by assignment group / queue.
 */
export function aggregateByQueue(cases: Case[]): QueueAggregation[] {
  if (cases.length === 0) {
    return [];
  }

  const groups = groupBy(
    cases,
    (item) => (item.assignmentGroup && item.assignmentGroup.trim().length > 0 ? item.assignmentGroup : "Unassigned Queue")
  );

  const results: QueueAggregation[] = [];
  for (const [queue, items] of groups.entries()) {
    results.push({
      queue,
      count: items.length,
      cases: items,
    });
  }

  return results.sort((a, b) => b.count - a.count || a.queue.localeCompare(b.queue));
}

/**
 * Find the oldest N cases by opened_at date.
 */
export function findOldestCases(cases: Case[], limit: number = 10): OldestCaseSummary[] {
  if (cases.length === 0) {
    return [];
  }

  const sorted = sortByAge(cases);
  return sorted.slice(0, limit).map((caseItem) => ({
    case: caseItem,
    ageDays: calculateAgeDays(caseItem.openedAt),
  }));
}

/**
 * Find cases that have not been updated within the provided threshold.
 */
export function findStaleCases(cases: Case[], thresholdDays: number = 7): StaleCaseSummary[] {
  if (cases.length === 0) {
    return [];
  }

  return cases
    .map((caseItem) => {
      const updatedOn = caseItem.updatedOn ?? caseItem.openedAt;
      const staleDays = calculateStaleDays(updatedOn);

      return {
        case: caseItem,
        staleDays,
        ageDays: calculateAgeDays(caseItem.openedAt),
        isHighPriority: caseItem.priority === "1" || caseItem.priority === "2",
      };
    })
    .filter((entry) => entry.staleDays >= thresholdDays)
    .sort((a, b) => b.staleDays - a.staleDays || b.ageDays - a.ageDays);
}
