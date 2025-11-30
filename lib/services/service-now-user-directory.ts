import type { Case } from "../infrastructure/servicenow/types/domain-models";
import { getTableApiClient } from "../infrastructure/servicenow/repositories/factory";
import type { ServiceNowTableAPIClient } from "../infrastructure/servicenow/client/table-api-client";
import { getSlackMessagingService, type SlackMessagingService } from "./slack-messaging";
import { extractDisplayValue } from "../infrastructure/servicenow/client/mappers";

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
      const raw = await this.tableClient.fetchById<ServiceNowUserRecord>(
        "sys_user",
        sysId,
        {
          sysparm_fields: "sys_id,name,user_name,email,u_slack_user_id",
          sysparm_display_value: "all",
        }
      );
      if (raw) {
        // Normalize potential display_value objects into strings
        const record: ServiceNowUserRecord = {
          sys_id: extractDisplayValue((raw as any).sys_id) || raw.sys_id,
          name: extractDisplayValue((raw as any).name) || raw.name,
          user_name: extractDisplayValue((raw as any).user_name) || raw.user_name,
          email: extractDisplayValue((raw as any).email) || raw.email,
          u_slack_user_id:
            extractDisplayValue((raw as any).u_slack_user_id) || raw.u_slack_user_id,
        };
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

    const email = user.email ? user.email : extractDisplayValue((user as any).email);
    if (!email) {
      return null;
    }

    const normalizedEmail = email.toLowerCase();
    const cached = this.slackIdByEmail.get(normalizedEmail);
    if (cached) {
      return cached;
    }

    try {
      const lookup = await this.slackMessaging.lookupUserByEmail(email);
      const slackId = lookup?.user?.id;
      if (slackId) {
        this.slackIdByEmail.set(normalizedEmail, slackId);
        return slackId;
      }
    } catch (error) {
      console.warn(`[ServiceNowUserDirectory] Slack lookup failed for ${email}`, error);
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
