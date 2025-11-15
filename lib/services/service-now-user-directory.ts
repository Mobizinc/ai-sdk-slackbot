import type { Case } from "../infrastructure/servicenow/types/domain-models";
import { getTableApiClient } from "../infrastructure/servicenow/repositories/factory";
import type { ServiceNowTableAPIClient } from "../infrastructure/servicenow/client/table-api-client";
import { getSlackMessagingService, type SlackMessagingService } from "./slack-messaging";

interface ServiceNowUserRecord {
  sys_id: string;
  name?: string;
  user_name?: string;
  email?: string;
  u_slack_user_id?: string;
}

export class ServiceNowUserDirectory {
  private readonly userCache = new Map<string, ServiceNowUserRecord>();
  private readonly slackIdByEmail = new Map<string, string>();

  constructor(
    private readonly tableClient: ServiceNowTableAPIClient = getTableApiClient(),
    private readonly slackMessaging: SlackMessagingService = getSlackMessagingService()
  ) {}

  async resolveSlackMention(caseItem: Case): Promise<string | null> {
    const owner = caseItem.assignedTo;
    if (!owner || owner.trim().length === 0) {
      return null;
    }

    if (owner.startsWith("<@") || owner.startsWith("@")) {
      return owner;
    }

    if (!caseItem.assignedToSysId) {
      return `@${owner}`;
    }

    const user = await this.fetchUser(caseItem.assignedToSysId);
    if (!user) {
      return `@${owner}`;
    }

    const slackId = await this.resolveSlackUserId(user);
    if (slackId) {
      return `<@${slackId}>`;
    }

    return user.name ? `@${user.name}` : `@${owner}`;
  }

  private async fetchUser(sysId: string): Promise<ServiceNowUserRecord | null> {
    if (!sysId) {
      return null;
    }

    const cached = this.userCache.get(sysId);
    if (cached) {
      return cached;
    }

    try {
      const record = await this.tableClient.fetchById<ServiceNowUserRecord>(
        "sys_user",
        sysId,
        {
          sysparm_fields: "sys_id,name,user_name,email,u_slack_user_id",
          sysparm_display_value: "all",
        }
      );
      if (record) {
        this.userCache.set(sysId, record);
        return record;
      }
    } catch (error) {
      console.warn(`[ServiceNowUserDirectory] Failed to fetch user ${sysId}`, error);
    }

    return null;
  }

  private async resolveSlackUserId(user: ServiceNowUserRecord): Promise<string | null> {
    if (user.u_slack_user_id && user.u_slack_user_id.trim().length > 0) {
      return user.u_slack_user_id.trim();
    }

    if (!user.email) {
      return null;
    }

    const cached = this.slackIdByEmail.get(user.email.toLowerCase());
    if (cached) {
      return cached;
    }

    try {
      const lookup = await this.slackMessaging.lookupUserByEmail(user.email);
      const slackId = lookup?.user?.id;
      if (slackId) {
        this.slackIdByEmail.set(user.email.toLowerCase(), slackId);
        return slackId;
      }
    } catch (error) {
      console.warn(`[ServiceNowUserDirectory] Slack lookup failed for ${user.email}`, error);
    }

    return null;
  }
}

let singletonDirectory: ServiceNowUserDirectory | null = null;
export function getServiceNowUserDirectory(): ServiceNowUserDirectory {
  if (!singletonDirectory) {
    singletonDirectory = new ServiceNowUserDirectory();
  }
  return singletonDirectory;
}
