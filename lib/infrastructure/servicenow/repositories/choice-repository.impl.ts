import type { ServiceNowHttpClient } from "../client/http-client";
import type { ChoiceRepository, ChoiceListOptions } from "./choice-repository.interface";
import type { Choice } from "../types/domain-models";
import type { ChoiceRecord } from "../types/api-responses";
import { mapChoice } from "../client/mappers";

export class ServiceNowChoiceRepository implements ChoiceRepository {
  constructor(private readonly httpClient: ServiceNowHttpClient) {}

  async list(options: ChoiceListOptions): Promise<Choice[]> {
    const queryParts = [`name=${options.table}`, `element=${options.element}`];

    if (options.dependentValue) {
      queryParts.push(`dependent_value=${options.dependentValue}`);
    }

    if (!options.includeInactive) {
      queryParts.push("inactive=false");
    }

    const response = await this.httpClient.get<ChoiceRecord>(
      "/api/now/table/sys_choice",
      {
        sysparm_query: queryParts.join("^"),
        sysparm_fields: "label,value,sequence,inactive,dependent_value",
        sysparm_display_value: "all",
        sysparm_limit: options.limit ?? 1000,
      },
    );

    const records = Array.isArray(response.result) ? response.result : [response.result];
    const seen = new Set<string>();
    const choices: Choice[] = [];

    for (const record of records) {
      if (!record) continue;
      const key = `${record.value}:${record.dependent_value ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      choices.push(mapChoice(record));
    }

    choices.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    return choices;
  }
}
