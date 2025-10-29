/**
 * ServiceNow Output Formatters
 *
 * This module provides deterministic, structured output formatters for ServiceNow tools.
 * All formatters return consistent sections: Summary, Current State, Latest Activity, Context, References
 */

import type {
  ServiceNowCaseResult,
  ServiceNowCaseJournalEntry,
  ServiceNowIncidentResult,
  ServiceNowCaseSummary,
  ServiceNowConfigurationItem,
} from "../tools/servicenow";

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum length for individual journal entries before truncation
 */
const MAX_JOURNAL_ENTRY_LENGTH = 1000;

/**
 * Number of journal entries to show in Latest Activity sections
 */
const MAX_JOURNAL_ENTRIES = 5;

// ============================================================================
// Type Definitions
// ============================================================================

export interface SanitizedJournalEntry {
  timestamp: string | null;
  author: string;
  text: string;
  wasTruncated: boolean;
}

// ============================================================================
// Core Sanitization Helpers
// ============================================================================

/**
 * Sanitizes text by removing HTML tags and normalizing whitespace
 *
 * @param value - Raw text that may contain HTML tags
 * @returns Sanitized text or null if empty
 */
export function sanitizeCaseText(value?: string | null): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?p>/gi, " ")
    .replace(/<\/?strong>/gi, "")
    .replace(/<\/?em>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length ? cleaned : null;
}

/**
 * Formats a timestamp for display in journal entries
 * Returns format: "Jan 15, 14:30"
 *
 * @param timestamp - ISO 8601 timestamp string
 * @returns Formatted timestamp or null if invalid
 */
export function formatJournalTimestamp(timestamp?: string | null): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Truncates text at word boundaries with ellipsis indicator
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with ellipsis if needed, and truncation flag
 */
export function truncateWithEllipsis(
  text: string,
  maxLength: number = MAX_JOURNAL_ENTRY_LENGTH,
): { text: string; wasTruncated: boolean } {
  if (text.length <= maxLength) {
    return { text, wasTruncated: false };
  }

  // Find the last space before maxLength to avoid cutting mid-word
  const truncateAt = text.lastIndexOf(" ", maxLength - 3); // -3 for "..."
  const cutoff = truncateAt > 0 ? truncateAt : maxLength - 3;

  return {
    text: text.slice(0, cutoff).trim() + "...",
    wasTruncated: true,
  };
}

// ============================================================================
// Journal Entry Processing
// ============================================================================

/**
 * Sanitizes a single journal entry: strips HTML, truncates to max length, normalizes whitespace
 *
 * @param entry - Raw ServiceNow journal entry
 * @returns Sanitized journal entry with metadata
 */
export function sanitizeJournalEntry(
  entry: ServiceNowCaseJournalEntry,
): SanitizedJournalEntry {
  const timestamp = formatJournalTimestamp(entry.sys_created_on);
  const author = sanitizeCaseText(entry.sys_created_by) ?? "unknown";
  const rawText = sanitizeCaseText(entry.value) ?? "(no content)";

  const { text, wasTruncated } = truncateWithEllipsis(rawText);

  return {
    timestamp,
    author,
    text,
    wasTruncated,
  };
}

/**
 * Deduplicates consecutive journal entries with identical content
 *
 * @param entries - Array of journal entries
 * @returns Deduplicated array
 */
export function deduplicateJournalEntries(
  entries: ServiceNowCaseJournalEntry[],
): ServiceNowCaseJournalEntry[] {
  if (entries.length === 0) return entries;

  const deduplicated: ServiceNowCaseJournalEntry[] = [entries[0]];

  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];

    // Skip if value is identical to previous entry
    if (curr.value !== prev.value) {
      deduplicated.push(curr);
    }
  }

  return deduplicated;
}

// ============================================================================
// Output Formatters for LLM
// ============================================================================

/**
 * Formats case data with journal entries into structured sections
 *
 * Sections: Summary, Current State, Latest Activity, Context, References
 *
 * @param caseRecord - ServiceNow case record
 * @param journalEntries - Journal entries for the case
 * @returns Formatted text with sections or null if no data
 */
