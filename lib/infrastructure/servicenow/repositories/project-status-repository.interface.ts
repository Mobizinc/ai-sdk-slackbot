/**
 * Project Status Repository Interface
 *
 * Provides a collection-oriented interface for Project Status operations,
 * abstracting ServiceNow REST API details for project_status table
 */

import type {
  ProjectStatus,
  ProjectWithStatus,
  ProjectStatusSearchCriteria,
  HealthStatus,
} from "../types/domain-models";

/**
 * Repository interface for Project Status entity operations
 */
export interface ProjectStatusRepository {
  /**
   * Find a project status by its sys_id
   */
  findBySysId(sysId: string): Promise<ProjectStatus | null>;

  /**
   * Find a project status by its number (e.g., "PRJSTAT0010761")
   */
  findByNumber(number: string): Promise<ProjectStatus | null>;

  /**
   * Search for project status reports matching criteria
   * Returns statuses and total count
   */
  search(criteria: ProjectStatusSearchCriteria): Promise<{
    statuses: ProjectStatus[];
    totalCount: number;
  }>;

  /**
   * Find projects by health status (joins project_status with pm_project)
   * This is the main query for "show me green projects"
   * @param health - Overall health status to filter by
   * @param activeOnly - Only return active (non-closed) projects
   * @param limit - Maximum number of results
   */
  findProjectsByHealth(
    health: HealthStatus,
    activeOnly?: boolean,
    limit?: number
  ): Promise<ProjectWithStatus[]>;

  /**
   * Get the latest status for a project
   * @param projectSysId - Project sys_id
   */
  getLatestStatusForProject(projectSysId: string): Promise<ProjectStatus | null>;

  /**
   * Get all status history for a project (sorted by date desc)
   * @param projectSysId - Project sys_id
   * @param limit - Maximum number of results
   */
  getStatusHistory(
    projectSysId: string,
    limit?: number
  ): Promise<ProjectStatus[]>;

  /**
   * Get projects grouped by health status
   * Returns a summary count of projects per health status
   */
  getHealthSummary(): Promise<{
    green: number;
    yellow: number;
    red: number;
    noStatus: number; // Projects without any status report
  }>;
}
