/**
 * Slack Interactivity Handler
 * Handles interactive component actions (buttons, select menus, etc.) from Slack
 *
 * This endpoint receives payloads when users interact with:
 * - Block Kit buttons
 * - Select menus
 * - Modal submissions
 * - Other interactive components
 *
 * For escalation buttons, see escalation-service.ts for business logic
 */

import { verifyRequest } from "../lib/slack-utils";
import { getEscalationService } from "../lib/services/escalation-service";
import { getKBApprovalManager } from "../lib/handle-kb-approval";
import { getSlackMessagingService } from "../lib/services/slack-messaging";
import { getIncidentClarificationService } from "../lib/services/incident-clarification-service";
import { initializeDatabase } from "../lib/db/init";
import { ErrorHandler } from "../lib/utils/error-handler";
import { getCaseRepository, getAssignmentGroupRepository } from "../lib/infrastructure/servicenow/repositories";
import { getSlackClient } from "../lib/slack/client";
import { getAssignmentGroupCache } from "../lib/services/assignment-group-cache";
import { getCaseSearchPagination } from "../lib/services/case-search-pagination";
import { caseSearchService } from "../lib/services/case-search-service";
import { buildSearchResultsMessage } from "../lib/services/case-search-ui-builder";
import { findStaleCases } from "../lib/services/case-aggregator";
import { buildStaleCasesMessage } from "../lib/services/case-search-ui-builder";
import {
  createModalView,
  createInputBlock,
  createPlainTextInput,
  createRichTextInput,
  createStaticSelect,
  createExternalSelect,
  createUserSelect,
  createRadioButtons,
  createDatePicker,
  createTimePicker,
  createCheckboxes,
  createSectionBlock,
  createDivider,
  sanitizePlainText,
  sanitizeMrkdwn,
  validateSelectOptions,
  safeParseMetadata,
  MessageEmojis,
  type KnownBlock,
  type ModalView,
} from "../lib/utils/message-styling";
import { enqueueBackgroundTask } from "../lib/background-tasks";
import { ProjectActions } from "../lib/projects/posting";
import { getProjectById } from "../lib/projects/catalog";
import { sendProjectLearnMore, startInterviewSession } from "../lib/projects/interview-session";
import { openStandupModal, handleStandupModalSubmission } from "../lib/projects/standup-responses";
import { StandupActions, StandupCallbackIds } from "../lib/projects/standup-constants";
import * as interestRepository from "../lib/db/repositories/interest-repository";

const slackMessaging = getSlackMessagingService();

// Initialize database on cold start
initializeDatabase().catch((err) => {
  console.error("[Interactivity] Database initialization failed:", err);
});

interface BlockActionsPayload {
  type: "block_actions";
  user: {
    id: string;
    username: string;
    name: string;
  };
  container: {
    type: string;
    message_ts: string;
    channel_id: string;
    is_ephemeral: boolean;
  };
  trigger_id: string;
  team: {
    id: string;
    domain: string;
  };
  actions: Array<{
    action_id: string;
    block_id: string;
    value?: string;
    type: string;
    action_ts: string;
  }>;
  response_url: string;
  message?: any;
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    // Slack sends interactivity payloads as application/x-www-form-urlencoded
    // with the JSON data in a "payload" parameter
    const params = new URLSearchParams(rawBody);
    const payloadStr = params.get("payload");

    if (!payloadStr) {
      return new Response("Missing payload", { status: 400 });
    }

    const payload = JSON.parse(payloadStr) as BlockActionsPayload;

    // Verify request signature
    await verifyRequest({
      requestType: "interactivity",
      request,
      rawBody,
    });

    console.log(`[Interactivity] Received ${payload.type} from user ${payload.user.id}`);

