/**
 * Case Number Normalizer
 *
 * Shared utility for normalizing ServiceNow case and incident numbers.
 * Extracted from case-number-extractor.ts to enable reuse across:
 * - Case number detection (passive monitoring)
 * - ServiceNow tool (agent actions)
 * - Any other code that needs canonical case IDs
 */

/**
 * Normalize a case/incident identifier with prefix and zero-padding
 *
 * @param prefix - Full prefix (SCS, CS, INC, etc.)
 * @param digits - Numeric portion (raw or partially formatted)
 * @param totalDigits - Total digit length after normalization (default 7)
 * @returns Normalized identifier (e.g., "SCS0046363")
 *
 * @example
 * normalizeCaseId("SCS", "46363", 7) → "SCS0046363"
 * normalizeCaseId("CS", "46363", 7) → "CS0046363"
 * normalizeCaseId("INC", "167587", 7) → "INC0167587"
 * normalizeCaseId("SCS", "12345678", 7) → "SCS2345678" (truncates from left)
 */
export function normalizeCaseId(
  prefix: string,
  digits: string,
  totalDigits = 7,
): string {
  // Strip any non-numeric characters from input
  const numeric = digits.replace(/\D/g, "");

  if (!numeric) {
    return "";
  }

  let normalized = numeric;

  // Truncate if too long (take rightmost digits)
  if (numeric.length > totalDigits) {
    normalized = numeric.slice(-totalDigits);
  }
  // Pad with zeros if too short
  else if (numeric.length < totalDigits) {
    normalized = numeric.padStart(totalDigits, "0");
  }

  return `${prefix}${normalized}`;
}

/**
 * Extract numeric portion from a case/incident number
 *
 * @param identifier - Full or partial case number (e.g., "SCS0046363", "46363", "CS46363")
 * @returns Numeric portion only (e.g., "0046363", "46363")
 *
 * @example
 * extractDigits("SCS0046363") → "0046363"
 * extractDigits("46363") → "46363"
 * extractDigits("CS46363") → "46363"
 */
export function extractDigits(identifier: string): string {
  const match = identifier.match(/\d+/);
  return match ? match[0] : "";
}

/**
 * Detect if an identifier looks like a ServiceNow case/incident number
 *
 * @param identifier - String to test
 * @returns true if it matches ServiceNow number patterns
 *
 * @example
 * isServiceNowNumber("SCS0046363") → true
 * isServiceNowNumber("46363") → true
 * isServiceNowNumber("CS46363") → true
 * isServiceNowNumber("abc") → false
 */
export function isServiceNowNumber(identifier: string): boolean {
  // Matches:
  // - Bare numbers with 5-7 digits: 46363, 167587
  // - Prefixed numbers: SCS0046363, CS46363, INC167587
  return /^(?:SCS|CS|INC)?\d{5,7}$/i.test(identifier);
}

/**
 * Find matching case number from a list of canonical case numbers
 *
 * Compares numeric portions to find a match even if prefixes differ
 *
 * @param rawNumber - Raw number from LLM (e.g., "46363", "CS46363")
 * @param caseNumbers - List of canonical case numbers (e.g., ["SCS0046363", "INC0167587"])
 * @returns Matching canonical case number, or null if not found
 *
 * @example
 * findMatchingCaseNumber("46363", ["SCS0046363", "INC0167587"]) → "SCS0046363"
 * findMatchingCaseNumber("167587", ["SCS0046363", "INC0167587"]) → "INC0167587"
 * findMatchingCaseNumber("99999", ["SCS0046363"]) → null
 */
export function findMatchingCaseNumber(
  rawNumber: string,
  caseNumbers: string[],
): string | null {
  if (!rawNumber || !caseNumbers || caseNumbers.length === 0) {
    return null;
  }

  // Extract digits from raw number
  const rawDigits = extractDigits(rawNumber);
  if (!rawDigits) {
    return null;
  }

  // Compare against each canonical case number
  for (const canonical of caseNumbers) {
    const canonicalDigits = extractDigits(canonical);

    // Match if numeric portions are the same (handles padding differences)
    // e.g., "46363" matches "SCS0046363" because both have same digits
    if (canonicalDigits === rawDigits || canonicalDigits === rawDigits.padStart(7, '0')) {
      return canonical;
    }
  }

  return null;
}
