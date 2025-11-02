import type { ServiceNowHttpClient } from "../client/http-client";
import type { CMDBRepository } from "./cmdb-repository.interface";
import type { ConfigurationItem, CISearchCriteria } from "../types/domain-models";
import type { ConfigurationItemRecord } from "../types/api-responses";
import { mapConfigurationItem } from "../client/mappers";

export interface CMDBRepositoryConfig {
  table: string;
}

export class ServiceNowCMDBRepository implements CMDBRepository {
  private readonly table: string;

  constructor(
    private readonly httpClient: ServiceNowHttpClient,
    config?: Partial<CMDBRepositoryConfig>,
  ) {
    this.table = config?.table ?? "cmdb_ci";
  }

  async findByName(name: string): Promise<ConfigurationItem | null> {
    const results = await this.search({ name, limit: 1 });
    return results.length > 0 ? results[0] : null;
  }

  async findBySysId(sysId: string): Promise<ConfigurationItem | null> {
    const response = await this.httpClient.get<ConfigurationItemRecord>(
      `/api/now/table/${this.table}/${sysId}`,
      {
        sysparm_display_value: "all",
      },
    );

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    if (!record) {
      return null;
    }

    return mapConfigurationItem(record, this.httpClient.getInstanceUrl());
  }

  async findByIpAddress(ipAddress: string): Promise<ConfigurationItem[]> {
    return this.search({ ipAddress });
  }

  async findByFqdn(fqdn: string): Promise<ConfigurationItem[]> {
    return this.search({ fqdn });
  }

  async search(criteria: CISearchCriteria): Promise<ConfigurationItem[]> {
    const queryParts: string[] = [];

    if (criteria.sysId) {
      queryParts.push(`sys_id=${criteria.sysId}`);
    }

    if (criteria.name) {
      queryParts.push(
        `nameLIKE${criteria.name}^ORfqdnLIKE${criteria.name}^ORhost_nameLIKE${criteria.name}`,
      );
    }

    if (criteria.ipAddress) {
      queryParts.push(
        `ip_addressLIKE${criteria.ipAddress}^ORu_ip_addressLIKE${criteria.ipAddress}`,
      );
    }

    if (criteria.fqdn) {
      queryParts.push(`fqdnLIKE${criteria.fqdn}^ORu_fqdnLIKE${criteria.fqdn}`);
    }

    if (criteria.className) {
      queryParts.push(`sys_class_name=${criteria.className}`);
    }

    if (criteria.ownerGroup) {
      queryParts.push(`owner=${criteria.ownerGroup}`);
    }

    if (criteria.environment) {
      queryParts.push(`u_environment=${criteria.environment}`);
    }

    if (queryParts.length === 0) {
      throw new Error("At least one search criterion must be provided for CMDB search.");
    }

    const query = queryParts.join("^");

    const response = await this.httpClient.get<ConfigurationItemRecord>(
      `/api/now/table/${this.table}`,
      {
        sysparm_query: query,
        sysparm_display_value: "all",
        sysparm_limit: criteria.limit ?? 25,
      },
    );

    const records = Array.isArray(response.result) ? response.result : [response.result];
    return records
      .filter(Boolean)
      .map((record) => mapConfigurationItem(record, this.httpClient.getInstanceUrl()));
  }

  async findByClassName(className: string, limit = 25): Promise<ConfigurationItem[]> {
    return this.search({ className, limit });
  }

  async linkToCase(): Promise<void> {
    throw new Error("linkToCase is not implemented in the CMDB repository.");
  }

  async findLinkedToCaseItem(): Promise<ConfigurationItem[]> {
    return [];
  }

  async findByOwnerGroup(ownerGroupSysId: string, limit = 25): Promise<ConfigurationItem[]> {
    return this.search({ ownerGroup: ownerGroupSysId, limit });
  }

  async findByEnvironment(environment: string, limit = 25): Promise<ConfigurationItem[]> {
    return this.search({ environment, limit });
  }

  async getRelatedCIs(ciSysId: string, relationshipType?: string): Promise<ConfigurationItem[]> {
    // Query cmdb_rel_ci table for relationships
    const queryParts = [`parent=${ciSysId}^ORchild=${ciSysId}`];

    if (relationshipType) {
      queryParts.push(`type.name=${relationshipType}`);
    }

    const query = queryParts.join("^");

    const response = await this.httpClient.get<any>(
      `/api/now/table/cmdb_rel_ci`,
      {
        sysparm_query: query,
        sysparm_display_value: "all",
        sysparm_limit: 50,
      },
    );

    const records = Array.isArray(response.result) ? response.result : [response.result];
    const relatedCiSysIds = records
      .filter(Boolean)
      .map((rel) => {
        // Get the "other" CI (if we're parent, get child; if we're child, get parent)
        const parentSysId = rel.parent?.value || rel.parent;
        const childSysId = rel.child?.value || rel.child;
        return parentSysId === ciSysId ? childSysId : parentSysId;
      })
      .filter(Boolean);

    // Fetch full CI details for related CIs
    const relatedCIs: ConfigurationItem[] = [];
    for (const sysId of relatedCiSysIds) {
      try {
        const ci = await this.findBySysId(sysId);
        if (ci) {
          relatedCIs.push(ci);
        }
      } catch (error) {
        console.warn(`[CMDB Repository] Failed to fetch related CI ${sysId}:`, error);
      }
    }

    return relatedCIs;
  }
}
