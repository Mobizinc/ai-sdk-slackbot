/**
 * Case Triage Formatters
 *
 * Work note generation and formatting utilities for case triage operations.
 * Provides consistent, emoji-enhanced work notes for ServiceNow record creation.
 *
 * **Format Standard:**
 * - Emoji prefix for visual identification
 * - Record number and type clearly stated
 * - AI reasoning included for transparency
 * - Category classification shown
 * - Direct link to created record
 *
 * @module case-triage/formatters
 */

import type { CaseClassification } from "../case-classifier";
import type { RecordCreationResult } from "./types";

// Re-export main work note formatter
export { formatWorkNote } from "../work-note-formatter";

/**
 * Format work note for incident creation
 *
 * Creates a formatted work note to be added to the parent Case when an
 * Incident is automatically created.
 *
 * **Output Format:**
 * ```
 * 🚨 [MAJOR ]INCIDENT CREATED
 *
 * Incident: INC0012345
 * Reason: [AI reasoning for incident creation]
 *
 * Category: Network > Wi-Fi
 *
 * [⚠️ MAJOR INCIDENT - Immediate escalation required]
 *
 * Link: https://servicenow.com/incident/...
 * ```
 *
 * @param incidentNumber - Created incident number (e.g., "INC0012345")
 * @param incidentUrl - ServiceNow incident URL
 * @param suggestion - Record type suggestion from classification
 * @param suggestion.is_major_incident - Whether incident is major (P1/P2)
 * @param suggestion.reasoning - AI explanation for incident creation
 * @param classification - Full classification result
 * @returns Formatted work note text ready for ServiceNow
 *
 * @example
 * ```typescript
 * const workNote = formatIncidentWorkNote(
 *   "INC0012345",
 *   "https://servicenow.com/incident/abc123",
 *   { is_major_incident: true, reasoning: "Network outage affecting 50+ users" },
 *   { category: "Network", subcategory: "Infrastructure" }
 * );
 *
 * await serviceNowClient.addCaseWorkNote(caseSysId, workNote, true);
 * ```
 */
export function formatIncidentWorkNote(
  incidentNumber: string,
  incidentUrl: string,
  suggestion: { is_major_incident: boolean; reasoning: string },
  classification: CaseClassification
): string {
  return (
    `🚨 ${suggestion.is_major_incident ? 'MAJOR ' : ''}INCIDENT CREATED\n\n` +
    `Incident: ${incidentNumber}\n` +
    `Reason: ${suggestion.reasoning}\n\n` +
    `Category: ${classification.category}` +
    `${classification.subcategory ? ` > ${classification.subcategory}` : ""}\n\n` +
    `${suggestion.is_major_incident ? "⚠️ MAJOR INCIDENT - Immediate escalation required\n\n" : ""}` +
    `Link: ${incidentUrl}`
  );
}

/**
 * Format work note for problem creation
 *
 * Creates a formatted work note to be added to the parent Case when a
 * Problem record is automatically created for recurring/systemic issues.
 *
 * **Output Format:**
 * ```
 * 🔍 PROBLEM CREATED
 *
 * Problem: PRB0012345
 * Reason: [AI reasoning for problem creation]
 *
 * Category: Network > Infrastructure
 *
 * Link: https://servicenow.com/problem/...
 * ```
 *
 * @param problemNumber - Created problem number (e.g., "PRB0012345")
 * @param problemUrl - ServiceNow problem URL
 * @param suggestion - Record type suggestion from classification
 * @param suggestion.reasoning - AI explanation for problem creation
 * @param classification - Full classification result with category
 * @returns Formatted work note text ready for ServiceNow
 *
 * @example
 * ```typescript
 * const workNote = formatProblemWorkNote(
 *   "PRB0012345",
 *   "https://servicenow.com/problem/xyz789",
 *   { reasoning: "Recurring authentication failures across 10+ cases in last week" },
 *   { category: "Software", subcategory: "Active Directory" }
 * );
 *
 * await serviceNowClient.addCaseWorkNote(caseSysId, workNote, true);
 * ```
 */
export function formatProblemWorkNote(
  problemNumber: string,
  problemUrl: string,
  suggestion: { reasoning: string },
  classification: CaseClassification
): string {
  return (
    `🔍 PROBLEM CREATED\n\n` +
    `Problem: ${problemNumber}\n` +
    `Reason: ${suggestion.reasoning}\n\n` +
    `Category: ${classification.category}` +
    `${classification.subcategory ? ` > ${classification.subcategory}` : ''}\n\n` +
    `Link: ${problemUrl}`
  );
}