    // Handle different payload types
    if (payload.type === "block_actions") {
      await handleBlockActions(payload);
      return new Response("", { status: 200 });
    } else if (payload.type === "view_submission") {
      await handleViewSubmission(payload as any);
      return new Response("", { status: 200 });
    } else if (payload.type === "block_suggestion") {
      // Handle external_select option requests
      const options = await handleBlockSuggestion(payload as any);
      return new Response(JSON.stringify({ options }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Slack expects a 200 OK response within 3 seconds
    return new Response("", { status: 200 });
  } catch (error) {
    console.error("[Interactivity] Error handling interaction:", error);
    return new Response("Error processing interaction", { status: 500 });
  }
}

/**
 * Handle project waitlist signup
 * User clicks "Join Waitlist" button when project is at capacity
 */
async function handleProjectWaitlistSignup(project: any, userId: string, userName?: string): Promise<void> {
  try {
    // Check if user already on waitlist
    const existingInterest = await interestRepository.findInterest(project.id, userId);

    if (existingInterest) {
      if (existingInterest.status === "waitlist") {
        // Already on waitlist
        const dmConversation = await slackMessaging.openConversation(userId);
        if (dmConversation.channelId) {
          await slackMessaging.postMessage({
            channel: dmConversation.channelId,
            text: `You're already on the waitlist for *${project.name}*. We'll notify you as soon as a slot opens up!`,
          });
        }
        return;
      } else if (existingInterest.status !== "abandoned") {
        // User already has an active interest
        const dmConversation = await slackMessaging.openConversation(userId);
        if (dmConversation.channelId) {
          await slackMessaging.postMessage({
            channel: dmConversation.channelId,
            text: `You've already expressed interest in *${project.name}*. We'll get back to you soon!`,
          });
        }
        return;
      }
    }

    // Add to waitlist
    const interest = await interestRepository.createInterest(project.id, userId, "waitlist");

    if (interest) {
      const dmConversation = await slackMessaging.openConversation(userId);
      if (dmConversation.channelId) {
        const waitlist = await interestRepository.getWaitlist(project.id);
        const position = waitlist.findIndex((i) => i.id === interest.id) + 1;

        await slackMessaging.postMessage({
          channel: dmConversation.channelId,
          text: [
            `Great! You've been added to the waitlist for *${project.name}*.`,
            `You're #${position} in line.`,
            "We'll send you a message as soon as a slot opens up. Thanks for your interest!",
          ].join("\n"),
        });
      }
    }
  } catch (error) {
    console.error("[Project Waitlist] Failed to add user to waitlist", {
      projectId: project.id,
      userId,
      error,
    });

    // Still send a response to the user
    const dmConversation = await slackMessaging.openConversation(userId);
    if (dmConversation.channelId) {
      await slackMessaging.postMessage({
        channel: dmConversation.channelId,
        text: `Thanks for your interest in *${project.name}*! We'll be in touch soon.`,
      });
    }
  }
}

/**
 * Handle block action interactions (button clicks, etc.)
 */
async function handleBlockActions(payload: BlockActionsPayload): Promise<void> {
  for (const action of payload.actions) {
    const actionId = action.action_id;
    const value = action.value || "";

    console.log(`[Interactivity] Action: ${actionId}, Value: ${value}`);

    // Handle escalation button actions
    if (actionId.startsWith("escalation_")) {
      await handleEscalationAction(actionId, value, payload);
    }

    // Handle KB approval button actions
    if (actionId.startsWith("kb_")) {
      await handleKBApprovalAction(actionId, value, payload);
    }

    // Handle incident enrichment CI selection buttons
    if (actionId.startsWith("select_ci_") || actionId === "skip_ci") {
      await handleIncidentEnrichmentAction(actionId, value, payload);
    }

    if (actionId === ProjectActions.INTEREST || actionId === ProjectActions.LEARN_MORE || actionId === ProjectActions.WAITLIST) {
      const parsed = (() => {
        try {
          return JSON.parse(value || "{}");
        } catch (error) {
          console.error("[Project Interactivity] Failed to parse action value", error);
          return null;
        }
      })();

      if (!parsed?.projectId) {
        console.warn("[Project Interactivity] Missing project id in action payload");
        continue;
      }

      const project = await getProjectById(parsed.projectId);
      if (!project) {
        console.warn(`[Project Interactivity] Project not found: ${parsed.projectId}`);
        continue;
      }

      if (actionId === ProjectActions.INTEREST) {
        enqueueBackgroundTask(
          startInterviewSession({
            project,
            userId: payload.user.id,
            userName: payload.user.name,
            initiatedBy: payload.user.id,
            sourceMessageTs: payload.message?.ts,
          }),
        );
      }

      if (actionId === ProjectActions.LEARN_MORE) {
        enqueueBackgroundTask(
          sendProjectLearnMore({
            project,
            userId: payload.user.id,
          }),
        );
      }

      if (actionId === ProjectActions.WAITLIST) {
        // Handle waitlist signup
        enqueueBackgroundTask(handleProjectWaitlistSignup(project, payload.user.id, payload.user.name));
      }
    }

    if (actionId === StandupActions.OPEN_MODAL) {
      const { channel_id: actionChannelId, message_ts: messageTs } = payload.container || {};

      if (!actionChannelId || !messageTs) {
        console.warn("[Standup] Missing container metadata for stand-up modal open");
        continue;
      }

      await openStandupModal({
        triggerId: payload.trigger_id,
        channelId: actionChannelId,
        messageTs,
      });
    }
  }
}

/**
 * Handle modal view submissions
 */
async function handleViewSubmission(payload: any): Promise<void> {
  const callbackId = payload.view.callback_id;
  const userId = payload.user.id;

  console.log(`[Interactivity] View submission: ${callbackId} by user ${userId}`);

  if (callbackId === "project_create_modal") {  // Updated to match new callback_id
    await handleCreateProjectSubmission(payload);
  } else if (callbackId === "reassign_case_modal") {
    await handleReassignSubmission(payload);
  } else if (callbackId === StandupCallbackIds.MODAL) {
    await handleStandupModalSubmission(payload);
  } else {
    console.warn(`[Interactivity] Unknown view submission: ${callbackId}`);
  }
}

/**
 * Handle block_suggestion requests (for external_select)
 */
async function handleBlockSuggestion(payload: any): Promise<Array<{ text: { type: string; text: string }; value: string }>> {
  const actionId = payload.action_id;
  const value = payload.value || ""; // User's search query

  console.log(`[Interactivity] Block suggestion for ${actionId}, query: "${value}"`);

  // Handle assignment group search
  if (actionId === "reassign_modal_external_group_value") {
    return await searchAssignmentGroups(value);
  }

  // Add more external_select handlers here as needed
  console.warn(`[Interactivity] Unknown block_suggestion action_id: ${actionId}`);
  return [];
}

/**
 * Search assignment groups for external_select
 */
async function searchAssignmentGroups(query: string): Promise<Array<{ text: { type: string; text: string }; value: string }>> {
  try {
    // Get all groups from cache
    const groupCache = getAssignmentGroupCache();
    const allGroups = await groupCache.getGroups();

    // Filter by query (case-insensitive)
    const queryLower = query.toLowerCase();
    const matchedGroups = allGroups.filter(group =>
      group.text.toLowerCase().includes(queryLower)
    );

    // Limit to 100 options (Slack max)
    const limitedGroups = matchedGroups.slice(0, 100);

    // Format for Slack
    const options = limitedGroups.map(group => ({
      text: {
        type: "plain_text" as const,
        text: group.text,
      },
      value: group.value,
    }));

    console.log(`[Interactivity] Found ${options.length} assignment groups matching "${query}"`);

    return options;
  } catch (error) {
    console.error('[Interactivity] Error searching assignment groups:', error);
    return [];
  }
}

/**
 * Convert Slack rich text format to plain text
 * Extracts text from rich_text_value structure
 */
function convertRichTextToPlain(richTextValue: any): string {
  if (!richTextValue || !richTextValue.elements) {
    return "";
  }

  let plainText = "";

  for (const section of richTextValue.elements) {
    if (section.elements) {
      for (const element of section.elements) {
        if (element.type === "text" && element.text) {
          plainText += element.text;
        } else if (element.type === "link" && element.text) {
          plainText += element.text;
        } else if (element.type === "user" && element.user_id) {
          plainText += `<@${element.user_id}>`;
        } else if (element.type === "channel" && element.channel_id) {
          plainText += `<#${element.channel_id}>`;
        }
      }
      plainText += "\n"; // Add newline after each section
    }
  }

  return plainText.trim();
}

/**
 * Handle Create Project modal submission
 */
async function handleCreateProjectSubmission(payload: any): Promise<void> {
  try {
    // Extract metadata with safe parsing
    const metadata = safeParseMetadata<{
      caseNumber: string;
      channelId: string;
      messageTs: string;
    }>(payload.view.private_metadata, ['caseNumber', 'channelId', 'messageTs']);

    if (!metadata) {
      console.error('[Interactivity] Invalid project creation metadata');
      return;
    }

    const { caseNumber, channelId, messageTs } = metadata;
    const userId = payload.user.id;

    // Extract form values using new block_ids and action_ids
    const values = payload.view.state.values;
    const projectNameRaw = values.project_modal_input_name.project_modal_input_name_value.value;
    const projectDescriptionRaw = values.project_modal_input_description.project_modal_input_description_value.value;
    const projectManager = values.project_modal_select_manager.project_modal_select_manager_value.selected_user || null;
    const priority = values.project_modal_select_priority.project_modal_select_priority_value.selected_option.value;

    // NEW: Extract date picker and time picker values
    const dueDate = values.project_modal_datepicker_due_date?.project_modal_datepicker_due_date_value?.selected_date || null;
    const kickoffTime = values.project_modal_timepicker_kickoff?.project_modal_timepicker_kickoff_value?.selected_time || null;

    // CRITICAL: Sanitize all user-provided inputs to prevent XSS injection
    const projectName = sanitizeMrkdwn(projectNameRaw);
    const projectDescription = sanitizeMrkdwn(projectDescriptionRaw);

    console.log(`[Interactivity] Creating project for ${caseNumber}: ${sanitizePlainText(projectNameRaw, 100)}`);

    // Post project creation confirmation in thread
    const confirmationBlocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "📋 Project Created",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `✅ <@${userId}> created a project for case *${caseNumber}*`,
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Project Name:*\n${projectName}`,
          },
          {
            type: "mrkdwn",
            text: `*Priority:*\n${priority.charAt(0).toUpperCase() + priority.slice(1)}`,
          },
          {
            type: "mrkdwn",
            text: `*Project Manager:*\n${projectManager ? `<@${projectManager}>` : "Not assigned"}`,
          },
          {
            type: "mrkdwn",
            text: `*Due Date:*\n${dueDate || "Not set"}`,
          },
          {
            type: "mrkdwn",
            text: `*Kickoff Time:*\n${kickoffTime || "Not scheduled"}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Description:*\n${projectDescription}`,
        },
      },
      {
        type: "divider",
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "📝 _Next steps: Project manager will create scope document and schedule kickoff meeting_",
          },
        ],
      },
    ];

    await slackMessaging.postMessage({
      channel: channelId,
      threadTs: messageTs,
      text: `✅ Project created for ${caseNumber}: ${sanitizePlainText(projectNameRaw, 200)}`, // Sanitized for text field
    });

    // Update original escalation message with sanitized data
    await updateEscalationMessage(
      channelId,
      messageTs,
      `✅ Project created by <@${userId}>: ${sanitizePlainText(projectNameRaw, 200)}` // Sanitized
    );

    // TODO: In the future, integrate with project management system
    // - Create project in ServiceNow/Jira/etc.
    // - Assign project manager
    // - Set up project tracking

    console.log(`[Interactivity] Project created successfully for ${caseNumber}`);
  } catch (error) {
    console.error(`[Interactivity] Error handling project creation:`, error);

    // Try to notify user of error with safe metadata parsing
    try {
      const metadata = safeParseMetadata<{
        channelId: string;
        messageTs: string;
      }>(payload.view.private_metadata, ['channelId', 'messageTs']);

      if (!metadata) {
        console.error('[Interactivity] Cannot notify user of project creation error - invalid metadata');
        return;
      }

      const { channelId, messageTs } = metadata;

      await slackMessaging.postMessage({
        channel: channelId,
        threadTs: messageTs,
        text: `❌ Error creating project: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } catch (notifyError) {
      console.error(`[Interactivity] Failed to notify about project creation error:`, notifyError);
    }
  }
}

/**
 * Handle Reassign modal submission
 */
async function handleReassignSubmission(payload: any): Promise<void> {
  try {
    // Extract metadata with safe parsing
    const metadata = safeParseMetadata<{
      caseNumber: string;
      channelId: string;
      messageTs: string;
      useExternalSelect: boolean;
    }>(payload.view.private_metadata, ['caseNumber', 'channelId', 'messageTs', 'useExternalSelect']);

    if (!metadata) {
      console.error('[Interactivity] Invalid reassignment metadata');
      return;
    }

    const { caseNumber, channelId, messageTs, useExternalSelect } = metadata;
    const userId = payload.user.id;

    // Extract form values using new block_ids and action_ids
    const values = payload.view.state.values;

    // Assignment type - now using radio buttons
    const assignmentType = values.reassign_modal_radio_assignment_type.reassign_modal_radio_assignment_type_value.selected_option.value;
    const assignedTo = values.reassign_modal_select_user.reassign_modal_select_user_value.selected_user || null;

    // Extract assignment group value - different field depending on external_select
    let assignmentGroupValue: string | null = null;
    let assignmentGroupDisplayName: string | null = null;
    if (useExternalSelect) {
      // External select (sys_id from selected_option.value, name from selected_option.text.text)
      const selectedOption = values.reassign_modal_external_group?.reassign_modal_external_group_value?.selected_option;
      if (selectedOption) {
        assignmentGroupValue = selectedOption.value; // This is the sys_id
        assignmentGroupDisplayName = selectedOption.text?.text || assignmentGroupValue;
      }
    } else {
      // Fallback: Text input (name only)
      assignmentGroupValue = values.reassign_modal_select_group?.reassign_modal_input_group_value?.value || null;
      assignmentGroupDisplayName = assignmentGroupValue; // Same value for display
    }

    const reassignmentReasonRaw = values.reassign_modal_input_reason.reassign_modal_input_reason_value.value;

    // NEW: Extract rich text input value (different structure than plain text)
    const workNoteRichText = values.reassign_modal_richtextinput_worknote?.reassign_modal_richtextinput_worknote_value?.rich_text_value;
    // Convert rich text to plain text (already handles user mentions safely)
    const workNoteRaw = workNoteRichText ? convertRichTextToPlain(workNoteRichText) : null;

    // CRITICAL: Sanitize all user-provided inputs to prevent XSS injection
    const reassignmentReason = sanitizeMrkdwn(reassignmentReasonRaw);
    const workNote = workNoteRaw ? sanitizeMrkdwn(workNoteRaw) : null;

    console.log(`[Interactivity] Reassigning ${caseNumber} (type: ${assignmentType})`);

    // Determine assignment target for display (sanitize group names)
    let assignmentTarget: string;
    if (assignmentType === "user" && assignedTo) {
      assignmentTarget = `<@${assignedTo}>`; // User IDs are safe (Slack-provided)
    } else if (assignmentType === "group" && assignmentGroupDisplayName) {
      assignmentTarget = sanitizeMrkdwn(assignmentGroupDisplayName); // CRITICAL: Sanitize group name
    } else {
      // Validation error
      await slackMessaging.postMessage({
        channel: channelId,
        threadTs: messageTs,
        text: `❌ Reassignment failed: Please specify either a user or a group`,
      });
      return;
    }

    // Try to update ServiceNow
    let serviceNowUpdateSuccess = false;
    let serviceNowError: string | null = null;

    try {
      const caseRepo = getCaseRepository();

      // Look up case by number to get sys_id
      const caseRecord = await caseRepo.findByNumber(caseNumber);

      if (!caseRecord) {
        throw new Error(`Case ${caseNumber} not found in ServiceNow`);
      }

      // Get reassigning user's name for work note
      let reassignedByName = `<@${userId}>`;
      try {
        const slackClient = getSlackClient();
        const userInfo = await slackClient.users.info({ user: userId });
        reassignedByName = userInfo.user?.real_name || userInfo.user?.name || reassignedByName;
      } catch (error) {
        console.warn(`[Interactivity] Could not fetch Slack user info for ${userId}:`, error);
      }

      // Handle assignment based on type
      if (assignmentType === "group" && assignmentGroupValue) {
        // Update case with assignment group
        // If useExternalSelect=true, assignmentGroupValue is a sys_id (most reliable)
        // If useExternalSelect=false, assignmentGroupValue is a name (fallback)
        await caseRepo.update(caseRecord.sysId, {
          assignmentGroup: assignmentGroupValue,
        });

        console.log(
          `[Interactivity] Updated case ${caseNumber} assignment group to ${assignmentGroupValue} ` +
          `(${useExternalSelect ? "sys_id from search" : "manual name entry"})`
        );
      } else if (assignmentType === "user" && assignedTo) {
        // User assignment requires Slack → ServiceNow user mapping
        // This is not yet implemented, so we'll skip ServiceNow update for now
        throw new Error("User assignment not yet implemented - please use group assignment");
      }

      // Build and add work note
      let workNoteContent = `━━━ CASE REASSIGNMENT ━━━
Action: Case reassigned
Reassigned by: ${reassignedByName}
Timestamp: ${new Date().toISOString()}
Assignment Type: ${assignmentType === "user" ? "User" : "Group"}
Assigned To: ${assignmentTarget}
Method: ${useExternalSelect ? "Search (external_select)" : "Manual entry (fallback)"}
Reason: ${reassignmentReason}`;

      if (workNote) {
        workNoteContent += `\n\nAdditional Notes:\n${workNote}`;
      }

      await caseRepo.addWorkNote(caseRecord.sysId, workNoteContent, true);
      console.log(`[Interactivity] Added reassignment work note to case ${caseNumber}`);

      serviceNowUpdateSuccess = true;
    } catch (error) {
      console.error(`[Interactivity] Error updating ServiceNow for ${caseNumber}:`, error);
      serviceNowError = error instanceof Error ? error.message : "Unknown error";
    }

    // Post reassignment confirmation in thread
    const statusEmoji = serviceNowUpdateSuccess ? "✅" : "⚠️";
    const statusMessage = serviceNowUpdateSuccess
      ? "Case reassigned in ServiceNow"
      : `ServiceNow update failed: ${serviceNowError}`;

    const confirmationBlocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🔄 Case Reassignment",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${statusEmoji} <@${userId}> reassigned case *${caseNumber}*\n\n${statusMessage}`,
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Assignment Type:*\n${assignmentType === "user" ? "User" : "Group"}`,
          },
          {
            type: "mrkdwn",
            text: `*Assigned To:*\n${assignmentTarget}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Reason:*\n${reassignmentReason}`,
        },
      },
    ];

    // Add work note if provided
    if (workNote) {
      confirmationBlocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Work Note:*\n${workNote}`,
        },
      });
    }

    // Add context based on success/failure
    confirmationBlocks.push(
      {
        type: "divider",
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: serviceNowUpdateSuccess
              ? "✅ _Assignment updated in ServiceNow with work note_"
              : "⚠️ _Slack acknowledgment only - manual ServiceNow update required_",
          },
        ],
      } as any
    );

    await slackMessaging.postMessage({
      channel: channelId,
      threadTs: messageTs,
      text: `${statusEmoji} Case ${caseNumber} reassigned to ${assignmentTarget}`,
    });

    // Update original escalation message
    const updateStatus = serviceNowUpdateSuccess
      ? `🔄 Reassigned by <@${userId}> to ${assignmentTarget} - Updated in ServiceNow`
      : `🔄 Reassigned by <@${userId}> to ${assignmentTarget} (⚠️ ServiceNow update failed)`;

    await updateEscalationMessage(
      channelId,
      messageTs,
      updateStatus
    );

    console.log(`[Interactivity] Case reassignment processed: ${caseNumber} (ServiceNow: ${serviceNowUpdateSuccess})`);
  } catch (error) {
    console.error(`[Interactivity] Error handling reassignment:`, error);

    // Try to notify user of error with safe metadata parsing
    try {
      const metadata = safeParseMetadata<{
        channelId: string;
        messageTs: string;
      }>(payload.view.private_metadata, ['channelId', 'messageTs']);

      if (!metadata) {
        console.error('[Interactivity] Cannot notify user of reassignment error - invalid metadata');
        return;
      }

      const { channelId, messageTs } = metadata;

      await slackMessaging.postMessage({
        channel: channelId,
        threadTs: messageTs,
        text: `❌ Error processing reassignment: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } catch (notifyError) {
      console.error(`[Interactivity] Failed to notify about reassignment error:`, notifyError);
    }
  }
}

/**
 * Handle escalation-related button actions
 */
async function handleEscalationAction(
  actionId: string,
  value: string,
  payload: BlockActionsPayload
): Promise<void> {
  const { user, container } = payload;
  const caseNumber = value.split(":")[1]; // Extract case number from value (format: "action:CASE123")

  console.log(
    `[Interactivity] Escalation action ${actionId} for case ${caseNumber} by user ${user.id}`
  );

  // Acknowledge the action in Slack (update message to show who clicked)
  try {
    const escalationService = getEscalationService();

    switch (actionId) {
      case "escalation_button_create_project":
        await handleCreateProject(caseNumber, user, container, payload);
        break;

      case "escalation_button_acknowledge_bau":
        await handleAcknowledgeBau(caseNumber, user, container, payload);
        break;

      case "escalation_button_reassign":
        await handleReassign(caseNumber, user, container, payload);
        break;

      case "escalation_button_view_servicenow":
        // This is a URL button - no action needed (Slack handles the redirect)
        console.log(`[Interactivity] User ${user.id} clicked View ServiceNow for ${caseNumber}`);
        break;

      // Case Search Pagination Handlers
      case "case_search_button_next_page":
      case "case_search_button_prev_page":
        await handleSearchPagination(actionId, value, user, container, payload);
        break;

      case "case_search_button_refresh":
        await handleSearchRefresh(value, user, container, payload);
        break;

      // Stale Ticket Threshold Selection
      case "case_search_button_stale_threshold":
        await handleStaleThresholdChange(value, user, container, payload);
        break;

      // Filter Selection
      case "case_search_button_filter_customer":
      case "case_search_button_filter_queue":
        await handleFilterSelection(actionId, value, user, container, payload);
        break;

      default:
        console.warn(`[Interactivity] Unknown escalation action: ${actionId}`);
    }

    // Track acknowledgment in database (for all non-view actions)
    if (actionId !== "escalation_button_view_servicenow") {
      await escalationService.handleAcknowledgment(
        container.channel_id,
        container.message_ts,
        user.id,
        actionId
      );
    }
  } catch (error) {
    console.error(`[Interactivity] Error handling escalation action:`, error);

    // Use error handler for contextual error message
    const errorResult = ErrorHandler.handle(error, {
      operation: `Escalation action (${actionId})`,
      caseNumber,
      userId: user.id,
    });

    // Post contextual error message with recovery steps
    const errorBlocks = ErrorHandler.formatForSlack(errorResult);

    await slackMessaging.postMessage({
      channel: container.channel_id,
      threadTs: container.message_ts,
      text: ErrorHandler.getSimpleMessage(errorResult),
    });
  }
}

/**
 * Handle Incident Enrichment CI Selection button actions
 * Processes technician responses to CI clarification requests
 */
async function handleIncidentEnrichmentAction(
  actionId: string,
  value: string,
  payload: BlockActionsPayload
): Promise<void> {
  const { user, container } = payload;

  console.log(
    `[Interactivity] Incident enrichment action ${actionId} by user ${user.id}`,
    { value }
  );

  try {
    const clarificationService = getIncidentClarificationService();

    // Parse the button value (contains incident_sys_id and CI details)
    let parsedValue: any;
    try {
      parsedValue = JSON.parse(value);
    } catch (error) {
      console.error("[Interactivity] Failed to parse enrichment button value:", error);
      await slackMessaging.postMessage({
        channel: container.channel_id,
        threadTs: container.message_ts,
        text: "Error processing CI selection - invalid button data",
      });
      return;
    }

    if (actionId === "skip_ci") {
      // User chose to skip auto-linking
      console.log(
        `[Interactivity] User ${user.id} skipped CI linking for incident ${parsedValue.incident_sys_id}`
      );

      await clarificationService.handleSkipAction(parsedValue.incident_sys_id);

      // Update Slack message to show action was taken
      await slackMessaging.updateMessage({
        channel: container.channel_id,
        ts: container.message_ts,
        text: `CI linking skipped by <@${user.id}>. Incident will need manual CI linking in ServiceNow.`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `✓ CI linking skipped by <@${user.id}>.\n\nIncident will need manual CI linking in ServiceNow if needed.`,
            },
          },
        ],
      });
    } else if (actionId.startsWith("select_ci_")) {
      // User selected a CI
      const incidentSysId = parsedValue.incident_sys_id;
      const ciSysId = parsedValue.ci_sys_id;
      const ciName = parsedValue.ci_name;

      console.log(
        `[Interactivity] User ${user.id} selected CI ${ciName} for incident ${incidentSysId}`
      );

      //  Handle the clarification response
      const result = await clarificationService.handleClarificationResponse({
        incidentSysId,
        selectedCiSysId: ciSysId,
        selectedCiName: ciName,
        respondedBy: user.id,
      });

      // Update Slack message to show action was taken
      if (result.success) {
        await slackMessaging.updateMessage({
          channel: container.channel_id,
          ts: container.message_ts,
          text: `CI linked by <@${user.id}>: ${ciName}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `✓ CI linked by <@${user.id}>: *${ciName}*\n\n${result.message}`,
              },
            },
          ],
        });
      } else {
        await slackMessaging.postMessage({
          channel: container.channel_id,
          threadTs: container.message_ts,
          text: `Error linking CI: ${result.message}`,
        });
      }
    }
  } catch (error) {
    console.error(`[Interactivity] Error handling incident enrichment action:`, error);

    await slackMessaging.postMessage({
      channel: container.channel_id,
      threadTs: container.message_ts,
      text: `Error processing CI selection: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}

/**
 * Handle KB approval button actions
 */
async function handleKBApprovalAction(
  actionId: string,
  value: string,
  payload: BlockActionsPayload
): Promise<void> {
  const { user, container } = payload;
  const caseNumber = value.split(":")[1]; // Extract case number from value (format: "kb_approve:CASE123")

  console.log(
    `[Interactivity] KB approval action ${actionId} for case ${caseNumber} by user ${user.id}`
  );

  // Declare action outside try block so it's accessible in catch block
  let action: "approve" | "reject" | "edit" = "approve";
  let processingEmoji: string;
  let processingText: string;

  try {
    // Map action_id to action type
    if (actionId === "kb_approval_button_approve") {
      action = "approve";
      processingEmoji = "⏳";
      processingText = "Approving KB article...";
    } else if (actionId === "kb_approval_button_reject") {
      action = "reject";
      processingEmoji = "⏳";
      processingText = "Rejecting KB article...";
    } else if (actionId === "kb_approval_button_edit") {
      action = "edit";
      processingEmoji = "⏳";
      processingText = "Opening editor...";
    } else {
      console.warn(`[Interactivity] Unknown KB action: ${actionId}`);
      return;
    }

    // Provide immediate feedback by updating the message to show processing state
    // This prevents double-clicks and gives instant visual confirmation
    await updateKBMessageToProcessing(
      container.channel_id,
      container.message_ts,
      processingEmoji,
      processingText,
      user.id
    );

    // Call KB approval manager to handle the action
    const kbApprovalManager = getKBApprovalManager();
    const result = await kbApprovalManager.handleButtonClick(
      action,
      container.channel_id,
      container.message_ts,
      user.id
    );

    // Post feedback message in thread if there was an error
    if (!result.success && result.message) {
      await slackMessaging.postMessage({
        channel: container.channel_id,
        threadTs: container.message_ts,
        text: `⚠️ ${result.message}`,
      });
    }

    console.log(`[Interactivity] KB approval result: ${result.success ? "Success" : "Failed"} - ${result.message || "No message"}`);
  } catch (error) {
    console.error(`[Interactivity] Error handling KB approval action:`, error);

    // Use error handler for contextual error message
    const errorResult = ErrorHandler.handle(error, {
      operation: `KB approval (${action})`,
      caseNumber,
      userId: user.id,
    });

    // Post contextual error message with recovery steps
    const errorBlocks = ErrorHandler.formatForSlack(errorResult);

    await slackMessaging.postMessage({
      channel: container.channel_id,
      threadTs: container.message_ts,
      text: ErrorHandler.getSimpleMessage(errorResult),
    });
  }
}

/**
 * Update KB approval message to show processing state
 * Provides immediate visual feedback and prevents double-clicks
 */
async function updateKBMessageToProcessing(
  channel: string,
  messageTs: string,
  emoji: string,
  processingText: string,
  userId: string
): Promise<void> {
  try {
    // Get the original message
    const result = await slackMessaging.getConversationHistory({
      channel,
      latest: messageTs,
      limit: 1,
      inclusive: true,
    });

    if (!result.ok || !result.messages || result.messages.length === 0) {
      console.warn("[Interactivity] Could not fetch original KB message to update");
      return;
    }

    const originalMessage = result.messages[0];
    const blocks = originalMessage.blocks || [];

    // Replace action buttons with processing state
    const actionBlockIndex = blocks.findIndex((b: any) => b.type === "actions");
    if (actionBlockIndex >= 0) {
      // Remove action buttons and replace with processing state
      blocks.splice(actionBlockIndex, 1, {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${emoji} *${processingText}*\n\n_Processing request by <@${userId}>..._`,
        },
      } as any);
    }

    // Update the message
    await slackMessaging.updateMessage({
      channel,
      ts: messageTs,
      text: `${processingText}`,
    });
  } catch (error) {
    console.error("[Interactivity] Error updating KB message to processing state:", error);
    // Don't throw - this is just visual feedback, continue with processing
  }
}

