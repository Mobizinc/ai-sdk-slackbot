/**
 * Content Helper Utilities
 *
 * This module provides reusable utilities for truncating and structuring content
 * to prevent verbatim copy-paste behavior and enforce synthesis in LLM responses.
 */

/**
 * Generates a concise pattern summary from case data
 * Extracts 5-10 word technical pattern without exposing case details
 *
 * @param caseData - Raw case data with potential fields: category, description, resolution
 * @returns Short pattern summary (5-10 words)
 */
export function generatePatternSummary(caseData: {
  category?: string;
  short_description?: string;
  resolution_code?: string;
  priority?: string;
}): string {
  const category = caseData.category || "unknown";
  const priority = caseData.priority || "";

  // Extract key technical terms from description (avoid full sentences)
  const description = caseData.short_description || "";
  const technicalTerms = extractTechnicalTerms(description);

  // Build concise pattern
  const parts: string[] = [];

  if (technicalTerms.length > 0) {
    parts.push(technicalTerms.slice(0, 2).join(" "));
  }

  if (category && category !== "unknown") {
    parts.push(`(${category})`);
  }

  if (priority && ["1", "2"].includes(priority)) {
    parts.push(`- high priority`);
  }

  const pattern = parts.join(" ").trim();

  // Ensure max 60 characters
  if (pattern.length > 60) {
    return pattern.substring(0, 57) + "...";
  }

  return pattern || "Technical issue";
}

/**
 * Extracts technical keywords from text (not full sentences)
 * Filters out common words to focus on technical terms
 *
 * @param text - Input text to analyze
 * @returns Array of technical keywords (max 5)
 */
function extractTechnicalTerms(text: string): string[] {
  if (!text) return [];

  // Common words to exclude
  const stopWords = new Set([
    "the", "is", "at", "which", "on", "a", "an", "and", "or", "but",
    "in", "with", "to", "for", "of", "as", "by", "from", "has", "have",
    "had", "not", "are", "was", "were", "been", "be", "this", "that",
    "these", "those", "can", "could", "will", "would", "should", "may",
    "might", "must", "user", "customer", "issue", "problem", "error"
  ]);

  // Extract words, filter stop words, keep capitalized or technical terms
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(word =>
      word.length > 3 &&
      !stopWords.has(word) &&
      !/^\d+$/.test(word) // Exclude pure numbers
    );

  // Prioritize words that look technical (contain capitals, numbers, or common tech patterns)
  const technicalScore = (word: string) => {
    let score = 0;
    if (/[A-Z]/.test(word)) score += 2; // Has capitals
    if (/\d/.test(word)) score += 1; // Has numbers
    if (word.includes("_") || word.includes("-")) score += 1; // Has separators
    if (word.length > 8) score += 1; // Long words tend to be technical
    return score;
  };

  return words
    .sort((a, b) => technicalScore(b) - technicalScore(a))
    .slice(0, 5);
}

/**
 * Extracts 2-3 key points from Microsoft Learn article content
 * Returns bullet points suitable for citation (max 80 chars each)
 *
 * @param content - Full article content
 * @param maxPoints - Maximum number of bullet points (default: 3)
 * @returns Array of key point strings
 */
export function extractKeyPoints(
  content: string,
  maxPoints: number = 3
): string[] {
  if (!content) return [];

  // Split into sentences
  const sentences = content
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 200); // Filter too short or too long

  if (sentences.length === 0) {
    // Fallback: use first 80 chars as single point
    return [truncateToExcerpt(content, 80)];
  }

  // Take first N sentences that look informative
  const keyPoints: string[] = [];

  for (const sentence of sentences) {
    if (keyPoints.length >= maxPoints) break;

    // Skip sentences that are too generic
    if (isGenericSentence(sentence)) continue;

    // Truncate to 80 chars if needed
    const truncated = sentence.length > 80
      ? sentence.substring(0, 77) + "..."
      : sentence;

    keyPoints.push(truncated);
  }

  // If we couldn't find enough informative sentences, use first N sentences
  if (keyPoints.length === 0) {
    return sentences
      .slice(0, maxPoints)
      .map(s => s.length > 80 ? s.substring(0, 77) + "..." : s);
  }

  return keyPoints;
}

/**
 * Checks if a sentence is too generic to be useful as a key point
 */
function isGenericSentence(sentence: string): boolean {
  const genericPhrases = [
    "this article",
    "in this article",
    "click here",
    "learn more",
    "for more information",
    "see also",
    "applies to",
    "feedback",
    "submit and view feedback",
  ];

  const lower = sentence.toLowerCase();
  return genericPhrases.some(phrase => lower.includes(phrase));
}

/**
 * Truncates text to specified length at sentence boundaries when possible
 * Adds ellipsis if truncated
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length (default: 150 chars)
 * @returns Truncated text with ellipsis if needed
 */
export function truncateToExcerpt(
  text: string,
  maxLength: number = 150
): string {
  if (!text || text.length <= maxLength) {
    return text || "";
  }

  // Try to truncate at sentence boundary
  const sentences = text.split(/[.!?]+/);
  let excerpt = "";

  for (const sentence of sentences) {
    const candidate = excerpt + sentence + ".";
    if (candidate.length > maxLength) {
      break;
    }
    excerpt = candidate;
  }

  // If we got at least one complete sentence, use it
  if (excerpt.length > 50) {
    return excerpt.trim();
  }

  // Otherwise truncate at word boundary
  const lastSpace = text.lastIndexOf(" ", maxLength - 3);
  const cutoff = lastSpace > 0 ? lastSpace : maxLength - 3;

  return text.substring(0, cutoff).trim() + "...";
}

/**
 * Sanitizes HTML and normalizes whitespace in text
 * Similar to sanitizeCaseText but more focused
 *
 * @param text - Text that may contain HTML
 * @returns Clean text with normalized whitespace
 */
export function sanitizeHtml(text: string): string {
  if (!text) return "";

  return text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
