/**
 * Get Case Journal Tool
 *
 * Single-purpose tool for retrieving journal entries (comments/work notes) for a ServiceNow case.
 * Replaces the `servicenow_action` with action="getCaseJournal"
 */

import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "@/agent/tools/shared";
import { getCaseRepository } from "@/infrastructure/servicenow/repositories";
import { normalizeCaseId, findMatchingCaseNumber } from "@/utils/case-number-normalizer";
import { formatJournalEntriesForLLM } from "@/services/servicenow-formatters";
import { extractReference } from "../shared/attachment-utils";
import {
  createErrorResult,
  createSuccessResult,
  ServiceNowErrorCodes,
} from "../shared/types";

/**
 * Input schema for get_case_journal tool
 */
const GetCaseJournalInputSchema = z.object({
  caseSysId: z
    .string()
    .optional()
    .describe(
      "Case sys_id (UUID) to retrieve journal entries for. Use this if you already have the sys_id from a previous case lookup."
    ),
  number: z
    .string()
    .optional()
    .describe(
      "Case number to retrieve journal entries for (e.g., CS0012345, SCS1234567). The tool will look up the case first to get its sys_id."
    ),
  limit: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .default(20)
    .describe(
      "Maximum number of journal entries to retrieve (default: 20, max: 50). Entries are returned in reverse chronological order (newest first)."
    ),
});

export type GetCaseJournalInput = z.infer<typeof GetCaseJournalInputSchema>;

/**
 * Get Case Journal Tool
 *
 * Retrieves journal entries (comments and work notes) for a ServiceNow case.
 */
export function createGetCaseJournalTool(params: AgentToolFactoryParams) {
  const { updateStatus, caseNumbers } = params;

  return createTool({
    name: "get_case_journal",
    description:
      "Retrieve journal entries (comments and work notes) for a ServiceNow case. " +
      "Returns the communication history including customer comments, internal notes, and system updates.\n\n" +
      "**Use this tool when:**\n" +
      "- You need to see the conversation history for a case\n" +
      "- User asks for comments, notes, or recent activity on a case\n" +
      "- You want to understand what actions have been taken on a case\n" +
      "- You need more detailed context beyond what get_case provides\n\n" +
      "**IMPORTANT:**\n" +
      "- Provide either caseSysId (if you have it) OR number (case number)\n" +
      "- If you just retrieved a case with get_case, it already includes journal entries by default\n" +
      "- Only use this tool if you need MORE journal entries than get_case provides\n" +
      "- Journal entries are returned in reverse chronological order (newest first)\n" +
      "- Default limit is 20 entries, which covers most conversation histories",

    inputSchema: GetCaseJournalInputSchema,

    execute: async ({
      caseSysId,
      number,
      limit = 20,
    }: GetCaseJournalInput) => {
      try {
        if (!caseSysId && !number) {
          return createErrorResult(
            ServiceNowErrorCodes.INVALID_INPUT,
            "Either caseSysId or number must be provided to retrieve journal entries.",
            { caseSysId, number }
          );
        }

        let sysId = caseSysId ?? null;
        let normalizedNumber: string | null = null;

        // If number is provided but not sysId, look up the case first
        if (!sysId && number) {
          // First, try to find matching canonical case number from context
          const matched = findMatchingCaseNumber(number, caseNumbers);
          normalizedNumber = matched || normalizeCaseId("SCS", number);

          console.log(
            `[get_case_journal] Looking up case for journal: "${number}" → "${normalizedNumber}"` +
              (matched ? " (canonical match)" : " (normalized)")
          );

          updateStatus?.(`is looking up case ${normalizedNumber}...`);

          const caseRepo = getCaseRepository();
          const caseRecord = await caseRepo.findByNumber(normalizedNumber);

          if (!caseRecord) {
            return createErrorResult(
              ServiceNowErrorCodes.NOT_FOUND,
              `Case ${normalizedNumber} was not found in ServiceNow. ` +
                `Cannot retrieve journal entries for a case that does not exist.`,
              { requestedNumber: number, normalizedNumber }
            );
          }

          console.log(
            `[get_case_journal] Found case ${caseRecord.number}, extracting sys_id...`
          );

          const extractedSysId = extractReference(caseRecord.sysId);
          sysId = extractedSysId ?? null;

          if (!sysId) {
            return createErrorResult(
              ServiceNowErrorCodes.FETCH_ERROR,
              `Unable to access sys_id for case ${normalizedNumber}. ` +
                `The case record may be malformed.`,
              { caseNumber: normalizedNumber }
            );
          }
        }

        const journalReference = normalizedNumber ?? number ?? caseSysId ?? "unknown";
        updateStatus?.(`is fetching journal entries for ${journalReference}...`);

        // Fetch journal entries from repository
        const caseRepo = getCaseRepository();
        const journal =
          (await caseRepo.getJournalEntries(sysId!, { limit })) ?? [];

        console.log(
          `[get_case_journal] Fetched ${journal.length} journal entries for ${journalReference}`
        );

        // Convert repository format to expected format for formatter
        const formattedJournal = journal.map((entry: any) => ({
          sys_id: entry.sysId,
          element: entry.element,
          element_id: entry.elementId,
          name: entry.name,
          sys_created_on: entry.createdOn,
          sys_created_by: entry.createdBy,
          value: entry.value,
        }));

        // Use shared formatter for consistent formatting
        const formatted = formatJournalEntriesForLLM(formattedJournal, journalReference);

        return createSuccessResult({
          entries: journal,
          totalEntries: journal.length,
          caseReference: journalReference,
          summary: formatted?.summary,
          rawData: formatted?.rawData,
        });
      } catch (error) {
        console.error("[get_case_journal] Error:", error);
        return createErrorResult(
          ServiceNowErrorCodes.FETCH_ERROR,
          error instanceof Error
            ? error.message
            : "Failed to retrieve journal entries from ServiceNow",
          { caseSysId, number }
        );
      }
    },
  });
}
