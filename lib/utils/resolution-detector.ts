/**
 * Resolution Detector Utility
 *
 * Detects when a case has been resolved based on message content analysis.
 * Uses pattern matching with context awareness to avoid false positives.
 *
 * This is a focused utility that implements SRP by handling only resolution detection logic.
 */

export interface ResolutionCheckContext {
  /**
   * When the case was first detected
   */
  detectedAt: Date;

  /**
   * Recent messages to check for ongoing troubleshooting
   */
  recentMessages: Array<{ text: string }>;

  /**
   * Whether the case is already marked as resolved
   */
  isResolved: boolean;
}

export interface ResolutionCheckResult {
  /**
   * Whether resolution was detected
   */
  isResolved: boolean;

  /**
   * Reason for the detection result (for logging/debugging)
   */
  reason: string;
}

/**
 * Cooldown period in minutes to avoid premature resolution detection
 * after a case is first detected
 */
const COOLDOWN_MINUTES = 5;

/**
 * Negative patterns - questions or hypotheticals should NOT trigger resolution
 */
const NEGATIVE_PATTERNS = [
  /\?$/,  // Message ends with question mark
  /is (it|this|that) (fixed|resolved|working|closed|done)/i,
  /can (you|we|someone) (fix|resolve|close)/i,
  /will (it|this|that) be (fixed|resolved|closed)/i,
  /what if (it's|it is|this is) (fixed|resolved|working)/i,
  /should (we|i) (fix|resolve|close)/i,
  /(help|issue|problem|error|failed|failing|broken)/i, // Active troubleshooting indicators
];

/**
 * Positive resolution patterns - affirmative statements only
 */
const RESOLUTION_KEYWORDS = [
  /\b(fixed|resolved|closed) (it|this|that|the issue|the problem)\b/i,
  /\b(it's|it is|this is) (fixed|resolved|working now|all set)\b/i,
  /\bproblem (solved|fixed|resolved)\b/i,
  /\bissue (resolved|fixed|closed)\b/i,
  /\b(successfully|completed|done) (fixed|resolved|closed)\b/i,
  /\b(working|operational) (now|again)\b/i,
];

/**
 * Number of recent messages to check for ongoing troubleshooting
 */
const RECENT_MESSAGES_TO_CHECK = 3;

/**
 * Check if a message indicates case resolution
 *
 * @param messageText - The message text to analyze
 * @param context - Context about the case and recent conversation
 * @returns Resolution check result with reason
 */
export function detectResolution(
  messageText: string,
  context: ResolutionCheckContext
): ResolutionCheckResult {
  // Already resolved, no need to check
  if (context.isResolved) {
    return {
      isResolved: false,
      reason: "Case already marked as resolved"
    };
  }

  // Check cooldown period to avoid premature detection
  const timeSinceDetection = new Date().getTime() - context.detectedAt.getTime();
  const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;

  if (timeSinceDetection < cooldownMs) {
    return {
      isResolved: false,
      reason: `Within ${COOLDOWN_MINUTES} minute cooldown period`
    };
  }

  // Check for negative context (questions, hypotheticals, active troubleshooting)
  const isNegativeContext = NEGATIVE_PATTERNS.some((pattern) =>
    pattern.test(messageText)
  );

  if (isNegativeContext) {
    return {
      isResolved: false,
      reason: "Message contains questions or troubleshooting indicators"
    };
  }

  // Check for positive resolution patterns
  const hasResolutionKeyword = RESOLUTION_KEYWORDS.some((pattern) =>
    pattern.test(messageText)
  );

  if (!hasResolutionKeyword) {
    return {
      isResolved: false,
      reason: "No resolution keywords found"
    };
  }

  // Check recent messages for ongoing troubleshooting signals
  const recentMessages = context.recentMessages.slice(-RECENT_MESSAGES_TO_CHECK);
  const hasRecentQuestions = recentMessages.some(msg => msg.text.includes('?'));

  if (hasRecentQuestions) {
    return {
      isResolved: false,
      reason: "Recent messages contain questions indicating ongoing troubleshooting"
    };
  }

  // All checks passed - resolution detected!
  return {
    isResolved: true,
    reason: `Resolution keyword detected in affirmative context`
  };
}

/**
 * Check if message text contains resolution keywords
 * (without context checks - useful for quick filtering)
 *
 * @param messageText - The message text to check
 * @returns True if resolution keywords are present
 */
export function hasResolutionKeywords(messageText: string): boolean {
  return RESOLUTION_KEYWORDS.some((pattern) => pattern.test(messageText));
}

/**
 * Check if message text contains negative indicators
 * (questions, hypotheticals, troubleshooting signals)
 *
 * @param messageText - The message text to check
 * @returns True if negative indicators are present
 */
export function hasNegativeIndicators(messageText: string): boolean {
  return NEGATIVE_PATTERNS.some((pattern) => pattern.test(messageText));
}
