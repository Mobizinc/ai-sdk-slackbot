/**
 * GitHub Issue Service
 *
 * Handles creation of GitHub issues for feature requests and feedback.
 * Uses the existing GitHub client infrastructure.
 */

import { getGitHubClient } from "../integrations/github/client";
import { getConfigValue } from "../config";
import type { GeneratedBRD } from "./brd-generator";

export interface CreateIssueParams {
  brd: GeneratedBRD;
  slackThreadUrl?: string;
  requestedBy?: string;
}

export interface CreatedIssue {
  number: number;
  htmlUrl: string;
  title: string;
}

/**
 * Creates a GitHub issue from a BRD
 */
export async function createGitHubIssue(params: CreateIssueParams): Promise<CreatedIssue> {
  let client;
  try {
    client = await getGitHubClient();
  } catch (error) {
    throw new Error(
      "GitHub App is not configured. Please set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_INSTALLATION_ID environment variables to enable feedback collection."
    );
  }

  const { owner, repo } = getRepoConfig();

  const body = formatIssueBody(params.brd, params.slackThreadUrl, params.requestedBy);
  const labels = getIssueLabels();

  const response = await client.issues.create({
    owner,
    repo,
    title: params.brd.title,
    body,
    labels,
  });

  return {
    number: response.data.number,
    htmlUrl: response.data.html_url,
    title: response.data.title,
  };
}

/**
 * Gets repository configuration from environment
 */
function getRepoConfig(): { owner: string; repo: string } {
  const repoConfig = getConfigValue("githubFeedbackRepo");
  const repoString = typeof repoConfig === "string" ? repoConfig : "Mobizinc/ai-sdk-slackbot";

  // Trim and filter empty segments to handle edge cases like leading/trailing slashes
  const parts = repoString
    .trim()
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length !== 2) {
    throw new Error(`Invalid GitHub repository format: ${repoString}. Expected format: owner/repo`);
  }

  const [owner, repo] = parts;

  // Validate that both owner and repo are non-empty after trimming
  if (!owner || !repo) {
    throw new Error(`Invalid GitHub repository format: ${repoString}. Both owner and repo must be non-empty`);
  }

  return { owner, repo };
}

/**
 * Gets labels for the issue
 */
function getIssueLabels(): string[] {
  const labelsConfig = getConfigValue("githubFeedbackLabels");
  const labelsString = typeof labelsConfig === "string" ? labelsConfig : "feature-request,user-feedback";

  return labelsString
    .split(",")
    .map((label) => label.trim())
    .filter((label) => label.length > 0);
}

/**
 * Formats the BRD into a GitHub issue body
 */
function formatIssueBody(brd: GeneratedBRD, slackThreadUrl?: string, requestedBy?: string): string {
  let body = "";

  // Header with metadata
  if (requestedBy || slackThreadUrl) {
    body += "## Request Information\n\n";
    if (requestedBy) {
      body += `**Requested by:** ${requestedBy}\n`;
    }
    if (slackThreadUrl) {
      body += `**Slack Thread:** ${slackThreadUrl}\n`;
    }
    body += "\n";
  }

  // Problem Statement
  body += "## Problem Statement\n\n";
  body += `${brd.problemStatement}\n\n`;

  // User Story
  body += "## User Story\n\n";
  body += `${brd.userStory}\n\n`;

  // Acceptance Criteria
  body += "## Acceptance Criteria\n\n";
  if (brd.acceptanceCriteria.length > 0) {
    for (const criterion of brd.acceptanceCriteria) {
      body += `- [ ] ${criterion}\n`;
    }
    body += "\n";
  } else {
    body += "_No acceptance criteria specified_\n\n";
  }

  // Technical Context
  body += "## Technical Context\n\n";
  body += `${brd.technicalContext}\n\n`;

  // Conversation Transcript (if available)
  if (brd.conversationTranscript) {
    body += "## Conversation Transcript\n\n";
    body += "```\n";
    body += brd.conversationTranscript;
    body += "\n```\n\n";
  }

  // Footer
  body += "---\n\n";
  body += "_This issue was automatically generated from user feedback via the Slack bot._\n";

  return body;
}
