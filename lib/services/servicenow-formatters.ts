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
import { formatIncidentAsBlockKit, generateIncidentFallbackText } from "../formatters/servicenow-block-kit";

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum length for individual journal entries before truncation
 * Increased to allow more detailed context for AI reasoning
 */
const MAX_JOURNAL_ENTRY_LENGTH = 8000;

/**
 * Number of journal entries to show in Latest Activity sections
 * Increased to provide richer historical context
 */
const MAX_JOURNAL_ENTRIES = 20;

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
 * Returns both a formatted summary for quick context and raw data for deep analysis.
 * Sections: Summary, Current State, Latest Activity, Context, References
 *
 * @param caseRecord - ServiceNow case record
 * @param journalEntries - Journal entries for the case
 * @returns Object with summary (formatted text) and rawData (full case + journals)
 */
export function formatCaseSummaryText(
  caseRecord: ServiceNowCaseResult,
  journalEntries: ServiceNowCaseJournalEntry[],
): { summary: string; rawData: { case: ServiceNowCaseResult; journals: ServiceNowCaseJournalEntry[] } } | null {
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

  return {
    summary: sections.join("\n\n"),
    rawData: {
      case: caseRecord,
      journals: journalEntries,
    },
  };
}

/**
 * Formats incident data into structured sections with Block Kit support
 *
 * Returns formatted summary for LLM context, Block Kit blocks for Slack UI,
 * and raw data for deep analysis.
 *
 * @param incident - ServiceNow incident record
 * @returns Object with summary (formatted text), blocks (Block Kit), and rawData
 */
export function formatIncidentForLLM(
  incident: ServiceNowIncidentResult,
): { summary: string; blocks: any[]; fallbackText: string; rawData: ServiceNowIncidentResult } | null {
  const summary = sanitizeCaseText(incident.short_description);
  const state = sanitizeCaseText(incident.state);

  const sections: string[] = [];

  // Summary section
  if (summary) {
    sections.push("*Summary*", summary);
  }

  // Current State section - Enhanced with more details
  const currentStateParts: string[] = [];
  if (state) currentStateParts.push(`Status: ${state}`);
  if (incident.priority) currentStateParts.push(`Priority: ${sanitizeCaseText(incident.priority)}`);
  if (incident.assigned_to) {
    currentStateParts.push(`Assigned: ${sanitizeCaseText(incident.assigned_to)}`);
  } else {
    currentStateParts.push("Assigned: Unassigned");
  }

  if (currentStateParts.length > 0) {
    sections.push("*Current State*", currentStateParts.join(" | "));
  }

  // Metadata section - timestamps and company
  const metaParts: string[] = [];
  if (incident.sys_created_on) {
    const createdDate = formatTimestamp(incident.sys_created_on);
    metaParts.push(`Created: ${createdDate}`);
  }
  if (incident.sys_updated_on) {
    const updatedDate = formatTimestamp(incident.sys_updated_on);
    metaParts.push(`Updated: ${updatedDate}`);
  }
  if (incident.company) {
    metaParts.push(`Company: ${sanitizeCaseText(incident.company)}`);
  }
  if (metaParts.length > 0) {
    sections.push(metaParts.join(" | "));
  }

  // Task Details section
  const taskDetails: string[] = [];
  if (incident.category) taskDetails.push(`Category: ${sanitizeCaseText(incident.category)}`);
  if (incident.subcategory) taskDetails.push(`Subcategory: ${sanitizeCaseText(incident.subcategory)}`);
  if (incident.business_service) taskDetails.push(`Service: ${sanitizeCaseText(incident.business_service)}`);
  if (incident.cmdb_ci) taskDetails.push(`Affected CI: ${sanitizeCaseText(incident.cmdb_ci)}`);
  if (incident.caller_id) taskDetails.push(`Caller: ${sanitizeCaseText(incident.caller_id)}`);

  if (taskDetails.length > 0) {
    sections.push("*Task Details*", taskDetails.join("\n"));
  }

  // Full description (for LLM deep analysis)
  if (incident.description) {
    const desc = sanitizeCaseText(incident.description);
    if (desc) {
      sections.push("*Detailed Description*", desc);
    }
  }

  // References section
  const referenceLines: string[] = [];
  if (incident.number && incident.url) {
    referenceLines.push(`<${incident.url}|${incident.number}>`);
  } else if (incident.number) {
    referenceLines.push(incident.number);
  }

  if (referenceLines.length > 0) {
    sections.push("*Reference*", referenceLines.join("\n"));
  }

  if (sections.length === 0) {
    return null;
  }

  // Generate Block Kit blocks for Slack UI
  const blocks = formatIncidentAsBlockKit(incident as any);
  const fallbackText = generateIncidentFallbackText(incident as any);

  return {
    summary: sections.join("\n\n"),
    blocks,
    fallbackText,
    rawData: incident,
  };
}

