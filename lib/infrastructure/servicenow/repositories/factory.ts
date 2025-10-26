/**
 * Repository Factory
 *
 * Creates repository instances with proper configuration
 */

import { ServiceNowHttpClient, type ServiceNowClientConfig } from "../client/http-client";
import { ServiceNowCaseRepository, type CaseRepositoryConfig } from "./case-repository.impl";
import type { CaseRepository } from "./case-repository.interface";
import { config } from "../../../config";

/**
 * Create ServiceNowHttpClient from environment configuration
 */
export function createHttpClient(overrides?: Partial<ServiceNowClientConfig>): ServiceNowHttpClient {
  const clientConfig: ServiceNowClientConfig = {
    instanceUrl: overrides?.instanceUrl ?? config.servicenowInstanceUrl ?? config.servicenowUrl ?? "",
    username: overrides?.username ?? config.servicenowUsername,
    password: overrides?.password ?? config.servicenowPassword,
    apiToken: overrides?.apiToken ?? config.servicenowApiToken,
    defaultTimeout: overrides?.defaultTimeout ?? 30000,
    maxRetries: overrides?.maxRetries ?? 3,
    retryDelay: overrides?.retryDelay ?? 1000,
  };

  return new ServiceNowHttpClient(clientConfig);
}

/**
 * Create CaseRepository with default configuration
 */
export function createCaseRepository(
  httpClient?: ServiceNowHttpClient,
  repoConfig?: Partial<CaseRepositoryConfig>,
): CaseRepository {
  const client = httpClient ?? createHttpClient();

  const repositoryConfig: Partial<CaseRepositoryConfig> = {
    caseTable: repoConfig?.caseTable ?? config.servicenowCaseTable ?? "sn_customerservice_case",
    caseJournalTable: repoConfig?.caseJournalTable ?? "sys_journal_field",
    incidentTable: repoConfig?.incidentTable ?? "incident",
  };

  return new ServiceNowCaseRepository(client, repositoryConfig);
}

/**
 * Singleton instances for production use
 * These are created lazily and cached
 */
let httpClientInstance: ServiceNowHttpClient | undefined;
let caseRepositoryInstance: CaseRepository | undefined;

/**
 * Get shared HTTP client instance
 */
export function getHttpClient(): ServiceNowHttpClient {
  if (!httpClientInstance) {
    httpClientInstance = createHttpClient();
  }
  return httpClientInstance;
}

/**
 * Get shared CaseRepository instance
 */
export function getCaseRepository(): CaseRepository {
  if (!caseRepositoryInstance) {
    caseRepositoryInstance = createCaseRepository(getHttpClient());
  }
  return caseRepositoryInstance;
}

/**
 * Reset singleton instances (useful for testing)
 */
export function resetRepositories(): void {
  httpClientInstance = undefined;
  caseRepositoryInstance = undefined;
}
