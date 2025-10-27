import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CaseTriageService, getCaseTriageService } from "../lib/services/case-triage";
import { getCaseClassificationRepository } from "../lib/db/repositories/case-classification-repository";
import { getWorkflowRouter } from "../lib/services/workflow-router";
import { getCaseClassifier } from "../lib/services/case-classifier";
import { createAzureSearchClient } from "../lib/services/azure-search-client";
import { getCategorySyncService } from "../lib/services/servicenow-category-sync";
import { getCatalogRedirectHandler } from "../lib/services/catalog-redirect-handler";
import { getCmdbReconciliationService } from "../lib/services/cmdb-reconciliation";
import { serviceNowClient } from "../lib/tools/servicenow";
import type { ServiceNowCaseWebhook, CaseClassificationResult } from "../lib/schemas/servicenow-webhook";

// Mock all dependencies
vi.mock("../lib/db/repositories/case-classification-repository");
vi.mock("../lib/services/workflow-router");
vi.mock("../lib/services/case-classifier");
vi.mock("../lib/services/azure-search-client");
vi.mock("../lib/services/servicenow-category-sync");
vi.mock("../lib/services/catalog-redirect-handler");
vi.mock("../lib/services/cmdb-reconciliation");

// Mock ServiceNow client with proper structure
vi.mock("../lib/tools/servicenow", () => ({
  serviceNowClient: {
    addCaseWorkNote: vi.fn(),
    updateCase: vi.fn(),
    createIncidentFromCase: vi.fn(),
    createProblemFromCase: vi.fn(),
    getServiceOffering: vi.fn(),
    getApplicationServicesForCompany: vi.fn(),
  },
}));

