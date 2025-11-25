/**
 * Get Incident Tool
 *
 * Single-purpose tool for retrieving a specific ServiceNow incident by its number.
 * Replaces the `servicenow_action` with action="getIncident"
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "../../shared";
import { getIncidentRepository } from "../../../../infrastructure/servicenow/repositories";
import { getCaseRepository } from "../../../../infrastructure/servicenow/repositories";
import { createServiceNowContext } from "../../../../infrastructure/servicenow-context";
import { normalizeCaseId, findMatchingCaseNumber } from "../../../../utils/case-number-normalizer";
import { formatIncidentForLLM } from "../../../../services/servicenow-formatters";
import { fetchAttachments } from "../shared/attachment-utils";
import {
  createErrorResult,
  createSuccessResult,
  ServiceNowErrorCodes,
} from "../shared/types";

/**
 * Input schema for get_incident tool
 */
const GetIncidentInputSchema = z.object({
  number: z
    .string()
    .describe(
      "Incident number to retrieve (e.g., INC0168060, or just 168060). The tool will automatically normalize the format."
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

export type GetIncidentInput = z.infer<typeof GetIncidentInputSchema>;

/**
 * Get Incident Tool
 *
 * Retrieves a specific ServiceNow incident by its number.
 */
export function createGetIncidentTool(params: AgentToolFactoryParams) {
  const { updateStatus, options, caseNumbers } = params;

  return createTool({
    name: "get_incident",
    description:
      "Retrieve a specific ServiceNow incident by its number. " +
      "Returns incident details including description, state, priority, assignment, " +
      "and optionally image attachments for troubleshooting.\n\n" +
      "**Use this tool when:**\n" +
      "- User mentions an incident number with INC prefix (e.g., 'show me INC0168060')\n" +
      "- User asks for incident details\n" +
      "- You need to check incident status or assignment\n\n" +
      "**IMPORTANT:**\n" +
      "- INC prefix (e.g., INC0168060) → ALWAYS use this tool ONLY\n" +
      "- For case numbers (SCS/CS prefix), use get_case tool instead\n" +
      "- For searching multiple incidents, use search_incidents tool\n" +
      "- Once you successfully retrieve the incident, you have complete information - do not make additional redundant calls\n\n" +
      "**Attachments:** When includeAttachments=true, returns visual content (screenshots, diagrams). " +
      "Useful for troubleshooting UI errors or viewing monitoring dashboards. Increases token usage 3000-10000 per incident. " +
      "Only enable when visual analysis is critical.",

    inputSchema: GetIncidentInputSchema,

    execute: async ({
      number,
      includeAttachments,
      maxAttachments,
    }: GetIncidentInput) => {
      try {
        // First, try to find matching canonical case number from context
        const matched = findMatchingCaseNumber(number, caseNumbers);
        const normalizedNumber = matched || normalizeCaseId("INC", number);

        console.log(
          `[get_incident] Looking up incident: "${number}" → "${normalizedNumber}"` +
            (matched ? " (canonical match)" : " (normalized)")
        );

        updateStatus?.(`is looking up incident ${normalizedNumber}...`);

        // Create ServiceNow context for routing
        const snContext = createServiceNowContext(undefined, options?.channelId);

        // Fetch incident from repository
        const incidentRepo = getIncidentRepository();
        const incident = await incidentRepo.findByNumber(normalizedNumber);

        // If not found, try fallback to case table
        if (!incident) {
          console.log(
            `[get_incident] Incident ${normalizedNumber} not found, trying case table as fallback...`
          );
          updateStatus?.(`is looking up ${normalizedNumber} in case table...`);

          // Try normalizing as a case number for fallback
          const normalizedCaseNumber = matched || normalizeCaseId("SCS", number);
          const caseRepo = getCaseRepository();
          const caseRecord = await caseRepo.findByNumber(normalizedCaseNumber);

          if (caseRecord) {
            console.log(
              `[get_incident] Found ${normalizedCaseNumber} in case table (fallback from incident)`
            );
            // Return case data instead - user likely meant to use get_case
            return createSuccessResult({
              case: {
                number: caseRecord.number,
                shortDescription: caseRecord.shortDescription,
                description: caseRecord.description,
                state: caseRecord.state,
                priority: caseRecord.priority,
                assignedTo: caseRecord.assignedTo,
                assignmentGroup: caseRecord.assignmentGroup,
                url: caseRecord.url,
              },
              message: `Note: ${normalizedNumber} was not found as an incident. Found it as case ${normalizedCaseNumber} instead. Use get_case tool for case records.`,
            });
          }

          return createErrorResult(
            ServiceNowErrorCodes.NOT_FOUND,
            `Incident ${normalizedNumber} was not found in ServiceNow. ` +
              `This incident number may be incorrect or the incident may not exist in the system. ` +
              `Verified in both incident table (INC prefix) and case table (SCS prefix).`,
            { requestedNumber: number, normalizedNumber }
          );
        }

        console.log(
          `[get_incident] Found incident ${incident.number}: ${incident.shortDescription}`
        );

        // Format incident for LLM consumption
        const formatted = formatIncidentForLLM({
          number: incident.number,
          sys_id: incident.sysId,
          short_description: incident.shortDescription,
          description: incident.description,
          state: incident.state,
          priority: incident.priority,
          assigned_to: incident.assignedTo,
          assignment_group: incident.assignmentGroup,
          company: incident.company,
          caller_id: incident.callerId,
          category: incident.category,
          subcategory: incident.subcategory,
          business_service: incident.businessService,
          cmdb_ci: incident.cmdbCi,
          sys_created_on: incident.sysCreatedOn?.toISOString(),
          sys_updated_on: incident.sysUpdatedOn?.toISOString(),
          url: incident.url,
        });

        // Handle attachments if requested
        let attachmentBlocks: unknown[] = [];
        if (includeAttachments) {
          updateStatus?.(`is fetching attachments for incident ${incident.number}...`);
          attachmentBlocks = await fetchAttachments(
            "incident",
            incident.sysId,
            includeAttachments,
            maxAttachments
          );
          console.log(
            `[get_incident] Fetched ${attachmentBlocks.length} attachments for incident ${incident.number}`
          );
        }

        return createSuccessResult(
          {
            incident: {
              number: incident.number,
              shortDescription: incident.shortDescription,
              description: incident.description,
              state: incident.state,
              priority: incident.priority,
              assignedTo: incident.assignedTo,
              assignmentGroup: incident.assignmentGroup,
              category: incident.category,
              subcategory: incident.subcategory,
              company: incident.company,
              businessService: incident.businessService,
              cmdbCi: incident.cmdbCi,
              openedAt: incident.sysCreatedOn?.toISOString(),
              updatedAt: incident.sysUpdatedOn?.toISOString(),
              url: incident.url,
            },
            summary: formatted?.summary,
            rawData: formatted?.rawData,
          },
          attachmentBlocks.length > 0 ? attachmentBlocks : undefined
        );
      } catch (error) {
        console.error("[get_incident] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error
            ? error.message
            : "Failed to retrieve incident from ServiceNow",
          { number }
        );
      }
    },
  });
}