export function formatCaseSummaryText(
  caseRecord: ServiceNowCaseResult,
  journalEntries: ServiceNowCaseJournalEntry[],
): string | null {
  const summary = sanitizeCaseText(caseRecord.short_description);
  const state = sanitizeCaseText(caseRecord.state);
  const priority = sanitizeCaseText(caseRecord.priority);
  const assignedTo = sanitizeCaseText(caseRecord.assigned_to);
  const context = sanitizeCaseText(caseRecord.description);
  const account = sanitizeCaseText(caseRecord.account);
  const requester = sanitizeCaseText(caseRecord.submitted_by);

  const sections: string[] = [];

  // Summary section
  if (summary) {
    sections.push("Summary", summary);
  }

  // Current State section
  const currentStateParts: string[] = [];
  if (state) currentStateParts.push(`Status: ${state}`);
  if (priority) currentStateParts.push(`Priority: ${priority}`);
  if (assignedTo) currentStateParts.push(`Assigned: ${assignedTo}`);

  if (currentStateParts.length > 0) {
    sections.push("Current State", currentStateParts.join(" | "));
  }

  // Latest Activity section - show last 5 entries
  const dedupedEntries = deduplicateJournalEntries(journalEntries);
  const latestActivityLines = dedupedEntries
    .slice(0, MAX_JOURNAL_ENTRIES)
    .map((entry) => {
      const sanitized = sanitizeJournalEntry(entry);
      const when = sanitized.timestamp ?? "recent";
      const truncationIndicator = sanitized.wasTruncated ? " [truncated]" : "";
      return `• ${when} – ${sanitized.author}: ${sanitized.text}${truncationIndicator}`;
    })
    .filter(Boolean);

  if (latestActivityLines.length > 0) {
    sections.push("Latest Activity", latestActivityLines.join("\n"));
  }

  // Context section
  if (context) {
    sections.push("Context", context);
  } else if (account || requester) {
    const contextParts: string[] = [];
    if (account) contextParts.push(`Account: ${account}`);
    if (requester) contextParts.push(`Requester: ${requester}`);
    if (contextParts.length > 0) {
      sections.push("Context", contextParts.join(" | "));
    }
  }

  // References section
  const referenceLines: string[] = [];
  if (caseRecord.number && caseRecord.url) {
    referenceLines.push(`• <${caseRecord.url}|${caseRecord.number}>`);
  } else if (caseRecord.number) {
    referenceLines.push(`• ${caseRecord.number}`);
  }

  if (referenceLines.length > 0) {
    sections.push("References", referenceLines.join("\n"));
  }

  if (sections.length === 0) {
    return null;
  }

  return sections.join("\n\n");
}

/**
 * Formats incident data into structured sections
 *
 * Sections: Summary, Current State, References
 *
 * @param incident - ServiceNow incident record
 * @returns Formatted text with sections or null if no data
 */
export function formatIncidentForLLM(
  incident: ServiceNowIncidentResult,
): string | null {
  const summary = sanitizeCaseText(incident.short_description);
  const state = sanitizeCaseText(incident.state);

  const sections: string[] = [];

  // Summary section
  if (summary) {
    sections.push("Summary", summary);
  }

  // Current State section
  const currentStateParts: string[] = [];
  if (state) currentStateParts.push(`Status: ${state}`);

  if (currentStateParts.length > 0) {
    sections.push("Current State", currentStateParts.join(" | "));
  }

  // References section
  const referenceLines: string[] = [];
  if (incident.number && incident.url) {
    referenceLines.push(`• <${incident.url}|${incident.number}>`);
  } else if (incident.number) {
    referenceLines.push(`• ${incident.number}`);
  }

  if (referenceLines.length > 0) {
    sections.push("References", referenceLines.join("\n"));
  }

  if (sections.length === 0) {
    return null;
  }

  return sections.join("\n\n");
}

/**
 * Formats journal entries into structured, sanitized list
 *
 * Sections: Summary (count), Latest Activity (entries)
 *
 * @param entries - Array of journal entries
 * @param caseName - Optional case number/name for context
 * @returns Formatted text with sections or null if no entries
 */
