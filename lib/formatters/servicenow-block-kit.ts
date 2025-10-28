/**
 * ServiceNow Block Kit Formatter
 *
 * Converts ServiceNow case data into rich Slack Block Kit layouts.
 * Handles null/undefined fields gracefully and provides mobile-responsive designs.
 */

import { config } from "../config";

interface ServiceNowCase {
  number?: string;
  sys_id?: string | { display_value?: string; value?: string };
  short_description?: string;
  description?: string;
  state?: string | { display_value?: string; value?: string };
  priority?: string | { display_value?: string; value?: string };
  assigned_to?: string | { display_value?: string; value?: string };
  assignment_group?: string | { display_value?: string; value?: string };
  caller_id?: string | { display_value?: string; value?: string };
  opened_at?: string;
  updated_on?: string;
  company?: string | { display_value?: string; value?: string };
  category?: string;
  subcategory?: string;
  [key: string]: any;
}

interface JournalEntry {
  sys_created_on: string;
  sys_created_by: string;
  value: string | { value?: string; display_value?: string };
  element?: string;
}

interface FormatCaseBlocksOptions {
  includeJournal?: boolean;
  journalEntries?: JournalEntry[];
  maxJournalEntries?: number;
}

/**
 * Priority emoji mapping
 */
const PRIORITY_EMOJI: Record<string, string> = {
  "1": "🔴", // Critical
  "2": "🟠", // High
  "3": "🟡", // Moderate
  "4": "🟢", // Low
  "5": "⚪", // Planning
};

/**
 * State emoji mapping
 */
const STATE_EMOJI: Record<string, string> = {
  "open": "🔵",
  "work in progress": "🟣",
  "awaiting info": "🟡",
  "resolved": "✅",
  "closed": "⚫",
};

/**
 * Extract display value from ServiceNow field (handles reference fields)
 */
function extractDisplayValue(field: any): string {
  if (!field) return "Not provided";
  if (typeof field === "string") return field;
  if (typeof field === "object") {
    return field.display_value || field.value || "Not provided";
  }
  return String(field);
}

/**
 * Format priority with emoji
 */
function formatPriority(priority: any): string {
  const displayValue = extractDisplayValue(priority);
  const numericPriority = displayValue.match(/^\d+/)?.[0] || "";
  const emoji = PRIORITY_EMOJI[numericPriority] || "⚪";
  return `${emoji} ${displayValue}`;
}

/**
 * Format state with emoji
 */
function formatState(state: any): string {
  const displayValue = extractDisplayValue(state).toLowerCase();
  const emoji = STATE_EMOJI[displayValue] || "🔵";
  return `${emoji} ${extractDisplayValue(state)}`;
}

/**
 * Format date to human-readable format
 */
