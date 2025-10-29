import type { Choice } from "../types/domain-models";

export interface ChoiceListOptions {
  table: string;
  element: string;
  includeInactive?: boolean;
  dependentValue?: string;
  limit?: number;
}

export interface ChoiceRepository {
  list(options: ChoiceListOptions): Promise<Choice[]>;
}
