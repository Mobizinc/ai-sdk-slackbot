/**
 * ServiceNow Tool
 *
 * Provides access to ServiceNow data including incidents, cases, knowledge base,
 * journal entries, and configuration items.
 */

import { z } from "zod";
import { serviceNowClient } from "../../tools/servicenow";
import { createTool, type AgentToolFactoryParams } from "./shared";
import { createServiceNowContext } from "../../infrastructure/servicenow-context";
import { optimizeImageForClaude, isSupportedImageFormat } from "../../utils/image-processing";
import type { ContentBlock } from "../../services/anthropic-chat";
import { config } from "../../config";
import { normalizeCaseId, findMatchingCaseNumber, extractDigits } from "../../utils/case-number-normalizer";

export type ServiceNowToolInput = {
  action:
    | "getIncident"
    | "getCase"
    | "getCaseJournal"
    | "searchKnowledge"
    | "searchConfigurationItem"
    | "searchCases";
  number?: string;
  caseSysId?: string;
  query?: string;
  limit?: number;
  ciName?: string;
  ipAddress?: string;
  ciSysId?: string;
  accountName?: string;
  companyName?: string;
  priority?: string;
  state?: string;
  assignmentGroup?: string;
  assignedTo?: string;
  openedAfter?: string;
  openedBefore?: string;
  activeOnly?: boolean;
  sortBy?: "opened_at" | "priority" | "updated_on" | "state";
  sortOrder?: "asc" | "desc";
  includeAttachments?: boolean;
  maxAttachments?: number;
  attachmentTypes?: string[];
};

const serviceNowInputSchema = z
  .object({
    action: z.enum([
      "getIncident",
      "getCase",
      "getCaseJournal",
      "searchKnowledge",
      "searchConfigurationItem",
      "searchCases",
    ]),
    number: z
      .string()
      .optional()
      .describe("REQUIRED for getIncident and getCase actions. The incident or case number to look up (e.g., INC0012345, SCS1234567, CS0098765, or just the numeric portion like 49764). Extract this from the user's message - they often provide it as part of their request."),
    caseSysId: z
      .string()
      .optional()
      .describe(
        "ServiceNow case sys_id for fetching journal entries (comments, work notes).",
      ),
    query: z
      .string()
      .optional()
      .describe("Search phrase for knowledge base lookups or keyword search in case descriptions."),
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .describe("Maximum number of results to return. For searchCases, up to 50 results are allowed (default: 25). For searchKnowledge (knowledge articles), the maximum is 20 (default: 20)."),
    ciName: z
      .string()
      .optional()
      .describe("Configuration item name, hostname, or partial match to search for."),
    ipAddress: z
      .string()
      .optional()
      .describe("IP address associated with a configuration item."),
    ciSysId: z
      .string()
      .optional()
      .describe("Exact sys_id of the configuration item to retrieve."),
    accountName: z
      .string()
      .optional()
      .describe("Filter cases by customer/account name (partial match)."),
    companyName: z
      .string()
      .optional()
      .describe("Filter cases by company name (partial match)."),
    priority: z
      .string()
      .optional()
      .describe("Filter by priority (1=Critical, 2=High, 3=Moderate, 4=Low)."),
    state: z
      .string()
      .optional()
      .describe("Filter by case state (Open, Work in Progress, Resolved, Closed, etc.)."),
    assignmentGroup: z
      .string()
      .optional()
      .describe("Filter by assignment group name (partial match)."),
    assignedTo: z
      .string()
      .optional()
      .describe("Filter by assigned user name (partial match)."),
    openedAfter: z
      .string()
      .optional()
      .describe("Filter cases opened after this date (ISO format: YYYY-MM-DD)."),
    openedBefore: z
      .string()
      .optional()
      .describe("Filter cases opened before this date (ISO format: YYYY-MM-DD)."),
    activeOnly: z
      .boolean()
      .optional()
      .describe("Only return active (open) cases (default: true if no state filter specified)."),
    sortBy: z
      .enum(["opened_at", "priority", "updated_on", "state"])
      .optional()
      .describe("Sort results by field (default: opened_at)."),
    sortOrder: z
      .enum(["asc", "desc"])
      .optional()
      .describe("Sort order: ascending or descending (default: desc)."),
    includeAttachments: z
      .boolean()
      .optional()
      .describe("Include image attachments (screenshots, diagrams) with case or incident. WARNING: Significantly increases token usage (3000-10000 tokens per case with images). Only use when visual analysis is critical for troubleshooting UI errors, screenshots, or system diagrams."),
    maxAttachments: z
      .number()
      .min(1)
      .max(5)
      .optional()
      .describe("Maximum number of attachments to retrieve (default: 3, max: 5). Each image adds ~1000-4000 tokens depending on size."),
    attachmentTypes: z
      .array(z.string())
      .optional()
      .describe("Filter attachments by MIME type (e.g., ['image/png', 'image/jpeg']). Defaults to all image types if not specified."),
  })
  .describe("ServiceNow action parameters");

