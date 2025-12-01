/**
 * Monitor Stuck Cases Cron Job
 *
 * Runs periodically to:
 * 1. Find cases that have been blocked by quality gates for too long
 * 2. Escalate stuck cases to Slack for supervisory review
 * 3. Generate alerts for cases requiring immediate attention
 *
 * Schedule: Every 30 minutes
 */

import { getQualityGateRepository, type PostgresQualityGateRepository } from "../../lib/db/repositories/quality-gate-repository";
import { getQualityAuditService } from "../../lib/services/quality-audit-service";
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
 * Escalation channel for stuck cases
 */
const ESCALATION_CHANNEL = process.env.ESCALATION_CHANNEL_ID || "C0123456789";

/**
 * Thresholds for stuck case detection
 */
const STUCK_THRESHOLDS = {
  WARNING_HOURS: 4,  // Cases blocked for 4+ hours
  CRITICAL_HOURS: 8, // Cases blocked for 8+ hours
  ALERT_HOURS: 24,   // Cases blocked for 24+ hours - immediate attention required
};

/**
 * Main monitoring handler
 */
async function runMonitoring(): Promise<Response> {
  const startTime = Date.now();
  console.log("[Cron] Starting stuck cases monitoring");

  try {
    const qualityGateRepo = getQualityGateRepository() as PostgresQualityGateRepository;
    const auditService = getQualityAuditService();

    // Find cases at different severity levels
    const alertCases = await qualityGateRepo.findStuckCases({
      status: 'BLOCKED',
      olderThanHours: STUCK_THRESHOLDS.ALERT_HOURS
    });

    const criticalCases = await qualityGateRepo.findStuckCases({
      status: 'BLOCKED',
      olderThanHours: STUCK_THRESHOLDS.CRITICAL_HOURS
    });

    const warningCases = await qualityGateRepo.findStuckCases({
      status: 'BLOCKED',
      olderThanHours: STUCK_THRESHOLDS.WARNING_HOURS
    });

    // Filter to avoid duplicates (critical includes alert, warning includes both)
    const criticalOnly = criticalCases.filter(c =>
      !alertCases.some(a => a.id === c.id)
    );
    const warningOnly = warningCases.filter(c =>
      !criticalCases.some(cr => cr.id === c.id)
    );

    console.log(`[Cron] Found stuck cases - Alert: ${alertCases.length}, Critical: ${criticalOnly.length}, Warning: ${warningOnly.length}`);

    let escalated = 0;

    // Escalate alert-level cases (24+ hours) immediately
    for (const stuckCase of alertCases) {
      try {
        await escalateStuckCase(stuckCase, 'alert');
        escalated++;
      } catch (error) {
        console.error(`[Cron] Failed to escalate alert case ${stuckCase.caseNumber}:`, error);
      }
    }

    // Send summary if there are critical or warning cases
    if (criticalOnly.length > 0 || warningOnly.length > 0) {
      await sendStuckCasesSummary(alertCases, criticalOnly, warningOnly);
    }

    // Get quality metrics for reporting
    const metrics = await qualityGateRepo.getMetrics({ timeWindow: { hours: 24 } });

    const duration = Date.now() - startTime;
    const message = `Monitored stuck cases - Alert: ${alertCases.length}, Critical: ${criticalOnly.length}, Warning: ${warningOnly.length}, Escalated: ${escalated} in ${duration}ms`;

    console.log(`[Cron] ${message}`);

    return jsonResponse({
      status: "ok",
      message,
      details: {
        alert: alertCases.length,
        critical: criticalOnly.length,
        warning: warningOnly.length,
        escalated,
        metrics: {
          totalGates24h: metrics.totalGates,
          approvalRate: metrics.approvalRate,
          blockRate: metrics.blockRate,
        },
        durationMs: duration
      }
    });

  } catch (error) {
    console.error("[Cron] Stuck cases monitoring failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ status: "error", message }, 500);
  }
}

/**
 * Escalate a stuck case to Slack
 */
async function escalateStuckCase(
  stuckCase: any,
  severity: 'alert' | 'critical' | 'warning'
): Promise<void> {
  const severityEmoji = {
    alert: ':rotating_light:',
    critical: ':warning:',
    warning: ':bell:'
  };

  const severityText = {
    alert: 'ALERT - IMMEDIATE ACTION REQUIRED',
    critical: 'CRITICAL - ATTENTION NEEDED',
    warning: 'WARNING - REVIEW RECOMMENDED'
  };

  const severityColor = {
    alert: '#FF0000',
    critical: '#FFA500',
    warning: '#FFFF00'
  };

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${severityEmoji[severity]} Stuck Case: ${severityText[severity]}`,
        emoji: true
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Case Number:*\n${stuckCase.caseNumber}`
        },
        {
          type: "mrkdwn",
          text: `*Blocked Duration:*\n${stuckCase.blockedDurationHours} hours`
        }
      ]
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Gate Type:*\n${stuckCase.gateType}`
        },
        {
          type: "mrkdwn",
          text: `*Risk Level:*\n${stuckCase.riskLevel}`
        }
      ]
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Reason:*\n${stuckCase.reviewReason || 'No reason provided'}`
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Created: ${new Date(stuckCase.createdAt).toLocaleString()}`
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
          url: `https://mobiz.service-now.com/nav_to.do?uri=x_mobit_serv_case_service_case.do?sys_id=${stuckCase.caseSysId}`,
          action_id: "view_stuck_case"
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Unblock Case",
            emoji: true
          },
          style: "danger",
          action_id: `unblock_case_${stuckCase.id}`
        }
      ]
    }
  ];

  const slackService = getSlackMessagingService();
  await slackService.postMessage({
    channel: ESCALATION_CHANNEL,
    text: `${severityText[severity]}: Case ${stuckCase.caseNumber} has been blocked for ${stuckCase.blockedDurationHours} hours`,
    blocks
  });
}

/**
 * Send summary of all stuck cases
 */
async function sendStuckCasesSummary(
  alertCases: any[],
  criticalCases: any[],
  warningCases: any[]
): Promise<void> {
  const totalStuck = alertCases.length + criticalCases.length + warningCases.length;

  if (totalStuck === 0) {
    return;
  }

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: ":chart_with_upwards_trend: Quality Gate Status Summary",
        emoji: true
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${totalStuck} cases currently blocked by quality gates*`
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `:rotating_light: *Alert (24h+):* ${alertCases.length}`
        },
        {
          type: "mrkdwn",
          text: `:warning: *Critical (8h+):* ${criticalCases.length}`
        },
        {
          type: "mrkdwn",
          text: `:bell: *Warning (4h+):* ${warningCases.length}`
        }
      ]
    }
  ];

  // Add top 5 oldest cases
  const allCases = [...alertCases, ...criticalCases, ...warningCases]
    .sort((a, b) => b.blockedDurationHours - a.blockedDurationHours)
    .slice(0, 5);

  if (allCases.length > 0) {
    const caseList = allCases.map(c =>
      `• ${c.caseNumber} - ${c.blockedDurationHours}h (${c.gateType})`
    ).join('\n');

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Longest Blocked Cases:*\n${caseList}`
      }
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Last updated: ${new Date().toLocaleString()}`
      }
    ]
  } as any);

  const slackService = getSlackMessagingService();
  await slackService.postMessage({
    channel: ESCALATION_CHANNEL,
    text: `Quality Gate Summary: ${totalStuck} cases blocked`,
    blocks
  });
}

export async function GET(): Promise<Response> {
  return runMonitoring();
}

export async function POST(): Promise<Response> {
  return runMonitoring();
}