function formatDate(dateString?: string): string {
  if (!dateString) return "Not provided";

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Invalid date";

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

/**
 * Build ServiceNow deep link URL
 */
function buildServiceNowLink(caseNumber: string, sysId?: string): string {
  const instanceUrl =
    (config.servicenowInstanceUrl as string | undefined) ||
    (config.servicenowUrl as string | undefined) ||
    process.env.SERVICENOW_INSTANCE_URL ||
    process.env.SERVICENOW_URL;

  if (!instanceUrl) {
    // Return placeholder URL if not configured (test/dev environments)
    return `https://servicenow.com/case/${caseNumber}`;
  }

  const baseUrl = instanceUrl.replace(/\/$/, "");

  if (sysId) {
    return `${baseUrl}/nav_to.do?uri=sn_customerservice_case.do?sys_id=${sysId}`;
  }

  return `${baseUrl}/sn_customerservice_case_list.do?sysparm_query=number=${caseNumber}`;
}

/**
 * Format journal entry for Block Kit display
 */
function formatJournalEntry(entry: JournalEntry, index: number): string {
  try {
    const date = new Date(entry.sys_created_on);
    if (isNaN(date.getTime())) {
      throw new Error("Invalid date");
    }

    const dateStr = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const user = entry.sys_created_by || "System";
    const valueStr =
      typeof entry.value === "string"
        ? entry.value
        : entry.value?.value || entry.value?.display_value || "(no content)";

    // Smart truncation with word boundary
    let content = String(valueStr).trim();
    if (content.length > 200) {
      const truncated = content.substring(0, 197);
      const lastSpace = truncated.lastIndexOf(" ");
      content = (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated) + "...";
    }

    return `*${dateStr}, ${timeStr}* – ${user}\n${content}`;
  } catch (error) {
    const user = entry.sys_created_by || "System";
    const valueStr =
      typeof entry.value === "string"
        ? entry.value
        : entry.value?.value || entry.value?.display_value || "(no content)";
    return `*Entry ${index + 1}* – ${user}\n${String(valueStr).substring(0, 200)}`;
  }
}

/**
 * Format case details into Slack Block Kit blocks
 *
 * @param caseData - ServiceNow case object
 * @param options - Formatting options (journal entries, limits)
 * @returns Array of Block Kit blocks (max 50 blocks per message)
 */
export function formatCaseAsBlockKit(
  caseData: ServiceNowCase,
  options: FormatCaseBlocksOptions = {},
): any[] {
  const blocks: any[] = [];

  const caseNumber = extractDisplayValue(caseData.number);
  const sysId = extractDisplayValue(caseData.sys_id);
  const shortDesc = extractDisplayValue(caseData.short_description) || "No description";

  // Header section with case number
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `Case ${caseNumber}`,
      emoji: true,
    },
  });

  // Short description (prominent)
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${shortDesc}*`,
    },
  });

  // Status row: State | Priority | Assigned To | Group
  const stateText = formatState(caseData.state);
  const priorityText = formatPriority(caseData.priority);
  const assignedToText = extractDisplayValue(caseData.assigned_to);
  const groupText = extractDisplayValue(caseData.assignment_group);

  blocks.push({
    type: "section",
    fields: [
      {
        type: "mrkdwn",
        text: `*Status:*\n${stateText}`,
      },
      {
        type: "mrkdwn",
        text: `*Priority:*\n${priorityText}`,
      },
      {
        type: "mrkdwn",
        text: `*Assigned To:*\n${assignedToText}`,
      },
      {
        type: "mrkdwn",
        text: `*Group:*\n${groupText}`,
      },
    ],
  });

  blocks.push({ type: "divider" });

  // Details section
  blocks.push({
    type: "section",
    fields: [
      {
        type: "mrkdwn",
        text: `*Customer:*\n${extractDisplayValue(caseData.caller_id)}`,
      },
      {
        type: "mrkdwn",
        text: `*Company:*\n${extractDisplayValue(caseData.company)}`,
      },
      {
        type: "mrkdwn",
        text: `*Category:*\n${extractDisplayValue(caseData.category)}`,
      },
      {
        type: "mrkdwn",
        text: `*Subcategory:*\n${extractDisplayValue(caseData.subcategory)}`,
      },
    ],
  });

  // Timestamps
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Opened: ${formatDate(caseData.opened_at)} | Updated: ${formatDate(caseData.updated_on)}`,
      },
    ],
  });

  // Description (if present)
  if (caseData.description) {
    const description = String(caseData.description);
    const maxDescLength = 2000; // Leave room for other blocks
    const truncatedDesc =
      description.length > maxDescLength
        ? `${description.substring(0, maxDescLength)}...\n\n_[Description truncated - view full details in ServiceNow]_`
        : description;

    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Description:*\n${truncatedDesc}`,
      },
    });
  }

  // Journal entries (Latest Activity)
  if (options.includeJournal && options.journalEntries && options.journalEntries.length > 0) {
    blocks.push({ type: "divider" });

    const totalEntries = options.journalEntries.length;
    const maxEntries = Math.min(options.maxJournalEntries || 3, totalEntries, 3);

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Latest Activity:* (showing ${maxEntries} of ${totalEntries})`,
      },
    });

    for (let i = 0; i < maxEntries; i++) {
      const entry = options.journalEntries[i];
      const formattedEntry = formatJournalEntry(entry, i);

      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: formattedEntry,
          },
        ],
      });
    }

    if (totalEntries > maxEntries) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `_+${totalEntries - maxEntries} more ${totalEntries - maxEntries === 1 ? "entry" : "entries"} available in ServiceNow_`,
          },
        ],
      });
    }
  }

  blocks.push({ type: "divider" });

  // Action buttons
  const serviceNowUrl = buildServiceNowLink(caseNumber, sysId);

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "Open in ServiceNow",
          emoji: true,
        },
        url: serviceNowUrl,
        action_id: "open_servicenow_case",
      },
    ],
  });

  // Verify block count (Slack limit: 50 blocks per message)
  if (blocks.length > 50) {
    console.warn(
      `[Block Kit] Generated ${blocks.length} blocks, exceeding Slack limit (50). Truncating...`,
    );
    return blocks.slice(0, 50);
  }

  return blocks;
}

/**
 * Generate fallback text for Block Kit message
 * (Required for notifications, search, and accessibility)
 */
export function generateCaseFallbackText(caseData: ServiceNowCase): string {
  const caseNumber = caseData.number || "Unknown";
  const shortDesc = caseData.short_description || "No description";
  const state = extractDisplayValue(caseData.state);
  const priority = extractDisplayValue(caseData.priority);

  return `Case ${caseNumber}: ${shortDesc} | Status: ${state} | Priority: ${priority}`;
}