/**
 * Build modal view for project creation using design system
 */
function buildCreateProjectModal(
  caseNumber: string,
  channelId: string,
  messageTs: string
): ModalView {
  // Sanitize case number for display and initial value
  const sanitizedCaseNumber = sanitizePlainText(caseNumber, 100);

  const blocks: KnownBlock[] = [
    createSectionBlock(`Creating project for case *${sanitizedCaseNumber}*`),
    createDivider(),

    // Project Name Input (Required) - Updated action_id
    createInputBlock({
      blockId: "project_modal_input_name",
      label: "Project Name",
      element: createPlainTextInput({
        actionId: "project_modal_input_name_value",
        placeholder: "Enter project name",
        initialValue: `Project: ${sanitizedCaseNumber}`,
        maxLength: 80,  // Add validation
      }),
    }),

    // Project Description Input (Required) - Updated action_id
    createInputBlock({
      blockId: "project_modal_input_description",
      label: "Project Description",
      element: createPlainTextInput({
        actionId: "project_modal_input_description_value",
        placeholder: "Describe the project scope and objectives (max 3000 chars)",
        multiline: true,
        maxLength: 3000,  // Add validation
      }),
      hint: "Provide clear scope and deliverables",
    }),

    // Project Manager Select (Optional) - Updated action_id
    createInputBlock({
      blockId: "project_modal_select_manager",
      label: "Project Manager",
      element: createUserSelect({
        actionId: "project_modal_select_manager_value",
        placeholder: "Select project manager",
      }),
      optional: true,
    }),

    // Priority Select (Required) - Updated action_id
    createInputBlock({
      blockId: "project_modal_select_priority",
      label: "Priority",
      element: createStaticSelect({
        actionId: "project_modal_select_priority_value",
        placeholder: "Select priority",
        initialOption: { text: "Medium", value: "medium" },
        options: [
          { text: "Critical", value: "critical" },
          { text: "High", value: "high" },
          { text: "Medium", value: "medium" },
          { text: "Low", value: "low" },
        ],
      }),
    }),

    // Due Date Picker (Optional) - NEW: Using date picker instead of text
    createInputBlock({
      blockId: "project_modal_datepicker_due_date",
      label: "Target Due Date",
      element: createDatePicker({
        actionId: "project_modal_datepicker_due_date_value",
        placeholder: "Select target completion date",
      }),
      optional: true,
      hint: "Select the target completion date for this project",
    }),

    // Kickoff Time Picker (Optional) - NEW: Schedule kickoff meeting
    createInputBlock({
      blockId: "project_modal_timepicker_kickoff",
      label: "Kickoff Meeting Time (Optional)",
      element: createTimePicker({
        actionId: "project_modal_timepicker_kickoff_value",
        placeholder: "Select time",
        initialTime: "10:00", // Default to 10 AM
      }),
      optional: true,
      hint: "Preferred time for kickoff meeting (in your timezone)",
    }),
  ];

  return createModalView({
    title: "Create Project",
    blocks,
    submit: "Create",
    close: "Cancel",
    callbackId: "project_create_modal",
    privateMetadata: JSON.stringify({
      caseNumber: sanitizedCaseNumber,
      channelId,
      messageTs,
    }),
  });
}

