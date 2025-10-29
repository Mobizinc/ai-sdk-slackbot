/**
 * Service Catalog Repository Implementation
 *
 * Implements ServiceCatalogRepository and ServiceManagementRepository interfaces
 */

import type { ServiceNowHttpClient } from "../client/http-client";
import type {
  ServiceCatalogRepository,
  ServiceManagementRepository,
  CatalogSearchCriteria,
  ServiceOffering,
  BusinessService,
  ApplicationService,
} from "./catalog-repository.interface";
import type { CatalogItem } from "../types/domain-models";
import type { CatalogItemRecord } from "../types/api-responses";
import { mapCatalogItem, extractDisplayValue } from "../client/mappers";
import { ServiceNowNotFoundError } from "../errors";

/**
 * ServiceNow Catalog Repository Implementation
 */
export class ServiceNowCatalogRepository implements ServiceCatalogRepository, ServiceManagementRepository {
  private readonly catalogItemTable = "sc_cat_item";
  private readonly serviceOfferingTable = "service_offering";
  private readonly businessServiceTable = "cmdb_ci_service_business";
  private readonly applicationServiceTable = "cmdb_ci_service_discovered";

  constructor(private readonly httpClient: ServiceNowHttpClient) {}

  /**
   * Find a catalog item by name
   */
  async findByName(name: string): Promise<CatalogItem | null> {
    const response = await this.httpClient.get<CatalogItemRecord>(
      `/api/now/table/${this.catalogItemTable}`,
      {
        sysparm_query: `name=${name}^active=true`,
        sysparm_limit: 1,
        sysparm_display_value: "all",
      },
    );

    if (!response.result || (Array.isArray(response.result) && response.result.length === 0)) {
      return null;
    }

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    return mapCatalogItem(record, this.httpClient.getInstanceUrl());
  }

  /**
   * Find a catalog item by sys_id
   */
  async findBySysId(sysId: string): Promise<CatalogItem | null> {
    try {
      const response = await this.httpClient.get<CatalogItemRecord>(
        `/api/now/table/${this.catalogItemTable}/${sysId}`,
        {
          sysparm_display_value: "all",
        },
      );

      const record = Array.isArray(response.result) ? response.result[0] : response.result;
      if (!record) {
        return null;
      }

      return mapCatalogItem(record, this.httpClient.getInstanceUrl());
    } catch (error) {
      if (error instanceof ServiceNowNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Search for catalog items matching criteria
   */
  async search(criteria: CatalogSearchCriteria): Promise<CatalogItem[]> {
    const queryParts: string[] = [];

    // Filter by active status (default to active only)
    if (criteria.active !== false) {
      queryParts.push('active=true');
    }

    // Filter by category
    if (criteria.category) {
      queryParts.push(`category.nameLIKE${criteria.category}`);
    }

    // Keyword search in name and short description
    if (criteria.keywords && criteria.keywords.length > 0) {
      const keywordQuery = criteria.keywords
        .map(keyword => `nameLIKE${keyword}^ORshort_descriptionLIKE${keyword}`)
        .join('^OR');
      queryParts.push(`(${keywordQuery})`);
    }

    const query = queryParts.length > 0 ? queryParts.join('^') : 'active=true';

    const response = await this.httpClient.get<CatalogItemRecord>(
      `/api/now/table/${this.catalogItemTable}`,
      {
        sysparm_query: query,
        sysparm_limit: criteria.limit ?? 10,
        sysparm_display_value: "all",
        sysparm_fields: "sys_id,name,short_description,description,category,active,order",
      },
    );

    const records = Array.isArray(response.result) ? response.result : [response.result];
    return records.map((record) => mapCatalogItem(record, this.httpClient.getInstanceUrl()));
  }

  /**
   * Find active catalog items
   */
  async findActive(limit = 100): Promise<CatalogItem[]> {
    return this.search({ active: true, limit });
  }

  /**
   * Find a service offering by name
   */
  async findServiceOfferingByName(name: string): Promise<ServiceOffering | null> {
    const response = await this.httpClient.get<any>(
      `/api/now/table/${this.serviceOfferingTable}`,
      {
        sysparm_query: `name=${name}`,
        sysparm_limit: 1,
        sysparm_display_value: "all",
      },
    );

    if (!response.result || (Array.isArray(response.result) && response.result.length === 0)) {
      return null;
    }

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    const sysId = extractDisplayValue(record.sys_id);

    return {
      sysId,
      name: extractDisplayValue(record.name),
      url: `${this.httpClient.getInstanceUrl()}/nav_to.do?uri=${this.serviceOfferingTable}.do?sys_id=${sysId}`,
    };
  }

  /**
   * Find a business service by name
   */
  async findBusinessServiceByName(name: string): Promise<BusinessService | null> {
    const response = await this.httpClient.get<any>(
      `/api/now/table/${this.businessServiceTable}`,
      {
        sysparm_query: `name=${name}`,
        sysparm_limit: 1,
        sysparm_display_value: "all",
      },
    );

    if (!response.result || (Array.isArray(response.result) && response.result.length === 0)) {
      return null;
    }

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    const sysId = extractDisplayValue(record.sys_id);

    return {
      sysId,
      name: extractDisplayValue(record.name),
      url: `${this.httpClient.getInstanceUrl()}/nav_to.do?uri=${this.businessServiceTable}.do?sys_id=${sysId}`,
    };
  }

  /**
   * Find an application service by name
   */
  async findApplicationServiceByName(name: string): Promise<ApplicationService | null> {
    const response = await this.httpClient.get<any>(
      `/api/now/table/${this.applicationServiceTable}`,
      {
        sysparm_query: `name=${name}`,
        sysparm_limit: 1,
        sysparm_display_value: "all",
        sysparm_fields: "sys_id,name,parent",
      },
    );

    if (!response.result || (Array.isArray(response.result) && response.result.length === 0)) {
      return null;
    }

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    const sysId = extractDisplayValue(record.sys_id);

    return {
      sysId,
      name: extractDisplayValue(record.name),
      parentName: extractDisplayValue(record.parent),
      url: `${this.httpClient.getInstanceUrl()}/nav_to.do?uri=${this.applicationServiceTable}.do?sys_id=${sysId}`,
    };
  }

  /**
   * Find application services for a company
   */
  async findApplicationServicesByCompany(
    companySysId: string,
    options?: { parentServiceOffering?: string; limit?: number },
  ): Promise<ApplicationService[]> {
    const queryParts = [`company=${companySysId}`];

    // Filter by parent service offering if provided
    if (options?.parentServiceOffering) {
      queryParts.push(`parent.name=${options.parentServiceOffering}`);
    }

    const query = queryParts.join('^');

    const response = await this.httpClient.get<any>(
      `/api/now/table/${this.applicationServiceTable}`,
      {
        sysparm_query: query,
        sysparm_limit: options?.limit ?? 100,
        sysparm_display_value: "all",
        sysparm_fields: "sys_id,name,parent",
      },
    );

    const records = Array.isArray(response.result) ? response.result : [response.result];
    return records.map((record: any) => {
      const sysId = extractDisplayValue(record.sys_id);
      return {
        sysId,
        name: extractDisplayValue(record.name),
        parentName: extractDisplayValue(record.parent),
        url: `${this.httpClient.getInstanceUrl()}/nav_to.do?uri=${this.applicationServiceTable}.do?sys_id=${sysId}`,
      };
    });
  }
}
