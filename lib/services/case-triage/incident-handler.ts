import type { ServiceNowCaseWebhook } from "../../schemas/servicenow-webhook";
import type { ServiceNowContext } from "../../infrastructure/servicenow-context";
import type { CaseClassification } from "../case-classifier";
import { serviceNowClient } from "../../tools/servicenow";
import { getIncidentEnrichmentRepository } from "../../db/repositories/incident-enrichment-repository";

export interface IncidentHandlingResult {
  incidentCreated: boolean;
  incidentNumber?: string;
  incidentSysId?: string;
  incidentUrl?: string;
  problemCreated: boolean;
  problemNumber?: string;
  problemSysId?: string;
  problemUrl?: string;
}

interface IncidentHandlingParams {
  suggestion: CaseClassification["record_type_suggestion"] | undefined;
  classificationResult: CaseClassification;
  webhook: ServiceNowCaseWebhook;
  snContext: ServiceNowContext;
}

interface RequiredIncidentHandlingParams {
  suggestion: NonNullable<CaseClassification["record_type_suggestion"]>;
  classificationResult: CaseClassification;
  webhook: ServiceNowCaseWebhook;
  snContext: ServiceNowContext;
}

/**
 * Handles record type suggestions (Incident / Problem / Change) returned by the classifier.
 * Creates the appropriate ITSM records and keeps the parent case in sync.
 */
export async function handleRecordTypeSuggestion({
  suggestion,
  classificationResult,
  webhook,
  snContext,
}: IncidentHandlingParams): Promise<IncidentHandlingResult> {
  const result: IncidentHandlingResult = {
    incidentCreated: false,
    problemCreated: false,
  };

  if (!suggestion) {
    return result;
  }

  console.log(
    `[Case Triage] Record type suggested: ${suggestion.type}` +
      `${suggestion.type === "Incident" ? ` (Major: ${suggestion.is_major_incident})` : ""}`,
  );

  try {
    if (suggestion.type === "Incident") {
      const incidentHandling = await createIncidentFromCase({
        suggestion,
        classificationResult,
        webhook,
        snContext,
      });

      Object.assign(result, incidentHandling);
    } else if (suggestion.type === "Problem") {
      const problemHandling = await createProblemFromCase({
        suggestion,
        classificationResult,
        webhook,
        snContext,
      });

      Object.assign(result, problemHandling);
    } else if (suggestion.type === "Change") {
      console.log(
        `[Case Triage] Change suggested for ${webhook.case_number} - manual Change Management process required`,
      );
    }
  } catch (error) {
    console.error("[Case Triage] Failed to handle record type suggestion:", error);
  }

  return result;
}

