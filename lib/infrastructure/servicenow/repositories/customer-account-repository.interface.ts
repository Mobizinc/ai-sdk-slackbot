import type { CustomerAccount } from "../types/domain-models";

export interface CustomerAccountRepository {
  findByNumber(number: string): Promise<CustomerAccount | null>;
  findBySysId(sysId: string): Promise<CustomerAccount | null>;
}
