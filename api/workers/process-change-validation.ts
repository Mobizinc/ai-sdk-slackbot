/**
 * QStash Worker: Change Validation Processing
 * Async worker that processes queued change validations
 *
 * This endpoint is called by QStash after a change is enqueued.
 * It retrieves the change details from the database and ServiceNow,
 * runs validation, and posts results back to ServiceNow.
 *
 * Flow:
 * 1. Verify QStash signature
 * 2. Fetch change validation record from DB
 * 3. Collect validation facts from ServiceNow
 * 4. Synthesize results using Claude (with ReACT pattern)
 * 5. Post results to ServiceNow work notes
 * 6. Update DB with completion status
 */

import { verifySignatureEdge } from "@upstash/qstash/nextjs";
import { getChangeValidationService } from "../../lib/services/change-validation";
import { withLangSmithTrace } from "../../lib/observability";

// Initialize service
const changeValidationService = getChangeValidationService();

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface WorkerPayload {
  changeSysId: string;
  changeNumber: string;
}

/**
 * Process change validation (async worker)
 * Note: verifySignatureEdge wrapper handles QStash signature verification AND body parsing
 */
const postWorkerImpl = withLangSmithTrace(
  async (request: Request) => {
    const startTime = Date.now();

    try {
      // Body is already verified and parsed by verifySignatureEdge wrapper
      // We can safely read it here
      const payload: WorkerPayload = await request.json();

      const { changeSysId, changeNumber } = payload;

      if (!changeSysId || !changeNumber) {
        console.error("[Change Validation Worker] Missing required fields in payload");
        return Response.json({ error: "Missing required fields" }, { status: 400 });
      }

      console.log(`[Change Validation Worker] Processing change: ${changeNumber} (${changeSysId})`);

      // Process validation
      const result = await changeValidationService.processValidation(changeSysId);

      const duration = Date.now() - startTime;

      console.log(`[Change Validation Worker] Completed ${changeNumber} in ${duration}ms`, {
        overall_status: result.overall_status,
        processing_time_ms: duration,
      });

      return Response.json(
        {
          success: true,
          change_number: changeNumber,
          change_sys_id: changeSysId,
          overall_status: result.overall_status,
          duration_ms: duration,
        },
        { status: 200 }
      );
    } catch (error) {
      const duration = Date.now() - startTime;

      console.error("[Change Validation Worker] Error processing validation:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        duration_ms: duration,
      });

      const errorMessage = error instanceof Error ? error.message : String(error);

      return Response.json(
        {
          success: false,
          error: errorMessage,
          duration_ms: duration,
        },
        { status: 500 }
      );
    }
  },
  {
    name: "process-change-validation-worker",
    tags: {
      component: "worker",
      operation: "process-validation",
      service: "servicenow",
      feature: "change-validation",
      runtime: "edge"
    },
    metadata: {
      runtime: "edge",
      queue: "qstash",
      version: "1.0.0",
    },
  }
);

// QStash signature verification wrapper
export const POST = verifySignatureEdge(postWorkerImpl);
