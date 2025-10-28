import type { ServiceNowHttpClient } from "../client/http-client";
import type { ProblemRepository } from "./problem-repository.interface";
import type { CreateProblemInput, Problem } from "../types/domain-models";
import type { ProblemRecord } from "../types/api-responses";
import { mapProblem } from "../client/mappers";

export class ServiceNowProblemRepository implements ProblemRepository {
  constructor(private readonly httpClient: ServiceNowHttpClient) {}

  async createFromCase(caseSysId: string, input: CreateProblemInput): Promise<Problem> {
    const payload: Record<string, any> = {
      short_description: input.shortDescription,
      description: input.description ?? input.shortDescription,
      parent: caseSysId,
      urgency: input.urgency ?? "3",
      priority: input.priority ?? "3",
    };

    if (input.category) payload.category = input.category;
    if (input.subcategory) payload.subcategory = input.subcategory;
    if (input.assignmentGroup) payload.assignment_group = input.assignmentGroup;
    if (input.assignedTo) payload.assigned_to = input.assignedTo;
    if (input.caller) payload.caller_id = input.caller;
    if (input.firstReportedBy) payload.first_reported_by_task = input.firstReportedBy;

    if (input.company) payload.company = input.company;
    if (input.account) payload.account = input.account;
    if (input.businessService) payload.business_service = input.businessService;
    if (input.location) payload.location = input.location;

    if (input.contact) payload.contact = input.contact;
    if (input.contactType) payload.contact_type = input.contactType;
    if (input.openedBy) payload.opened_by = input.openedBy;

    if (input.cmdbCi) payload.cmdb_ci = input.cmdbCi;

    if (input.sysDomain) payload.sys_domain = input.sysDomain;
    if (input.sysDomainPath) payload.sys_domain_path = input.sysDomainPath;

    if (input.caseNumber) {
      payload.work_notes = `Automatically created from Case ${input.caseNumber} via AI triage system. ITSM record type classification determined this requires root cause analysis via problem management.`;
    }

    const response = await this.httpClient.post<ProblemRecord>(
      "/api/now/table/problem",
      payload,
    );

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    return mapProblem(record, this.httpClient.getInstanceUrl());
  }
}
