/**
 * Get Case Tool
 *
 * Single-purpose tool for retrieving a specific ServiceNow case by its number.
 * Replaces the `servicenow_action` with action="getCase"
 *
 * Note: This tool focuses on sn_customerservice_case table only.
 * For service catalog items (REQ, RITM, SCTASK), use the dedicated catalog tools.
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "../../shared";
import { getCaseRepository } from "../../../../infrastructure/servicenow/repositories";
import { getIncidentRepository } from "../../../../infrastructure/servicenow/repositories";
import {
  normalizeCaseId,
  findMatchingCaseNumber,
  detectTableFromPrefix,
} from "../../../../utils/case-number-normalizer";
import { fetchAttachments, extractReference } from "../shared/attachment-utils";
import {
  createErrorResult,
  createSuccessResult,
  ServiceNowErrorCodes,
} from "../shared/types";

/**
 * Input schema for get_case tool
 */
const GetCaseInputSchema = z.object({
  number: z
    .string()
    .describe(
      "Case number to retrieve (e.g., CS0012345, SCS1234567, or just 49764). The tool will automatically normalize the format."
    ),
  includeJournal: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Include recent journal entries (comments/work notes) for context. Default: true. Provides up to 20 latest entries for rich historical context."
    ),
  includeAttachments: z
    .boolean()
    .optional()
    .describe(
      "Include image attachments for visual analysis (increases token usage 3000-10000). Only use when visual analysis is critical for troubleshooting UI errors, screenshots, or system diagrams."
    ),
  maxAttachments: z
    .number()
    .min(1)
    .max(5)
    .optional()
    .describe(
      "Maximum number of attachments to retrieve (default: 3, max: 5). Each image adds ~1000-4000 tokens depending on size."
    ),
});

export type GetCaseInput = z.infer<typeof GetCaseInputSchema>;

/**
 * Get Case Tool
 *
 * Retrieves a specific ServiceNow case by its number.
 */
