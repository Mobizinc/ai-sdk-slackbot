import { ServiceNowHttpClient } from "../client/http-client";
import { detectTableFromPrefix } from "../../../utils/case-number-normalizer";
import { getHttpClient } from "./factory";
import { parseServiceNowDate, extractDisplayValue } from "../client/mappers";
import type { JournalEntry } from "../types/domain-models";

export interface UnifiedTask {
  sysId: string;
  number: string;
  shortDescription: string;
  description?: string;
  state: string;
  priority?: string;
  assignedTo?: string;
  assignmentGroup?: string;
  sysCreatedOn?: Date;
  sysUpdatedOn?: Date;
  url: string;
  table: string;
}

export interface TaskWithJournals {
  task: UnifiedTask;
  journals: JournalEntry[];
}

export class ServiceNowTaskRepository {
  constructor(private readonly httpClient: ServiceNowHttpClient = getHttpClient()) {}

  /**
   * Fetch a task and its recent journals in parallel.
   * Supports Incident, Case, RITM, Request, Change, Problem, etc.
   */
  async getTaskAndJournals(number: string, journalLimit = 10): Promise<TaskWithJournals | null> {
    const detection = detectTableFromPrefix(number);
    
    if (!detection) {
        console.warn(`[UnifiedTaskRepo] Could not detect table for number: ${number}`);
        return null;
    }

    const tableName = detection.table;

    // Fetch Task
    // We use a generic query to get common fields
    const taskFields = [
        "sys_id", "number", "short_description", "description", 
        "state", "priority", "assigned_to", "assignment_group",
        "sys_created_on", "sys_updated_on"
    ].join(",");

    const taskResponsePromise = this.httpClient.get<any>(
      `/api/now/table/${tableName}`,
      {
        sysparm_query: `number=${number}`,
        sysparm_limit: 1,
        sysparm_display_value: "all",
        sysparm_fields: taskFields,
        sysparm_exclude_reference_link: "true"
      }
    );

    // We can't fetch journals yet because we need the sys_id.
    // However, to be truly "fast", we might want to avoid sequential calls if possible.
    // But standard ServiceNow API requires sys_id for journal queries usually (element_id).
    // So we have to wait for the task first.
    // UNLESS we search sys_journal_field by filtering on the task number? No, it links via sys_id (element_id).
    
    const taskResponse = await taskResponsePromise;
    const taskRecord = Array.isArray(taskResponse.result) ? taskResponse.result[0] : taskResponse.result;

    if (!taskRecord) {
        return null;
    }

    const sysId = taskRecord.sys_id?.value || taskRecord.sys_id; // Handle display_value object or string

    // Fetch Journals
    const journalPromise = this.httpClient.get<any>(
      `/api/now/table/sys_journal_field`,
      {
        sysparm_query: `element_id=${sysId}^ORDERBYDESCsys_created_on`,
        sysparm_limit: journalLimit,
        sysparm_fields: "sys_id,element,element_id,name,sys_created_on,sys_created_by,value",
        sysparm_display_value: "all",
      }
    );

    const journalResponse = await journalPromise;
    const journalRecords = Array.isArray(journalResponse.result) ? journalResponse.result : [journalResponse.result];

    const journals: JournalEntry[] = journalRecords.map((record: any) => ({
      sysId: record.sys_id || "",
      element: record.element || "",
      elementId: extractDisplayValue(record.element_id) || "",
      name: typeof record.name === "object" ? record.name.display_value : record.name,
      createdOn: parseServiceNowDate(record.sys_created_on) ?? new Date(),
      createdBy: typeof record.sys_created_by === "object"
        ? record.sys_created_by.display_value
        : (record.sys_created_by || ""),
      value: typeof record.value === "object" ? record.value.display_value : record.value,
    }));

    const task: UnifiedTask = {
        sysId: sysId,
        number: extractDisplayValue(taskRecord.number),
        shortDescription: extractDisplayValue(taskRecord.short_description),
        description: extractDisplayValue(taskRecord.description),
        state: extractDisplayValue(taskRecord.state),
        priority: extractDisplayValue(taskRecord.priority),
        assignedTo: extractDisplayValue(taskRecord.assigned_to),
        assignmentGroup: extractDisplayValue(taskRecord.assignment_group),
        sysCreatedOn: parseServiceNowDate(taskRecord.sys_created_on),
        sysUpdatedOn: parseServiceNowDate(taskRecord.sys_updated_on),
        table: tableName,
        url: `${this.httpClient.getInstanceUrl()}/nav_to.do?uri=${tableName}.do?sys_id=${sysId}`
    };

    return { task, journals };
  }
}

let unifiedRepositoryInstance: ServiceNowTaskRepository | null = null;

export function getUnifiedTaskRepository(): ServiceNowTaskRepository {
    if (!unifiedRepositoryInstance) {
        unifiedRepositoryInstance = new ServiceNowTaskRepository();
    }
    return unifiedRepositoryInstance;
}
