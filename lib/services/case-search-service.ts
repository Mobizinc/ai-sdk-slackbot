/**
 * Case Search Service
 *
 * Thin wrapper around the ServiceNow case repository that exposes
 * search functionality with friendly filter names for agent tooling.
 */

import { getCaseRepository, getCustomerAccountRepository } from "../infrastructure/servicenow/repositories/factory";
import type { Case, CaseSearchCriteria } from "../infrastructure/servicenow/types/domain-models";

export interface CaseSearchFilters {
  accountName?: string;
  companyName?: string;
  query?: string;
  assignmentGroup?: string;
  assignedTo?: string;
  priority?: string;
  state?: string;
  openedAfter?: string;
  openedBefore?: string;
  updatedBefore?: string; // NEW: For stale case detection
  updatedAfter?: string;
  resolvedAfter?: string;
  resolvedBefore?: string;
  closedAfter?: string;
  closedBefore?: string;
  activeOnly?: boolean;
  sysDomain?: string; // NEW: Domain sys_id for multi-tenant filtering
  includeChildDomains?: boolean; // NEW: Include child domains in hierarchical search
  sortBy?: CaseSearchCriteria["sortBy"];
  sortOrder?: CaseSearchCriteria["sortOrder"];
  limit?: number;
  offset?: number; // NEW: For pagination
}

/**
 * Search result with metadata for better UX
 */
export interface CaseSearchResult {
  cases: Case[];
  totalFound: number;
  appliedFilters: CaseSearchFilters;
  hasMore: boolean;
  nextOffset?: number;
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    console.warn(`[CaseSearchService] Ignoring invalid date filter "${value}"`);
    return undefined;
  }

  return parsed;
}

export class CaseSearchService {
  private readonly caseRepository = getCaseRepository();
  private readonly customerAccountRepository = getCustomerAccountRepository();

  /**
   * Search cases with metadata (preferred for new code)
   */
  async searchWithMetadata(filters: CaseSearchFilters = {}): Promise<CaseSearchResult> {
    const limit = Math.min(filters.limit ?? 25, 50); // Default 25, max 50
    const offset = filters.offset ?? 0;

    const criteria: CaseSearchCriteria = {
      accountName: filters.accountName,
      companyName: filters.companyName,
      query: filters.query,
      assignmentGroup: filters.assignmentGroup,
      assignedTo: filters.assignedTo,
      priority: filters.priority,
      state: filters.state,
      openedAfter: parseDate(filters.openedAfter),
      openedBefore: parseDate(filters.openedBefore),
      updatedAfter: parseDate(filters.updatedAfter),
      updatedBefore: parseDate(filters.updatedBefore),
      resolvedAfter: parseDate(filters.resolvedAfter),
      resolvedBefore: parseDate(filters.resolvedBefore),
      closedAfter: parseDate(filters.closedAfter),
      closedBefore: parseDate(filters.closedBefore),
      activeOnly: filters.activeOnly,
      sysDomain: filters.sysDomain,
      includeChildDomains: filters.includeChildDomains,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      limit,
      offset,
    };

    try {
      const searchResult: any = await this.caseRepository.search(criteria);
      const cases: Case[] = Array.isArray(searchResult)
        ? searchResult
        : searchResult?.cases ?? [];
      const totalCount: number =
        typeof searchResult?.totalCount === "number"
          ? searchResult.totalCount
          : offset + cases.length;

      // Calculate metadata
      const totalFound = totalCount; // Use real total from ServiceNow, not offset + length
      const hasMore = offset + cases.length < totalCount;
      const nextOffset = hasMore ? offset + limit : undefined;

      return {
        cases,
        totalFound,
        appliedFilters: filters,
        hasMore,
        nextOffset,
      };
    } catch (error) {
      console.error("[CaseSearchService] Failed to search cases:", error);
      return {
        cases: [],
        totalFound: 0,
        appliedFilters: filters,
        hasMore: false,
      };
    }
  }

