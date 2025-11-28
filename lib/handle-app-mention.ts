import type { AppMentionEvent } from "./slack-event-types";
import { getSlackMessagingService } from "./services/slack-messaging";
import { generateResponse } from "./agent";
import { getContextManager } from "./context-manager";
import { notifyResolution } from "./handle-passive-messages";
import { isServiceNowConfigured } from "./config/helpers";
import { getCaseRepository } from "./infrastructure/servicenow/repositories";
import { getCaseTriageService } from "./services/case-triage";
import { createStatusUpdater } from "./utils/slack-status-updater";
import { setErrorWithStatusUpdater } from "./utils/slack-error-handler";
import { getResolutionDetector } from "./passive/detectors/resolution-detector";
import { formatCaseAsMinimalCard, splitTextIntoSectionBlocks, formatCaseAsBlockKit } from "./formatters/servicenow-block-kit";
import { detectIntentHybrid } from "./intent-detection-llm";
import { getUnifiedTaskRepository } from "./infrastructure/servicenow/repositories/unified-task-repository";

const slackMessaging = getSlackMessagingService();

const extractSummaryText = (raw: unknown): string | null => {
  if (!raw) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed;
};

interface BlockKitData {
  type: string;
  caseData?: {
    number?: string;
    short_description?: string;
    priority?: string;
    state?: string;
    sys_id?: string;
  };
}

interface ParsedResponse {
  text: string;
  blockKitData?: BlockKitData;
}

/**
 * Parse LLM response that may contain embedded Block Kit data.
 * Expected format: JSON with { text: string, _blockKitData?: {...} }
 */
function parseBlockKitResponse(raw: string): ParsedResponse {
  if (!raw || typeof raw !== "string") {
    return { text: raw || "" };
  }

  const trimmed = raw.trim();

  // Try to parse as JSON with _blockKitData
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        let textContent = "";

        // Extract text - may be nested JSON or plain string
        if (parsed.text) {
          if (typeof parsed.text === "string") {
            // Check if text is itself JSON
            try {
              const innerParsed = JSON.parse(parsed.text);
              textContent = innerParsed.text || parsed.text;
            } catch {
              textContent = parsed.text;
            }
          } else if (typeof parsed.text === "object" && parsed.text.text) {
            textContent = parsed.text.text;
          }
        }

        return {
          text: textContent || trimmed,
          blockKitData: parsed._blockKitData,
        };
      }
    } catch {
      // Not valid JSON, return as plain text
    }
  }

  return { text: trimmed };
}

const SLACK_MAX_BLOCKS = 50;
const RESERVED_BLOCKS_FOR_CASE_CARD = 3; // Section + actions + buffer

/**
 * Build Block Kit blocks from parsed response.
 * Splits long text into sections and appends case card if _blockKitData is present.
 * Enforces Slack's 50 block limit.
 */
function buildResponseBlocks(parsed: ParsedResponse): any[] | undefined {
  const blocks: any[] = [];
  const hasCaseCard = parsed.blockKitData?.type === "case_detail" && parsed.blockKitData.caseData;
  const maxTextBlocks = hasCaseCard ? SLACK_MAX_BLOCKS - RESERVED_BLOCKS_FOR_CASE_CARD : SLACK_MAX_BLOCKS;

  // Split long text into section blocks
  if (parsed.text && parsed.text.length > 2800) {
    const textBlocks = splitTextIntoSectionBlocks(parsed.text, "mrkdwn");
    // Limit to max blocks, keeping room for case card
    blocks.push(...textBlocks.slice(0, maxTextBlocks));
  } else if (parsed.text) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: parsed.text,
      },
    });
  }

  // Append case card if Block Kit data is present
  if (hasCaseCard) {
    const caseCard = formatCaseAsMinimalCard(parsed.blockKitData!.caseData as any);
    blocks.push(...caseCard);
  }

  return blocks.length > 0 ? blocks : undefined;
}

