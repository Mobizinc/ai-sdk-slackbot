/**
 * Troubleshooting Assistant - Generates clarifying questions and provides structured guidance
 * Acts as a senior engineer co-pilot during troubleshooting
 */

import { generateText } from "../instrumented-ai";
import { modelProvider } from "../model-provider";
import { detectIssueType, getTroubleshootingTemplate } from "./troubleshooting-templates";

export interface ClarifyingQuestions {
  questions: string[];
  issueType: string | null;
  reasoning: string;
}

/**
 * Extract infrastructure mentions (IPs, hostnames, servers) from text
 */
export function extractInfrastructureReferences(text: string): {
  ipAddresses: string[];
  hostnames: string[];
  sharePaths: string[];
} {
  const ipAddresses: string[] = [];
  const hostnames: string[] = [];
  const sharePaths: string[] = [];

  // Match IP addresses (basic pattern)
  const ipPattern = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  const ipMatches = text.match(ipPattern);
  if (ipMatches) {
    ipAddresses.push(...ipMatches);
  }

  // Match UNC paths and share paths
  const uncPattern = /\\\\[\w.-]+\\[\w$.-]+/g;
  const uncMatches = text.match(uncPattern);
  if (uncMatches) {
    sharePaths.push(...uncMatches);

    // Extract hostnames from UNC paths
    uncMatches.forEach((path) => {
      const parts = path.split("\\");
      if (parts.length >= 3 && parts[2]) {
        hostnames.push(parts[2]);
      }
    });
  }

  // Match hostnames (basic pattern - word followed by domain-like structure)
  const hostnamePattern = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi;
  const hostnameMatches = text.match(hostnamePattern);
  if (hostnameMatches) {
    hostnameMatches.forEach((host) => {
      if (!hostnames.includes(host.toLowerCase())) {
        hostnames.push(host.toLowerCase());
      }
    });
  }

  return {
    ipAddresses: Array.from(new Set(ipAddresses)),
    hostnames: Array.from(new Set(hostnames)),
    sharePaths: Array.from(new Set(sharePaths || [])),
  };
}

/**
 * Generate clarifying questions to help narrow down the problem
 */
export async function generateClarifyingQuestions(
  problemDescription: string,
  channelContext?: string
): Promise<ClarifyingQuestions> {
  // Detect issue type
  const issueType = detectIssueType(problemDescription);

  try {
    const prompt = `You are a senior IT support engineer helping troubleshoot an issue.

**Problem Description:**
${problemDescription}

${channelContext ? `**Channel Context:** ${channelContext}` : ""}

Generate 2-4 specific, actionable clarifying questions that would help narrow down the root cause.
Focus on:
- Exact error messages or symptoms
- Scope (who/what/when is affected)
- Recent changes or patterns
- Basic connectivity/access checks

Return ONLY a JSON object with this structure:
{
  "questions": ["Question 1?", "Question 2?", ...],
  "reasoning": "Brief explanation of why these questions matter"
}`;

    const result = await generateText({
      model: modelProvider.languageModel("intelligent-assistant"),
      prompt,
    });

    // Parse JSON response
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      questions: parsed.questions || [],
      issueType,
      reasoning: parsed.reasoning || "",
    };
  } catch (error) {
    console.error("[Troubleshooting Assistant] Error generating questions:", error);

    // Fallback: Use template-based questions
    if (issueType) {
      const template = getTroubleshootingTemplate(issueType);
      if (template) {
        const highPrioritySteps = template.steps
          .filter((s) => s.priority === "high")
          .map((s) => s.description)
          .slice(0, 3);

        return {
          questions: highPrioritySteps,
          issueType,
          reasoning: `Based on ${template.name} pattern`,
        };
      }
    }

    // Ultimate fallback
    return {
      questions: [
        "What specific error message do you see?",
        "Does this affect all users or specific ones?",
        "Has anything changed recently?",
      ],
      issueType,
      reasoning: "General troubleshooting questions",
    };
  }
}

/**
 * Format clarifying questions for Slack
 */
export function formatClarifyingQuestions(questions: string[]): string {
  if (questions.length === 0) return "";

  let output = "*Key Questions to Narrow This Down*\n";
  questions.forEach((q, index) => {
    output += `${index + 1}. ${q}\n`;
  });

  return output;
}

/**
 * Check if message contains infrastructure that should be looked up in CMDB
 */
export function shouldLookupInfrastructure(text: string): boolean {
  const infrastructure = extractInfrastructureReferences(text);

  return (
    infrastructure.ipAddresses.length > 0 ||
    infrastructure.hostnames.some((h) => !h.match(/\.(com|org|net|gov)$/i)) || // Exclude public domains
    infrastructure.sharePaths.length > 0
  );
}
