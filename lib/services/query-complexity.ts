/**
 * Query complexity classifier for intelligent model routing.
 * Routes simple queries to cheaper models, complex queries to premium models.
 */

import type { CoreMessage } from "ai";

export type ComplexityLevel = "simple" | "complex";

export interface ComplexityScore {
  level: ComplexityLevel;
  score: number; // 0-100
  reasons: string[];
  recommendedModel: "gpt-5-mini";
}

/**
 * Analyze query complexity to determine appropriate model tier.
 *
 * Simple queries (gpt-5-mini):
 * - Status checks: "What's the status of SCS123?"
 * - Single field lookups: "Who is assigned to case XYZ?"
 * - Short, direct questions
 * - Single tool call expected
 *
 * Complex queries (gpt-4o):
 * - Analysis: "Why did this issue occur?"
 * - Multi-step reasoning: "Compare these two cases and suggest a solution"
 * - KB generation and summarization
 * - Multiple tool calls expected
 * - Long conversation context
 */
export function classifyQueryComplexity(messages: CoreMessage[]): ComplexityScore {
  if (messages.length === 0) {
    return {
      level: "simple",
      score: 20,
      reasons: ["Empty message"],
      recommendedModel: "gpt-5-mini",
    };
  }

  const lastMessage = messages[messages.length - 1];
  const userMessage = typeof lastMessage.content === "string"
    ? lastMessage.content.toLowerCase()
    : "";

  let score = 0;
  const reasons: string[] = [];

  // Factor 1: Message length (longer = more complex)
  if (userMessage.length > 200) {
    score += 20;
    reasons.push("Long query (>200 chars)");
  } else if (userMessage.length > 100) {
    score += 10;
    reasons.push("Medium query (>100 chars)");
  }

  // Factor 2: Complexity keywords
  const complexKeywords = [
    "why", "how", "explain", "analyze", "compare", "suggest", "recommend",
    "investigate", "troubleshoot", "root cause", "diagnose", "summarize",
    "generate", "create", "write", "draft"
  ];

  const hasComplexKeyword = complexKeywords.some(kw => userMessage.includes(kw));
  if (hasComplexKeyword) {
    score += 30;
    reasons.push("Contains complex reasoning keywords");
  }

  // Factor 3: Simple status check patterns
  const simplePatterns = [
    /what('s| is) the status/i,
    /who is assigned/i,
    /when was.*created/i,
    /show (me )?case/i,
    /get case/i,
    /lookup.*case/i,
    /\bstatus of\b/i,
  ];

  const isSimplePattern = simplePatterns.some(pattern => pattern.test(userMessage));
  if (isSimplePattern) {
    score -= 20;
    reasons.push("Matches simple lookup pattern");
  }

  // Factor 4: Conversation depth (long conversations = more complex context)
  if (messages.length > 5) {
    score += 15;
    reasons.push("Long conversation history");
  } else if (messages.length > 2) {
    score += 5;
    reasons.push("Multi-turn conversation");
  }

  // Factor 5: Multiple entities/cases mentioned
  const caseNumberPattern = /\b[A-Z]{3}\d{7}\b/g;
  const caseMatches = userMessage.match(caseNumberPattern) || [];
  if (caseMatches.length > 1) {
    score += 15;
    reasons.push("Multiple cases referenced");
  }

  // Factor 6: KB generation signals
  if (userMessage.includes("generate kb") || userMessage.includes("create kb") ||
      userMessage.includes("knowledge base")) {
    score += 25;
    reasons.push("KB generation requested");
  }

  // Normalize score to 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine level (threshold at 40)
  const level: ComplexityLevel = score >= 40 ? "complex" : "simple";
  const recommendedModel = "gpt-5-mini"; // Always use gpt-5-mini

  return {
    level,
    score,
    reasons,
    recommendedModel,
  };
}

/**
 * Override complexity for specific scenarios where we always want premium model
 */
export function forceComplexModel(messages: CoreMessage[]): boolean {
  const lastMessage = messages[messages.length - 1];
  const userMessage = typeof lastMessage.content === "string"
    ? lastMessage.content.toLowerCase()
    : "";

  // Always use gpt-5o for KB generation
  if (userMessage.includes("resolved") && messages.some(m =>
    typeof m.content === "string" && /\b[A-Z]{3}\d{7}\b/.test(m.content)
  )) {
    return true; // Case resolution likely triggers KB generation
  }

  return false;
}