/**
 * Helper function to fetch and process attachments from ServiceNow
 * Returns content blocks with optimized images for Claude
 */
async function processAttachments(
  tableName: string,
  recordSysId: string,
  includeAttachments?: boolean,
  maxAttachments?: number,
  attachmentTypes?: string[]
): Promise<ContentBlock[]> {
  // Check if multimodal is enabled and requested
  if (!config.enableMultimodalToolResults || !includeAttachments) {
    return [];
  }

  try {
    const attachmentLimit = Math.min(
      maxAttachments ?? config.maxImageAttachmentsPerTool,
      config.maxImageAttachmentsPerTool
    );

    // Fetch attachment metadata
    const attachments = await serviceNowClient.getAttachments(
      tableName,
      recordSysId,
      attachmentLimit
    );

    if (attachments.length === 0) {
      return [];
    }

    // Filter by type if specified, default to images only
    const typeFilter = attachmentTypes && attachmentTypes.length > 0
      ? attachmentTypes
      : ["image/jpeg", "image/png", "image/gif", "image/webp"];

    const filteredAttachments = attachments.filter(a =>
      typeFilter.some(type => a.content_type.startsWith(type.split("/")[0]))
    );

    const contentBlocks: ContentBlock[] = [];

    // Download and optimize images
    for (const attachment of filteredAttachments.slice(0, attachmentLimit)) {
      try {
        // Skip if not a supported image format
        if (!isSupportedImageFormat(attachment.content_type)) {
          console.log(`[ServiceNow] Skipping unsupported format: ${attachment.content_type} (${attachment.file_name})`);
          continue;
        }

        // Download the image
        const imageBuffer = await serviceNowClient.downloadAttachment(attachment.sys_id);

        // Optimize for Claude
        const optimized = await optimizeImageForClaude(
          imageBuffer,
          attachment.content_type,
          config.maxImageSizeBytes
        );

        contentBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: optimized.media_type,
            data: optimized.data,
          },
        });

        console.log(
          `[ServiceNow] Processed attachment: ${attachment.file_name} (${optimized.was_optimized ? "optimized" : "original"}: ${optimized.size_bytes} bytes)`
        );
      } catch (error) {
        console.error(
          `[ServiceNow] Failed to process attachment ${attachment.file_name}:`,
          error instanceof Error ? error.message : String(error)
        );
        // Continue with other attachments
      }
    }

    return contentBlocks;
  } catch (error) {
    console.error("[ServiceNow] Failed to fetch attachments:", error);
    return []; // Return empty array, don't fail the entire tool call
  }
}

