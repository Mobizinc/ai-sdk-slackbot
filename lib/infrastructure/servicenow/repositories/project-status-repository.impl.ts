/**
 * Project Status Repository Implementation
 *
 * Implements ProjectStatusRepository interface using ServiceNowHttpClient
 * Queries the project_status table for project health reporting
 */

import type { ServiceNowHttpClient } from "../client/http-client";
import type { ProjectStatusRepository } from "./project-status-repository.interface";
import type {
  ProjectStatus,
  ProjectWithStatus,
  ProjectStatusSearchCriteria,
  HealthStatus,
  SPMProject,
} from "../types/domain-models";
import { extractDisplayValue, extractSysId, parseServiceNowDate } from "../client/mappers";
import { ServiceNowNotFoundError } from "../errors";
import { cacheGet, cacheSet } from "../../../cache/redis";
import { config } from "../../../config";
import { getSPMRepository } from "./factory";

const PROJECT_STATUS_TABLE = "project_status";
const CACHE_TTL = 300; // 5 minutes for status data (more dynamic than projects)

/**
 * ServiceNow Project Status Repository Implementation
 */
export class ServiceNowProjectStatusRepository implements ProjectStatusRepository {
  constructor(private readonly httpClient: ServiceNowHttpClient) {}

  /**
   * Find a project status by its sys_id
   */
  async findBySysId(sysId: string): Promise<ProjectStatus | null> {
    const cacheKey = `sn:project_status:${sysId}`;
    const cached = await cacheGet<ProjectStatus>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.httpClient.get<any>(
        `/api/now/table/${PROJECT_STATUS_TABLE}/${sysId}`,
        { sysparm_display_value: "all" }
      );

      const record = Array.isArray(response.result) ? response.result[0] : response.result;
      if (!record) return null;

      const mapped = this.mapProjectStatus(record);
      await cacheSet(cacheKey, mapped, CACHE_TTL);
      return mapped;
    } catch (error) {
      if (error instanceof ServiceNowNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Find a project status by its number
   */
  async findByNumber(number: string): Promise<ProjectStatus | null> {
    const cacheKey = `sn:project_status:number:${number}`;
    const cached = await cacheGet<ProjectStatus>(cacheKey);
    if (cached) return cached;

    const response = await this.httpClient.get<any>(
      `/api/now/table/${PROJECT_STATUS_TABLE}`,
      {
        sysparm_query: `number=${number}`,
        sysparm_limit: 1,
        sysparm_display_value: "all",
      }
    );

    if (!response.result || (Array.isArray(response.result) && response.result.length === 0)) {
      return null;
    }

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    const mapped = this.mapProjectStatus(record);
    await cacheSet(cacheKey, mapped, CACHE_TTL);
    return mapped;
  }

  /**
   * Search for project status reports matching criteria
   */
  async search(criteria: ProjectStatusSearchCriteria): Promise<{
    statuses: ProjectStatus[];
    totalCount: number;
  }> {
    const queryParts: string[] = [];

    // Sort configuration
    const sortField = criteria.sortBy || "as_on";
    const sortDirection = criteria.sortOrder === "asc" ? "" : "DESC";
    queryParts.push(`ORDERBY${sortDirection}${sortField}`);

    // Apply filters
    if (criteria.projectSysId) {
      queryParts.push(`project=${criteria.projectSysId}`);
    }
    if (criteria.overallHealth) {
      queryParts.push(`overall_health=${criteria.overallHealth}`);
    }
    if (criteria.scheduleHealth) {
      queryParts.push(`schedule=${criteria.scheduleHealth}`);
    }
    if (criteria.costHealth) {
      queryParts.push(`cost=${criteria.costHealth}`);
    }
    if (criteria.scopeHealth) {
      queryParts.push(`scope=${criteria.scopeHealth}`);
    }
    if (criteria.resourcesHealth) {
      queryParts.push(`resources=${criteria.resourcesHealth}`);
    }
    if (criteria.statusDateAfter) {
      queryParts.push(`as_on>=${criteria.statusDateAfter.toISOString().split("T")[0]}`);
    }
    if (criteria.statusDateBefore) {
      queryParts.push(`as_on<=${criteria.statusDateBefore.toISOString().split("T")[0]}`);
    }

    const query = queryParts.filter(Boolean).join("^");
    const limit = criteria.limit ?? 25;
    const offset = criteria.offset ?? 0;

    // Get total count first
    const countResponse = await this.httpClient.get<any>(
      `/api/now/table/${PROJECT_STATUS_TABLE}`,
      {
        sysparm_query: query,
        sysparm_count: true,
        sysparm_limit: 0,
      }
    );
    const totalCount = parseInt(
      countResponse.result?.length?.toString() ||
        (countResponse as any)["x-total-count"] ||
        "0",
      10
    );

    // Get actual results
    const response = await this.httpClient.get<any>(
      `/api/now/table/${PROJECT_STATUS_TABLE}`,
      {
        sysparm_query: query,
        sysparm_limit: limit,
        sysparm_offset: offset,
        sysparm_display_value: "all",
      }
    );

    const records = Array.isArray(response.result) ? response.result : [response.result].filter(Boolean);
    const statuses = records.map((r: any) => this.mapProjectStatus(r));

    return { statuses, totalCount: totalCount || records.length };
  }

  /**
   * Find projects by health status
   * This is the main query for "show me green projects"
   */
  async findProjectsByHealth(
    health: HealthStatus,
    activeOnly: boolean = true,
    limit: number = 25
  ): Promise<ProjectWithStatus[]> {
    const cacheKey = `sn:projects_by_health:${health}:${activeOnly}:${limit}`;
    const cached = await cacheGet<ProjectWithStatus[]>(cacheKey);
    if (cached) return cached;

    // Step 1: Get latest status for each project with the specified health
    // We need to get the latest status per project, then filter by health
    // Using a subquery approach: get project_status records ordered by as_on desc
    const statusResponse = await this.httpClient.get<any>(
      `/api/now/table/${PROJECT_STATUS_TABLE}`,
      {
        sysparm_query: `overall_health=${health}^ORDERBYDESCas_on`,
        sysparm_limit: limit * 2, // Get extra to handle duplicates
        sysparm_display_value: "all",
        sysparm_fields: "sys_id,number,project,overall_health,schedule,cost,scope,resources,as_on,phase,state",
      }
    );

    const statusRecords = Array.isArray(statusResponse.result)
      ? statusResponse.result
      : [statusResponse.result].filter(Boolean);

    if (statusRecords.length === 0) {
      return [];
    }

    // Step 2: Deduplicate by project (keep only latest status per project)
    const projectStatusMap = new Map<string, any>();
    for (const status of statusRecords) {
      const projectSysId = extractSysId(status.project);
      if (projectSysId && !projectStatusMap.has(projectSysId)) {
        projectStatusMap.set(projectSysId, status);
      }
    }

    // Step 3: Get project details for each unique project
    const projectSysIds = Array.from(projectStatusMap.keys()).slice(0, limit);
    if (projectSysIds.length === 0) {
      return [];
    }

    const spmRepo = getSPMRepository();
    const results: ProjectWithStatus[] = [];

    for (const projectSysId of projectSysIds) {
      const project = await spmRepo.findBySysId(projectSysId);
      if (!project) continue;

      // If activeOnly, skip closed projects
      if (activeOnly && this.isProjectClosed(project.state)) {
        continue;
      }

      const statusRecord = projectStatusMap.get(projectSysId);
      const projectWithStatus: ProjectWithStatus = {
        ...project,
        latestStatus: {
          overallHealth: this.parseHealth(statusRecord.overall_health),
          scheduleHealth: this.parseHealth(statusRecord.schedule),
          costHealth: this.parseHealth(statusRecord.cost),
          scopeHealth: this.parseHealth(statusRecord.scope),
          resourcesHealth: this.parseHealth(statusRecord.resources),
          statusDate: parseServiceNowDate(statusRecord.as_on) ?? new Date(),
          statusNumber: extractDisplayValue(statusRecord.number),
        },
      };

      results.push(projectWithStatus);

      if (results.length >= limit) break;
    }

    await cacheSet(cacheKey, results, CACHE_TTL);
    return results;
  }

  /**
   * Get the latest status for a project
   */
  async getLatestStatusForProject(projectSysId: string): Promise<ProjectStatus | null> {
    const cacheKey = `sn:project_status:latest:${projectSysId}`;
    const cached = await cacheGet<ProjectStatus>(cacheKey);
    if (cached) return cached;

    const response = await this.httpClient.get<any>(
      `/api/now/table/${PROJECT_STATUS_TABLE}`,
      {
        sysparm_query: `project=${projectSysId}^ORDERBYDESCas_on`,
        sysparm_limit: 1,
        sysparm_display_value: "all",
      }
    );

    if (!response.result || (Array.isArray(response.result) && response.result.length === 0)) {
      return null;
    }

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    const mapped = this.mapProjectStatus(record);
    await cacheSet(cacheKey, mapped, CACHE_TTL);
    return mapped;
  }

  /**
   * Get status history for a project
   */
  async getStatusHistory(projectSysId: string, limit: number = 10): Promise<ProjectStatus[]> {
    const response = await this.httpClient.get<any>(
      `/api/now/table/${PROJECT_STATUS_TABLE}`,
      {
        sysparm_query: `project=${projectSysId}^ORDERBYDESCas_on`,
        sysparm_limit: limit,
        sysparm_display_value: "all",
      }
    );

    const records = Array.isArray(response.result)
      ? response.result
      : [response.result].filter(Boolean);

    return records.map((r: any) => this.mapProjectStatus(r));
  }

  /**
   * Get summary count of projects by health status
   */
  async getHealthSummary(): Promise<{
    green: number;
    yellow: number;
    red: number;
    noStatus: number;
  }> {
    const cacheKey = "sn:project_status:health_summary";
    const cached = await cacheGet<{ green: number; yellow: number; red: number; noStatus: number }>(cacheKey);
    if (cached) return cached;

    // Get count of latest status per health type
    // This is approximate - counts all statuses, not just latest per project
    const [greenResp, yellowResp, redResp] = await Promise.all([
      this.httpClient.get<any>(`/api/now/table/${PROJECT_STATUS_TABLE}`, {
        sysparm_query: "overall_health=green",
        sysparm_count: true,
        sysparm_limit: 0,
      }),
      this.httpClient.get<any>(`/api/now/table/${PROJECT_STATUS_TABLE}`, {
        sysparm_query: "overall_health=yellow",
        sysparm_count: true,
        sysparm_limit: 0,
      }),
      this.httpClient.get<any>(`/api/now/table/${PROJECT_STATUS_TABLE}`, {
        sysparm_query: "overall_health=red",
        sysparm_count: true,
        sysparm_limit: 0,
      }),
    ]);

    const summary = {
      green: parseInt((greenResp as any)["x-total-count"] || "0", 10),
      yellow: parseInt((yellowResp as any)["x-total-count"] || "0", 10),
      red: parseInt((redResp as any)["x-total-count"] || "0", 10),
      noStatus: 0, // Would need separate query to count projects without status
    };

    await cacheSet(cacheKey, summary, CACHE_TTL);
    return summary;
  }

  /**
   * Map ServiceNow project_status record to domain model
   */
  private mapProjectStatus(record: any): ProjectStatus {
    const sysId = extractSysId(record.sys_id) || record.sys_id || "";
    const instanceUrl = this.httpClient.getInstanceUrl();

    return {
      sysId,
      number: extractDisplayValue(record.number),
      projectSysId: extractSysId(record.project) || "",
      projectName: extractDisplayValue(record.project),
      overallHealth: this.parseHealth(record.overall_health),
      scheduleHealth: this.parseHealth(record.schedule),
      costHealth: this.parseHealth(record.cost),
      scopeHealth: this.parseHealth(record.scope),
      resourcesHealth: this.parseHealth(record.resources),
      state: extractDisplayValue(record.state),
      phase: extractDisplayValue(record.phase),
      statusDate: parseServiceNowDate(record.as_on) ?? new Date(),
      createdOn: parseServiceNowDate(record.sys_created_on) ?? new Date(),
      createdBy: extractDisplayValue(record.sys_created_by),
      url: `${instanceUrl}/project_status.do?sys_id=${sysId}`,
    };
  }

  /**
   * Parse health value to typed HealthStatus
   */
  private parseHealth(value: any): HealthStatus {
    const v = extractDisplayValue(value)?.toLowerCase();
    if (v === "green" || v === "yellow" || v === "red") {
      return v as HealthStatus;
    }
    return "green"; // Default to green if unknown
  }

  /**
   * Check if project state is closed
   */
  private isProjectClosed(state: string): boolean {
    const closedStates = ["Closed Complete", "Closed Incomplete", "Closed Cancelled", "0", "1", "2"];
    return closedStates.some((s) => state === s || state?.includes("Closed"));
  }
}
