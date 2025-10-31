/**
 * Case Triage Formatters
 *
 * Work note generation and formatting utilities for case triage operations.
 */

import type { CaseClassificationResult } from "../case-classifier";
import type { RecordCreationResult } from "./types";

// Re-export main work note formatter
export { formatWorkNote } from "../work-note-formatter";

/**
 * Format work note for incident creation
 *
 * @param incidentNumber - Created incident number
 * @param incidentUrl - ServiceNow incident URL
 * @param suggestion - Record type suggestion from classification
 * @param classification - Full classification result
 * @returns Formatted work note text
 */
export function formatIncidentWorkNote(
  incidentNumber: string,
  incidentUrl: string,
  suggestion: { is_major_incident: boolean; reasoning: string },
  classification: CaseClassificationResult
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
 * @param problemNumber - Created problem number
 * @param problemUrl - ServiceNow problem URL
 * @param suggestion - Record type suggestion from classification
 * @param classification - Full classification result
 * @returns Formatted work note text
 */
export function formatProblemWorkNote(
  problemNumber: string,
  problemUrl: string,
  suggestion: { reasoning: string },
  classification: CaseClassificationResult
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
