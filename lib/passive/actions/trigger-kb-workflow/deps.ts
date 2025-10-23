import type { CaseContext } from "../../../../context-manager";
import type { SlackMessagingService } from "../../../../services/slack-messaging";
import type { CaseDataService } from "../../../../services/case-data";

export interface TriggerKBWorkflowDeps {
  slackMessaging: SlackMessagingService;
  caseData: CaseDataService;
  contextManager: {
    getContextSync(caseNumber: string, threadTs: string): CaseContext | undefined;
  };
}
