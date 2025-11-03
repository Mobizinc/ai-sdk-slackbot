import type { CaseContext } from "../../../context-manager";
import type { TriggerKBWorkflowDeps } from "./deps";
import { triggerWorkflow as triggerWorkflowStage } from "./start";
import { handleUserResponse as handleUserResponseStage } from "./gathering-response";
import { cleanupTimedOut } from "./cleanup";

export class TriggerKBWorkflowAction {
  constructor(private deps: TriggerKBWorkflowDeps) {}

  async triggerWorkflow(
    caseNumber: string,
    channelId: string,
    threadTs: string,
  ): Promise<void> {
    await triggerWorkflowStage(this.deps, { caseNumber, channelId, threadTs });
  }

  async handleUserResponse(context: CaseContext, responseText: string): Promise<void> {
    await handleUserResponseStage(this.deps, context, responseText);
  }

  async cleanupTimedOut(): Promise<void> {
    await cleanupTimedOut(this.deps);
  }
}

// Export individual functions for direct testing
export { triggerWorkflowStage as triggerWorkflow };
export { handleUserResponseStage as handleUserResponse };
export { cleanupTimedOut };
export type { TriggerKBWorkflowDeps };
