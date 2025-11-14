import type { ServiceNowHttpClient } from "../client/http-client";
import type { CMDBRepository } from "./cmdb-repository.interface";
import type {
  ConfigurationItem,
  CISearchCriteria,
  CreateConfigurationItemInput,
  CreateCIRelationshipInput,
} from "../types/domain-models";
import type { ConfigurationItemRecord, ServiceNowTableResponse } from "../types/api-responses";
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
        `ip_addressLIKE${criteria.ipAddress}^ORu_ip_addressLIKE${criteria.ipAddress}^ORfqdnLIKE${criteria.ipAddress}`,
      );
    }

    if (criteria.fqdn) {
      queryParts.push(`fqdnLIKE${criteria.fqdn}^ORu_fqdnLIKE${criteria.fqdn}`);
    }

    if (criteria.className) {
      queryParts.push(`sys_class_name=${criteria.className}`);
    }

    if (criteria.company) {
      queryParts.push(`company.nameLIKE${criteria.company}`);
    }

    if (criteria.ownerGroup) {
      queryParts.push(`owner=${criteria.ownerGroup}`);
    }

    if (criteria.environment) {
      queryParts.push(`u_environment=${criteria.environment}`);
    }

    if (criteria.operationalStatus) {
      queryParts.push(`operational_status=${criteria.operationalStatus}`);
    }

    if (criteria.location) {
      queryParts.push(`locationLIKE${criteria.location}`);
    }

    if (queryParts.length === 0) {
      throw new Error("At least one search criterion must be provided for CMDB search. Broad queries require additional filters (location, environment, owner group, company).");
    }

    // Limit maximum results to prevent overly broad queries
    const limit = criteria.limit ?? 10;
    const maxLimit = 50;
    const effectiveLimit = Math.min(limit, maxLimit);

    const query = queryParts.join("^");

    const response = await this.httpClient.get<ConfigurationItemRecord>(
      `/api/now/table/${this.table}`,
      {
        sysparm_query: query,
        sysparm_display_value: "all",
        sysparm_limit: effectiveLimit,
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

  async create(input: CreateConfigurationItemInput): Promise<ConfigurationItem> {
    const table = input.className?.trim() || this.table;
    const payload: Record<string, any> = {
      name: input.name,
      short_description: input.shortDescription,
      ip_address: input.ipAddress,
      u_environment: input.environment,
      owner: input.ownerGroup,
      support_group: input.supportGroup,
      location: input.location,
      operational_status: input.status,
      install_status: input.installStatus,
      company: input.company,
    };

    if (table === "cmdb_ci" && input.className) {
      payload.sys_class_name = input.className;
    }

    if (input.attributes) {
      for (const [key, value] of Object.entries(input.attributes)) {
        if (typeof value === "string" && value.length > 0) {
          payload[key] = value;
        }
      }
    }

    // Remove undefined / empty string values
    for (const key of Object.keys(payload)) {
      if (
        payload[key] === undefined ||
        payload[key] === null ||
        payload[key] === ""
      ) {
        delete payload[key];
      }
    }

    const response = await this.httpClient.request<ServiceNowTableResponse<ConfigurationItemRecord>>(
      `/api/now/table/${table}`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    if (!record?.sys_id) {
      throw new Error("Failed to create configuration item in ServiceNow.");
    }

    const created = await this.findBySysId(record.sys_id);
    if (!created) {
      throw new Error(`Configuration item ${record.sys_id} created but not retrievable.`);
    }

    return created;
  }

  async createRelationship(input: CreateCIRelationshipInput): Promise<{ sysId: string }> {
    if (!input.parentSysId || !input.childSysId) {
      throw new Error("Both parentSysId and childSysId are required to create a CI relationship.");
    }

    const payload: Record<string, any> = {
      parent: input.parentSysId,
      child: input.childSysId,
    };

    if (input.relationshipType) {
      payload.type = input.relationshipType;
    }

    const response = await this.httpClient.request<ServiceNowTableResponse<{ sys_id: string }>>(
      `/api/now/table/cmdb_rel_ci`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    if (!record?.sys_id) {
      throw new Error("Failed to create CI relationship in ServiceNow.");
    }

    return { sysId: record.sys_id };
  }
}
