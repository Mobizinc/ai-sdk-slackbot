/**
 * Case Number Extractor
 *
 * Detects ServiceNow case numbers in text using regex patterns.
 * Supports SCS, INC, CASE, RITM, REQ, and CTASK number formats.
 *
 * This is a pure function with no side effects, making it easy to test.
 */

import { normalizeCaseId } from "./case-number-normalizer";

/**
 * Supported case number patterns
 */
const CASE_PATTERNS = [
  /\b(SCS\d{7,})\b/gi,     // SCS numbers: SCS0001234
  /\b(INC\d{7,})\b/gi,     // Incident numbers: INC0005678
  /\b(CASE\d{7,})\b/gi,    // Case numbers: CASE0001234
  /\b(RITM\d{7,})\b/gi,    // Request items: RITM0001234
  /\b(REQ\d{7,})\b/gi,     // Request numbers: REQ0043549
  /\b(CTASK\d{7,})\b/gi,   // Catalog task numbers: CTASK0049921
];

/**
 * Additional keyword-based patterns to catch shorthand references such as
 * "case 49764" or "incident 167980".
 *
 * Each entry defines:
 * - regex: pattern to capture the numeric portion
 * - prefix: canonical prefix to prepend when normalizing
 */
const KEYWORD_PATTERNS: Array<{
  regex: RegExp;
  prefix: "SCS" | "INC" | "REQ" | "RITM" | "CTASK";
}> = [
  // Phrases like "case 49764" or "case number 49764"
  {
    regex: /\b(?:case|ticket)\s*(?:#|number|no\.?)?\s+(\d{5,7})\b/gi,
    prefix: "SCS",
  },
  // Phrases like "SCS 49764" or "SCS-49764"
  {
    regex: /\bSCS[\s#-]+(\d{5,7})\b/gi,
    prefix: "SCS",
  },
  // Phrases like "incident 167980" or "incident number 167980"
  {
    regex: /\b(?:incident|inc)\s*(?:#|number|no\.?)?\s+(\d{5,7})\b/gi,
    prefix: "INC",
  },
  // Phrases like "INC 167980" or "INC-167980"
  {
    regex: /\bINC[\s#-]+(\d{5,7})\b/gi,
    prefix: "INC",
  },
  // Phrases like "request 43549" or "req number 43549"
  {
    regex: /\b(?:request|req)\s*(?:#|number|no\.?)?\s+(\d{5,7})\b/gi,
    prefix: "REQ",
  },
  // Phrases like "REQ 43549" or "REQ-43549"
  {
    regex: /\bREQ[\s#-]+(\d{5,7})\b/gi,
    prefix: "REQ",
  },
  // Phrases like "requested item 46210" or "ritm number 46210"
  {
    regex: /\b(?:requested item|ritm)\s*(?:#|number|no\.?)?\s+(\d{5,7})\b/gi,
    prefix: "RITM",
  },
  // Phrases like "RITM 46210" or "RITM-46210"
  {
    regex: /\bRITM[\s#-]+(\d{5,7})\b/gi,
    prefix: "RITM",
  },
  // Phrases like "catalog task 49921" or "ctask number 49921"
  {
    regex: /\b(?:catalog task|ctask|sc_task)\s*(?:#|number|no\.?)?\s+(\d{5,7})\b/gi,
    prefix: "CTASK",
  },
  // Phrases like "CTASK 49921" or "CTASK-49921"
  {
    regex: /\bCTASK[\s#-]+(\d{5,7})\b/gi,
    prefix: "CTASK",
  },
];


/**
 * Extract ServiceNow case numbers from text
 *
 * @param text - The message text to search
 * @returns Array of unique case numbers found
 */
export function extractCaseNumbers(text: string): string[] {
  if (!text) {
    return [];
  }

  const caseNumbers = new Set<string>();

  // Apply each pattern to find case numbers
  for (const pattern of CASE_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        // Normalize to uppercase
        caseNumbers.add(match[1].toUpperCase());
      }
    }
  }

  // Apply keyword-based patterns to capture shorthand references (e.g., "case 49764")
  for (const { regex, prefix } of KEYWORD_PATTERNS) {
    regex.lastIndex = 0;
    const matches = text.matchAll(regex);
    for (const match of matches) {
      const rawMatch = match[0].toUpperCase();

      // Skip matches that already follow canonical formats (e.g., SCS0001234)
      if (/^(SCS|INC|CASE|RITM|REQ|CTASK)\d{5,}$/.test(rawMatch)) {
        continue;
      }

      const normalized = normalizeCaseId(prefix, match[1]);
      if (normalized) {
        caseNumbers.add(normalized.toUpperCase());
      }
    }
  }

  return Array.from(caseNumbers);
}

/**
 * Check if text contains any case numbers
 * Convenience method for quick checks
 */
export function hasCaseNumbers(text: string): boolean {
  return extractCaseNumbers(text).length > 0;
}

/**
 * Extract case numbers with their positions in text
 * Useful for highlighting or replacing case numbers
 */
export function extractCaseNumbersWithPositions(text: string): Array<{
  caseNumber: string;
  startIndex: number;
  endIndex: number;
}> {
  if (!text) {
    return [];
  }

  const results: Array<{
    caseNumber: string;
    startIndex: number;
    endIndex: number;
  }> = [];

  for (const pattern of CASE_PATTERNS) {
    // Reset pattern for multiple matches
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1]) {
        results.push({
          caseNumber: match[1].toUpperCase(),
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        });
      }
    }
  }

  // Include keyword-based matches with normalized identifiers
  for (const { regex, prefix } of KEYWORD_PATTERNS) {
    regex.lastIndex = 0;

    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match[1]) {
        const rawMatch = match[0].toUpperCase();

        if (/^(SCS|INC|CASE|RITM|REQ|CTASK)\d{5,}$/.test(rawMatch)) {
          continue;
        }

        const normalized = normalizeCaseId(prefix, match[1]);
        if (!normalized) continue;

        results.push({
          caseNumber: normalized.toUpperCase(),
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        });
      }
    }
  }

  // Sort by position and deduplicate overlapping matches
  results.sort((a, b) => a.startIndex - b.startIndex);

  // Remove duplicates (same case number at same position)
  const unique = results.filter((item, index) => {
    if (index === 0) return true;
    const prev = results[index - 1];
    return item.caseNumber !== prev.caseNumber ||
           item.startIndex !== prev.startIndex;
  });

  return unique;
}
