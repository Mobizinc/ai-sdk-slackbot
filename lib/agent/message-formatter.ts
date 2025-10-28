/**
 * Message Formatter (Phase 3D Complete)
 *
 * Converts model output (markdown) into Slack-friendly mrkdwn format and manages
 * status update callbacks ("formatting" and "sent" states).
 */

import type { UpdateStatusFn } from "./types";

export interface FormatMessageParams {
  text: string;
  updateStatus?: UpdateStatusFn;
}

const markdownReplacements: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /^#{1,6}\s+(.+)$/gm, replacement: "*$1*" },
  { pattern: /\*\*(.+?)\*\*/g, replacement: "*$1*" },
  { pattern: /\[(.*?)\]\((.*?)\)/g, replacement: "<$2|$1>" },
];

export function formatMessage(params: FormatMessageParams): string {
  params.updateStatus?.("formatting");

  let formatted = params.text.trim();

  for (const { pattern, replacement } of markdownReplacements) {
    formatted = formatted.replace(pattern, replacement);
  }

  params.updateStatus?.("sent");
  return formatted;
}
