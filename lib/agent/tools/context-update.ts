/**
 * Context Update Tool
 *
 * Proposes updates to business context and CMDB data for steward approval.
 */

import { z } from "zod";
import { getContextManager } from "../../context-manager";
import { getBusinessContextService } from "../../services/business-context-service";
import { getContextUpdateManager, type ContextUpdateAction } from "../../context-update-manager";
import { createTool, type AgentToolFactoryParams } from "./shared";

export type ProposeContextUpdateInput = {
  entityName: string;
  caseNumber?: string;
  summary: string;
  details?: string;
  cmdbIdentifier: {
    ciName?: string;
    sysId?: string;
    ipAddresses?: string[];
    description?: string;
    ownerGroup?: string;
    documentation?: string[];
  };
  confidence?: "LOW" | "MEDIUM" | "HIGH";
  entityTypeIfCreate?: "CLIENT" | "VENDOR" | "PLATFORM";
};

const proposeContextUpdateInputSchema = z.object({
  entityName: z
    .string()
    .min(2)
    .describe("Business entity/client name that should be updated."),
  caseNumber: z
    .string()
    .optional()
    .describe("Case number associated with the discovered context gap."),
  summary: z
    .string()
    .min(10)
    .describe("Short summary describing what needs to change."),
  details: z
    .string()
    .optional()
    .describe("Optional additional detail or justification."),
  cmdbIdentifier: z
    .object({
      ciName: z.string().optional(),
      sysId: z.string().optional(),
      ipAddresses: z.array(z.string()).optional(),
      description: z.string().optional(),
      ownerGroup: z.string().optional(),
      documentation: z.array(z.string()).optional(),
    })
    .describe("CMDB identifier payload to append if approved."),
  confidence: z
    .enum(["LOW", "MEDIUM", "HIGH"])
    .optional()
    .describe("Assistant confidence in this proposed update."),
  entityTypeIfCreate: z
    .enum(["CLIENT", "VENDOR", "PLATFORM"])
    .optional()
    .describe("If the entity does not exist, what type should be created."),
});

export function createContextUpdateTool(params: AgentToolFactoryParams) {
  const { caseNumbers } = params;

  return createTool({
    description:
      "Draft a context/CMDB update for steward approval. Only use when the conversation reveals durable infrastructure facts that are missing from business_contexts or ServiceNow.",
    inputSchema: proposeContextUpdateInputSchema,
    execute: async ({
      entityName,
      caseNumber,
      summary,
      details,
      cmdbIdentifier,
      confidence,
      entityTypeIfCreate,
    }: ProposeContextUpdateInput) => {
      const chosenCaseNumber = caseNumber ?? caseNumbers[0];
      if (!chosenCaseNumber) {
        return {
          error:
            "No case number available for the context update. Provide caseNumber in the tool invocation so the stewards can trace the source conversation.",
        };
      }

      const contextManager = getContextManager();
      const contexts = contextManager.getContextsForCase(chosenCaseNumber);

      if (!contexts.length) {
        return {
          error: `Unable to locate conversation history for ${chosenCaseNumber}. Wait until the case is tracked before proposing updates.`,
        };
      }

      const conversationContext = contexts[contexts.length - 1];
      const sourceChannelId = conversationContext.channelId;
      const sourceThreadTs = conversationContext.threadTs;

      const businessService = getBusinessContextService();
      const businessContext = await businessService.getContextForCompany(entityName);

      if (!businessContext && !entityTypeIfCreate) {
        return {
          error:
            `No business context exists for ${entityName}. Provide entityTypeIfCreate (CLIENT | VENDOR | PLATFORM) so a record can be bootstrapped when approved.`,
        };
      }

      const identifierHasSignal =
        Boolean(cmdbIdentifier.ciName) ||
        Boolean(cmdbIdentifier.sysId) ||
        Boolean(cmdbIdentifier.description) ||
        (cmdbIdentifier.ipAddresses?.length ?? 0) > 0;

      if (!identifierHasSignal) {
        return {
          error:
            "Provide at least one of ciName, sysId, description, or ipAddresses for the CMDB identifier so stewards have something actionable.",
        };
      }

      const normalizeIp = (value: string) => value.trim();
      const dedupeIps = (ips: string[] | undefined) =>
        Array.from(new Set((ips ?? []).map(normalizeIp))).filter(Boolean);

      const stewardChannel = businessContext?.contextStewards?.find(
        (steward) => steward.type === "channel" && steward.id
      );

      const stewardChannelId = stewardChannel?.id || sourceChannelId;

      const formatStewardMention = (steward: {
        type: "channel" | "user" | "usergroup";
        id?: string;
        name?: string;
        notes?: string;
      }): string => {
        const label = steward.name || steward.id || steward.type;
        let mention: string;
        if (steward.type === "channel") {
          mention = steward.id ? `<#${steward.id}${steward.name ? `|${steward.name}` : ""}>` : `#${label}`;
        } else if (steward.type === "usergroup") {
          mention = steward.id ? `<!subteam^${steward.id}${steward.name ? `|@${steward.name}` : ""}>` : `@${label}`;
        } else {
          mention = steward.id ? `<@${steward.id}>` : `@${label}`;
        }
        return steward.notes ? `${mention} (${steward.notes})` : mention;
      };

      const stewardMentions = (businessContext?.contextStewards ?? []).map(formatStewardMention);

      if (!stewardMentions.length) {
        stewardMentions.push("Context stewards not configured – please triage manually.");
      }

      const contextUpdateManager = getContextUpdateManager();
      const actions: ContextUpdateAction[] = [
        {
          type: "append_cmdb_identifier",
          identifier: {
            ciName: cmdbIdentifier.ciName,
            sysId: cmdbIdentifier.sysId,
            ipAddresses: dedupeIps(cmdbIdentifier.ipAddresses),
            description: cmdbIdentifier.description,
            ownerGroup: cmdbIdentifier.ownerGroup,
            documentation: cmdbIdentifier.documentation ?? [],
          },
          createEntityIfMissing: !businessContext,
          entityTypeIfCreate,
        },
      ];

      const proposal = await contextUpdateManager.postProposal({
        entityName,
        summary,
        details,
        actions,
        stewardMentions,
        stewardChannelId,
        sourceChannelId,
        sourceThreadTs,
        initiatedBy: "PeterPool",
        caseNumber: chosenCaseNumber,
        confidence,
      });

      return {
        status: "pending_approval",
        messageTs: proposal.messageTs,
        stewardChannelId,
      };
    },
  });
}
