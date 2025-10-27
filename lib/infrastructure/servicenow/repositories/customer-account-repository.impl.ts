import type { ServiceNowHttpClient } from "../client/http-client";
import type { CustomerAccountRepository } from "./customer-account-repository.interface";
import type { CustomerAccount } from "../types/domain-models";
import type { CustomerAccountRecord } from "../types/api-responses";
import { mapCustomerAccount } from "../client/mappers";

export class ServiceNowCustomerAccountRepository implements CustomerAccountRepository {
  constructor(
    private readonly httpClient: ServiceNowHttpClient,
  ) {}

  async findByNumber(number: string): Promise<CustomerAccount | null> {
    const response = await this.httpClient.get<CustomerAccountRecord>(
      "/api/now/table/customer_account",
      {
        sysparm_query: `number=${number}`,
        sysparm_limit: 1,
        sysparm_display_value: "all",
      },
    );

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    if (!record) {
      return null;
    }

    return mapCustomerAccount(record, this.httpClient.getInstanceUrl());
  }

  async findBySysId(sysId: string): Promise<CustomerAccount | null> {
    const response = await this.httpClient.get<CustomerAccountRecord>(
      `/api/now/table/customer_account/${sysId}`,
      {
        sysparm_display_value: "all",
      },
    );

    const record = Array.isArray(response.result) ? response.result[0] : response.result;
    if (!record) {
      return null;
    }

    return mapCustomerAccount(record, this.httpClient.getInstanceUrl());
  }
}
