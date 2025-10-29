/**
 * CMDB Repository Interface
 *
 * Provides a collection-oriented interface for Configuration Item (CI) operations
 */

import type { ConfigurationItem, CISearchCriteria } from "../types/domain-models";

/**
 * Repository interface for Configuration Item (CI) entity operations
 */
export interface CMDBRepository {
  /**
   * Find a CI by its name
   */
  findByName(name: string): Promise<ConfigurationItem | null>;

  /**
   * Find a CI by its sys_id
   */
  findBySysId(sysId: string): Promise<ConfigurationItem | null>;

  /**
   * Find CIs by IP address
   */
  findByIpAddress(ipAddress: string): Promise<ConfigurationItem[]>;

  /**
   * Find CIs by FQDN (Fully Qualified Domain Name)
   */
  findByFqdn(fqdn: string): Promise<ConfigurationItem[]>;

  /**
   * Search for CIs matching criteria
   */
  search(criteria: CISearchCriteria): Promise<ConfigurationItem[]>;

  /**
   * Find CIs by class name (e.g., "cmdb_ci_server", "cmdb_ci_computer")
   */
  findByClassName(className: string, limit?: number): Promise<ConfigurationItem[]>;

  /**
   * Link a CI to a case
   */
  linkToCase(ciSysId: string, caseSysId: string): Promise<void>;

  /**
   * Get CIs linked to a case
   */
  findLinkedToCaseItem(caseSysId: string): Promise<ConfigurationItem[]>;

  /**
   * Find CIs owned by a specific group
   */
  findByOwnerGroup(ownerGroupSysId: string, limit?: number): Promise<ConfigurationItem[]>;

  /**
   * Find CIs by environment (e.g., "production", "development")
   */
  findByEnvironment(environment: string, limit?: number): Promise<ConfigurationItem[]>;
}