export function formatJournalEntriesForLLM(
  entries: ServiceNowCaseJournalEntry[],
  caseName?: string,
): string | null {
  if (entries.length === 0) {
    return null;
  }

  const sections: string[] = [];

  // Summary section
  const summaryText = caseName
    ? `${entries.length} journal entries for ${caseName}`
    : `${entries.length} journal entries`;
  sections.push("Summary", summaryText);

  // Latest Activity section - show up to MAX_JOURNAL_ENTRIES
  const dedupedEntries = deduplicateJournalEntries(entries);
  const activityLines = dedupedEntries
    .slice(0, MAX_JOURNAL_ENTRIES)
    .map((entry) => {
      const sanitized = sanitizeJournalEntry(entry);
      const when = sanitized.timestamp ?? "recent";
      const truncationIndicator = sanitized.wasTruncated ? " [truncated]" : "";
      return `• ${when} – ${sanitized.author}: ${sanitized.text}${truncationIndicator}`;
    })
    .filter(Boolean);

  if (activityLines.length > 0) {
    sections.push("Latest Activity", activityLines.join("\n"));
  }

  if (dedupedEntries.length > MAX_JOURNAL_ENTRIES) {
    sections.push(
      "Context",
      `Showing ${MAX_JOURNAL_ENTRIES} of ${dedupedEntries.length} entries`,
    );
  }

  return sections.join("\n\n");
}

/**
 * Formats case search results into structured summary with top results
 *
 * Sections: Summary (count), Current State (filters), Latest Activity (top results), Context
 *
 * @param cases - Array of case summaries
 * @param filters - Applied filter descriptions
 * @param total - Total number of matching cases
 * @returns Formatted text with sections or null if no results
 */
export function formatSearchResultsForLLM(
  cases: ServiceNowCaseSummary[],
  filters: string[],
  total?: number,
): string | null {
  if (cases.length === 0) {
    return "Summary\nNo cases found matching the search criteria.";
  }

  const sections: string[] = [];

  // Summary section
  const totalText = total !== undefined ? total : cases.length;
  sections.push("Summary", `Found ${totalText} case${totalText !== 1 ? "s" : ""}`);

  // Current State section - applied filters
  if (filters.length > 0) {
    sections.push("Current State", `Filters: ${filters.join(", ")}`);
  }

  // Latest Activity section - top results (up to 10)
  const topCases = cases.slice(0, 10);
  const caseLines = topCases.map((caseItem) => {
    const desc = sanitizeCaseText(caseItem.short_description) ?? "(no description)";
    const priority = caseItem.priority ? ` [P${caseItem.priority}]` : "";
    const state = caseItem.state ? ` (${caseItem.state})` : "";

    if (caseItem.url) {
      return `• <${caseItem.url}|${caseItem.number}>: ${desc}${priority}${state}`;
    }
    return `• ${caseItem.number}: ${desc}${priority}${state}`;
  });

  sections.push("Latest Activity", caseLines.join("\n"));

  // Context section - if showing subset
  if (totalText > topCases.length) {
    sections.push("Context", `Showing top ${topCases.length} of ${totalText} results`);
  }

  return sections.join("\n\n");
}

/**
 * Formats configuration items (CMDB) into structured list
 *
 * Sections: Summary (count), Latest Activity (items with key fields), Context
 *
 * @param items - Array of configuration items
 * @returns Formatted text with sections or null if no items
 */
export function formatConfigurationItemsForLLM(
  items: ServiceNowConfigurationItem[],
): string | null {
  if (items.length === 0) {
    return "Summary\nNo configuration items found.";
  }

  const sections: string[] = [];

  // Summary section
  sections.push(
    "Summary",
    `Found ${items.length} configuration item${items.length !== 1 ? "s" : ""}`,
  );

  // Latest Activity section - show items with key fields (up to 10)
  const topItems = items.slice(0, 10);
  const itemLines = topItems.map((item) => {
    const parts: string[] = [];

    // Name with URL
    if (item.url) {
      parts.push(`<${item.url}|${item.name}>`);
    } else {
      parts.push(item.name);
    }

    // Key metadata
    const metadata: string[] = [];
    if (item.sys_class_name) metadata.push(`Type: ${item.sys_class_name}`);
    if (item.status) metadata.push(`Status: ${item.status}`);
    if (item.environment) metadata.push(`Env: ${item.environment}`);
    if (item.ip_addresses.length > 0) {
      metadata.push(`IPs: ${item.ip_addresses.join(", ")}`);
    }

    if (metadata.length > 0) {
      parts.push(`[${metadata.join(" | ")}]`);
    }

    return `• ${parts.join(" ")}`;
  });

  sections.push("Latest Activity", itemLines.join("\n"));

  // Context section - if showing subset
  if (items.length > topItems.length) {
    sections.push("Context", `Showing top ${topItems.length} of ${items.length} items`);
  }

  return sections.join("\n\n");
}