/**
 * Format timestamp to human-readable format
 */
function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

/**
 * Formats journal entries into structured, sanitized list
 *
 * Returns both a formatted summary for quick context and raw entries for deep analysis.
 * Sections: Summary (count), Latest Activity (entries)
 *
 * @param entries - Array of journal entries
 * @param caseName - Optional case number/name for context
 * @returns Object with summary (formatted text) and rawData (full entries array)
 */
export function formatJournalEntriesForLLM(
  entries: ServiceNowCaseJournalEntry[],
  caseName?: string,
): { summary: string; rawData: ServiceNowCaseJournalEntry[] } | null {
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

  return {
    summary: sections.join("\n\n"),
    rawData: entries,
  };
}

/**
 * Formats case search results into structured summary with top results
 *
 * Returns both a formatted summary for quick context and raw data for deep analysis.
 * Sections: Summary (count), Current State (filters), Latest Activity (top results), Context
 *
 * @param cases - Array of case summaries
 * @param filters - Applied filter descriptions
 * @param total - Total number of matching cases
 * @returns Object with summary (formatted text) and rawData (full cases array)
 */
export function formatSearchResultsForLLM(
  cases: ServiceNowCaseSummary[],
  filters: string[],
  total?: number,
): { summary: string; rawData: { cases: ServiceNowCaseSummary[]; filters: string[]; total?: number } } | null {
  if (cases.length === 0) {
    return {
      summary: "Summary\nNo cases found matching the search criteria.",
      rawData: { cases: [], filters, total: 0 },
    };
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

  return {
    summary: sections.join("\n\n"),
    rawData: { cases, filters, total },
  };
}

/**
 * Formats configuration items (CMDB) into structured list
 *
 * Returns both a formatted summary for quick context and raw data for deep analysis.
 * Sections: Summary (count), Latest Activity (items with key fields), Relationships (if provided), Context
 *
 * @param items - Array of configuration items
 * @param options - Optional formatting options including relationships map
 * @returns Object with summary (formatted text) and rawData (full items array)
 */
export function formatConfigurationItemsForLLM(
  items: ServiceNowConfigurationItem[],
  options?: {
    relationships?: Map<string, ServiceNowConfigurationItem[]>;
    includeRelationships?: boolean;
  },
): { summary: string; rawData: ServiceNowConfigurationItem[] } | null {
  if (items.length === 0) {
    return {
      summary: "Summary\nNo configuration items found.",
      rawData: [],
    };
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

  // Relationships section - show first-level relationships for each CI
  if (options?.includeRelationships && options?.relationships && options.relationships.size > 0) {
    const relationshipLines: string[] = [];

    for (const item of topItems) {
      const relatedCIs = options.relationships.get(item.sys_id);
      if (relatedCIs && relatedCIs.length > 0) {
        relationshipLines.push(`\n${item.name}:`);
        relatedCIs.slice(0, 5).forEach(relatedCI => {
          const relType = relatedCI.sys_class_name || "Related to";
          relationshipLines.push(`  → ${relatedCI.name} (${relType})`);
        });
        if (relatedCIs.length > 5) {
          relationshipLines.push(`  ... and ${relatedCIs.length - 5} more`);
        }
      }
    }

    if (relationshipLines.length > 0) {
      sections.push("Relationships", relationshipLines.join("\n"));
    }
  }

  // Context section - if showing subset
  if (items.length > topItems.length) {
    sections.push("Context", `Showing top ${topItems.length} of ${items.length} items`);
  }

  return {
    summary: sections.join("\n\n"),
    rawData: items,
  };
}
