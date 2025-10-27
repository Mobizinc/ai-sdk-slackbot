import { getContextManager } from "../context-manager";
import { getChannelInfo } from "./channel-info";
import { getBusinessContextService } from "./business-context-service";
import { serviceNowClient, type ServiceNowCaseSummary } from "../tools/servicenow";
import { createServiceNowContext } from "../infrastructure/servicenow-context";

export interface SlackThreadIssueSummary {
  caseNumber: string;
  lastMessageAt?: string;
  lastMessage?: string;
  messageCount: number;
}

export interface CurrentIssuesResult {
  channelId: string;
  channelName?: string;
  potentialCustomer?: string;
  clientName?: string;
  needsClientDetails: boolean;
  serviceNowCases?: ServiceNowCaseSummary[];
  slackThreads?: SlackThreadIssueSummary[];
  serviceNowConfigured: boolean;
}

export class CurrentIssuesService {
  private contextManager = getContextManager();
  private businessContextService = getBusinessContextService();

  async getCurrentIssues(channelId: string): Promise<CurrentIssuesResult> {
    const channelInfo = await getChannelInfo(channelId);
    const channelName = channelInfo?.channelName;
    const potentialCustomer = channelInfo?.potentialCustomer;

    const entityHints = [channelInfo?.channelName, potentialCustomer]
      .map((hint) => hint?.trim())
      .filter((hint): hint is string => Boolean(hint));

    let clientName: string | undefined;
    for (const hint of entityHints) {
      const context = await this.businessContextService.getContextForCompany(hint);
      if (context) {
        clientName = context.entityName;
        break;
      }
    }

    const serviceNowConfigured = serviceNowClient.isConfigured();
    const needsClientDetails = !clientName;

    const slackThreads = this.contextManager
      .getActiveContextsForChannel(channelId)
      .map((context) => {
        const mostRecentMessage = context.messages[context.messages.length - 1];
        return {
          caseNumber: context.caseNumber,
          lastMessageAt: mostRecentMessage?.timestamp,
          lastMessage: mostRecentMessage?.text,
          messageCount: context.messages.length,
        } satisfies SlackThreadIssueSummary;
      });

    let serviceNowCases: ServiceNowCaseSummary[] | undefined;
    if (clientName && serviceNowConfigured) {
      try {
        // Create ServiceNow context for this search (use channelId for deterministic routing)
        const snContext = createServiceNowContext(undefined, channelId);

        serviceNowCases = await serviceNowClient.searchCustomerCases(
          {
            accountName: clientName,
            activeOnly: true,
            limit: 5,
          },
          snContext,
        );
      } catch (error) {
        console.warn(`[CurrentIssuesService] Failed to load ServiceNow cases for ${clientName}:`, error);
      }
    }

    return {
      channelId,
      channelName,
      potentialCustomer,
      clientName,
      needsClientDetails,
      serviceNowCases,
      slackThreads,
      serviceNowConfigured,
    };
  }
}

let currentIssuesService: CurrentIssuesService | null = null;

export function getCurrentIssuesService(): CurrentIssuesService {
  if (!currentIssuesService) {
    currentIssuesService = new CurrentIssuesService();
  }
  return currentIssuesService;
}