/**
 * Build modal view for case reassignment using design system
 */
async function buildReassignModal(
  caseNumber: string,
  channelId: string,
  messageTs: string
): Promise<ModalView> {
  // Sanitize case number
  const sanitizedCaseNumber = sanitizePlainText(caseNumber, 100);

  // Use external_select for assignment groups (better UX for large lists)
  // Provides search functionality instead of scrolling through 100 options
  const useExternalSelect = true; // Always use for better UX

  const assignmentGroupBlock: KnownBlock = useExternalSelect
    ? createInputBlock({
        blockId: "reassign_modal_external_group",
        label: "Assignment Group",
        element: createExternalSelect({
          actionId: "reassign_modal_external_group_value",
          placeholder: "Search assignment groups...",
          minQueryLength: 2,
        }),
        optional: true,
        hint: "Type to search assignment groups (min 2 characters)",
      })
    : createInputBlock({
        blockId: "reassign_modal_select_group",
        label: "Assignment Group",
        element: createPlainTextInput({
          actionId: "reassign_modal_input_group_value",
          placeholder: "Enter assignment group name",
          maxLength: 100,
        }),
        optional: true,
        hint: "⚠️ Search unavailable. Enter group name manually.",
      });

  console.log(`[Interactivity] Using external_select for assignment groups (better UX for search)`);

  const blocks: KnownBlock[] = [
    createSectionBlock(`Reassigning case *${sanitizedCaseNumber}*`),
    createDivider(),

    // Assignment Type - IMPROVED: Using radio buttons instead of select
    createInputBlock({
      blockId: "reassign_modal_radio_assignment_type",
      label: "Assignment Type",
      element: createRadioButtons({
        actionId: "reassign_modal_radio_assignment_type_value",
        initialOption: { text: "Assign to Group", value: "group" },
        options: [
          {
            text: "Assign to User",
            value: "user",
            description: "Assign to a specific Slack user",
          },
          {
            text: "Assign to Group",
            value: "group",
            description: "Assign to a ServiceNow assignment group",
          },
        ],
      }),
    }),

    // Assign To User (Optional) - Updated action_id
    createInputBlock({
      blockId: "reassign_modal_select_user",
      label: "Assign To User",
      element: createUserSelect({
        actionId: "reassign_modal_select_user_value",
        placeholder: "Select user to assign",
      }),
      optional: true,
      hint: "Select this if assigning to a specific user",
    }),

    // Assignment Group (Dynamic: select or text input)
    assignmentGroupBlock,

    // Reassignment Reason (Required) - Updated action_id
    createInputBlock({
      blockId: "reassign_modal_input_reason",
      label: "Reason for Reassignment",
      element: createPlainTextInput({
        actionId: "reassign_modal_input_reason_value",
        placeholder: "Explain why this case is being reassigned",
        multiline: true,
        maxLength: 1000,  // Add validation
      }),
    }),

    // Work Note (Optional) - NEW: Using rich text input for better formatting
    createInputBlock({
      blockId: "reassign_modal_richtextinput_worknote",
      label: "Work Note (Optional)",
      element: createRichTextInput({
        actionId: "reassign_modal_richtextinput_worknote_value",
        placeholder: "Optional work note to add to the case (supports rich formatting)",
      }),
      optional: true,
    }),
  ];

  return createModalView({
    title: "Reassign Case",
    blocks,
    submit: "Reassign",
    close: "Cancel",
    callbackId: "reassign_case_modal",
    privateMetadata: JSON.stringify({
      caseNumber: sanitizedCaseNumber,
      channelId,
      messageTs,
      useExternalSelect,
    }),
  });
}