async function createIncidentFromCase({
  suggestion,
  classificationResult,
  webhook,
  snContext,
}: RequiredIncidentHandlingParams): Promise<IncidentHandlingResult> {
  const result: IncidentHandlingResult = {
    incidentCreated: false,
    problemCreated: false,
  };

  try {
    const incidentCategory = classificationResult.incident_category || classificationResult.category;
    const incidentSubcategory =
      classificationResult.incident_subcategory || classificationResult.subcategory;

    console.log(
      `[Case Triage] Creating Incident with category: ${incidentCategory}` +
        `${incidentSubcategory ? ` > ${incidentSubcategory}` : ""}` +
        `${classificationResult.incident_category ? " (incident-specific)" : " (fallback to case category)"}`,
    );

    let businessServiceSysId = webhook.business_service;
    if (classificationResult.service_offering) {
      try {
        console.log(
          `[Case Triage] Looking up Service Offering: "${classificationResult.service_offering}"`,
        );
        const serviceOffering = await serviceNowClient.getServiceOffering(
          classificationResult.service_offering,
          snContext,
        );
        if (serviceOffering) {
          businessServiceSysId = serviceOffering.sys_id;
          console.log(
            `[Case Triage] Linked Service Offering: ${serviceOffering.name} (${serviceOffering.sys_id})`,
          );
        } else {
          console.warn(
            `[Case Triage] Service Offering "${classificationResult.service_offering}" not found in ServiceNow`,
          );
        }
      } catch (error) {
        console.error(`[Case Triage] Failed to lookup Service Offering:`, error);
      }
    }

    // CALLER ID RESOLUTION: Resolve caller sys_id if webhook sends display value
    let callerSysId = webhook.caller_id;

    // If caller_id doesn't look like a sys_id (32 chars), fetch from case record
    if (webhook.caller_id && webhook.caller_id.length !== 32) {
      try {
        console.log(
          `[Case Triage] caller_id appears to be display value ("${webhook.caller_id}"), ` +
          `fetching case record for proper sys_id`
        );

        const caseRecord = await serviceNowClient.getCaseBySysId(webhook.sys_id, snContext);
        if (caseRecord?.caller_id) {
          callerSysId = caseRecord.caller_id;
          console.log(`[Case Triage] Resolved caller_id from case: ${callerSysId}`);
        } else {
          console.warn(`[Case Triage] Case record has no caller_id, continuing with webhook value`);
        }
      } catch (error) {
        console.error(`[Case Triage] Failed to fetch case record for caller_id:`, error);
        // Continue with original webhook value
      }
    }

    // FIELD VALIDATION: Warn about potential issues before incident creation
    const validationWarnings: string[] = [];

    if (!callerSysId || callerSysId.length !== 32) {
      validationWarnings.push(`caller_id invalid or missing: "${callerSysId}"`);
    }

    if (!incidentCategory) {
      validationWarnings.push(`incident category missing`);
    }

    if (validationWarnings.length > 0) {
      console.warn(
        `[Case Triage] Incident creation validation warnings:\n` +
        validationWarnings.map(w => `  - ${w}`).join('\n')
      );
    }

    const incidentResult = await serviceNowClient.createIncidentFromCase(
      {
        caseSysId: webhook.sys_id,
        caseNumber: webhook.case_number,
        category: incidentCategory,
        subcategory: incidentSubcategory,
        shortDescription: webhook.short_description,
        description: webhook.description,
        urgency: webhook.urgency,
        priority: webhook.priority,
        callerId: callerSysId, // Use resolved caller_id
        assignmentGroup: webhook.assignment_group,
        assignedTo: webhook.assigned_to,
        isMajorIncident: suggestion.is_major_incident,
        company: webhook.company,
        account: webhook.account || webhook.account_id,
        businessService: businessServiceSysId,
        location: webhook.location,
        contact: webhook.contact,
        contactType: webhook.contact_type,
        openedBy: webhook.opened_by,
        cmdbCi: webhook.cmdb_ci || webhook.configuration_item,
        sysDomain: webhook.sys_domain,
        sysDomainPath: webhook.sys_domain_path,
      },
      snContext,
    );

    result.incidentCreated = true;
    result.incidentNumber = incidentResult.incident_number;
    result.incidentSysId = incidentResult.incident_sys_id;
    result.incidentUrl = incidentResult.incident_url;

    await serviceNowClient.updateCase(
      webhook.sys_id,
      {
        incident: incidentResult.incident_sys_id,
      },
      snContext,
    );

    const workNote =
      `🚨 ${suggestion.is_major_incident ? "MAJOR " : ""}INCIDENT CREATED\n\n` +
      `Incident: ${incidentResult.incident_number}\n` +
      `Reason: ${suggestion.reasoning}\n\n` +
      `Category: ${classificationResult.category}` +
      `${classificationResult.subcategory ? ` > ${classificationResult.subcategory}` : ""}\n\n` +
      `${suggestion.is_major_incident ? "⚠️ MAJOR INCIDENT - Immediate escalation required\n\n" : ""}` +
      `Link: ${incidentResult.incident_url}`;

    await serviceNowClient.addCaseWorkNote(webhook.sys_id, workNote, true, snContext);

    console.log(
      `[Case Triage] Created ${suggestion.is_major_incident ? "MAJOR " : ""}` +
        `Incident ${incidentResult.incident_number} from Case ${webhook.case_number}`,
    );

    // Add incident to enrichment watchlist
    if (process.env.ENABLE_INCIDENT_ENRICHMENT === "true") {
      try {
        const repository = getIncidentEnrichmentRepository();
        await repository.recordIncident({
          incidentSysId: incidentResult.incident_sys_id,
          incidentNumber: incidentResult.incident_number,
          caseSysId: webhook.sys_id,
          caseNumber: webhook.case_number,
          enrichmentStage: "created",
          matchedCis: [],
          extractedEntities: {},
          confidenceScores: {},
          lastProcessedAt: new Date(),
          metadata: {
            // Store Slack context if available
            slack_channel_id: (webhook.metadata as any)?.slack_channel_id,
            slack_thread_ts: (webhook.metadata as any)?.slack_thread_ts,
            assignment_group: webhook.assignment_group,
            account: webhook.account || webhook.account_id,
          },
        });

        console.log(
          `[Case Triage] Added incident ${incidentResult.incident_number} to enrichment watchlist`
        );
      } catch (error) {
        console.error(
          `[Case Triage] Failed to add incident ${incidentResult.incident_number} to enrichment watchlist:`,
          error
        );
        // Don't fail incident creation if watchlist insertion fails
      }
    }
  } catch (error) {
    console.error("[Case Triage] Failed to create Incident:", error);
  }

  return result;
}

