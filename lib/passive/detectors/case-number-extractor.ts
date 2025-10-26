/**
 * Case Number Extractor
 *
 * Detects ServiceNow case numbers in text using regex patterns.
 * Supports SCS, INC, CASE, and RITM number formats.
 *
 * This is a pure function with no side effects, making it easy to test.
 */

/**
 * Supported case number patterns
 */
const CASE_PATTERNS = [
  /\b(SCS\d{7,})\b/gi,     // SCS numbers: SCS0001234
  /\b(INC\d{7,})\b/gi,     // Incident numbers: INC0005678
  /\b(CASE\d{7,})\b/gi,    // Case numbers: CASE0001234
  /\b(RITM\d{7,})\b/gi,    // Request items: RITM0001234
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