/**
 * Build KB Edit modal with checkboxes for categories
 * Demonstrates checkbox usage for multi-select categorization
 */
function buildKBEditModal(
  caseNumber: string,
  article: any,
  channelId: string,
  messageTs: string
): ModalView {
  const sanitizedCaseNumber = sanitizePlainText(caseNumber, 100);

  // KB category options with checkboxes
  const kbCategories = [
    { text: "Troubleshooting", value: "troubleshooting", description: "Diagnostic and resolution steps" },
    { text: "How-To Guide", value: "howto", description: "Step-by-step instructions" },
    { text: "Best Practice", value: "best_practice", description: "Recommended approaches" },
    { text: "Known Issue", value: "known_issue", description: "Documented problem with workaround" },
    { text: "Configuration", value: "configuration", description: "Setup and configuration guidance" },
    { text: "FAQ", value: "faq", description: "Frequently asked question" },
  ];

  // Pre-select categories based on article tags (intelligent default)
  const preselectedCategories = kbCategories
    .filter(cat => article.tags?.some((tag: string) =>
      tag.toLowerCase().includes(cat.value) || cat.value.includes(tag.toLowerCase())
    ))
    .map(cat => ({ text: cat.text, value: cat.value }));

  const blocks: KnownBlock[] = [
    createSectionBlock(`Edit KB Article for case *${sanitizedCaseNumber}*`),
    createDivider(),

    // Title
    createInputBlock({
      blockId: "kb_edit_modal_input_title",
      label: "Article Title",
      element: createPlainTextInput({
        actionId: "kb_edit_modal_input_title_value",
        placeholder: "Enter KB article title",
        initialValue: article.title || "",
        maxLength: 200,
      }),
    }),

    // Problem
    createInputBlock({
      blockId: "kb_edit_modal_input_problem",
      label: "Problem Description",
      element: createRichTextInput({
        actionId: "kb_edit_modal_input_problem_value",
        placeholder: "Describe the problem or issue",
      }),
    }),

    // Solution
    createInputBlock({
      blockId: "kb_edit_modal_input_solution",
      label: "Solution",
      element: createRichTextInput({
        actionId: "kb_edit_modal_input_solution_value",
        placeholder: "Provide the solution or resolution steps",
      }),
    }),

    // Categories - NEW: Checkboxes for multi-select
    createInputBlock({
      blockId: "kb_edit_modal_checkboxes_categories",
      label: "KB Categories",
      element: createCheckboxes({
        actionId: "kb_edit_modal_checkboxes_categories_value",
        options: kbCategories,
        initialOptions: preselectedCategories.length > 0 ? preselectedCategories : undefined,
      }),
      optional: true,
      hint: "Select all categories that apply to this article",
    }),
  ];

  return createModalView({
    title: "Edit KB Article",
    blocks,
    submit: "Save & Approve",
    close: "Cancel",
    callbackId: "kb_edit_modal",
    privateMetadata: JSON.stringify({
      caseNumber: sanitizedCaseNumber,
      channelId,
      messageTs,
      article,
    }),
  });
}

