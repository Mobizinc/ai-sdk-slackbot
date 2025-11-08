/**
 * Repository Factory
 *
 * Creates repository instances with proper configuration
 */

import { ServiceNowHttpClient, type ServiceNowClientConfig } from "../client/http-client";
import { ServiceNowCaseRepository, type CaseRepositoryConfig } from "./case-repository.impl";
import { ServiceNowIncidentRepository, type IncidentRepositoryConfig } from "./incident-repository.impl";
import { ServiceNowKnowledgeRepository, type KnowledgeRepositoryConfig } from "./knowledge-repository.impl";
import { ServiceNowCatalogRepository } from "./catalog-repository.impl";
import { ServiceNowCMDBRepository } from "./cmdb-repository.impl";
import { ServiceNowCustomerAccountRepository } from "./customer-account-repository.impl";
import { ServiceNowChoiceRepository } from "./choice-repository.impl";
import { ServiceNowProblemRepository } from "./problem-repository.impl";
import { ServiceNowAssignmentGroupRepository } from "./assignment-group-repository.impl";
import { ChangeRepository } from "./change-repository.impl";
import type { CaseRepository } from "./case-repository.interface";
import type { IncidentRepository } from "./incident-repository.interface";
import type { KnowledgeRepository } from "./knowledge-repository.interface";
import type { ServiceCatalogRepository, ServiceManagementRepository } from "./catalog-repository.interface";
import type { CMDBRepository } from "./cmdb-repository.interface";
import type { CustomerAccountRepository } from "./customer-account-repository.interface";
import type { ChoiceRepository } from "./choice-repository.interface";
import type { ProblemRepository } from "./problem-repository.interface";
import type { AssignmentGroupRepository } from "./assignment-group-repository.interface";
import { ServiceNowTableAPIClient } from "../client/table-api-client";
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
 * Create IncidentRepository with default configuration
 */
export function createIncidentRepository(
  httpClient?: ServiceNowHttpClient,
  repoConfig?: Partial<IncidentRepositoryConfig>,
): IncidentRepository {
  const client = httpClient ?? createHttpClient();

  const repositoryConfig: Partial<IncidentRepositoryConfig> = {
    incidentTable: repoConfig?.incidentTable ?? "incident",
  };

  return new ServiceNowIncidentRepository(client, repositoryConfig);
}

/**
 * Create KnowledgeRepository with default configuration
 */
export function createKnowledgeRepository(
  httpClient?: ServiceNowHttpClient,
  repoConfig?: Partial<KnowledgeRepositoryConfig>,
): KnowledgeRepository {
  const client = httpClient ?? createHttpClient();

  const repositoryConfig: Partial<KnowledgeRepositoryConfig> = {
    knowledgeTable: repoConfig?.knowledgeTable ?? "kb_knowledge",
  };

  return new ServiceNowKnowledgeRepository(client, repositoryConfig);
}

/**
 * Create ServiceCatalogRepository (also implements ServiceManagementRepository)
 */
export function createServiceCatalogRepository(
  httpClient?: ServiceNowHttpClient,
): ServiceCatalogRepository & ServiceManagementRepository {
  const client = httpClient ?? createHttpClient();
  return new ServiceNowCatalogRepository(client);
}

export function createCmdbRepository(
  httpClient?: ServiceNowHttpClient,
): CMDBRepository {
  const client = httpClient ?? createHttpClient();
  return new ServiceNowCMDBRepository(client);
}

export function createCustomerAccountRepository(
  httpClient?: ServiceNowHttpClient,
): CustomerAccountRepository {
  const client = httpClient ?? createHttpClient();
  return new ServiceNowCustomerAccountRepository(client);
}

export function createChoiceRepository(
  httpClient?: ServiceNowHttpClient,
): ChoiceRepository {
  const client = httpClient ?? createHttpClient();
  return new ServiceNowChoiceRepository(client);
}

export function createProblemRepository(
  httpClient?: ServiceNowHttpClient,
): ProblemRepository {
  const client = httpClient ?? createHttpClient();
  return new ServiceNowProblemRepository(client);
}

export function createAssignmentGroupRepository(
  httpClient?: ServiceNowHttpClient,
): AssignmentGroupRepository {
  const client = httpClient ?? createHttpClient();
  return new ServiceNowAssignmentGroupRepository(client);
}

/**
 * Singleton instances for production use
 * These are created lazily and cached
 */
