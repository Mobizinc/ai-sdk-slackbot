import type { ServiceNowHttpClient } from "../client/http-client";
import type { AssignmentGroupRepository } from "./assignment-group-repository.interface";
import type { AssignmentGroup } from "../types/domain-models";
import type { AssignmentGroupRecord } from "../types/api-responses";
import { mapAssignmentGroup } from "../client/mappers";

export class ServiceNowAssignmentGroupRepository implements AssignmentGroupRepository {
  private readonly groupTable = "sys_user_group";

  constructor(private readonly httpClient: ServiceNowHttpClient) {}

  async findAll(limit = 200): Promise<AssignmentGroup[]> {
    const response = await this.httpClient.get<AssignmentGroupRecord>(
      `/api/now/table/${this.groupTable}`,
      {
        sysparm_query: "active=true^ORDERBYname",
        sysparm_fields: "sys_id,name,description,manager,active",
        sysparm_display_value: "all",
        sysparm_limit: limit,
      }
    );

    const records = Array.isArray(response.result) ? response.result : [response.result];
    return records
      .filter(record => record && record.sys_id)
      .map(record => mapAssignmentGroup(record, this.httpClient.getInstanceUrl()));
  }

  async findBySysId(sysId: string): Promise<AssignmentGroup | null> {
    try {
      const response = await this.httpClient.get<AssignmentGroupRecord>(
        `/api/now/table/${this.groupTable}/${sysId}`,
        {
          sysparm_fields: "sys_id,name,description,manager,active",
          sysparm_display_value: "all",
        }
      );

      const record = Array.isArray(response.result) ? response.result[0] : response.result;
      if (!record) return null;

      return mapAssignmentGroup(record, this.httpClient.getInstanceUrl());
    } catch (error) {
      console.error(`[AssignmentGroupRepository] Error finding group by sys_id ${sysId}:`, error);
      return null;
    }
  }

  async findByName(name: string): Promise<AssignmentGroup | null> {
    try {
      const response = await this.httpClient.get<AssignmentGroupRecord>(
        `/api/now/table/${this.groupTable}`,
        {
          sysparm_query: `name=${name}^active=true`,
          sysparm_fields: "sys_id,name,description,manager,active",
          sysparm_display_value: "all",
          sysparm_limit: 1,
        }
      );

      const records = Array.isArray(response.result) ? response.result : [response.result];
      const record = records[0];
      if (!record) return null;

      return mapAssignmentGroup(record, this.httpClient.getInstanceUrl());
    } catch (error) {
      console.error(`[AssignmentGroupRepository] Error finding group by name "${name}":`, error);
      return null;
    }
  }
}
