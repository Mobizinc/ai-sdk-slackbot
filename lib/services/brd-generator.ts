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
 * Generates a structured BRD from user feedback
 */
export async function generateBRD(input: FeedbackInput): Promise<GeneratedBRD> {
  const apiKey = getConfigValue("anthropicApiKey");
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("Anthropic API key not configured");
  }

  const client = new Anthropic({ apiKey });

  const prompt = buildBRDPrompt(input);

  const response = await client.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
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
[A concise, descriptive title for the feature request]

## Problem Statement
[2-3 sentences describing what problem this feature solves and why it matters]

## User Story
[In the format: "As a [user], I want to [action] so that [benefit]"]

## Acceptance Criteria
[Bulleted list of specific, testable criteria that define when this feature is complete]

## Technical Context
[Any technical details, tool names, API parameters, or system constraints mentioned in the feedback]

Keep it concise and actionable. Focus on what the user needs, not how to implement it.`;
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

  return {
    title: sections.title || "Feature Request",
    problemStatement: sections.problemStatement || "No problem statement provided",
    userStory: sections.userStory || "No user story provided",
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
