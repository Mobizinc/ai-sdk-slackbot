/**
 * Response Validation Utilities
 *
 * Validates that LLM responses properly use pre-formatted tool outputs
 * and contain expected structural sections when tool summaries are provided.
 */

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  missingElements: string[];
  toolsWithUnusedSummaries: string[];
  responseType?: 'field_query' | 'overview' | 'unknown';
  responseLength?: number;
}

/**
 * Known tool payload fields that contain pre-formatted summaries
 */
const FORMATTED_SUMMARY_FIELDS = [
  "caseSummary",
  "incidentSummary",
  "journalSummary",
  "casesSearchSummary",
  "formattedItems",
  "key_points",
  "excerpt",
  "pattern_summary",
] as const;

/**
 * Response type classification based on length and content
 */
type ResponseType = 'field_query' | 'overview' | 'unknown';

/**
 * Patterns that indicate field-specific queries
 */
const FIELD_QUERY_PATTERNS = [
  /assigned to:?\s+\w+/i,
  /priority:?\s+(1|2|3|4|critical|high|moderate|low)/i,
  /status:?\s+\w+/i,
  /state:?\s+\w+/i,
  /requester:?\s+\w+/i,
  /account:?\s+\w+/i,
  /opened (on|at):?\s+/i,
  /updated (on|at):?\s+/i,
] as const;

/**
 * Expected sections that should appear when structured summaries are provided
 * Split into required and optional based on response type
 */
const REQUIRED_SECTIONS = [
  "Summary",
  "Current State",
] as const;

const OPTIONAL_SECTIONS = [
  "Latest Activity",
  "Context",
  "References",
] as const;

/**
 * Detects the response type based on length and content patterns
 *
 * @param response - The LLM's generated response text
 * @returns Response type classification
 */
function detectResponseType(response: string): ResponseType {
  const trimmedResponse = response.trim();
  const responseLength = trimmedResponse.length;

  // Check for structured sections FIRST - if response has multiple section headers,
  // it's an overview regardless of length
  const hasMultipleSections = (response.match(/\*[^*]+\*/g) || []).length >= 2;
  if (hasMultipleSections) {
    return 'overview';
  }

  // Very short responses (<150 chars) without sections are likely field queries
  if (responseLength < 150) {
    return 'field_query';
  }

  // Check for field query patterns in short-to-medium responses (<300 chars)
  if (responseLength < 300) {
    const hasFieldPattern = FIELD_QUERY_PATTERNS.some(pattern =>
      pattern.test(response)
    );

    if (hasFieldPattern) {
      return 'field_query';
    }
  }

  // Longer responses (>=300 chars) default to overview
  if (responseLength >= 300) {
    return 'overview';
  }

  return 'unknown';
}

/**
 * Validates that the LLM response properly uses tool-provided formatted summaries
 * and contains expected structural sections.
 *
 * @param response - The LLM's generated response text
 * @param toolCalls - Array of tool calls with their results
 * @returns Validation result with warnings and missing elements
 */