  /**
   * Search cases (legacy method for backward compatibility)
   */
  async search(filters: CaseSearchFilters = {}): Promise<Case[]> {
    const result = await this.searchWithMetadata(filters);
    return result.cases;
  }

  /**
   * Find stale cases (no updates in X days)
   */
  async findStaleCases(staleDays: number = 7, limit: number = 25): Promise<Case[]> {
    const updatedBefore = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

    const result = await this.searchWithMetadata({
      activeOnly: true,
      updatedBefore: updatedBefore.toISOString(),
      sortBy: "updated_on",
      sortOrder: "asc", // Oldest updates first
      limit,
    });

    return result.cases;
  }

  /**
   * Find oldest open cases
   */
  async findOldestCases(limit: number = 10): Promise<Case[]> {
    const result = await this.searchWithMetadata({
      activeOnly: true,
      sortBy: "opened_at",
      sortOrder: "asc", // Oldest first
      limit,
    });

    return result.cases;
  }

  /**
   * Build human-readable summary of applied filters
   */
  buildFilterSummary(filters: CaseSearchFilters): string {
    const parts: string[] = [];

    if (filters.accountName) parts.push(`Customer: ${filters.accountName}`);
    if (filters.companyName) parts.push(`Company: ${filters.companyName}`);
    if (filters.assignmentGroup) parts.push(`Queue: ${filters.assignmentGroup}`);
    if (filters.assignedTo) parts.push(`Assignee: ${filters.assignedTo}`);
    if (filters.priority) parts.push(`Priority: ${filters.priority}`);
    if (filters.state) parts.push(`State: ${filters.state}`);
    if (filters.query) parts.push(`Keyword: "${filters.query}"`);
    if (filters.openedAfter) parts.push(`Opened after: ${parseDate(filters.openedAfter)?.toLocaleDateString()}`);
    if (filters.openedBefore) parts.push(`Opened before: ${parseDate(filters.openedBefore)?.toLocaleDateString()}`);
    if (filters.updatedBefore) parts.push(`Updated before: ${parseDate(filters.updatedBefore)?.toLocaleDateString()}`);
    if (filters.updatedAfter) parts.push(`Updated after: ${parseDate(filters.updatedAfter)?.toLocaleDateString()}`);
    if (filters.resolvedAfter) parts.push(`Resolved after: ${parseDate(filters.resolvedAfter)?.toLocaleDateString()}`);
    if (filters.resolvedBefore) parts.push(`Resolved before: ${parseDate(filters.resolvedBefore)?.toLocaleDateString()}`);
    if (filters.closedAfter) parts.push(`Closed after: ${parseDate(filters.closedAfter)?.toLocaleDateString()}`);
    if (filters.closedBefore) parts.push(`Closed before: ${parseDate(filters.closedBefore)?.toLocaleDateString()}`);
    if (filters.sysDomain) {
      const domainType = filters.includeChildDomains ? "Domain (with children)" : "Domain";
      parts.push(`${domainType}: ${filters.sysDomain}`);
    }

    return parts.length > 0 ? parts.join(" | ") : "No filters applied";
  }

  /**
   * Suggest customer account names similar to the provided input
   */
  async suggestCustomerNames(partialName: string, limit: number = 5): Promise<string[]> {
    if (!partialName || !partialName.trim()) {
      return [];
    }

    try {
      const matches = await this.customerAccountRepository.searchByName(partialName, { limit });
      const unique = Array.from(
        new Set(
          matches
            .map((account) => account.name?.trim())
            .filter((name): name is string => Boolean(name))
        )
      );
      return unique.slice(0, limit);
    } catch (error) {
      console.warn(`[CaseSearchService] Failed to suggest customers for "${partialName}":`, error);
      return [];
    }
  }
}

export const caseSearchService = new CaseSearchService();
