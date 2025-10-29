/**
 * Service Catalog Repository Interface
 *
 * Provides a collection-oriented interface for Service Catalog operations
 */

import type { CatalogItem } from "../types/domain-models";

/**
 * Criteria for searching catalog items
 */
export interface CatalogSearchCriteria {
  category?: string;
  keywords?: string[];
  active?: boolean;
  limit?: number;
}

/**
 * Repository interface for Service Catalog entity operations
 */
export interface ServiceCatalogRepository {
  /**
   * Find a catalog item by name
   */
  findByName(name: string): Promise<CatalogItem | null>;

  /**
   * Find a catalog item by sys_id
   */
  findBySysId(sysId: string): Promise<CatalogItem | null>;

  /**
   * Search for catalog items matching criteria
   */
  search(criteria: CatalogSearchCriteria): Promise<CatalogItem[]>;

  /**
   * Find active catalog items
   */
  findActive(limit?: number): Promise<CatalogItem[]>;
}

/**
 * Service Offering (part of Service Catalog)
 */
export interface ServiceOffering {
  sysId: string;
  name: string;
  url: string;
}

/**
 * Business Service (part of CMDB/Service Catalog)
 */
export interface BusinessService {
  sysId: string;
  name: string;
  url: string;
}

/**
 * Application Service (part of CMDB)
 */
export interface ApplicationService {
  sysId: string;
  name: string;
  parentName?: string;
  url: string;
}

/**
 * Repository interface for Service Management entities
 * Includes Service Offerings, Business Services, Application Services
 */
export interface ServiceManagementRepository {
  /**
   * Find a service offering by name
   */
  findServiceOfferingByName(name: string): Promise<ServiceOffering | null>;

  /**
   * Find a business service by name
   */
  findBusinessServiceByName(name: string): Promise<BusinessService | null>;

  /**
   * Find an application service by name
   */
  findApplicationServiceByName(name: string): Promise<ApplicationService | null>;

  /**
   * Find application services for a company
   */
  findApplicationServicesByCompany(
    companySysId: string,
    options?: { parentServiceOffering?: string; limit?: number },
  ): Promise<ApplicationService[]>;
}
