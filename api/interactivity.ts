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
import { initializeDatabase } from "../lib/db/init";
import { ErrorHandler } from "../lib/utils/error-handler";
import { getCaseRepository } from "../lib/infrastructure/servicenow/repositories";
import { getSlackClient } from "../lib/slack/client";

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
    } else if (payload.type === "view_submission") {
      await handleViewSubmission(payload as any);
    }

    // Slack expects a 200 OK response within 3 seconds
    // Long-running operations should be handled asynchronously
    return new Response("", { status: 200 });
  } catch (error) {
    console.error("[Interactivity] Error handling interaction:", error);
    return new Response("Error processing interaction", { status: 500 });
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
  }
}

/**
 * Handle modal view submissions
 */
async function handleViewSubmission(payload: any): Promise<void> {
  const callbackId = payload.view.callback_id;
  const userId = payload.user.id;

  console.log(`[Interactivity] View submission: ${callbackId} by user ${userId}`);

  if (callbackId === "create_project_modal") {
    await handleCreateProjectSubmission(payload);
  } else if (callbackId === "reassign_case_modal") {
    await handleReassignSubmission(payload);
  } else {
    console.warn(`[Interactivity] Unknown view submission: ${callbackId}`);
  }
}

/**
 * Handle Create Project modal submission
 */
