/**
 * Business Requirements Document (BRD) Generator
 *
 * Uses LLM to generate structured BRDs from user feedback about missing features.
 * Synthesizes conversation context and user input into actionable requirements.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getConfigValue } from "../config";

export interface FeedbackInput {
  featureDescription: string;
  useCase: string;
  currentLimitation: string;
  conversationContext?: string;
}

export interface GeneratedBRD {
  title: string;
  problemStatement: string;
  userStory: string;
  acceptanceCriteria: string[];
  technicalContext: string;
  conversationTranscript?: string;
}

/**
 * Sanitizes and validates user input to prevent prompt injection and ensure quality
 */
function sanitizeInput(input: FeedbackInput): FeedbackInput {
  const MAX_FIELD_LENGTH = 1000;

  // Validate and truncate field lengths
  const sanitize = (field: string, fieldName: string): string => {
    if (!field || field.trim().length === 0) {
      throw new Error(`${fieldName} cannot be empty`);
    }

    const trimmed = field.trim();

    if (trimmed.length > MAX_FIELD_LENGTH) {
      throw new Error(`${fieldName} exceeds maximum length of ${MAX_FIELD_LENGTH} characters`);
    }

    // Check for potential prompt injection patterns
    const suspiciousPatterns = [
      /ignore\s+(previous|above|prior)\s+instructions/i,
      /system\s*:\s*/i,
      /\[INST\]/i,
      /\<\|im_start\|\>/i,
      /\{system\}/i,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(trimmed)) {
        throw new Error(
          `${fieldName} contains suspicious content. Please rephrase without meta-instructions.`
        );
      }
    }

    return trimmed;
  };

  return {
    featureDescription: sanitize(input.featureDescription, "Feature description"),
    useCase: sanitize(input.useCase, "Use case"),
    currentLimitation: sanitize(input.currentLimitation, "Current limitation"),
    conversationContext: input.conversationContext?.substring(0, 2000), // Limit context length
  };
}

/**
 * Generates a structured BRD from user feedback
 */
export async function generateBRD(input: FeedbackInput): Promise<GeneratedBRD> {
  const apiKey = getConfigValue("anthropicApiKey");
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("Anthropic API key not configured");
  }

  // Sanitize and validate input
  const sanitizedInput = sanitizeInput(input);

  const client = new Anthropic({ apiKey });

  const prompt = buildBRDPrompt(sanitizedInput);

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 900,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  // Validate response structure
  if (!response.content || response.content.length === 0) {
    throw new Error("Empty response from Claude - no content blocks returned");
  }

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  // Validate response quality
  if (content.text.length < 100) {
    throw new Error("Response too short - BRD generation failed to produce sufficient content");
  }

  return parseBRDResponse(content.text, input.conversationContext);
}

/**
 * Builds the prompt for BRD generation
 */
function buildBRDPrompt(input: FeedbackInput): string {
  return `You are a product requirements analyst. Based on the following user feedback about a missing feature in our Slack bot, generate a structured Business Requirements Document (BRD).

User Feedback:
- Feature Description: ${input.featureDescription}
- Use Case: ${input.useCase}
- Current Limitation: ${input.currentLimitation}
${input.conversationContext ? `\nConversation Context:\n${input.conversationContext}` : ""}

Generate a BRD with the following sections (use these exact headers):

## Title
[A concise, descriptive title for the feature request, maximum 10 words]

## Problem Statement
[≤2 sentences (≤80 words) describing what problem this feature solves and why it matters]

## User Story
[Exactly one sentence in the format: "As a [user], I want to [action] so that [benefit]"]

## Acceptance Criteria
[3-5 bullets, each ≤12 words, describing specific, testable criteria that define when this feature is complete]

## Technical Context
[1-3 short bullet sentences (≤15 words each) covering relevant systems, APIs, or constraints mentioned in the feedback]

Keep every section compact and actionable. Avoid implementation detail beyond what the user already described.`;
}

/**
 * Parses the LLM response into a structured BRD object
 */
function parseBRDResponse(text: string, conversationContext?: string): GeneratedBRD {
  const sections = {
    title: extractSection(text, "## Title", "## Problem Statement"),
    problemStatement: extractSection(text, "## Problem Statement", "## User Story"),
    userStory: extractSection(text, "## User Story", "## Acceptance Criteria"),
    acceptanceCriteria: extractListSection(text, "## Acceptance Criteria", "## Technical Context"),
    technicalContext: extractSection(text, "## Technical Context", null),
  };

  // Validate quality thresholds - reject poor responses instead of using fallbacks
  const missingFields: string[] = [];
  if (!sections.title || sections.title.length < 5) {
    missingFields.push("Title");
  }
  if (!sections.problemStatement || sections.problemStatement.length < 20) {
    missingFields.push("Problem Statement");
  }
  if (!sections.userStory || sections.userStory.length < 15) {
    missingFields.push("User Story");
  }
  if (sections.acceptanceCriteria.length === 0) {
    missingFields.push("Acceptance Criteria");
  }

  if (missingFields.length > 0) {
    throw new Error(
      `BRD generation failed quality checks. Missing or insufficient content for: ${missingFields.join(", ")}. Please try again with more detailed feedback.`
    );
  }

  return {
    title: sections.title,
    problemStatement: sections.problemStatement,
    userStory: sections.userStory,
    acceptanceCriteria: sections.acceptanceCriteria,
    technicalContext: sections.technicalContext || "No technical context provided",
    conversationTranscript: conversationContext,
  };
}

/**
 * Extracts a section of text between two headers
 */
function extractSection(text: string, startHeader: string, endHeader: string | null): string {
  const startIndex = text.indexOf(startHeader);
  if (startIndex === -1) return "";

  const contentStart = startIndex + startHeader.length;
  const endIndex = endHeader ? text.indexOf(endHeader, contentStart) : text.length;
  const actualEndIndex = endIndex === -1 ? text.length : endIndex;

  return text.substring(contentStart, actualEndIndex).trim();
}

/**
 * Extracts a bulleted list section and returns as array
 */
function extractListSection(text: string, startHeader: string, endHeader: string | null): string[] {
  const sectionText = extractSection(text, startHeader, endHeader);
  if (!sectionText) return [];

  return sectionText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("-") || line.startsWith("•") || line.startsWith("*"))
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter((line) => line.length > 0);
}