export function validateResponseFormat(
  response: string,
  toolCalls: Array<{ toolName: string; result: any }>
): ValidationResult {
  const warnings: string[] = [];
  const missingElements: string[] = [];
  const toolsWithUnusedSummaries: string[] = []; // Kept for backward compatibility but no longer populated

  // Detect response type
  const responseType = detectResponseType(response);
  const responseLength = response.trim().length;

  // Simple structural validation - check for section presence only (informational)
  // No keyword matching or content overlap validation

  // Check if any ServiceNow tools were called (for context on whether to check structure)
  const hasServiceNowTools = toolCalls.some((tool) =>
    ["getCase", "getIncident", "searchCases", "getCMDB", "getCaseJournal", "getConfigurationItems"].includes(tool.toolName)
  );

  if (hasServiceNowTools) {
    if (responseType === 'overview') {
      // For overviews: require Summary + Current State, warn on missing optional sections
      const requiredMissing: string[] = [];
      const optionalMissing: string[] = [];

      for (const section of REQUIRED_SECTIONS) {
        const sectionRegex = new RegExp(
          `\\*${section}\\*|\\*\\*${section}\\*\\*|^${section}:`,
          "im"
        );

        if (!sectionRegex.test(response)) {
          requiredMissing.push(section);
        }
      }

      for (const section of OPTIONAL_SECTIONS) {
        const sectionRegex = new RegExp(
          `\\*${section}\\*|\\*\\*${section}\\*\\*|^${section}:`,
          "im"
        );

        if (!sectionRegex.test(response)) {
          optionalMissing.push(section);
        }
      }

      // Track missing sections as informational only (not errors)
      // Don't add to missingElements - this is just for observability

      if (requiredMissing.length > 0) {
        warnings.push(
          `[INFO] Overview response missing suggested sections: ${requiredMissing.join(", ")}`
        );
      }

      // Optional sections are just FYI
      if (optionalMissing.length > 0 && responseLength > 500) {
        console.log(`[Validation] Optional sections not included: ${optionalMissing.join(", ")}`);
      }
    } else if (responseType === 'field_query') {
      // For field queries: sections are NOT required
      // Skip section validation entirely
      console.log(`[Validation] Skipping section validation for field_query response (${responseLength} chars)`);
    } else {
      // Unknown type: informational suggestion only
      const hasSummary = /\*Summary\*|\*\*Summary\*\*|^Summary:/im.test(response);

      if (!hasSummary && responseLength > 300) {
        console.log(`[Validation] Longer response (${responseLength} chars) might benefit from a Summary section`);
      }
    }
  }

  // All validation is now informational only - always return valid: true
  // Warnings are for observability, not enforcement
  const valid = true;

  return {
    valid,
    warnings,
    missingElements,
    toolsWithUnusedSummaries,
    responseType,
    responseLength,
  };
}

/**
 * Checks if a tool result contains a formatted summary field
 */
function hasFormattedSummary(result: any): boolean {
  if (!result || typeof result !== "object") return false;

  return FORMATTED_SUMMARY_FIELDS.some((field) => field in result);
}

/**
 * Gets the name of the formatted summary field in the result
 */
function getFormattedSummaryField(result: any): string | null {
  if (!result || typeof result !== "object") return null;

  for (const field of FORMATTED_SUMMARY_FIELDS) {
    if (field in result) return field;
  }

  return null;
}

/**
 * Extracts key terms and concepts from summary content for matching
 * Returns distinctive keywords that should appear in the response
 *
 * More lenient to avoid penalizing raw field usage
 */
function extractKeyPhrases(content: string): string[] {
  if (!content) return [];

  // Extract distinctive keywords (not full phrases)
  // This is more forgiving for conversational responses
  const words = content
    .toLowerCase()
    .replace(/[^\w\s]/g, " ") // Remove punctuation
    .split(/\s+/)
    .filter((word) => word.length > 3); // Keep longer words (reduced from 4 to 3)

  // Filter out common words
  const commonWords = new Set([
    "summary",
    "current",
    "state",
    "status",
    "latest",
    "activity",
    "context",
    "references",
    "about",
    "there",
    "their",
    "which",
    "would",
    "should",
    "could",
    "system",
    "this",
    "that",
    "with",
    "from",
    "have",
    "been",
    "were",
    "when",
    // Add more common words to reduce false positives
    "case",
    "open",
    "work",
    "progress",
    "assigned",
    "priority",
  ]);

  const distinctiveWords = words.filter((word) => !commonWords.has(word));

  // Return unique words, limited to 15 (increased from 10)
  return Array.from(new Set(distinctiveWords)).slice(0, 15);
}

/**
 * Checks if a phrase is too generic to be a good match indicator
 */
function isGenericPhrase(phrase: string): boolean {
  const lower = phrase.toLowerCase();

  const genericPatterns = [
    "the case is",
    "this is a",
    "there is a",
    "it is a",
    "was created",
    "has been",
    "will be",
    "should be",
    "can be",
  ];

  return genericPatterns.some((pattern) => lower.includes(pattern));
}
