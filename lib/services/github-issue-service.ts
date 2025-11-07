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
  const client = await getGitHubClient();
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

  const parts = repoString.split("/");
  if (parts.length !== 2) {
    throw new Error(`Invalid GitHub repository format: ${repoString}. Expected format: owner/repo`);
  }

  return {
    owner: parts[0],
    repo: parts[1],
  };
}

/**
 * Gets labels for the issue
 */
function getIssueLabels(): string[] {
  const labelsConfig = getConfigValue("githubFeedbackLabels");
  const labelsString = typeof labelsConfig === "string" ? labelsConfig : "feature-request,user-feedback";

  return labelsString.split(",").map((label) => label.trim());
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
