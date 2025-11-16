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
import { normalizeCaseId, findMatchingCaseNumber, detectTableFromPrefix } from "../../utils/case-number-normalizer";
import {
  formatIncidentForLLM,
  formatJournalEntriesForLLM,
  formatSearchResultsForLLM,
  formatConfigurationItemsForLLM,
} from "../../services/servicenow-formatters";

/**
 * Extract value from ServiceNow reference field
 * Handles both string and {value, display_value} object formats
 */
function extractReference(field: unknown): string | undefined {
  if (!field) return undefined;
  if (typeof field === "string") return field;
  if (typeof field === "object") {
    const ref = field as { value?: unknown; display_value?: unknown };
    const value = ref.value;
    const display = ref.display_value;
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
    if (typeof display === "string" && display.trim().length > 0) {
      return display;
    }
  }
  return undefined;
}

export type ServiceNowToolInput = {
  action:
    | "getIncident"
    | "getCase"
    | "getCaseJournal"
    | "searchKnowledge"
    | "searchConfigurationItem"
    | "getCIRelationships"
    | "searchCases"
    | "searchProjects"
    | "getProject"
    | "getProjectEpics"
    | "getProjectStories";
  number?: string;
  caseSysId?: string;
  query?: string;
  limit?: number;
  projectNumber?: string;
  projectSysId?: string;
  projectName?: string;
  projectState?: string;
  projectPriority?: string;
  projectManager?: string;
  projectActiveOnly?: boolean;
  ciName?: string;
  ipAddress?: string;
  ciSysId?: string;
  ciClassName?: string;
  ciOperationalStatus?: string;
  ciLocation?: string;
  ciOwnerGroup?: string;
  ciEnvironment?: string;
  relationshipType?: string;
  accountName?: string;
  companyName?: string;
  priority?: string;
  state?: string;
  assignmentGroup?: string;
  assignedTo?: string;
  openedAfter?: string;
  openedBefore?: string;
  activeOnly?: boolean;
  domain?: string;
  includeChildDomains?: boolean;
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
      "getCIRelationships",
      "searchCases",
      "searchProjects",
      "getProject",
      "getProjectEpics",
      "getProjectStories",
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
    ciClassName: z
      .string()
      .optional()
      .describe("CI class/type filter (e.g., 'cmdb_ci_server' for servers, 'cmdb_ci_netgear' for network devices, 'cmdb_ci_appl' for applications, 'cmdb_ci_computer' for computers)."),
    ciOperationalStatus: z
      .string()
      .optional()
      .describe("Operational status filter (e.g., '1' for Operational, '2' for Non-Operational, '6' for Retired)."),
    ciLocation: z
      .string()
      .optional()
      .describe("Location filter for CIs (e.g., datacenter name, city, or location partial match)."),
    ciOwnerGroup: z
      .string()
      .optional()
      .describe("Owner/support group filter for CIs (partial match on group name)."),
    ciEnvironment: z
      .string()
      .optional()
      .describe("Environment filter (e.g., 'production', 'development', 'staging', 'test')."),
    relationshipType: z
      .string()
      .optional()
      .describe("CMDB relationship type filter for getCIRelationships action (e.g., 'Depends On', 'Supports', 'Runs on', 'Hosted on'). If not specified, returns all relationships."),
    accountName: z
      .string()
      .optional()
      .describe("Filter cases by customer/account name (partial match)."),
    companyName: z
      .string()
      .optional()
      .describe("Filter cases by company name (partial match). Also used to filter CMDB configuration items by company for searchConfigurationItem action."),
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
    domain: z
      .string()
      .optional()
      .describe("Domain sys_id for filtering cases in multi-tenant environments. Use this to filter cases by organizational domain."),
    includeChildDomains: z
      .boolean()
      .optional()
      .describe("Include cases from child domains in hierarchical multi-tenant searches (default: false). Only applies when domain is specified."),
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
    projectNumber: z
      .string()
      .optional()
      .describe("REQUIRED for getProject action. Project number to look up (e.g., PRJ0100115). Used for retrieving specific project details."),
    projectSysId: z
      .string()
      .optional()
      .describe("REQUIRED for getProjectEpics and getProjectStories actions. Project sys_id to find related epics or stories."),
    projectName: z
      .string()
      .optional()
      .describe("Fuzzy search by project name/description for searchProjects action. Supports partial matching (e.g., 'Migration' will match 'Azure Migration Project')."),
    projectState: z
      .string()
      .optional()
      .describe("Filter projects by state for searchProjects action. Values: 'Pending' (-5), 'Open' (-4), 'Work in Progress' (-3), 'On Hold' (-2), 'Closed Complete' (0), 'Closed Incomplete' (1), 'Closed Cancelled' (2)."),
    projectPriority: z
      .string()
      .optional()
      .describe("Filter projects by priority for searchProjects action. Values: '1' (Critical), '2' (High), '3' (Moderate), '4' (Low), '5' (Planning)."),
    projectManager: z
      .string()
      .optional()
      .describe("Filter projects by project manager name (partial match) for searchProjects action."),
    projectActiveOnly: z
      .boolean()
      .optional()
      .describe("Only return active (non-closed) projects for searchProjects action. Default: false (returns all projects)."),
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
      "**⚠️ DEPRECATED: Use specific tools instead!**\n" +
      "This tool will be removed in a future release. Please use the new single-purpose tools for better performance:\n" +
      "- For incidents: use `get_incident` tool\n" +
      "- For cases: use `get_case` tool\n" +
      "- For case journals: use `get_case_journal` tool\n" +
      "- For knowledge articles: use `search_knowledge` tool\n" +
      "- For CMDB/CIs: use `search_configuration_items` tool\n\n" +
      "Retrieves data from ServiceNow ITSM platform including incidents, cases, case journals, knowledge base articles, configuration items (CMDB), and SPM projects.\n\n" +
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
      "- 'searchConfigurationItem': CMDB lookup - search for CIs by name, IP, class, company, location, environment, status, or owner group\n" +
      "- 'getCIRelationships': Get related CIs for a specific CI (requires ciSysId, optional relationshipType filter)\n" +
      "- 'searchCases': DEPRECATED - Use the 'search_cases' tool instead for case filtering. This action is kept for backward compatibility only.\n" +
      "- 'searchProjects': Search SPM projects with flexible filters (projectName, projectState, projectPriority, projectManager, projectActiveOnly)\n" +
      "- 'getProject': Get specific project details BY NUMBER (projectNumber parameter REQUIRED, e.g., PRJ0100115)\n" +
      "- 'getProjectEpics': Get epics related to a project (projectSysId REQUIRED)\n" +
      "- 'getProjectStories': Get stories related to a project (projectSysId REQUIRED)\n\n" +
      "**Natural Language Query Examples for searchConfigurationItem:**\n" +
      "- 'server PROD-WEB-01' → ciName: 'PROD-WEB-01', ciClassName: 'cmdb_ci_server'\n" +
      "- 'CIs in Chicago' → ciLocation: 'Chicago'\n" +
      "- 'production servers' → ciEnvironment: 'production', ciClassName: 'cmdb_ci_server'\n" +
      "- 'network devices for Network Ops' → ciClassName: 'cmdb_ci_netgear', ciOwnerGroup: 'Network Ops'\n" +
      "- 'Neighbors servers in Azure' → companyName: 'Neighbors', ciLocation: 'Azure'\n" +
      "- 'what servers does Altus have' → companyName: 'Altus', ciClassName: 'cmdb_ci_server'\n" +
      "- '10.50.10.25' → ipAddress: '10.50.10.25'\n" +
      "- 'operational servers in production' → ciClassName: 'cmdb_ci_server', ciEnvironment: 'production', ciOperationalStatus: '1'\n" +
      "- 'all CIs owned by Platform team' → ciOwnerGroup: 'Platform'\n" +
      "- 'non-operational devices' → ciOperationalStatus: '2'\n\n" +
      "**When to Use Each:**\n" +
      "- Use getCase/getIncident ONLY when user provides a specific case number\n" +
      "- For case filtering by customer, status, or other criteria, use the 'search_cases' tool (NOT this tool's searchCases action)\n\n" +
      "**CRITICAL: Avoid Redundant Calls**\n" +
      "- INC prefix (e.g., INC0168060) → ALWAYS use 'getIncident' ONLY, never getCase\n" +
      "- SCS/CS prefix (e.g., SCS1234567) → ALWAYS use 'getCase' ONLY, never getIncident\n" +
      "- Do NOT call both getIncident AND getCase for the same number\n" +
      "- If getIncident or getCase succeeds, you have complete information - STOP, do not make additional calls\n" +
      "- Each prefix maps to a specific ServiceNow table - calling the wrong action will always fail\n\n" +
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
      ciClassName,
      ciOperationalStatus,
      ciLocation,
      ciOwnerGroup,
      ciEnvironment,
      relationshipType,
      accountName,
      companyName,
      priority,
      state,
      assignmentGroup,
      assignedTo,
      openedAfter,
      openedBefore,
      activeOnly,
      domain,
      includeChildDomains,
      sortBy,
      sortOrder,
      includeAttachments,
      maxAttachments,
      attachmentTypes,
      projectNumber,
      projectSysId,
      projectName,
      projectState,
      projectPriority,
      projectManager,
      projectActiveOnly,
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
      if (projectNumber) logParams.projectNumber = projectNumber;
      if (projectSysId) logParams.projectSysId = projectSysId;
      if (projectName) logParams.projectName = projectName;

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
              // Return raw case data for LLM to analyze directly
              return {
                case: caseRecord,
                journals: [],
              };
            }

            return {
              incident: null,
              message: `Incident ${normalizedNumber} was not found in ServiceNow. This case number may be incorrect or the incident may not exist in the system.`,
            };
          }

          // Format incident data with summary + rawData structure
          const formatted = formatIncidentForLLM(incident);

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
                incident: incident,
                summary: formatted?.summary,
                rawData: formatted?.rawData,
                _attachmentBlocks: imageBlocks,
                _attachmentCount: imageBlocks.length,
              };
            }
          }

          return {
            summary: formatted?.summary,
            rawData: formatted?.rawData,
          };
        }

        if (action === "getCase") {
          if (!number) {
            throw new Error(
              "number is required to retrieve a ServiceNow case.",
            );
          }

          // Detect table from prefix BEFORE normalizing
          const detectedTable = detectTableFromPrefix(number);

          // Route to correct method based on detected prefix
          if (detectedTable) {
            console.log(`[ServiceNow Tool] Detected prefix: ${detectedTable.prefix} → table: ${detectedTable.table}`);

            if (detectedTable.table === "sc_request") {
              // REQ prefix → use getRequest() method
              updateStatus?.(`is looking up request ${number} in ServiceNow...`);
              const request = await serviceNowClient.getRequest(number, snContext);

              if (!request) {
                return {
                  case: null,
                  message: `Request ${number} was not found in ServiceNow. This request number may be incorrect or may not exist in the system.`,
                };
              }

              return {
                request,
                type: "sc_request",
                message: `Successfully retrieved request ${request.number}`,
              };
            }

            if (detectedTable.table === "sc_req_item") {
              // RITM prefix → use getRequestedItem() method
              updateStatus?.(`is looking up requested item ${number} in ServiceNow...`);
              const requestedItem = await serviceNowClient.getRequestedItem(number, snContext);

              if (!requestedItem) {
                return {
                  case: null,
                  message: `Requested item ${number} was not found in ServiceNow. This RITM number may be incorrect or may not exist in the system.`,
                };
              }

              return {
                requestedItem,
                type: "sc_req_item",
                message: `Successfully retrieved requested item ${requestedItem.number}`,
              };
            }

            if (detectedTable.table === "sc_task") {
              // SCTASK prefix → use getCatalogTask() method
              updateStatus?.(`is looking up catalog task ${number} in ServiceNow...`);
              const catalogTask = await serviceNowClient.getCatalogTask(number, snContext);

              if (!catalogTask) {
                return {
                  case: null,
                  message: `Catalog task ${number} was not found in ServiceNow. This SCTASK number may be incorrect or may not exist in the system.`,
                };
              }

              return {
                catalogTask,
                type: "sc_task",
                message: `Successfully retrieved catalog task ${catalogTask.number}`,
              };
            }
          }

          // No prefix detected or Case/Incident prefix → continue with normal flow
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
              const formattedFallback = formatIncidentForLLM(incident);
              if (formattedFallback) {
                return {
                  summary: formattedFallback.summary,
                  rawData: formattedFallback.rawData,
                };
              }

              return {
                rawData: incident,
              };
            }

            return {
              case: null,
              message: `Case ${normalizedNumber} was not found in ServiceNow. This case number may be incorrect or the case may not exist in the system.`,
            };
          }

          // Automatically fetch journal entries for context and Block Kit display
          let journalEntries: any[] = [];
          try {
            const extractedSysId = extractReference(caseRecord.sys_id);
            if (extractedSysId) {
              updateStatus?.(`is fetching recent activity for case ${normalizedNumber}...`);
              journalEntries = (await serviceNowClient.getCaseJournal(
                extractedSysId,
                { limit: 20 }, // Fetch latest 20 for rich context (increased from 5)
                snContext,
              )) ?? [];
              console.log(`[ServiceNow Tool] Fetched ${journalEntries.length} journal entries for context`);
            }
          } catch (error) {
            console.warn(`[ServiceNow Tool] Failed to fetch journal for ${normalizedNumber}:`, error);
            // Continue without journal entries
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
              // Return raw case data with attachments for LLM to analyze
              return {
                case: caseRecord,
                journals: journalEntries,
                _attachmentBlocks: imageBlocks,
                _attachmentCount: imageBlocks.length,
              };
            }
          }

          // Return raw case data for LLM to analyze directly
          return {
            case: caseRecord,
            journals: journalEntries,
          };
        }

        if (action === "getCaseJournal") {
          if (!caseSysId && !number) {
            throw new Error(
              "Provide either caseSysId or number to retrieve journal entries.",
            );
          }

          let sysId = caseSysId ?? null;
          let normalizedJournalNumber: string | null = null;

          if (!sysId && number) {
            normalizedJournalNumber = normalizeNumber(number, false);
            const caseRecord = await serviceNowClient.getCase(normalizedJournalNumber, snContext);

            if (!caseRecord) {
              return {
                entries: [],
                message: `Case ${normalizedJournalNumber} was not found in ServiceNow.`,
              };
            }

            const extractedSysId = extractReference(caseRecord.sys_id);

            sysId = extractedSysId ?? null;
            if (!sysId) {
              return {
                entries: [],
                message: `Unable to access sys_id for case ${normalizedJournalNumber}.`,
              };
            }
          }

          const journalReference = normalizedJournalNumber ?? number ?? caseSysId;
          updateStatus?.(`is fetching journal entries for ${journalReference}...`);

          const journal = (await serviceNowClient.getCaseJournal(
            sysId!,
            { limit: limit ?? 20 },
            snContext,
          )) ?? [];

          // Use shared formatter for consistent formatting
          const formatted = formatJournalEntriesForLLM(journal, journalReference);

          return {
            summary: formatted?.summary,
            rawData: formatted?.rawData,
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
          if (!ciName && !ipAddress && !ciSysId && !ciClassName && !companyName && !ciLocation && !ciOwnerGroup && !ciEnvironment && !ciOperationalStatus) {
            throw new Error(
              "At least one search criterion must be provided: ciName, ipAddress, ciSysId, ciClassName, companyName, ciLocation, ciOwnerGroup, ciEnvironment, or ciOperationalStatus.",
            );
          }

          updateStatus?.(`is searching configuration items...`);

          const results = (await serviceNowClient.searchConfigurationItems(
            {
              name: ciName,
              ipAddress,
              sysId: ciSysId,
              className: ciClassName,
              company: companyName,
              operationalStatus: ciOperationalStatus,
              location: ciLocation,
              ownerGroup: ciOwnerGroup,
              environment: ciEnvironment,
              limit: limit ?? 10,
            },
            snContext,
          )) ?? [];

          const formatted = formatConfigurationItemsForLLM(results);

          return {
            summary: formatted?.summary,
            rawData: formatted?.rawData,
          };
        }

        if (action === "getCIRelationships") {
          if (!ciSysId) {
            throw new Error(
              "ciSysId is required to get CI relationships. Use searchConfigurationItem first to find the CI and get its sys_id.",
            );
          }

          updateStatus?.(`is fetching CI relationships...`);

          const relatedCIs = (await serviceNowClient.getCIRelationships(
            {
              ciSysId,
              relationshipType,
              limit: limit ?? 50,
            },
            snContext,
          )) ?? [];

          const formatted = formatConfigurationItemsForLLM(relatedCIs);

          return {
            summary: formatted?.summary,
            rawData: formatted?.rawData,
            relationshipCount: relatedCIs.length,
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
            sysDomain: domain,
            includeChildDomains,
            sortBy,
            sortOrder,
          };

          const results = (await serviceNowClient.searchCustomerCases(filters, snContext)) ?? [];

          // Build filter descriptions for formatter
          const appliedFilters: string[] = [];
          if (query) appliedFilters.push(`query="${query}"`);
          if (accountName) appliedFilters.push(`account=${accountName}`);
          if (companyName) appliedFilters.push(`company=${companyName}`);
          if (priority) appliedFilters.push(`priority=${priority}`);
          if (state) appliedFilters.push(`state=${state}`);
          if (assignmentGroup) appliedFilters.push(`group=${assignmentGroup}`);
          if (assignedTo) appliedFilters.push(`assigned_to=${assignedTo}`);
          if (activeOnly) appliedFilters.push(`active=true`);
          if (domain) appliedFilters.push(`domain=${domain}${includeChildDomains ? ' (with children)' : ''}`);

          const formatted = formatSearchResultsForLLM(results, appliedFilters, results.length);

          return {
            summary: formatted?.summary,
            results: results,
            total: results.length,
            filters: appliedFilters,
          };
        }

        if (action === "searchProjects") {
          updateStatus?.(`is searching SPM projects${projectName ? ` for "${projectName}"` : ""}...`);

          const criteria: any = {
            limit: limit ?? 25,
            sortBy: 'opened_at',
            sortOrder: 'desc',
          };

          if (projectName) {
            criteria.query = projectName;
          }
          if (projectState) {
            criteria.state = projectState;
          }
          if (projectPriority) {
            criteria.priority = projectPriority;
          }
          if (projectManager) {
            criteria.projectManager = projectManager;
          }
          if (projectActiveOnly !== undefined) {
            criteria.activeOnly = projectActiveOnly;
          }

          const searchResults = await serviceNowClient.searchSPMProjects(criteria, snContext);

          return {
            projects: searchResults.projects,
            totalCount: searchResults.totalCount,
            filters: criteria,
            message: `Found ${searchResults.totalCount} project(s) matching criteria`,
          };
        }

        if (action === "getProject") {
          if (!projectNumber) {
            throw new Error(
              "projectNumber is required to retrieve a ServiceNow project.",
            );
          }

          updateStatus?.(`is looking up project ${projectNumber} in ServiceNow...`);

          const project = await serviceNowClient.getSPMProject(projectNumber, snContext);
          if (!project) {
            return {
              project: null,
              message: `Project ${projectNumber} was not found in ServiceNow. This project number may be incorrect or the project may not exist in the system.`,
            };
          }

          return {
            project,
            message: `Successfully retrieved project ${project.number}: ${project.shortDescription}`,
          };
        }

        if (action === "getProjectEpics") {
          if (!projectSysId) {
            throw new Error(
              "projectSysId is required to retrieve project epics.",
            );
          }

          updateStatus?.(`is fetching epics for project...`);

          const epics = await serviceNowClient.getSPMProjectEpics(projectSysId, snContext);

          return {
            epics,
            totalCount: epics.length,
            message: `Found ${epics.length} epic(s) for this project`,
          };
        }

        if (action === "getProjectStories") {
          if (!projectSysId) {
            throw new Error(
              "projectSysId is required to retrieve project stories.",
            );
          }

          updateStatus?.(`is fetching stories for project...`);

          const stories = await serviceNowClient.getSPMProjectStories(projectSysId, snContext);

          return {
            stories,
            totalCount: stories.length,
            message: `Found ${stories.length} story/stories for this project`,
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