export function createGetCaseTool(params: AgentToolFactoryParams) {
  const { updateStatus, options, caseNumbers } = params;

  return createTool({
    name: "get_case",
    description:
      "Retrieve a specific ServiceNow case by its number. " +
      "Returns case details including description, state, priority, assignment, recent journal entries, " +
      "and optionally image attachments for troubleshooting.\n\n" +
      "**Use this tool when:**\n" +
      "- User mentions a case number with SCS/CS prefix (e.g., 'show me SCS1234567')\n" +
      "- User references a case by number only (e.g., 'details for 49764')\n" +
      "- You need to check case status, assignment, or recent activity\n\n" +
      "**IMPORTANT:**\n" +
      "- SCS/CS prefix (e.g., SCS1234567, CS0012345) → ALWAYS use this tool ONLY\n" +
      "- For incident numbers (INC prefix), use get_incident tool instead\n" +
      "- For service catalog items (REQ, RITM, SCTASK), use dedicated catalog tools\n" +
      "- Once you successfully retrieve the case, you have complete information - do not make additional redundant calls\n" +
      "- By default, includes recent journal entries (20 latest) for full context\n\n" +
      "**Attachments:** When includeAttachments=true, returns visual content (screenshots, diagrams). " +
      "Useful for troubleshooting UI errors or viewing monitoring dashboards. Increases token usage 3000-10000 per case. " +
      "Only enable when visual analysis is critical.",

    inputSchema: GetCaseInputSchema,

    execute: async ({
      number,
      includeJournal = true,
      includeAttachments,
      maxAttachments,
    }: GetCaseInput) => {
      try {
        // Detect if this is actually a service catalog item (REQ, RITM, SCTASK)
        const detectedTable = detectTableFromPrefix(number);
        if (detectedTable && detectedTable.table !== "sn_customerservice_case") {
          return createErrorResult(
            ServiceNowErrorCodes.INVALID_INPUT,
            `The number ${number} appears to be a ${detectedTable.prefix} record (table: ${detectedTable.table}). ` +
              `Please use the appropriate catalog tool instead:\n` +
              `- For REQ (service requests), use get_request tool\n` +
              `- For RITM (requested items), use get_requested_item tool\n` +
              `- For SCTASK (catalog tasks), use get_catalog_task tool`,
            { number, detectedTable }
          );
        }

        // First, try to find matching canonical case number from context
        const matched = findMatchingCaseNumber(number, caseNumbers);
        const normalizedNumber = matched || normalizeCaseId("SCS", number);

        console.log(
          `[get_case] Looking up case: "${number}" → "${normalizedNumber}"` +
            (matched ? " (canonical match)" : " (normalized)")
        );

        updateStatus?.(`is looking up case ${normalizedNumber}...`);

        // Fetch case from repository
        const caseRepo = getCaseRepository();
        const caseRecord = await caseRepo.findByNumber(normalizedNumber);

        // If not found, try fallback to incident table
        if (!caseRecord) {
          console.log(
            `[get_case] Case ${normalizedNumber} not found, trying incident table as fallback...`
          );
          updateStatus?.(`is looking up ${normalizedNumber} in incident table...`);

          // Try normalizing as an incident number for fallback
          const normalizedIncidentNumber = matched || normalizeCaseId("INC", number);
          const incidentRepo = getIncidentRepository();
          const incident = await incidentRepo.findByNumber(normalizedIncidentNumber);

          if (incident) {
            console.log(
              `[get_case] Found ${normalizedIncidentNumber} in incident table (fallback from case)`
            );
            // Return incident data instead - user likely meant to use get_incident
            return createSuccessResult({
              incident: {
                number: incident.number,
                shortDescription: incident.shortDescription,
                description: incident.description,
                state: incident.state,
                priority: incident.priority,
                assignedTo: incident.assignedTo,
                assignmentGroup: incident.assignmentGroup,
                url: incident.url,
              },
              message: `Note: ${normalizedNumber} was not found as a case. Found it as incident ${normalizedIncidentNumber} instead. Use get_incident tool for incident records.`,
            });
          }

          return createErrorResult(
            ServiceNowErrorCodes.NOT_FOUND,
            `Case ${normalizedNumber} was not found in ServiceNow. ` +
              `This case number may be incorrect or the case may not exist in the system. ` +
              `Verified in both case table (SCS/CS prefix) and incident table (INC prefix).`,
            { requestedNumber: number, normalizedNumber }
          );
        }

        console.log(
          `[get_case] Found case ${caseRecord.number}: ${caseRecord.shortDescription}`
        );

        // Fetch journal entries if requested
        let journalEntries: any[] = [];
        if (includeJournal) {
          try {
            const caseSysId = extractReference(caseRecord.sysId);
            if (caseSysId) {
              updateStatus?.(
                `is fetching recent activity for case ${caseRecord.number}...`
              );
              journalEntries =
                (await caseRepo.getJournalEntries(caseSysId, { limit: 20 })) ?? [];
              console.log(
                `[get_case] Fetched ${journalEntries.length} journal entries for context`
              );
            }
          } catch (error) {
            console.warn(
              `[get_case] Failed to fetch journal for ${caseRecord.number}:`,
              error
            );
            // Continue without journal entries
          }
        }

        // Handle attachments if requested
        let attachmentBlocks: unknown[] = [];
        if (includeAttachments) {
          updateStatus?.(
            `is fetching attachments for case ${caseRecord.number}...`
          );
          attachmentBlocks = await fetchAttachments(
            "sn_customerservice_case",
            caseRecord.sysId,
            includeAttachments,
            maxAttachments
          );
          console.log(
            `[get_case] Fetched ${attachmentBlocks.length} attachments for case ${caseRecord.number}`
          );
        }

        return createSuccessResult(
          {
            case: {
              number: caseRecord.number,
              shortDescription: caseRecord.shortDescription,
              description: caseRecord.description,
              state: caseRecord.state,
              priority: caseRecord.priority,
              impact: caseRecord.impact,
              assignedTo: caseRecord.assignedTo,
              assignmentGroup: caseRecord.assignmentGroup,
              account: caseRecord.accountName,
              company: caseRecord.companyName,
              category: caseRecord.category,
              subcategory: caseRecord.subcategory,
              contact: caseRecord.contactName,
              openedAt: caseRecord.openedAt?.toISOString(),
              updatedAt: caseRecord.updatedOn?.toISOString(),
              ageDays: caseRecord.ageDays,
              url: caseRecord.url,
            },
            journals: journalEntries,
          },
          attachmentBlocks.length > 0 ? attachmentBlocks : undefined
        );
      } catch (error) {
        console.error("[get_case] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error
            ? error.message
            : "Failed to retrieve case from ServiceNow",
          { number }
        );
      }
    },
  });
}