describe("CaseTriageService", () => {
  let triageService: CaseTriageService;
  let mockRepository: any;
  let mockWorkflowRouter: any;
  let mockClassifier: any;
  let mockAzureSearchClient: any;
  let mockCategorySyncService: any;
  let mockCatalogRedirectHandler: any;
  let mockCmdbService: any;
  let mockServiceNowClient: any;

  // Helper function to create valid classification results
  function createClassificationResult(overrides: Partial<CaseClassificationResult> = {}): CaseClassificationResult {
    return {
      case_number: "CASE001",
      category: "Email",
      subcategory: "Server",
      confidence_score: 0.9,
      reasoning: "Email service disruption affecting multiple users",
      keywords_detected: ["email", "server", "disruption"],
      model_used: "gpt-4",
      classified_at: new Date(),
      pricing_tier: "standard",
      similar_cases: [],
      kb_articles: [],
      technical_entities: {
        ip_addresses: [],
        systems: [],
        users: [],
        software: [],
        error_codes: [],
      },
      ...overrides,
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock repository
    mockRepository = {
      checkRecentClassification: vi.fn(),
      recordInboundPayload: vi.fn(),
      checkClassificationCache: vi.fn(),
      storeClassificationResult: vi.fn(),
      storeDiscoveredEntities: vi.fn(),
      saveInboundPayload: vi.fn(),
      getUnprocessedPayload: vi.fn(),
      markPayloadAsProcessed: vi.fn(),
      saveClassificationResult: vi.fn(),
      getLatestClassificationResult: vi.fn(),
      getClassificationsByWorkflow: vi.fn(),
    };
    vi.mocked(getCaseClassificationRepository).mockReturnValue(mockRepository);

    // Mock workflow router
    mockWorkflowRouter = {
      determineWorkflow: vi.fn(),
    };
    vi.mocked(getWorkflowRouter).mockReturnValue(mockWorkflowRouter);

    // Mock classifier
    mockClassifier = {
      setCategories: vi.fn(),
      classifyCaseEnhanced: vi.fn(),
    };
    vi.mocked(getCaseClassifier).mockReturnValue(mockClassifier);

    // Mock Azure Search client
    mockAzureSearchClient = {
      searchSimilarCases: vi.fn(),
      searchKBArticles: vi.fn(),
    };
    vi.mocked(createAzureSearchClient).mockReturnValue(mockAzureSearchClient);

    // Mock category sync service
    mockCategorySyncService = {
      getCategoriesForClassifier: vi.fn(),
    };
    vi.mocked(getCategorySyncService).mockReturnValue(mockCategorySyncService);

    // Mock catalog redirect handler
    mockCatalogRedirectHandler = {
      processCase: vi.fn(),
    };
    vi.mocked(getCatalogRedirectHandler).mockReturnValue(mockCatalogRedirectHandler);

    // Mock CMDB service
    mockCmdbService = {
      reconcileEntities: vi.fn(),
    };
    vi.mocked(getCmdbReconciliationService).mockReturnValue(mockCmdbService);

    // Get ServiceNow client mock from the module mock
    const { serviceNowClient } = await import("../lib/tools/servicenow");
    mockServiceNowClient = serviceNowClient;
    
    // Setup default ServiceNow mock returns
    mockServiceNowClient.getApplicationServicesForCompany.mockResolvedValue([]);

    triageService = new CaseTriageService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Incident Creation", () => {
    const mockWebhook: ServiceNowCaseWebhook = {
      case_number: "CASE001",
      sys_id: "sys_id_123",
      short_description: "Email server is down",
      description: "Users cannot access email",
      category: "Email",
      subcategory: "Server",
      priority: "1",
      urgency: "High",
      state: "New",
      assignment_group: "IT Support",
      assignment_group_sys_id: "group_123",
      company: "company_456",
      account_id: "Acme Corp",
      caller_id: "user@example.com",
      contact: "John Doe",
      contact_type: "User",
      opened_by: "admin",
      cmdb_ci: "ci_789",
      configuration_item: "Email Server",
      business_service: "Email Service",
      location: "Main Office",
      sys_domain: "domain_001",
      sys_domain_path: "/",
      account: "Acme Corp",
    };

    it("should create Incident when record type suggestion is Incident", async () => {
      // Arrange
      const classificationResult = createClassificationResult({
        record_type_suggestion: {
          type: "Incident",
          is_major_incident: false,
          reasoning: "Service disruption affecting business operations",
        },
      });

      const incidentResult = {
        incident_number: "INC001",
        incident_sys_id: "inc_sys_123",
        incident_url: "https://example.service-now.com/incident.do?sys_id=inc_sys_123",
      };

      mockRepository.checkRecentClassification.mockResolvedValue(null);
      mockRepository.recordInboundPayload.mockResolvedValue(1);
      mockWorkflowRouter.determineWorkflow.mockReturnValue({ workflowId: "default", ruleMatched: false });
      mockRepository.checkClassificationCache.mockResolvedValue(null);
      mockCategorySyncService.getCategoriesForClassifier.mockResolvedValue({
        caseCategories: [],
        incidentCategories: [],
        caseSubcategories: [],
        incidentSubcategories: [],
        tablesCovered: [],
        isStale: false,
      });
      mockClassifier.classifyCaseEnhanced.mockResolvedValue(classificationResult);
      mockServiceNowClient.addCaseWorkNote.mockResolvedValue(undefined);
      mockServiceNowClient.createIncidentFromCase.mockResolvedValue(incidentResult);
      mockServiceNowClient.updateCase.mockResolvedValue(undefined);
      mockRepository.storeClassificationResult.mockResolvedValue(undefined);
      mockRepository.storeDiscoveredEntities.mockResolvedValue(0);

      // Act
      const result = await triageService.triageCase(mockWebhook, {
        writeToServiceNow: true,
        enableCatalogRedirect: false,
      });

      // Assert
      expect(result.incidentCreated).toBe(true);
      expect(result.incidentNumber).toBe("INC001");

      expect(mockServiceNowClient.createIncidentFromCase).toHaveBeenCalledWith(
        expect.objectContaining({
          isMajorIncident: false,
        }),
        expect.any(Object)
      );

      expect(mockServiceNowClient.addCaseWorkNote).toHaveBeenCalledWith(
        "sys_id_123",
        expect.stringContaining("INCIDENT CREATED"),
        true,
        expect.any(Object)
      );
    });

    it("should create Problem when record type suggestion is Problem", async () => {
      // Arrange
      const classificationResult = createClassificationResult({
        category: "Application",
        subcategory: "Performance",
        reasoning: "Recurring performance issue requiring root cause analysis",
        record_type_suggestion: {
          type: "Problem",
          is_major_incident: false,
          reasoning: "Recurring issue affecting multiple users over time",
        },
      });

      const problemResult = {
        problem_number: "PRB001",
        problem_sys_id: "prb_sys_123",
        problem_url: "https://example.service-now.com/problem.do?sys_id=prb_sys_123",
      };

      mockRepository.checkRecentClassification.mockResolvedValue(null);
      mockRepository.recordInboundPayload.mockResolvedValue(1);
      mockWorkflowRouter.determineWorkflow.mockReturnValue({ workflowId: "default", ruleMatched: false });
      mockRepository.checkClassificationCache.mockResolvedValue(null);
      mockCategorySyncService.getCategoriesForClassifier.mockResolvedValue({
        caseCategories: [],
        incidentCategories: [],
        caseSubcategories: [],
        incidentSubcategories: [],
        tablesCovered: [],
        isStale: false,
      });
      mockClassifier.classifyCaseEnhanced.mockResolvedValue(classificationResult);
      mockServiceNowClient.addCaseWorkNote.mockResolvedValue(undefined);
      mockServiceNowClient.createProblemFromCase.mockResolvedValue(problemResult);
      mockServiceNowClient.updateCase.mockResolvedValue(undefined);
      mockServiceNowClient.getApplicationServicesForCompany.mockResolvedValue([]);
      mockRepository.storeClassificationResult.mockResolvedValue(undefined);
      mockRepository.storeDiscoveredEntities.mockResolvedValue(0);

      // Act
      const result = await triageService.triageCase(mockWebhook, {
        writeToServiceNow: true,
        enableCatalogRedirect: false,
      });

      // Assert
      expect(result.problemCreated).toBe(true);
      expect(result.problemNumber).toBe("PRB001");

      expect(mockServiceNowClient.addCaseWorkNote).toHaveBeenCalledWith(
        "sys_id_123",
        expect.stringContaining("PROBLEM CREATED"),
        true,
        expect.any(Object)
      );
    });

    it("should not create Incident for Change suggestion", async () => {
      // Arrange
      const classificationResult = createClassificationResult({
        category: "Infrastructure",
        subcategory: "Server",
        reasoning: "Planned server maintenance required",
        record_type_suggestion: {
          type: "Change",
          is_major_incident: false,
          reasoning: "Planned change requiring CAB approval",
        },
      });

      mockRepository.checkRecentClassification.mockResolvedValue(null);
      mockRepository.recordInboundPayload.mockResolvedValue(1);
      mockWorkflowRouter.determineWorkflow.mockReturnValue({ workflowId: "default", ruleMatched: false });
      mockRepository.checkClassificationCache.mockResolvedValue(null);
      mockCategorySyncService.getCategoriesForClassifier.mockResolvedValue({
        caseCategories: [],
        incidentCategories: [],
        caseSubcategories: [],
        incidentSubcategories: [],
        tablesCovered: [],
        isStale: false,
      });
      mockClassifier.classifyCaseEnhanced.mockResolvedValue(classificationResult);
      mockServiceNowClient.addCaseWorkNote.mockResolvedValue(undefined);
      mockRepository.storeClassificationResult.mockResolvedValue(undefined);
      mockRepository.storeDiscoveredEntities.mockResolvedValue(0);

      // Act
      const result = await triageService.triageCase(mockWebhook, {
        writeToServiceNow: true,
        enableCatalogRedirect: false,
      });

      // Assert
      expect(result.incidentCreated).toBe(false);
      expect(result.incidentNumber).toBeUndefined();
      expect(mockServiceNowClient.createIncidentFromCase).not.toHaveBeenCalled();
    });

    it("should handle incident creation failure gracefully", async () => {
      // Arrange
      const classificationResult = createClassificationResult({
        category: "Network",
        subcategory: "Outage",
        reasoning: "Network outage detected",
        record_type_suggestion: {
          type: "Incident",
          is_major_incident: false,
          reasoning: "Service disruption",
        },
      });

      mockRepository.checkRecentClassification.mockResolvedValue(null);
      mockRepository.recordInboundPayload.mockResolvedValue(1);
      mockWorkflowRouter.determineWorkflow.mockReturnValue({ workflowId: "default", ruleMatched: false });
      mockRepository.checkClassificationCache.mockResolvedValue(null);
      mockCategorySyncService.getCategoriesForClassifier.mockResolvedValue({
        caseCategories: [],
        incidentCategories: [],
        caseSubcategories: [],
        incidentSubcategories: [],
        tablesCovered: [],
        isStale: false,
      });
      mockClassifier.classifyCaseEnhanced.mockResolvedValue(classificationResult);
      mockServiceNowClient.createIncidentFromCase.mockRejectedValue(new Error("ServiceNow API error"));
      mockServiceNowClient.addCaseWorkNote.mockResolvedValue(undefined);
      mockRepository.storeClassificationResult.mockResolvedValue(undefined);
      mockRepository.storeDiscoveredEntities.mockResolvedValue(0);

      // Act
      const result = await triageService.triageCase(mockWebhook, {
        writeToServiceNow: true,
        enableCatalogRedirect: false,
      });

      // Assert
      expect(result.incidentCreated).toBe(false);
      expect(result.incidentNumber).toBeUndefined();
      // Should continue with triage process despite incident creation failure
      expect(result.classification).toEqual(classificationResult);
    });

    it("should use fallback categories when incident-specific categories not available", async () => {
      // Arrange
      const classificationResult = createClassificationResult({
        category: "Email",
        subcategory: "Server",
        reasoning: "Email server issues",
        record_type_suggestion: {
          type: "Incident",
          is_major_incident: false,
          reasoning: "Service disruption",
        },
        // No incident-specific categories
      });

      const incidentResult = {
        incident_number: "INC001",
        incident_sys_id: "inc_sys_123",
        incident_url: "https://example.service-now.com/incident.do?sys_id=inc_sys_123",
      };

      mockRepository.checkRecentClassification.mockResolvedValue(null);
      mockRepository.recordInboundPayload.mockResolvedValue(1);
      mockWorkflowRouter.determineWorkflow.mockReturnValue({ workflowId: "default", ruleMatched: false });
      mockRepository.checkClassificationCache.mockResolvedValue(null);
      mockCategorySyncService.getCategoriesForClassifier.mockResolvedValue({
        caseCategories: [],
        incidentCategories: [],
        caseSubcategories: [],
        incidentSubcategories: [],
        tablesCovered: [],
        isStale: false,
      });
      mockClassifier.classifyCaseEnhanced.mockResolvedValue(classificationResult);
      mockServiceNowClient.addCaseWorkNote.mockResolvedValue(undefined);
      mockServiceNowClient.createIncidentFromCase.mockResolvedValue(incidentResult);
      mockServiceNowClient.updateCase.mockResolvedValue(undefined);
      mockRepository.storeClassificationResult.mockResolvedValue(undefined);
      mockRepository.storeDiscoveredEntities.mockResolvedValue(0);

      // Act
      await triageService.triageCase(mockWebhook, {
        writeToServiceNow: true,
        enableCatalogRedirect: false,
      });

      // Assert
      expect(mockServiceNowClient.createIncidentFromCase).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "Email", // Fallback to case category
          subcategory: "Server", // Fallback to case subcategory
        }),
        expect.any(Object)
      );
    });
  });

  describe("Catalog Redirect Integration", () => {
    const mockWebhook: ServiceNowCaseWebhook = {
      case_number: "CASE002",
      sys_id: "sys_id_456",
      short_description: "New employee onboarding request",
      description: "Need to set up new hire",
      category: "HR",
      subcategory: "Onboarding",
      priority: "3",
      urgency: "Medium",
      state: "New",
      assignment_group: "HR Support",
      assignment_group_sys_id: "hr_group_123",
      company: "company_789",
      account_id: "Global Corp",
      caller_id: "hr@example.com",
    };

    it("should perform catalog redirect when HR request detected", async () => {
      // Arrange
      const classificationResult = createClassificationResult({
        category: "HR",
        subcategory: "Onboarding",
        reasoning: "HR request for new employee setup",
      });

      const redirectResult = {
        redirected: true,
        caseClosed: true,
        workNoteAdded: true,
        catalogItems: [
          {
            sys_id: "catalog_1",
            name: "HR - Employee Onboarding Request",
            short_description: "Request for new employee onboarding",
            active: true,
            url: "https://example.service-now.com/sp?id=sc_cat_item&sys_id=catalog_1",
          },
        ],
        messageGenerated: "Please use the catalog for onboarding requests",
      };

      mockRepository.checkRecentClassification.mockResolvedValue(null);
      mockRepository.recordInboundPayload.mockResolvedValue(1);
      mockWorkflowRouter.determineWorkflow.mockReturnValue({ workflowId: "default", ruleMatched: false });
      mockRepository.checkClassificationCache.mockResolvedValue(null);
      mockCategorySyncService.getCategoriesForClassifier.mockResolvedValue({
        caseCategories: [],
        incidentCategories: [],
        caseSubcategories: [],
        incidentSubcategories: [],
        tablesCovered: [],
        isStale: false,
      });
      mockClassifier.classifyCaseEnhanced.mockResolvedValue(classificationResult);
      mockCatalogRedirectHandler.processCase.mockResolvedValue(redirectResult);
      mockRepository.storeClassificationResult.mockResolvedValue(undefined);
      mockRepository.storeDiscoveredEntities.mockResolvedValue(0);

      // Act
      const result = await triageService.triageCase(mockWebhook, {
        writeToServiceNow: false,
        enableCatalogRedirect: true,
      });

      // Assert
      expect(result.catalogRedirected).toBe(true);
      expect(result.catalogRedirectReason).toContain("HR request detected and redirected to catalog");
      expect(result.catalogItemsProvided).toBe(1);

      expect(mockCatalogRedirectHandler.processCase).toHaveBeenCalledWith({
        caseNumber: "CASE002",
        caseSysId: "sys_id_456",
        shortDescription: "New employee onboarding request",
        description: "Need to set up new hire",
        category: "HR",
        subcategory: "Onboarding",
        companyId: "company_789",
        submittedBy: "hr@example.com",
        clientName: "Global Corp",
      });
    });

    it("should not perform catalog redirect when incident created", async () => {
      // Arrange
      const classificationResult = createClassificationResult({
        category: "Network",
        subcategory: "Outage",
        reasoning: "Network outage",
        record_type_suggestion: {
          type: "Incident",
          is_major_incident: false,
          reasoning: "Service disruption",
        },
      });

      const incidentResult = {
        incident_number: "INC001",
        incident_sys_id: "inc_sys_123",
        incident_url: "https://example.service-now.com/incident.do?sys_id=inc_sys_123",
      };

      mockRepository.checkRecentClassification.mockResolvedValue(null);
      mockRepository.recordInboundPayload.mockResolvedValue(1);
      mockWorkflowRouter.determineWorkflow.mockReturnValue({ workflowId: "default", ruleMatched: false });
      mockRepository.checkClassificationCache.mockResolvedValue(null);
      mockCategorySyncService.getCategoriesForClassifier.mockResolvedValue({
        caseCategories: [],
        incidentCategories: [],
        caseSubcategories: [],
        incidentSubcategories: [],
        tablesCovered: [],
        isStale: false,
      });
      mockClassifier.classifyCaseEnhanced.mockResolvedValue(classificationResult);
      mockServiceNowClient.createIncidentFromCase.mockResolvedValue(incidentResult);
      mockServiceNowClient.updateCase.mockResolvedValue(undefined);
      mockServiceNowClient.addCaseWorkNote.mockResolvedValue(undefined);
      mockRepository.storeClassificationResult.mockResolvedValue(undefined);
      mockRepository.storeDiscoveredEntities.mockResolvedValue(0);

      // Act
      const result = await triageService.triageCase(mockWebhook, {
        writeToServiceNow: true,
        enableCatalogRedirect: true,
      });

      // Assert
      expect(result.incidentCreated).toBe(true);
      expect(result.catalogRedirected).toBe(false);
      expect(mockCatalogRedirectHandler.processCase).not.toHaveBeenCalled();
    });

    it("should handle catalog redirect failure gracefully", async () => {
      // Arrange
      const classificationResult = createClassificationResult({
        category: "HR",
        subcategory: "Onboarding",
        reasoning: "HR request",
      });

      mockRepository.checkRecentClassification.mockResolvedValue(null);
      mockRepository.recordInboundPayload.mockResolvedValue(1);
      mockWorkflowRouter.determineWorkflow.mockReturnValue({ workflowId: "default", ruleMatched: false });
      mockRepository.checkClassificationCache.mockResolvedValue(null);
      mockCategorySyncService.getCategoriesForClassifier.mockResolvedValue({
        caseCategories: [],
        incidentCategories: [],
        caseSubcategories: [],
        incidentSubcategories: [],
        tablesCovered: [],
        isStale: false,
      });
      mockClassifier.classifyCaseEnhanced.mockResolvedValue(classificationResult);
      mockCatalogRedirectHandler.processCase.mockRejectedValue(new Error("Catalog redirect failed"));
      mockRepository.storeClassificationResult.mockResolvedValue(undefined);
      mockRepository.storeDiscoveredEntities.mockResolvedValue(0);

      // Act
      const result = await triageService.triageCase(mockWebhook, {
        writeToServiceNow: false,
        enableCatalogRedirect: true,
      });

      // Assert
      expect(result.catalogRedirected).toBe(false);
      expect(result.catalogRedirectReason).toBeUndefined();
      // Should continue with triage process despite catalog redirect failure
      expect(result.classification).toEqual(classificationResult);
    });
  });
});

describe("getCaseTriageService", () => {
  it("should return singleton instance", () => {
    const service1 = getCaseTriageService();
    const service2 = getCaseTriageService();
    expect(service1).toBe(service2);
  });
});