/**
 * Handle "Create Project" button click
 */
async function handleCreateProject(
  caseNumber: string,
  user: any,
  container: any,
  payload: BlockActionsPayload
): Promise<void> {
  console.log(`[Interactivity] Create Project requested for ${caseNumber} by ${user.id}`);

  try {
    // Open modal for project creation
    const modalView = buildCreateProjectModal(caseNumber, container.channel_id, container.message_ts);

    await slackMessaging.openView({
      triggerId: payload.trigger_id,
      view: modalView,
    });

    console.log(`[Interactivity] Create Project modal opened for ${caseNumber}`);
  } catch (error) {
    console.error(`[Interactivity] Error opening Create Project modal:`, error);

    // Fallback: Post message if modal fails
    await slackMessaging.postMessage({
      channel: container.channel_id,
      threadTs: container.message_ts,
      text:
        `✅ <@${user.id}> acknowledged this as a **Project**\n\n` +
        `❌ Unable to open project creation form. Please create the project manually:\n` +
        `• Create project scope document\n` +
        `• Assign project manager\n` +
        `• Schedule kickoff meeting`,
    });
  }
}

/**
 * Handle "Acknowledge as BAU" button click
 */
async function handleAcknowledgeBau(
  caseNumber: string,
  user: any,
  container: any,
  payload: BlockActionsPayload
): Promise<void> {
  console.log(`[Interactivity] BAU acknowledgment for ${caseNumber} by ${user.id}`);

  let serviceNowUpdateSuccess = false;
  let serviceNowError: string | null = null;

  // Try to update ServiceNow
  try {
    const caseRepo = getCaseRepository();

    // Look up case by number to get sys_id
    const caseRecord = await caseRepo.findByNumber(caseNumber);

    if (!caseRecord) {
      throw new Error(`Case ${caseNumber} not found in ServiceNow`);
    }

    // Get user info from Slack to include name in work note
    let userName = `<@${user.id}>`;
    try {
      const slackClient = getSlackClient();
      const userInfo = await slackClient.users.info({ user: user.id });
      userName = userInfo.user?.real_name || userInfo.user?.name || userName;
    } catch (error) {
      console.warn(`[Interactivity] Could not fetch Slack user info for ${user.id}:`, error);
    }

    // Add work note to ServiceNow case
    const workNote = `━━━ ESCALATION ACKNOWLEDGED ━━━
Action: Confirmed as standard BAU work
Acknowledged by: ${userName}
Timestamp: ${new Date().toISOString()}
Reason: This case does not require escalation and will be handled through normal support channels.

Escalation dismissed. Case proceeding through standard workflow.`;

    await caseRepo.addWorkNote(caseRecord.sysId, workNote, true);
    console.log(`[Interactivity] Added work note to case ${caseNumber}`);

    // Update case state to "2" (Work in Progress)
    await caseRepo.update(caseRecord.sysId, { state: "2" });
    console.log(`[Interactivity] Updated case ${caseNumber} state to Work in Progress`);

    serviceNowUpdateSuccess = true;
  } catch (error) {
    console.error(`[Interactivity] Error updating ServiceNow for ${caseNumber}:`, error);
    serviceNowError = error instanceof Error ? error.message : "Unknown error";
  }

  // Post acknowledgment in thread
  const statusEmoji = serviceNowUpdateSuccess ? "✅" : "⚠️";
  const statusMessage = serviceNowUpdateSuccess
    ? "Case updated in ServiceNow and escalation acknowledged."
    : `Acknowledged in Slack. ServiceNow update failed: ${serviceNowError}`;

  await slackMessaging.postMessage({
    channel: container.channel_id,
    threadTs: container.message_ts,
    text:
      `${statusEmoji} <@${user.id}> confirmed this is **standard BAU** work\n\n` +
      `${statusMessage}\n\n` +
      `The case will continue through normal support channels. Escalation dismissed.`,
  });

  // Update original message
  const updateStatus = serviceNowUpdateSuccess
    ? `✅ Confirmed as BAU by <@${user.id}> - Escalation dismissed, case updated in ServiceNow`
    : `✅ Confirmed as BAU by <@${user.id}> - Escalation dismissed (⚠️ ServiceNow update failed)`;

  await updateEscalationMessage(
    container.channel_id,
    container.message_ts,
    updateStatus
  );
}