export function createServiceNowTool(params: AgentToolFactoryParams) {
  const { updateStatus, options } = params;

  return createTool({
    name: "servicenow_action",
    description:
      "Retrieves data from ServiceNow ITSM platform including incidents, cases, case journals, knowledge base articles, and configuration items (CMDB).\n\n" +
      "**IMPORTANT: Parameter Extraction Rules**\n" +
      "- For 'getIncident' or 'getCase' actions, the 'number' parameter is REQUIRED and MUST be extracted from the user's message\n" +
      "- Case numbers appear in formats like: INC0012345, SCS1234567, CS0098765, or just numeric portions like '49764'\n" +
      "- Examples of extraction:\n" +
      "  • 'details for 49764' → number: '49764'\n" +
      "  • 'show me SCS1234567' → number: 'SCS1234567'\n" +
      "  • 'case CS0012345 status' → number: 'CS0012345'\n\n" +
      "**Actions:**\n" +
      "- 'getIncident' / 'getCase': Fetch specific ticket BY NUMBER (number parameter REQUIRED)\n" +
      "- 'getCaseJournal': Get comment history (requires caseSysId)\n" +
      "- 'searchKnowledge': Find KB articles (requires query)\n" +
      "- 'searchConfigurationItem': CMDB lookup (requires ciName, ipAddress, or ciSysId)\n" +
      "- 'searchCases': Advanced filtering when you DON'T have an exact number (use filters: companyName, priority, state, assignmentGroup, etc.)\n\n" +
      "**When to Use Each:**\n" +
      "- Use getCase/getIncident ONLY when user provides a specific case number\n" +
      "- Use searchCases when filtering by customer, status, or other criteria without a specific number\n\n" +
      "**Attachments:** When includeAttachments=true, returns visual content (screenshots, diagrams). Useful for troubleshooting UI errors or viewing monitoring dashboards. Increases token usage 3000-10000 per case. Only enable when visual analysis is critical.",
    inputSchema: serviceNowInputSchema,
    execute: async ({
      action,
      number,
      caseSysId,
      query,
      limit,
      ciName,
      ipAddress,
      ciSysId,
      accountName,
      companyName,
      priority,
      state,
      assignmentGroup,
      assignedTo,
      openedAfter,
      openedBefore,
      activeOnly,
      sortBy,
      sortOrder,
      includeAttachments,
      maxAttachments,
      attachmentTypes,
    }: ServiceNowToolInput) => {
      if (!serviceNowClient.isConfigured()) {
        return {
          error:
            "ServiceNow integration is not configured. Set SERVICENOW_INSTANCE_URL and credentials to enable this tool.",
        };
      }

      // Log tool invocation with action and key parameters
      const logParams: Record<string, any> = { action };
      if (number) logParams.number = number;
      if (caseSysId) logParams.caseSysId = caseSysId;
      if (query) logParams.query = query;
      if (ciName) logParams.ciName = ciName;
      if (ipAddress) logParams.ipAddress = ipAddress;
      if (companyName) logParams.companyName = companyName;
      if (includeAttachments) logParams.includeAttachments = includeAttachments;

      console.log(`[ServiceNow Tool] Invoking action with parameters:`, logParams);

      // Create ServiceNow context for deterministic feature flag routing
      const snContext = createServiceNowContext(undefined, options?.channelId);

      /**
       * Normalize case/incident number by reconciling with params.caseNumbers
       * or applying standard normalization rules
       */
      const normalizeNumber = (rawNumber: string, isIncident: boolean): string => {
        // First, try to find matching canonical case number from context
        const matched = findMatchingCaseNumber(rawNumber, params.caseNumbers);
        if (matched) {
          console.log(`[ServiceNow Tool] Matched canonical case number: "${rawNumber}" → "${matched}"`);
          return matched;
        }

        // No match in context - normalize with appropriate prefix
        const prefix = isIncident ? "INC" : "SCS";
        const normalized = normalizeCaseId(prefix, rawNumber);

        console.log(`[ServiceNow Tool] Normalized number: "${rawNumber}" → "${normalized}" (prefix: ${prefix})`);
        return normalized;
      };

      try {
        if (action === "getIncident") {
          if (!number) {
            throw new Error(
              "number is required to retrieve a ServiceNow incident.",
            );
          }

          const normalizedNumber = normalizeNumber(number, true);
          updateStatus?.(`is looking up incident ${normalizedNumber} in ServiceNow...`);

          const incident = await serviceNowClient.getIncident(normalizedNumber, snContext);
          if (!incident) {
            console.log(`[ServiceNow] Incident ${normalizedNumber} not found, trying case table...`);
            updateStatus?.(`is looking up ${normalizedNumber} in case table...`);

            // Try normalizing as a case number for fallback
            const normalizedCaseNumber = normalizeNumber(number, false);
            const caseRecord = await serviceNowClient.getCase(normalizedCaseNumber, snContext);
            if (caseRecord) {
              console.log(`[ServiceNow] Found ${normalizedCaseNumber} in case table (fallback from incident)`);
              return { case: caseRecord };
            }

            return {
              incident: null,
              message: `Incident ${normalizedNumber} was not found in ServiceNow. This case number may be incorrect or the incident may not exist in the system.`,
            };
          }

          // Handle attachments if requested
          if (includeAttachments) {
            updateStatus?.(`is fetching attachments for incident ${number}...`);
            const imageBlocks = await processAttachments(
              "incident",
              incident.sys_id,
              includeAttachments,
              maxAttachments,
              attachmentTypes
            );

            if (imageBlocks.length > 0) {
              return {
                incident,
                _attachmentBlocks: imageBlocks,
                _attachmentCount: imageBlocks.length,
              };
            }
          }

          return { incident };
        }

        if (action === "getCase") {
          if (!number) {
            throw new Error(
              "number is required to retrieve a ServiceNow case.",
            );
          }

          const normalizedNumber = normalizeNumber(number, false);
          updateStatus?.(`is looking up case ${normalizedNumber} in ServiceNow...`);

          const caseRecord = await serviceNowClient.getCase(normalizedNumber, snContext);

          if (!caseRecord) {
            console.log(`[ServiceNow] Case ${normalizedNumber} not found, trying incident table...`);
            updateStatus?.(`is looking up ${normalizedNumber} in incident table...`);

            // Try normalizing as an incident number for fallback
            const normalizedIncidentNumber = normalizeNumber(number, true);
            const incident = await serviceNowClient.getIncident(normalizedIncidentNumber, snContext);
            if (incident) {
              console.log(`[ServiceNow] Found ${normalizedIncidentNumber} in incident table (fallback from case)`);
              return { incident };
            }

            return {
              case: null,
              message: `Case ${normalizedNumber} was not found in ServiceNow. This case number may be incorrect or the case may not exist in the system.`,
            };
          }

          // Handle attachments if requested
          if (includeAttachments) {
            updateStatus?.(`is fetching attachments for case ${number}...`);
            const imageBlocks = await processAttachments(
              "sn_customerservice_case",
              caseRecord.sys_id,
              includeAttachments,
              maxAttachments,
              attachmentTypes
            );

            if (imageBlocks.length > 0) {
              // Return with special _attachments marker for runner to handle
              return {
                case: caseRecord,
                _attachmentBlocks: imageBlocks,
                _attachmentCount: imageBlocks.length,
              };
            }
          }

          return { case: caseRecord };
        }

        if (action === "getCaseJournal") {
          if (!caseSysId && !number) {
            throw new Error(
              "Provide either caseSysId or number to retrieve journal entries.",
            );
          }

          let sysId = caseSysId ?? null;

          if (!sysId && number) {
            const caseRecord = await serviceNowClient.getCase(number, snContext);

            if (!caseRecord) {
              return {
                entries: [],
                message: `Case ${number} was not found in ServiceNow.`,
              };
            }

            sysId = caseRecord.sys_id ?? null;
            if (!sysId) {
              return {
                entries: [],
                message: `Unable to access sys_id for case ${number}.`,
              };
            }
          }

          updateStatus?.(`is fetching journal entries for ${number ?? caseSysId}...`);

          const journal = await serviceNowClient.getCaseJournal(
            sysId!,
            { limit: limit ?? 20 },
            snContext,
          );

          return {
            entries: journal,
            total: journal.length,
          };
        }

        if (action === "searchKnowledge") {
          if (!query) {
            throw new Error(
              "query is required to search knowledge base articles.",
            );
          }

          updateStatus?.(`is searching knowledge base for ${query}...`);

          const articles = await serviceNowClient.searchKnowledge(
            {
              query,
              limit: limit ?? 10,
            },
            snContext,
          );

          return {
            articles,
            total_found: articles.length,
          };
        }

        if (action === "searchConfigurationItem") {
          if (!ciName && !ipAddress && !ciSysId) {
            throw new Error(
              "Provide ciName, ipAddress, or ciSysId to search for a configuration item.",
            );
          }

          updateStatus?.(`is searching configuration items...`);

          const results = await serviceNowClient.searchConfigurationItems(
            {
              name: ciName,
              ipAddress,
              sysId: ciSysId,
              limit: limit ?? 10,
            },
            snContext,
          );

          return {
            configuration_items: results,
            total_found: results.length,
          };
        }

        if (action === "searchCases") {
          updateStatus?.(`is searching ServiceNow cases${companyName ? ` for ${companyName}` : ""}...`);

          const filters = {
            query,
            limit,
            ciName,
            ipAddress,
            accountName,
            companyName,
            priority,
            state,
            assignmentGroup,
            assignedTo,
            openedAfter,
            openedBefore,
            activeOnly,
            sortBy,
            sortOrder,
          };

          const results = await serviceNowClient.searchCustomerCases(filters, snContext);

          return {
            cases: results,
            total_found: results.length,
            applied_filters: filters,
          };
        }

        return {
          error: `Unsupported action: ${action}`,
        };
      } catch (error) {
        console.error("[ServiceNow Tool] Error:", error);
        return {
          error:
            error instanceof Error ? error.message : "ServiceNow operation failed",
        };
      }
    },
  });
}
