import { TriggerKBWorkflowAction } from "./trigger-kb-workflow/main";
import { getSlackMessagingService } from "../../services/slack-messaging";
import { getCaseDataService } from "../../services/case-data";
import { getContextManager } from "../../context-manager";

export { TriggerKBWorkflowAction };

let action: TriggerKBWorkflowAction | null = null;

export function getTriggerKBWorkflowAction(): TriggerKBWorkflowAction {
  if (!action) {
    action = new TriggerKBWorkflowAction({
      slackMessaging: getSlackMessagingService(),
      caseData: getCaseDataService(),
      contextManager: getContextManager(),
    });
  }
  return action;
}
