import { generateText } from "ai";
import type { CaseContext } from "../context-manager";
import type {
  ServiceNowCaseJournalEntry,
  ServiceNowCaseResult,
} from "../tools/servicenow";
import { sanitizeModelConfig } from "../model-capabilities";
import { selectLanguageModel } from "../model-provider";

interface ResolutionSummaryInput {
  caseNumber: string;
  context: CaseContext;
  caseDetails?: ServiceNowCaseResult | null;
  journalEntries?: ServiceNowCaseJournalEntry[];
}

const MAX_CONVERSATION_MESSAGES = 12;
const MAX_JOURNAL_ENTRIES = 6;

function formatConversation(context: CaseContext): string {
  const recentMessages = context.messages
    .slice(-MAX_CONVERSATION_MESSAGES)
    .map((msg) => `${msg.user}: ${msg.text}`.trim())
    .filter(Boolean);

  return recentMessages.length > 0
    ? recentMessages.join("\n")
    : "No conversation captured.";
}

function formatJournalEntries(entries: ServiceNowCaseJournalEntry[] | undefined): string {
  if (!entries?.length) return "No recent journal activity.";

  return entries
    .slice(0, MAX_JOURNAL_ENTRIES)
    .map((entry) => {
      const timestamp = entry.sys_created_on;
      const author = entry.sys_created_by || "unknown";
      const kind = entry.element === "work_notes" ? "Work note" : "Comment";
      const value = entry.value?.replace(/\s+/g, " ").trim() ?? "(no content)";
      return `${timestamp} – ${author} (${kind}): ${value}`;
    })
    .join("\n");
}

function formatCaseDetails(caseDetails: ServiceNowCaseResult | null | undefined): string {
  if (!caseDetails) return "Not available.";

  const fields = [
    caseDetails.short_description ? `Short description: ${caseDetails.short_description}` : null,
    caseDetails.description ? `Description: ${caseDetails.description}` : null,
    caseDetails.state ? `State: ${caseDetails.state}` : null,
    caseDetails.priority ? `Priority: ${caseDetails.priority}` : null,
    caseDetails.assignment_group ? `Assignment group: ${caseDetails.assignment_group}` : null,
    caseDetails.assigned_to ? `Assigned to: ${caseDetails.assigned_to}` : null,
    caseDetails.submitted_by ? `Requester: ${caseDetails.submitted_by}` : null,
  ].filter(Boolean);

  return fields.length > 0 ? fields.join("\n") : "Limited metadata available.";
}

export async function generateResolutionSummary({
  caseNumber,
  context,
  caseDetails,
  journalEntries,
}: ResolutionSummaryInput): Promise<string | null> {
  const conversationText = formatConversation(context);
  const journalText = formatJournalEntries(journalEntries);
  const caseDetailText = formatCaseDetails(caseDetails ?? null);

  const prompt = `You are an internal Service Desk assistant. Summarize the resolved case below for a support analyst audience.

Case Number: ${caseNumber}

ServiceNow Details:
${caseDetailText}

Recent Journal Activity:
${journalText}

Conversation Excerpt:
${conversationText}

Produce a Slack-formatted message with:
*Resolution Summary* – 2-4 bullets explaining the issue, root cause, and fix.
*Latest Updates* – bullet the most recent actions (chronological).
*Outstanding Items* – list follow-up actions or state "- None noted." if nothing remains.

Keep bullets concise (≤140 characters) and avoid repeating the case number. Do not invent details beyond the provided information.`;

  try {
    const modelSelection = selectLanguageModel();

    const config = sanitizeModelConfig(modelSelection.modelId, {
      model: modelSelection.model,
      prompt,
    });

    const { text } = await generateText(config);
    const summary = text.trim();

    if (summary.length === 0) {
      return null;
    }

    return summary;
  } catch (error) {
    console.error("[ResolutionSummary] Failed to generate summary:", error);

    const fallbackLines = [
      `✅ Case ${caseNumber} marked resolved.`,
      caseDetails?.short_description
        ? `• Issue: ${caseDetails.short_description}`
        : undefined,
      context.messages.length > 0
        ? `• Last comment from ${context.messages[context.messages.length - 1]?.user ?? "user"}: ${context.messages[context.messages.length - 1]?.text}`
        : undefined,
    ].filter(Boolean);

    return fallbackLines.length > 0 ? fallbackLines.join("\n") : null;
  }
}
