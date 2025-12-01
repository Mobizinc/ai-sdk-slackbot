/**
 * Expire Clarification Sessions Cron Job
 *
 * Runs periodically to:
 * 1. Find and expire ACTIVE clarification sessions that have passed their expiration time
 * 2. Escalate expired sessions to Slack for supervisory review
 * 3. Update quality gate records for expired sessions
 * 4. Add work notes to ServiceNow cases for expired sessions
 *
 * Schedule: Every 15 minutes
 */

import { getClarificationSessionRepository } from "../../lib/db/repositories/clarification-session-repository";
import { getQualityGateRepository } from "../../lib/db/repositories/quality-gate-repository";
import { getQualityAuditService } from "../../lib/services/quality-audit-service";
import { serviceNowClient } from "../../lib/tools/servicenow";
import { getSlackMessagingService } from "../../lib/services/slack-messaging";

type JsonBody = { status: "ok"; message: string; details?: any } | { status: "error"; message: string };

function jsonResponse(body: JsonBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

/**
 * Escalation channel for expired sessions
 */
const ESCALATION_CHANNEL = process.env.ESCALATION_CHANNEL_ID || "C0123456789";

/**
 * Main expiration handler
 */
async function runExpiration(): Promise<Response> {
  const startTime = Date.now();
  console.log("[Cron] Starting clarification session expiration check");

  try {
    const sessionRepo = getClarificationSessionRepository();
    const qualityGateRepo = getQualityGateRepository();
    const auditService = getQualityAuditService();

    // Find expired sessions (ACTIVE status but past expiration time)
    const expiredSessions = await sessionRepo.findExpired();
    console.log(`[Cron] Found ${expiredSessions.length} expired clarification sessions`);

    if (expiredSessions.length === 0) {
      return jsonResponse({
        status: "ok",
        message: "No expired sessions found",
        details: { processed: 0, escalated: 0 }
      });
    }

    let processed = 0;
    let escalated = 0;
    let errors = 0;

    for (const session of expiredSessions) {
      try {
        console.log(`[Cron] Processing expired session ${session.sessionId} for case ${session.caseNumber}`);

        // Mark session as expired
        await sessionRepo.markAsExpired(session.id);

        // Log expiration in audit trail
        await auditService.logSessionExpiration(
          session.id,
          session.caseNumber,
          'cron'
        );

        // Update quality gate record if exists
        if (session.qualityGateId) {
          await qualityGateRepo.update(session.qualityGateId, {
            status: 'EXPIRED',
            blocked: true,
            reviewedAt: new Date(),
            reviewerId: 'cron',
            reviewReason: 'Clarification session expired without response'
          });
        }

        // Add expiration work note to ServiceNow
        const expirationNote = generateExpirationWorkNote(session);
        try {
          await serviceNowClient.addCaseWorkNote(session.caseSysId, expirationNote, true);
        } catch (noteError) {
          console.error(`[Cron] Failed to add expiration work note for ${session.caseNumber}:`, noteError);
        }

        // Escalate to Slack
        try {
          await escalateToSlack(session);
          escalated++;
        } catch (slackError) {
          console.error(`[Cron] Failed to escalate to Slack for ${session.caseNumber}:`, slackError);
        }

        processed++;
      } catch (sessionError) {
        console.error(`[Cron] Error processing session ${session.sessionId}:`, sessionError);
        errors++;
      }
    }

    // Also check for sessions expiring soon and send reminders
    const expiringSoon = await sessionRepo.findExpiringSoon(30); // Sessions expiring in next 30 minutes
    if (expiringSoon.length > 0) {
      console.log(`[Cron] Found ${expiringSoon.length} sessions expiring soon`);

      for (const session of expiringSoon) {
        try {
          await sendExpirationWarning(session);
        } catch (warnError) {
          console.error(`[Cron] Failed to send warning for ${session.sessionId}:`, warnError);
        }
      }
    }

    const duration = Date.now() - startTime;
    const message = `Processed ${processed} expired sessions, escalated ${escalated} to Slack${errors > 0 ? `, ${errors} errors` : ''} in ${duration}ms`;

    console.log(`[Cron] ${message}`);

    return jsonResponse({
      status: "ok",
      message,
      details: {
        processed,
        escalated,
        errors,
        expiringSoon: expiringSoon.length,
        durationMs: duration
      }
    });

  } catch (error) {
    console.error("[Cron] Session expiration check failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ status: "error", message }, 500);
  }
}

/**
 * Generate expiration work note content
 */
function generateExpirationWorkNote(session: any): string {
  const questions = session.questions as Array<any>;
  const unansweredRequired = questions.filter(q => q.required && !session.responses?.[q.id]);

  return `
⏰ CLARIFICATION SESSION EXPIRED

Session ID: ${session.sessionId}
Expired At: ${new Date().toISOString()}
Original Expiration: ${session.expiresAt}

This clarification session has expired without receiving all required responses.

**Unanswered Required Questions:**
${unansweredRequired.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}

**Action Required:**
1. Contact the requestor directly for missing information
2. Verify all compliance requirements are met
3. Document the reason for expiration
4. Manually review and proceed with case resolution

This case has been escalated to supervisory review.

---
*This is an automated system message*
  `.trim();
}

/**
 * Escalate expired session to Slack
 */
async function escalateToSlack(session: any): Promise<void> {
  const questions = session.questions as Array<any>;
  const unansweredRequired = questions.filter(q => q.required && !session.responses?.[q.id]);

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "⏰ Clarification Session Expired",
        emoji: true
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Case Number:*\n${session.caseNumber}`
        },
        {
          type: "mrkdwn",
          text: `*Session ID:*\n${session.sessionId}`
        }
      ]
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Created:*\n${new Date(session.createdAt).toLocaleString()}`
        },
        {
          type: "mrkdwn",
          text: `*Expired:*\n${new Date(session.expiresAt).toLocaleString()}`
        }
      ]
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Unanswered Required Questions (${unansweredRequired.length}):*\n${unansweredRequired.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}`
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "This case requires supervisory review due to expired clarification session."
        }
      ]
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View in ServiceNow",
            emoji: true
          },
          url: `https://mobiz.service-now.com/nav_to.do?uri=x_mobit_serv_case_service_case.do?sys_id=${session.caseSysId}`,
          action_id: "view_case"
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Acknowledge",
            emoji: true
          },
          style: "primary",
          action_id: `acknowledge_expired_session_${session.sessionId}`
        }
      ]
    }
  ];

  const slackService = getSlackMessagingService();
  await slackService.postMessage({
    channel: ESCALATION_CHANNEL,
    text: `Clarification session expired for case ${session.caseNumber}`,
    blocks
  });
}

/**
 * Send expiration warning for sessions expiring soon
 */
async function sendExpirationWarning(session: any): Promise<void> {
  const minutesRemaining = Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / (60 * 1000));

  // Only send warning if there's a Slack channel associated
  if (!session.slackChannel) {
    return;
  }

  const warningNote = `
⚠️ CLARIFICATION SESSION EXPIRING SOON

Session ID: ${session.sessionId}
Time Remaining: ${minutesRemaining} minutes

Please respond to the clarification questions before the session expires.
If no response is received, this case will be escalated to supervisory review.

---
*This is an automated reminder*
  `.trim();

  try {
    await serviceNowClient.addCaseWorkNote(session.caseSysId, warningNote, true);
  } catch (error) {
    console.warn(`[Cron] Failed to add warning work note for ${session.caseNumber}:`, error);
  }
}

export async function GET(): Promise<Response> {
  return runExpiration();
}

export async function POST(): Promise<Response> {
  return runExpiration();
}
