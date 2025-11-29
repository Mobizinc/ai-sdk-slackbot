/**
 * QStash Worker: Supervisor Approval Processing
 * Async worker that processes supervisor approval requests from the queue.
 */

import { approveSupervisorState, SupervisorStateNotFoundError } from '../../lib/supervisor/actions';
import { getSigningKeys, isQStashEnabled, verifyQStashSignature } from '../../lib/queue/qstash-client';
import { withLangSmithTrace } from '../../lib/observability';
import { getSlackMessagingService } from '../../lib/services/slack-messaging';

interface SupervisorApprovalJobPayload {
  workflowId: string;
  reviewer: string;
}

const postWorkerImpl = withLangSmithTrace(async (request: Request) => {
  const startTime = Date.now();

  try {
    const body = await request.text();

    if (isQStashEnabled()) {
      const signature = request.headers.get('upstash-signature');
      const signingKeys = getSigningKeys();
      const isValidSignature = verifyQStashSignature(signature, signingKeys.current || '', body);
      if (!isValidSignature) {
        console.warn('[Supervisor Worker] Invalid QStash signature - rejecting request');
        return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
      }
    }

    let messageData: any;
    try {
      messageData = JSON.parse(body);
    } catch (error) {
      console.error('[Supervisor Worker] Failed to parse JSON body:', error);
      return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), { status: 400 });
    }

    const { workflowId, reviewer } = (messageData?.body ?? messageData) as SupervisorApprovalJobPayload;

    if (!workflowId || !reviewer) {
      console.error('[Supervisor Worker] Missing workflowId or reviewer in payload');
      return new Response(JSON.stringify({ success: false, error: 'Missing parameters' }), { status: 400 });
    }

    console.info(`[Supervisor Worker] Processing approval for workflow ${workflowId} by ${reviewer}`);

    const state = await approveSupervisorState(workflowId, reviewer);

    const processingTime = Date.now() - startTime;
    console.info(`[Supervisor Worker] Workflow ${workflowId} approved successfully in ${processingTime}ms`);

    // Send completion notification to Slack
    try {
      const slack = getSlackMessagingService();
      const payload = state.payload as any;

      if (payload.channelId && payload.threadTs) {
        await slack.postToThread({
          channel: payload.channelId,
          threadTs: payload.threadTs,
          text: `✅ Supervisor approval completed for case ${payload.caseNumber || 'unknown'} (${processingTime}ms)`,
          unfurlLinks: false,
        });
      }
    } catch (slackError) {
      console.warn('[Supervisor Worker] Failed to send Slack completion notification:', slackError);
      // Don't fail the whole operation for Slack errors
    }

    return new Response(JSON.stringify({ success: true, processing_time_ms: processingTime }), { status: 200 });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`[Supervisor Worker] Processing failed after ${processingTime}ms:`, error);

    if (error instanceof SupervisorStateNotFoundError) {
        // Don't retry if the workflow is not found or already processed
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 200 });
    }
    
    // Return 500 error to trigger QStash retry for other errors
    return new Response(JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        processing_time_ms: processingTime,
    }), { status: 500 });
  }
}, {
  name: "qstash_worker_process_supervisor_approval",
  runType: "chain",
  tags: {
    component: "worker",
    operation: "supervisor_approval",
    service: "qstash",
  },
});

export const POST = postWorkerImpl;

export async function GET() {
  return new Response(JSON.stringify({
    status: 'healthy',
    worker: 'process-supervisor-approval',
    qstash_configured: !!(getSigningKeys().current && getSigningKeys().next),
    timestamp: new Date().toISOString(),
  }));
}
