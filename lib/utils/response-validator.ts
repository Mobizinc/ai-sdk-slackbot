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
  const toolsWithUnusedSummaries: string[] = [];

  // Detect response type
  const responseType = detectResponseType(response);
  const responseLength = response.trim().length;

  // Find tools that returned formatted summaries
  const toolsWithSummaries = toolCalls.filter((tool) =>
    hasFormattedSummary(tool.result)
  );

  if (toolsWithSummaries.length === 0) {
    // No formatted summaries provided, nothing to validate
    return {
      valid: true,
      warnings: [],
      missingElements: [],
      toolsWithUnusedSummaries: [],
      responseType,
      responseLength,
    };
  }

  // Check if response references the formatted summaries
  for (const tool of toolsWithSummaries) {
    const summaryField = getFormattedSummaryField(tool.result);
    if (!summaryField) continue;

    const summaryContent = tool.result[summaryField];
    if (!summaryContent) continue;

    // Handle different field types
    let contentToCheck: string;
    if (Array.isArray(summaryContent)) {
      // For key_points array, join into single string
      contentToCheck = summaryContent.join(" ");
    } else if (typeof summaryContent === "string") {
      contentToCheck = summaryContent;
    } else {
      // Skip non-string, non-array fields
      continue;
    }

    // Check if the response seems to use the summary content
    // We look for key keywords from the summary in the response
    const summaryKeywords = extractKeyPhrases(contentToCheck);

    if (summaryKeywords.length === 0) {
      // No distinctive keywords found, skip validation for this tool
      continue;
    }

    // Count how many keywords from summary appear in response
    const matchedKeywords = summaryKeywords.filter((keyword) =>
      response.toLowerCase().includes(keyword.toLowerCase())
    );

    // Adjust threshold based on response type
    let matchThreshold: number;

    if (responseType === 'field_query') {
      // For field queries, be very lenient - only warn if COMPLETELY ignored (0% match)
      matchThreshold = Math.max(1, Math.ceil(summaryKeywords.length * 0.1)); // 10% threshold
    } else if (responseType === 'overview') {
      // For overviews, use standard threshold
      matchThreshold = Math.max(2, Math.ceil(summaryKeywords.length * 0.2)); // 20% threshold
    } else {
      // Unknown type - use lenient threshold
      matchThreshold = Math.max(1, Math.ceil(summaryKeywords.length * 0.15)); // 15% threshold
    }

    const hasEnoughMatches = matchedKeywords.length >= matchThreshold;

    if (!hasEnoughMatches) {
      // Only warn if summary is completely ignored for field queries
      if (responseType === 'field_query' && matchedKeywords.length > 0) {
        // Field query uses some summary content - this is fine
        continue;
      }

      toolsWithUnusedSummaries.push(tool.toolName);
      warnings.push(
        `Tool ${tool.toolName} returned ${summaryField} but response doesn't appear to use it (only ${matchedKeywords.length}/${summaryKeywords.length} keywords matched, response_type: ${responseType})`
      );
    }
  }

  // Check for expected sections when ServiceNow summaries are provided
  // Only enforce for overview-type responses
  const serviceNowTools = toolsWithSummaries.filter((tool) =>
    ["getCase", "getIncident", "searchCases", "getCMDB"].includes(tool.toolName)
  );

  if (serviceNowTools.length > 0) {
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

      // Only add required sections to missingElements (affects valid flag)
      missingElements.push(...requiredMissing);

      if (requiredMissing.length > 0) {
        warnings.push(
          `Overview response missing required sections: ${requiredMissing.join(", ")}`
        );
      }

      // Log optional sections as info, not warning
      if (optionalMissing.length > 0 && responseLength > 500) {
        // Only warn about optional sections if response is long enough to warrant them
        warnings.push(
          `Overview response could include optional sections: ${optionalMissing.join(", ")}`
        );
      }
    } else if (responseType === 'field_query') {
      // For field queries: sections are NOT required
      // Skip section validation entirely
      console.log(`[Validation] Skipping section validation for field_query response (${responseLength} chars)`);
    } else {
      // Unknown type: be lenient, only check for Summary
      const hasSummary = /\*Summary\*|\*\*Summary\*\*|^Summary:/im.test(response);

      if (!hasSummary && responseLength > 300) {
        missingElements.push("Summary");
        warnings.push(
          `Response should include at least a Summary section for longer responses (${responseLength} chars)`
        );
      }
    }
  }

  // Field queries are allowed to skip sections, but not to completely ignore summaries
  // An invalid response has warnings AND either:
  // 1. It's an overview/unknown type (sections required), OR
  // 2. It's a field query that completely ignored summaries
  const valid = warnings.length === 0;

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
  return [...new Set(distinctiveWords)].slice(0, 15);
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
