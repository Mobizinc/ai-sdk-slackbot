import type { AssignmentGroup } from "../types/domain-models";

export interface AssignmentGroupRepository {
  /**
   * Find all active assignment groups
   * @param limit - Maximum number of groups to return (default 200)
   */
  findAll(limit?: number): Promise<AssignmentGroup[]>;

  /**
   * Find assignment group by sys_id
   */
  findBySysId(sysId: string): Promise<AssignmentGroup | null>;

  /**
   * Find assignment group by exact name
   */
  findByName(name: string): Promise<AssignmentGroup | null>;
}
