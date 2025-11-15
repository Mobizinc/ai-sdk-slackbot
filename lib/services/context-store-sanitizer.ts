/**
 * Context Store Sanitizer
 * Removes or redacts basic PII patterns before case transcripts are persisted.
 */
import type { CaseMessage } from "../context-manager";

interface RedactionPattern {
  key: string;
  regex: RegExp;
  replacement: string;
}

const REDACTION_PATTERNS: RedactionPattern[] = [
  {
    key: "email",
    regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    replacement: "[REDACTED_EMAIL]",
  },
  {
    key: "mrn",
    regex: /\b(?:MRN|Medical Record Number)[:\s-]*\d{6,}\b/gi,
    replacement: "[REDACTED_MRN]",
  },
  {
    key: "phone",
    regex: /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g,
    replacement: "[REDACTED_PHONE]",
  },
  {
    key: "ssn",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[REDACTED_SSN]",
  },
  {
    key: "credit_card",
    regex: /\b(?:\d[ -]?){13,16}\b/g,
    replacement: "[REDACTED_PAN]",
  },
];

export interface SanitizedContextMessage {
  message: CaseMessage;
  redactions: string[];
}

/**
 * Sanitize a context message by redacting known PII patterns.
 */
export function sanitizeContextMessage(message: CaseMessage): SanitizedContextMessage {
  const redactions = new Set<string>();
  let sanitizedText = message.text ?? "";

  for (const pattern of REDACTION_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    const updated = sanitizedText.replace(regex, pattern.replacement);
    if (updated !== sanitizedText) {
      redactions.add(pattern.key);
      sanitizedText = updated;
    }
  }

  return {
    message: {
      ...message,
      text: sanitizedText,
    },
    redactions: Array.from(redactions),
  };
}
