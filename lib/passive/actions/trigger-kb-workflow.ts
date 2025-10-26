import { TriggerKBWorkflowAction } from "./trigger-kb-workflow/main";

export { TriggerKBWorkflowAction };

let action: TriggerKBWorkflowAction | null = null;

export function getTriggerKBWorkflowAction(): TriggerKBWorkflowAction {
  if (!action) {
    const { getSlackMessagingService } = require("../../services/slack-messaging");
    const { getCaseDataService } = require("../../services/case-data");
    const { getContextManager } = require("../../context-manager");

        action = new TriggerKBWorkflowAction({
      slackMessaging: getSlackMessagingService(),
      caseData: getCaseDataService(),
      contextManager: getContextManager(),
    });
  }
  return action;
}