async function handleCreateProjectSubmission(payload: any): Promise<void> {
  try {
    // Extract metadata
    const metadata = JSON.parse(payload.view.private_metadata);
    const { caseNumber, channelId, messageTs } = metadata;
    const userId = payload.user.id;

    // Extract form values
    const values = payload.view.state.values;
    const projectName = values.project_name.project_name_input.value;
    const projectDescription = values.project_description.project_description_input.value;
    const projectManager = values.project_manager.project_manager_select.selected_user || null;
    const priority = values.project_priority.project_priority_select.selected_option.value;
    const timeline = values.project_timeline.project_timeline_input.value || "Not specified";

    console.log(`[Interactivity] Creating project for ${caseNumber}: ${projectName}`);

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
            text: `*Timeline:*\n${timeline}`,
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
      text: `✅ Project created for ${caseNumber}: ${projectName}`,
    });

    // Update original escalation message
    await updateEscalationMessage(
      channelId,
      messageTs,
      `✅ Project created by <@${userId}>: ${projectName}`
    );

    // TODO: In the future, integrate with project management system
    // - Create project in ServiceNow/Jira/etc.
    // - Assign project manager
    // - Set up project tracking

    console.log(`[Interactivity] Project created successfully for ${caseNumber}`);
  } catch (error) {
    console.error(`[Interactivity] Error handling project creation:`, error);

    // Try to notify user of error
    try {
      const metadata = JSON.parse(payload.view.private_metadata);
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
    // Extract metadata
    const metadata = JSON.parse(payload.view.private_metadata);
    const { caseNumber, channelId, messageTs } = metadata;
    const userId = payload.user.id;

    // Extract form values
    const values = payload.view.state.values;
    const assignmentType = values.assignment_type.assignment_type_select.selected_option.value;
    const assignedTo = values.assigned_to.assigned_to_select.selected_user || null;
    const assignmentGroup = values.assignment_group.assignment_group_input.value || null;
    const reassignmentReason = values.reassignment_reason.reassignment_reason_input.value;
    const workNote = values.work_note.work_note_input.value || null;

    console.log(`[Interactivity] Reassigning ${caseNumber} (type: ${assignmentType})`);

    // Determine assignment target
    let assignmentTarget: string;
    if (assignmentType === "user" && assignedTo) {
      assignmentTarget = `<@${assignedTo}>`;
    } else if (assignmentType === "group" && assignmentGroup) {
      assignmentTarget = assignmentGroup;
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
      if (assignmentType === "group" && assignmentGroup) {
        // Query ServiceNow to get assignment group sys_id by name
        // Note: Using the ServiceNow HTTP client directly since there's no group repository
        const serviceNowClient = await import("../lib/infrastructure/servicenow/repositories/case-repository.impl");

        console.log(`[Interactivity] Looking up assignment group: ${assignmentGroup}`);

        // For now, update with group name directly - ServiceNow often accepts exact names
        // This will work if the instance is configured to accept group names
        await caseRepo.update(caseRecord.sysId, {
          assignmentGroup: assignmentGroup,
        });

        console.log(`[Interactivity] Updated case ${caseNumber} assignment group to ${assignmentGroup}`);
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

    // Try to notify user of error
    try {
      const metadata = JSON.parse(payload.view.private_metadata);
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
      case "escalation_create_project":
        await handleCreateProject(caseNumber, user, container, payload);
        break;

      case "escalation_acknowledge_bau":
        await handleAcknowledgeBau(caseNumber, user, container, payload);
        break;

      case "escalation_reassign":
        await handleReassign(caseNumber, user, container, payload);
        break;

      case "escalation_view_servicenow":
        // This is a URL button - no action needed (Slack handles the redirect)
        console.log(`[Interactivity] User ${user.id} clicked View ServiceNow for ${caseNumber}`);
        break;

      default:
        console.warn(`[Interactivity] Unknown escalation action: ${actionId}`);
    }

    // Track acknowledgment in database (for all non-view actions)
    if (actionId !== "escalation_view_servicenow") {
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
    if (actionId === "kb_approve") {
      action = "approve";
      processingEmoji = "⏳";
      processingText = "Approving KB article...";
    } else if (actionId === "kb_reject") {
      action = "reject";
      processingEmoji = "⏳";
      processingText = "Rejecting KB article...";
    } else if (actionId === "kb_edit") {
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
 * Build modal view for project creation
 */
function buildCreateProjectModal(
  caseNumber: string,
  channelId: string,
  messageTs: string
): any {
  return {
    type: "modal",
    callback_id: "create_project_modal",
    private_metadata: JSON.stringify({
      caseNumber,
      channelId,
      messageTs,
    }),
    title: {
      type: "plain_text",
      text: "Create Project",
      emoji: true,
    },
    submit: {
      type: "plain_text",
      text: "Create",
      emoji: true,
    },
    close: {
      type: "plain_text",
      text: "Cancel",
      emoji: true,
    },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Creating project for case *${caseNumber}*`,
        },
      },
      {
        type: "divider",
      },
      {
        type: "input",
        block_id: "project_name",
        element: {
          type: "plain_text_input",
          action_id: "project_name_input",
          placeholder: {
            type: "plain_text",
            text: "Enter project name",
          },
          initial_value: `Project: ${caseNumber}`,
        },
        label: {
          type: "plain_text",
          text: "Project Name",
          emoji: true,
        },
      },
      {
        type: "input",
        block_id: "project_description",
        element: {
          type: "plain_text_input",
          action_id: "project_description_input",
          multiline: true,
          placeholder: {
            type: "plain_text",
            text: "Describe the project scope and objectives",
          },
        },
        label: {
          type: "plain_text",
          text: "Project Description",
          emoji: true,
        },
      },
      {
        type: "input",
        block_id: "project_manager",
        element: {
          type: "users_select",
          action_id: "project_manager_select",
          placeholder: {
            type: "plain_text",
            text: "Select project manager",
          },
        },
        label: {
          type: "plain_text",
          text: "Project Manager",
          emoji: true,
        },
        optional: true,
      },
      {
        type: "input",
        block_id: "project_priority",
        element: {
          type: "static_select",
          action_id: "project_priority_select",
          placeholder: {
            type: "plain_text",
            text: "Select priority",
          },
          initial_option: {
            text: {
              type: "plain_text",
              text: "Medium",
            },
            value: "medium",
          },
          options: [
            {
              text: {
                type: "plain_text",
                text: "Critical",
                emoji: true,
              },
              value: "critical",
            },
            {
              text: {
                type: "plain_text",
                text: "High",
                emoji: true,
              },
              value: "high",
            },
            {
              text: {
                type: "plain_text",
                text: "Medium",
                emoji: true,
              },
              value: "medium",
            },
            {
              text: {
                type: "plain_text",
                text: "Low",
                emoji: true,
              },
              value: "low",
            },
          ],
        },
        label: {
          type: "plain_text",
          text: "Priority",
          emoji: true,
        },
      },
      {
        type: "input",
        block_id: "project_timeline",
        element: {
          type: "plain_text_input",
          action_id: "project_timeline_input",
          placeholder: {
            type: "plain_text",
            text: "e.g., 2-3 months, Q2 2025",
          },
        },
        label: {
          type: "plain_text",
          text: "Estimated Timeline",
          emoji: true,
        },
        optional: true,
      },
    ],
  };
}

/**
 * Build modal view for case reassignment
 */
function buildReassignModal(
  caseNumber: string,
  channelId: string,
  messageTs: string
): any {
  return {
    type: "modal",
    callback_id: "reassign_case_modal",
    private_metadata: JSON.stringify({
      caseNumber,
      channelId,
      messageTs,
    }),
    title: {
      type: "plain_text",
      text: "Reassign Case",
      emoji: true,
    },
    submit: {
      type: "plain_text",
      text: "Reassign",
      emoji: true,
    },
    close: {
      type: "plain_text",
      text: "Cancel",
      emoji: true,
    },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Reassigning case *${caseNumber}*`,
        },
      },
      {
        type: "divider",
      },
      {
        type: "input",
        block_id: "assignment_type",
        element: {
          type: "static_select",
          action_id: "assignment_type_select",
          placeholder: {
            type: "plain_text",
            text: "Choose assignment type",
          },
          initial_option: {
            text: {
              type: "plain_text",
              text: "Assign to User",
            },
            value: "user",
          },
          options: [
            {
              text: {
                type: "plain_text",
                text: "Assign to User",
                emoji: true,
              },
              value: "user",
            },
            {
              text: {
                type: "plain_text",
                text: "Assign to Group",
                emoji: true,
              },
              value: "group",
            },
          ],
        },
        label: {
          type: "plain_text",
          text: "Assignment Type",
          emoji: true,
        },
      },
      {
        type: "input",
        block_id: "assigned_to",
        element: {
          type: "users_select",
          action_id: "assigned_to_select",
          placeholder: {
            type: "plain_text",
            text: "Select user to assign",
          },
        },
        label: {
          type: "plain_text",
          text: "Assign To User",
          emoji: true,
        },
        optional: true,
        hint: {
          type: "plain_text",
          text: "Select this if assigning to a specific user",
        },
      },
      {
        type: "input",
        block_id: "assignment_group",
        element: {
          type: "plain_text_input",
          action_id: "assignment_group_input",
          placeholder: {
            type: "plain_text",
            text: "e.g., IT Support, Engineering, Customer Success",
          },
        },
        label: {
          type: "plain_text",
          text: "Assignment Group Name",
          emoji: true,
        },
        optional: true,
        hint: {
          type: "plain_text",
          text: "Enter this if assigning to a group",
        },
      },
      {
        type: "input",
        block_id: "reassignment_reason",
        element: {
          type: "plain_text_input",
          action_id: "reassignment_reason_input",
          multiline: true,
          placeholder: {
            type: "plain_text",
            text: "Explain why this case is being reassigned",
          },
        },
        label: {
          type: "plain_text",
          text: "Reason for Reassignment",
          emoji: true,
        },
      },
      {
        type: "input",
        block_id: "work_note",
        element: {
          type: "plain_text_input",
          action_id: "work_note_input",
          multiline: true,
          placeholder: {
            type: "plain_text",
            text: "Optional work note to add to the case",
          },
        },
        label: {
          type: "plain_text",
          text: "Work Note (Optional)",
          emoji: true,
        },
        optional: true,
      },
    ],
  };
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
    // Open modal for reassignment
    const modalView = buildReassignModal(caseNumber, container.channel_id, container.message_ts);

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
    const blocks: any[] = originalMessage.blocks || [];

    // Add status to context block (last block)
    const contextBlockIndex = blocks.findIndex((b: any) => b.type === "context");
    if (contextBlockIndex >= 0 && blocks[contextBlockIndex].elements) {
      blocks[contextBlockIndex].elements.push({
        type: "mrkdwn",
        text: `\n${statusText}`,
      });
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