/**
 * Handle "Reassign" button click
 */
async function handleReassign(
  caseNumber: string,
  user: any,
  container: any,
  payload: BlockActionsPayload
): Promise<void> {
  console.log(`[Interactivity] Reassignment requested for ${caseNumber} by ${user.id}`);

  try {
    // Build modal (now async because it fetches groups)
    const modalView = await buildReassignModal(caseNumber, container.channel_id, container.message_ts);

    await slackMessaging.openView({
      triggerId: payload.trigger_id,
      view: modalView,
    });

    console.log(`[Interactivity] Reassign modal opened for ${caseNumber}`);
  } catch (error) {
    console.error(`[Interactivity] Error opening Reassign modal:`, error);

    // Fallback: Post message if modal fails
    await slackMessaging.postMessage({
      channel: container.channel_id,
      threadTs: container.message_ts,
      text:
        `✅ <@${user.id}> requested **reassignment**\n\n` +
        `❌ Unable to open reassignment form. Please reassign manually:\n` +
        `1. Open case ${caseNumber} in ServiceNow\n` +
        `2. Update the Assignment Group or Assigned To field\n` +
        `3. Add a work note explaining the reassignment`,
    });
  }
}

/**
 * Update escalation message to show acknowledgment status
 */
async function updateEscalationMessage(
  channel: string,
  messageTs: string,
  statusText: string
): Promise<void> {
  try {
    // Get the original message
    const result = await slackMessaging.getConversationHistory({
      channel,
      latest: messageTs,
      limit: 1,
      inclusive: true,
    });

    if (!result.ok || !result.messages || result.messages.length === 0) {
      console.warn("[Interactivity] Could not fetch original message to update");
      return;
    }

    const originalMessage = result.messages[0];
    const blocks: KnownBlock[] = originalMessage.blocks || [];

    // Add status to context block with proper type safety and validation
    const contextBlockIndex = blocks.findIndex((b) => b.type === "context");
    if (contextBlockIndex >= 0) {
      const contextBlock = blocks[contextBlockIndex] as any; // Cast needed for dynamic access

      // Validate context block has elements array
      if (contextBlock.elements && Array.isArray(contextBlock.elements)) {
        // Check max elements limit (10 for context blocks)
        if (contextBlock.elements.length < 10) {
          // Create immutable copy with new element
          contextBlock.elements = [
            ...contextBlock.elements,
            {
              type: "mrkdwn" as const,
              text: statusText, // Already includes newline in statusText
            }
          ];
        } else {
          console.warn('[Interactivity] Context block already has 10 elements (max), cannot add status');
        }
      }
    }

    // Update the message
    await slackMessaging.updateMessage({
      channel,
      ts: messageTs,
      text: originalMessage.text,
    });
  } catch (error) {
    console.error("[Interactivity] Error updating escalation message:", error);
  }
}