let httpClientInstance: ServiceNowHttpClient | undefined;
let caseRepositoryInstance: CaseRepository | undefined;
let incidentRepositoryInstance: IncidentRepository | undefined;
let knowledgeRepositoryInstance: KnowledgeRepository | undefined;
let catalogRepositoryInstance: (ServiceCatalogRepository & ServiceManagementRepository) | undefined;
let cmdbRepositoryInstance: CMDBRepository | undefined;
let customerAccountRepositoryInstance: CustomerAccountRepository | undefined;
let choiceRepositoryInstance: ChoiceRepository | undefined;
let problemRepositoryInstance: ProblemRepository | undefined;
let assignmentGroupRepositoryInstance: AssignmentGroupRepository | undefined;
let changeRepositoryInstance: ChangeRepository | undefined;
let tableClientInstance: ServiceNowTableAPIClient | undefined;

/**
 * Get shared HTTP client instance
 */
export function getHttpClient(): ServiceNowHttpClient {
  if (!httpClientInstance) {
    httpClientInstance = createHttpClient();
  }
  return httpClientInstance;
}

export function getTableApiClient(): ServiceNowTableAPIClient {
  if (!tableClientInstance) {
    tableClientInstance = new ServiceNowTableAPIClient(getHttpClient());
  }
  return tableClientInstance;
}

export function createChangeRepositoryInstance(
  tableClient?: ServiceNowTableAPIClient,
): ChangeRepository {
  const client = tableClient ?? getTableApiClient();
  return new ChangeRepository(client);
}

export function getChangeRepository(): ChangeRepository {
  if (!changeRepositoryInstance) {
    changeRepositoryInstance = createChangeRepositoryInstance();
  }
  return changeRepositoryInstance;
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
 * Get shared IncidentRepository instance
 */
export function getIncidentRepository(): IncidentRepository {
  if (!incidentRepositoryInstance) {
    incidentRepositoryInstance = createIncidentRepository(getHttpClient());
  }
  return incidentRepositoryInstance;
}

/**
 * Get shared KnowledgeRepository instance
 */
export function getKnowledgeRepository(): KnowledgeRepository {
  if (!knowledgeRepositoryInstance) {
    knowledgeRepositoryInstance = createKnowledgeRepository(getHttpClient());
  }
  return knowledgeRepositoryInstance;
}

/**
 * Get shared ServiceCatalogRepository instance (also ServiceManagementRepository)
 */
export function getServiceCatalogRepository(): ServiceCatalogRepository & ServiceManagementRepository {
  if (!catalogRepositoryInstance) {
    catalogRepositoryInstance = createServiceCatalogRepository(getHttpClient());
  }
  return catalogRepositoryInstance;
}

export function getCmdbRepository(): CMDBRepository {
  if (!cmdbRepositoryInstance) {
    cmdbRepositoryInstance = createCmdbRepository(getHttpClient());
  }
  return cmdbRepositoryInstance;
}

export function getCustomerAccountRepository(): CustomerAccountRepository {
  if (!customerAccountRepositoryInstance) {
    customerAccountRepositoryInstance = createCustomerAccountRepository(getHttpClient());
  }
  return customerAccountRepositoryInstance;
}

export function getChoiceRepository(): ChoiceRepository {
  if (!choiceRepositoryInstance) {
    choiceRepositoryInstance = createChoiceRepository(getHttpClient());
  }
  return choiceRepositoryInstance;
}

export function getProblemRepository(): ProblemRepository {
  if (!problemRepositoryInstance) {
    problemRepositoryInstance = createProblemRepository(getHttpClient());
  }
  return problemRepositoryInstance;
}

export function getAssignmentGroupRepository(): AssignmentGroupRepository {
  if (!assignmentGroupRepositoryInstance) {
    assignmentGroupRepositoryInstance = createAssignmentGroupRepository(getHttpClient());
  }
  return assignmentGroupRepositoryInstance;
}

/**
 * Reset singleton instances (useful for testing)
 */
export function resetRepositories(): void {
  httpClientInstance = undefined;
  tableClientInstance = undefined;
  caseRepositoryInstance = undefined;
  incidentRepositoryInstance = undefined;
  knowledgeRepositoryInstance = undefined;
  catalogRepositoryInstance = undefined;
  cmdbRepositoryInstance = undefined;
  customerAccountRepositoryInstance = undefined;
  choiceRepositoryInstance = undefined;
  problemRepositoryInstance = undefined;
  assignmentGroupRepositoryInstance = undefined;
  changeRepositoryInstance = undefined;
}