async function createProblemFromCase({
  suggestion,
  classificationResult,
  webhook,
  snContext,
}: RequiredIncidentHandlingParams): Promise<IncidentHandlingResult> {
  const result: IncidentHandlingResult = {
    incidentCreated: false,
    problemCreated: false,
  };

  try {
    const problemCategory = classificationResult.incident_category || classificationResult.category;
    const problemSubcategory =
      classificationResult.incident_subcategory || classificationResult.subcategory;

    console.log(
      `[Case Triage] Creating Problem with category: ${problemCategory}` +
        `${problemSubcategory ? ` > ${problemSubcategory}` : ""}` +
        `${classificationResult.incident_category ? " (incident-specific)" : " (fallback to case category)"}`,
    );

    let businessServiceSysId = webhook.business_service;
    if (classificationResult.service_offering) {
      try {
        console.log(
          `[Case Triage] Looking up Service Offering: "${classificationResult.service_offering}"`,
        );
        const serviceOffering = await serviceNowClient.getServiceOffering(
          classificationResult.service_offering,
          snContext,
        );
        if (serviceOffering) {
          businessServiceSysId = serviceOffering.sys_id;
          console.log(
            `[Case Triage] Linked Service Offering: ${serviceOffering.name} (${serviceOffering.sys_id})`,
          );
        } else {
          console.warn(
            `[Case Triage] Service Offering "${classificationResult.service_offering}" not found in ServiceNow`,
          );
        }
      } catch (error) {
        console.error(`[Case Triage] Failed to lookup Service Offering:`, error);
      }
    }

    const problemResult = await serviceNowClient.createProblemFromCase(
      {
        caseSysId: webhook.sys_id,
        caseNumber: webhook.case_number,
        category: problemCategory,
        subcategory: problemSubcategory,
        shortDescription: webhook.short_description,
        description: webhook.description,
        urgency: webhook.urgency,
        priority: webhook.priority,
        callerId: webhook.caller_id,
        assignmentGroup: webhook.assignment_group,
        assignedTo: webhook.assigned_to,
        firstReportedBy: webhook.sys_id,
        company: webhook.company,
        account: webhook.account || webhook.account_id,
        businessService: businessServiceSysId,
        location: webhook.location,
        contact: webhook.contact,
        contactType: webhook.contact_type,
        openedBy: webhook.opened_by,
        cmdbCi: webhook.cmdb_ci || webhook.configuration_item,
        sysDomain: webhook.sys_domain,
        sysDomainPath: webhook.sys_domain_path,
      },
      snContext,
    );

    result.problemCreated = true;
    result.problemNumber = problemResult.problem_number;
    result.problemSysId = problemResult.problem_sys_id;
    result.problemUrl = problemResult.problem_url;

    await serviceNowClient.updateCase(
      webhook.sys_id,
      {
        problem: problemResult.problem_sys_id,
      },
      snContext,
    );

    const workNote =
      `🔍 PROBLEM CREATED\n\n` +
      `Problem: ${problemResult.problem_number}\n` +
      `Reason: ${suggestion.reasoning}\n\n` +
      `Category: ${classificationResult.category}` +
      `${classificationResult.subcategory ? ` > ${classificationResult.subcategory}` : ""}\n\n` +
      `Link: ${problemResult.problem_url}`;

    await serviceNowClient.addCaseWorkNote(webhook.sys_id, workNote, true, snContext);

    console.log(`[Case Triage] Created Problem ${problemResult.problem_number} from Case ${webhook.case_number}`);
  } catch (error) {
    console.error("[Case Triage] Failed to create Problem:", error);
  }

  return result;
}