/**
 * Handle case search pagination (next/previous page)
 */
async function handleSearchPagination(
  actionId: string,
  encodedState: string,
  user: any,
  container: any,
  payload: any
): Promise<void> {
  console.log(`[Interactivity] Handling search pagination: ${actionId}`);

  try {
    const pagination = getCaseSearchPagination();

    // Decode pagination state
    const state = await pagination.decodeState(encodedState, user.id);

    if (!state) {
      await slackMessaging.postMessage({
        channel: container.channel_id,
        threadTs: container.message_ts,
        text: `${MessageEmojis.ERROR} Pagination state expired. Please run your search again.`,
      });
      return;
    }

    // Execute search with new offset
    const result = await caseSearchService.searchWithMetadata(state.filters);

    // Build updated display
    const display = buildSearchResultsMessage(result);

    // Update the message
    await slackMessaging.updateMessage({
      channel: container.channel_id,
      ts: container.message_ts,
      text: display.text,
      blocks: display.blocks,
    });

    console.log(`[Interactivity] Updated search results (offset: ${state.offset})`);
  } catch (error) {
    console.error('[Interactivity] Error handling pagination:', error);

    await slackMessaging.postMessage({
      channel: container.channel_id,
      threadTs: container.message_ts,
      text: `${MessageEmojis.ERROR} Failed to load page. Please try again.`,
    });
  }
}

/**
 * Handle search refresh button
 */
async function handleSearchRefresh(
  encodedState: string,
  user: any,
  container: any,
  payload: any
): Promise<void> {
  console.log('[Interactivity] Handling search refresh');

  try {
    const pagination = getCaseSearchPagination();

    // Decode state
    const state = await pagination.decodeState(encodedState, user.id);

    if (!state) {
      await slackMessaging.postMessage({
        channel: container.channel_id,
        threadTs: container.message_ts,
        text: `${MessageEmojis.ERROR} Search state expired. Please run your search again.`,
      });
      return;
    }

    // Reset offset and re-run search
    const result = await caseSearchService.searchWithMetadata({
      ...state.filters,
      offset: 0, // Reset to first page
    });

    // Build display
    const display = buildSearchResultsMessage(result);

    // Update message
    await slackMessaging.updateMessage({
      channel: container.channel_id,
      ts: container.message_ts,
      text: display.text,
      blocks: display.blocks,
    });

    console.log(`[Interactivity] Refreshed search results (${result.totalFound} cases)`);
  } catch (error) {
    console.error('[Interactivity] Error refreshing search:', error);

    await slackMessaging.postMessage({
      channel: container.channel_id,
      threadTs: container.message_ts,
      text: `${MessageEmojis.ERROR} Failed to refresh results. Please try again.`,
    });
  }
}

/**
 * Handle stale threshold selection
 */
async function handleStaleThresholdChange(
  thresholdDaysStr: string,
  user: any,
  container: any,
  payload: any
): Promise<void> {
  const thresholdDays = parseInt(thresholdDaysStr);

  console.log(`[Interactivity] Changing stale threshold to ${thresholdDays} days`);

  try {
    // Fetch stale cases with new threshold
    const cases = await caseSearchService.findStaleCases(thresholdDays, 50);
    const staleCases = findStaleCases(cases, thresholdDays);

    // Build updated display
    const display = buildStaleCasesMessage(staleCases, thresholdDays);

    // Update message
    await slackMessaging.updateMessage({
      channel: container.channel_id,
      ts: container.message_ts,
      text: display.text,
      blocks: display.blocks,
    });

    console.log(`[Interactivity] Updated stale cases (${staleCases.length} found at ${thresholdDays}d threshold)`);
  } catch (error) {
    console.error('[Interactivity] Error changing threshold:', error);

    await slackMessaging.postMessage({
      channel: container.channel_id,
      threadTs: container.message_ts,
      text: `${MessageEmojis.ERROR} Failed to update threshold. Please try again.`,
    });
  }
}

/**
 * Handle filter selection (customer or queue buttons)
 */
async function handleFilterSelection(
  actionId: string,
  filterValue: string,
  user: any,
  container: any,
  payload: any
): Promise<void> {
  console.log(`[Interactivity] Filter selected: ${actionId} = ${filterValue}`);

  try {
    // Determine filter type
    const isCustomerFilter = actionId === "case_search_button_filter_customer";
    const isQueueFilter = actionId === "case_search_button_filter_queue";

    // Build filters
    const filters: any = {};

    if (isCustomerFilter && filterValue !== "*") {
      filters.accountName = filterValue;
    }

    if (isQueueFilter && filterValue !== "*") {
      filters.assignmentGroup = filterValue;
    }

    // Default to active cases only
    filters.activeOnly = true;
    filters.limit = 10;

    // Execute search
    const result = await caseSearchService.searchWithMetadata(filters);

    // Build display
    const display = buildSearchResultsMessage(result);

    // Update message
    await slackMessaging.updateMessage({
      channel: container.channel_id,
      ts: container.message_ts,
      text: display.text,
      blocks: display.blocks,
    });

    console.log(`[Interactivity] Applied filter (${result.totalFound} cases found)`);
  } catch (error) {
    console.error('[Interactivity] Error applying filter:', error);

    await slackMessaging.postMessage({
      channel: container.channel_id,
      threadTs: container.message_ts,
      text: `${MessageEmojis.ERROR} Failed to apply filter. Please try again.`,
    });
  }
}

export async function GET(request: Request) {
  return new Response(
    JSON.stringify({
      message: "Slack Interactivity endpoint expects POST requests from Slack",
    }),
    {
      status: 405,
      headers: {
        "content-type": "application/json",
        allow: "POST",
      },
    }
  );
}