export async function handleNewAppMention(
  event: AppMentionEvent,
  botUserId: string,
) {
  console.log("Handling app mention");
  if (event.bot_id || event.bot_id === botUserId || event.bot_profile) {
    console.log("Skipping app mention");
    return;
  }

  const { thread_ts, channel } = event;
  const { updateStatus, setFinalMessage } = await createStatusUpdater(
    event.channel,
    event.thread_ts ?? event.ts,
    "is thinking..."
  );

  const contextManager = getContextManager();
  const mentionCaseNumbers = contextManager.extractCaseNumbers(event.text || "");

  // --- FAST PATH: Status Checks ---
  // Quickly detect if this is a simple status check for a single case/incident
  try {
    const intentResult = await detectIntentHybrid({ message: event.text });
    const isSimpleIntent = ['status_query', 'latest_updates', 'assignment_info'].includes(intentResult.intent);
    
    // Proceed if simple intent and exactly one case number found (or ambiguous intent but high confidence match)
    if ((isSimpleIntent || intentResult.confidence >= 0.8) && mentionCaseNumbers.length === 1) {
      const ticketNumber = mentionCaseNumbers[0];
      console.log(`[App Mention] Fast Path triggered for ${ticketNumber} (Intent: ${intentResult.intent})`);
      
      if (isServiceNowConfigured()) {
        await updateStatus(`checking status of ${ticketNumber}...`);
        
        const repo = getUnifiedTaskRepository();
        const data = await repo.getTaskAndJournals(ticketNumber);

        if (data) {
          // Map UnifiedTask to the format expected by formatCaseAsBlockKit
          // The formatter handles snake_case fields from API, but our UnifiedTask has camelCase
          // We map back to what the formatter expects
          const formatData = {
            number: data.task.number,
            sys_id: data.task.sysId,
            short_description: data.task.shortDescription,
            description: data.task.description,
            state: data.task.state,
            priority: data.task.priority,
            assigned_to: data.task.assignedTo,
            assignment_group: data.task.assignmentGroup,
            sys_created_on: data.task.sysCreatedOn?.toISOString(),
            updated_on: data.task.sysUpdatedOn?.toISOString(),
            // Add mapped fields for display
            caller_id: "Caller", // Generic label since we normalized it
            company: "",
            category: "",
            subcategory: ""
          };

          const blocks = formatCaseAsBlockKit(formatData, {
            includeJournal: true,
            journalEntries: data.journals.map(j => ({
              sys_created_on: j.createdOn.toISOString(),
              sys_created_by: j.createdBy,
              value: j.value || "",
              element: j.element
            })),
            maxJournalEntries: 3 // Show latest 3 updates
          });

          // Send response and EXIT
          await setFinalMessage(`Here is the latest update for *${ticketNumber}*:`, blocks);
          return; 
        }
      }
    }
  } catch (error) {
    console.error("[App Mention] Fast path failed, falling back to agent:", error);
    // Fall through to normal agent execution
  }
  // --- END FAST PATH ---

  // Check for triage command pattern: @botname triage [case_number]
  // Supported patterns:
  // - @bot triage SCS0001234
  // - @bot triage case SCS0001234
  // - @bot classify SCS0001234
  // - @bot analyze SCS0001234
  const triageKeywordPattern = /(?:triage|classify|analyze)(?:\s+case)?\s+((?:SCS|CS|INC|RITM|REQ|CHG|PRB|SCTASK|STASK)[0-9]{7,10})/i;
  const triageMatch = event.text.match(triageKeywordPattern);

  if (triageMatch) {
    const caseNumber = triageMatch[1].toUpperCase();
    console.log(`[App Mention] Detected triage command for case ${caseNumber}`);

    try {
      await updateStatus(`is triaging case ${caseNumber}...`);

      // Fetch case from ServiceNow
      if (!isServiceNowConfigured()) {
        await setFinalMessage("ServiceNow integration is not configured. Cannot triage cases.");
        return;
      }

      // Fetch case using repository pattern
      const caseRepo = getCaseRepository();
      const caseDetails = await caseRepo.findByNumber(caseNumber);

      if (!caseDetails) {
        await setFinalMessage(`Case ${caseNumber} not found in ServiceNow. Please verify the case number is correct.`);
        return;
      }

      // Perform triage
      const caseTriageService = getCaseTriageService();
      const classificationStage = await caseTriageService.runClassificationStage(
        {
          case_number: caseDetails.number,
          sys_id: caseDetails.sysId,
          short_description: caseDetails.shortDescription || "",
          description: caseDetails.description,
          priority: caseDetails.priority,
          urgency: caseDetails.urgency || caseDetails.priority, // Use urgency if available, fall back to priority
          state: caseDetails.state,
          category: caseDetails.category,
          subcategory: caseDetails.subcategory,
          assignment_group: caseDetails.assignmentGroup,
          assignment_group_sys_id: caseDetails.assignmentGroupSysId || caseDetails.assignmentGroup,
          assigned_to: caseDetails.assignedTo,
          caller_id: caseDetails.callerId,
          company: caseDetails.company || caseDetails.callerId, // Use company if available
          account_id: caseDetails.account, // Use account from Case type
        },
        {
          enableCaching: true,
          enableSimilarCases: true,
          enableKBArticles: true,
          enableBusinessContext: true,
          enableWorkflowRouting: true,
          writeToServiceNow: false, // Don't write from @mention (manual triage is read-only)
        }
      );

      const triageResult = {
        caseNumber: classificationStage.core.caseNumber,
        classification: classificationStage.core.classification,
        similarCases: classificationStage.core.similarCases,
        kbArticles: classificationStage.core.kbArticles,
        recordTypeSuggestion: classificationStage.core.recordTypeSuggestion,
        processingTimeMs: classificationStage.core.processingTimeMs,
        cached: classificationStage.core.cached,
      };

      // Format response
      const classification = triageResult.classification;
      const confidencePercent = Math.round((classification.confidence_score || 0) * 100);

      let response = `*Triage Results for ${caseNumber}*\n\n`;
      response += `*Classification:* ${classification.category}`;
      if (classification.subcategory) {
        response += ` > ${classification.subcategory}`;
      }
      response += `\n*Confidence:* ${confidencePercent}%\n`;
      response += `*Urgency Level:* ${classification.urgency_level || 'N/A'}\n\n`;

      if (classification.quick_summary) {
        response += `*Summary:* ${classification.quick_summary}\n\n`;
      }

      if (classification.immediate_next_steps && classification.immediate_next_steps.length > 0) {
        response += `*Immediate Next Steps:*\n`;
        classification.immediate_next_steps.forEach((step, idx) => {
          response += `${idx + 1}. ${step}\n`;
        });
        response += `\n`;
      }

      if (triageResult.similarCases && triageResult.similarCases.length > 0) {
        response += `*Similar Cases Found:* ${triageResult.similarCases.length}\n`;
        triageResult.similarCases.slice(0, 3).forEach((sc) => {
          const similarity = Math.round(sc.similarity_score * 100);
          response += `• ${sc.case_number} (${similarity}% match)\n`;
        });
        response += `\n`;
      }

      if (triageResult.kbArticles && triageResult.kbArticles.length > 0) {
        response += `*Relevant KB Articles Found:* ${triageResult.kbArticles.length}\n`;
        triageResult.kbArticles.slice(0, 3).forEach((kb) => {
          const relevance = Math.round(kb.similarity_score * 10); // similarity_score is 0-10, normalize to percentage
          response += `• ${kb.kb_number}: ${kb.title?.substring(0, 60)}... (${relevance}% relevant)\n`;
        });
        response += `\n`;
      }

      if (triageResult.recordTypeSuggestion) {
        const suggestion = triageResult.recordTypeSuggestion;
        response += `\n*Record Type Recommendation:* ${suggestion.type}`;
        if (suggestion.is_major_incident) {
          response += ` ⚠️ *MAJOR INCIDENT*`;
        }
        response += `\n_${suggestion.reasoning}_\n`;
      }

      response += `\n_Processing time: ${triageResult.processingTimeMs}ms`;
      if (triageResult.cached) {
        response += ` (cached)`;
      }
      response += `_`;

      await setFinalMessage(response);
      return;

    } catch (error) {
      await setErrorWithStatusUpdater(
        { setFinalMessage },
        error,
        `Failed to triage case ${caseNumber}`,
        "[App Mention]"
      );
      return;
    }
  }

  // If not a triage command, proceed with normal AI response (full agent/tools)
  let result: string;
  if (thread_ts) {
    const messages = await slackMessaging.getThread(channel, thread_ts, botUserId);
    result = await generateResponse(messages, updateStatus, {
      channelId: channel,
      threadTs: thread_ts,
    });
  } else {
    result = await generateResponse(
      [{ role: "user", content: event.text }],
      updateStatus,
      {
        channelId: channel,
        threadTs: thread_ts ?? event.ts,
      },
    );
  }

  // Parse response for Block Kit data and build blocks
  const parsed = parseBlockKitResponse(result);
  const blocks = buildResponseBlocks(parsed);
  const displayText = extractSummaryText(parsed.text) || parsed.text || result;
  await setFinalMessage(displayText, blocks);

  // After responding, check for case numbers and trigger intelligent workflow
  const caseNumbers = mentionCaseNumbers;

  if (caseNumbers.length > 0) {
    const actualThreadTs = thread_ts || event.ts; // Use event.ts as thread if not in thread

    for (const caseNumber of caseNumbers) {
      // Add message to context for tracking
      contextManager.addMessage(caseNumber, channel, actualThreadTs, {
        user: event.user || "unknown",
        text: event.text || "",
        timestamp: event.ts,
        thread_ts: thread_ts,
      });

      // Check if case is resolved using the centralized detector
      const context = contextManager.getContextSync(caseNumber, actualThreadTs);
      
      if (context && !context._notified) {
        const detector = getResolutionDetector();
        const resolution = await detector.shouldTriggerKBWorkflow(context);

        if (resolution.isResolved) {
          console.log(`[App Mention] Case ${caseNumber} resolution detected: ${resolution.reason}`);
          // Fire and forget - don't block the response
          notifyResolution(caseNumber, channel, actualThreadTs).catch((err) => {
            console.error(`[App Mention] Error in notifyResolution for ${caseNumber}:`, err);
          });
          context._notified = true;
        } else if (context.isResolved && !resolution.isValidatedByServiceNow) {
           // Reset isResolved flag if ServiceNow validation failed (fail-safe from detector)
           // This prevents stuck "resolved" state in context if the backend disagrees
           console.log(`[App Mention] Resetting resolution flag: ${resolution.reason}`);
           context.isResolved = false;
        }
      }
    }
  }
}