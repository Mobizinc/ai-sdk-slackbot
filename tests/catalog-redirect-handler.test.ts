import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CatalogRedirectHandler } from "../lib/services/catalog-redirect-handler";
import { getHRRequestDetector } from "../lib/services/hr-request-detector";
import { getClientSettingsRepository } from "../lib/db/repositories/client-settings-repository";
import { serviceNowClient } from "../lib/tools/servicenow";
import type { ServiceNowCatalogItem } from "../lib/tools/servicenow";
import type { ClientSettings } from "../lib/db/schema";

// Mock dependencies
vi.mock("../lib/services/hr-request-detector");
vi.mock("../lib/db/repositories/client-settings-repository");

vi.mock("../lib/tools/servicenow", () => ({
  serviceNowClient: {
    getCatalogItemByName: vi.fn(),
    getCatalogItems: vi.fn(),
    addCaseWorkNote: vi.fn(),
    updateCase: vi.fn(),
  },
}));

describe("CatalogRedirectHandler", () => {
  let handler: CatalogRedirectHandler;
  let mockDetector: any;
  let mockSettingsRepository: any;
  const mockServiceNowClient = serviceNowClient as unknown as {
    getCatalogItemByName: ReturnType<typeof vi.fn>;
    getCatalogItems: ReturnType<typeof vi.fn>;
    addCaseWorkNote: ReturnType<typeof vi.fn>;
    updateCase: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock HR Request Detector
    mockDetector = {
      detectHRRequest: vi.fn(),
      shouldAutoRedirect: vi.fn(),
    };
    vi.mocked(getHRRequestDetector).mockReturnValue(mockDetector);

    // Mock Client Settings Repository
    mockSettingsRepository = {
      getClientSettings: vi.fn(),
      logRedirect: vi.fn(),
    };
    vi.mocked(getClientSettingsRepository).mockReturnValue(mockSettingsRepository);

    // Reset ServiceNow client mocks
    mockServiceNowClient.getCatalogItemByName.mockReset();
    mockServiceNowClient.getCatalogItems.mockReset();
    mockServiceNowClient.addCaseWorkNote.mockReset();
    mockServiceNowClient.updateCase.mockReset();

    handler = new CatalogRedirectHandler({
      enabled: true,
      confidenceThreshold: 0.5,
      autoCloseEnabled: true,
      closeState: "Resolved",
      closeCode: "Incorrectly Submitted",
      contactInfo: "IT Support",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("processCase", () => {
    const mockCatalogItems: ServiceNowCatalogItem[] = [
      {
        sys_id: "catalog_1",
        name: "HR - Employee Onboarding Request",
        short_description: "Request for new employee onboarding",
        active: true,
        url: "https://example.service-now.com/sp?id=sc_cat_item&sys_id=catalog_1",
      },
    ];

    it("should redirect HR request with high confidence", async () => {
      // Arrange
      const input = {
        caseNumber: "CASE001",
        caseSysId: "sys_id_123",
        shortDescription: "new employee onboarding request",
        description: "Need to set up new hire John Doe",
        category: "HR",
        subcategory: "Onboarding",
        companyId: "client_123",
        submittedBy: "user@example.com",
        clientName: "Acme Corp",
      };

      const detectionResult = {
        isHRRequest: true,
        requestType: "onboarding" as const,
        matchedKeywords: ["onboarding", "new employee"],
        confidence: 0.8,
        suggestedCatalogItems: ["HR - Employee Onboarding Request"],
      };

      mockDetector.detectHRRequest.mockReturnValue(detectionResult);
      mockDetector.shouldAutoRedirect.mockReturnValue(true);
      mockServiceNowClient.getCatalogItemByName.mockResolvedValue(mockCatalogItems[0]);
      mockServiceNowClient.addCaseWorkNote.mockResolvedValue(undefined);
      mockServiceNowClient.updateCase.mockResolvedValue(undefined);
      mockSettingsRepository.logRedirect.mockResolvedValue(undefined);

      // Act
      const result = await handler.processCase(input);

      // Assert
      expect(result.redirected).toBe(true);
      expect(result.caseClosed).toBe(true);
      expect(result.workNoteAdded).toBe(true);
      expect(result.catalogItems).toEqual(mockCatalogItems);
      expect(result.messageGenerated).toContain("Employee Onboarding Request");
      expect(result.messageGenerated).toContain("CASE001");

      expect(mockDetector.detectHRRequest).toHaveBeenCalledWith({
        shortDescription: input.shortDescription,
        description: input.description,
        category: input.category,
        subcategory: input.subcategory,
        customMappings: undefined,
      });

      expect(mockServiceNowClient.addCaseWorkNote).toHaveBeenCalledWith(
        input.caseSysId,
        expect.stringContaining("Employee Onboarding Request"),
        true, // workNotes = true (internal)
        expect.any(Object) // context
      );

      expect(mockServiceNowClient.updateCase).toHaveBeenCalledWith(
        input.caseSysId,
        {
          state: "Resolved",
          close_code: "Incorrectly Submitted",
          close_notes: expect.stringContaining("HR request must be submitted via catalog"),
        },
        expect.any(Object) // context
      );

      expect(mockSettingsRepository.logRedirect).toHaveBeenCalledWith(
        expect.objectContaining({
          caseNumber: "CASE001",
          requestType: "onboarding",
          confidence: 0.8,
          catalogItemsProvided: 1,
          caseClosed: true,
        })
      );
    });

    it("should not redirect when confidence is below threshold", async () => {
      // Arrange
      const input = {
        caseNumber: "CASE002",
        caseSysId: "sys_id_456",
        shortDescription: "computer issue",
        description: "My computer is slow",
        category: "Hardware",
        subcategory: "Computer",
      };

      const detectionResult = {
        isHRRequest: true,
        requestType: "onboarding" as const,
        matchedKeywords: ["new"],
        confidence: 0.3,
        suggestedCatalogItems: ["HR - Employee Onboarding Request"],
      };

      mockDetector.detectHRRequest.mockReturnValue(detectionResult);
      mockDetector.shouldAutoRedirect.mockReturnValue(false);

      // Act
      const result = await handler.processCase(input);

      // Assert
      expect(result.redirected).toBe(false);
      expect(result.caseClosed).toBe(false);
      expect(result.workNoteAdded).toBe(false);
      expect(result.catalogItems).toEqual([]);

      expect(mockServiceNowClient.addCaseWorkNote).not.toHaveBeenCalled();
      expect(mockServiceNowClient.updateCase).not.toHaveBeenCalled();
      expect(mockSettingsRepository.logRedirect).not.toHaveBeenCalled();
    });

    it("should not redirect when handler is disabled", async () => {
      // Arrange
      const disabledHandler = new CatalogRedirectHandler({ enabled: false });
      const input = {
        caseNumber: "CASE003",
        caseSysId: "sys_id_789",
        shortDescription: "new employee onboarding",
      };

      // Act
      const result = await disabledHandler.processCase(input);

      // Assert
      expect(result.redirected).toBe(false);
      expect(mockDetector.detectHRRequest).not.toHaveBeenCalled();
    });

    it("should handle catalog item fetch failure gracefully", async () => {
      // Arrange
      const input = {
        caseNumber: "CASE004",
        caseSysId: "sys_id_000",
        shortDescription: "terminate employee access",
      };

      const detectionResult = {
        isHRRequest: true,
        requestType: "termination" as const,
        matchedKeywords: ["terminate", "employee"],
        confidence: 0.9,
        suggestedCatalogItems: ["HR - Employee Termination Request"],
      };

      mockDetector.detectHRRequest.mockReturnValue(detectionResult);
      mockDetector.shouldAutoRedirect.mockReturnValue(true);
      mockServiceNowClient.getCatalogItemByName.mockRejectedValue(new Error("Catalog API error"));
      mockServiceNowClient.getCatalogItems.mockResolvedValue([]); // Fallback search also fails

      // Act
      const result = await handler.processCase(input);

      // Assert
      expect(result.redirected).toBe(false);
      expect(result.error).toBe("No catalog items found");
      expect(mockServiceNowClient.addCaseWorkNote).not.toHaveBeenCalled();
    });

    it("should handle work note addition failure", async () => {
      // Arrange
      const input = {
        caseNumber: "CASE005",
        caseSysId: "sys_id_111",
        shortDescription: "offboarding request",
      };

      const detectionResult = {
        isHRRequest: true,
        requestType: "offboarding" as const,
        matchedKeywords: ["offboarding"],
        confidence: 0.7,
        suggestedCatalogItems: ["HR - Employee Offboarding Request"],
      };

      mockDetector.detectHRRequest.mockReturnValue(detectionResult);
      mockDetector.shouldAutoRedirect.mockReturnValue(true);
      mockServiceNowClient.getCatalogItemByName.mockResolvedValue(mockCatalogItems[0]);
      mockServiceNowClient.addCaseWorkNote.mockRejectedValue(new Error("Work note API error"));

      // Act
      const result = await handler.processCase(input);

      // Assert
      expect(result.redirected).toBe(false);
      expect(result.caseClosed).toBe(false);
      expect(result.workNoteAdded).toBe(false);
      expect(result.error).toBe("Failed to add work note");
      expect(mockServiceNowClient.updateCase).not.toHaveBeenCalled();
    });

    it("should use client-specific settings when available", async () => {
      // Arrange
      const input = {
        caseNumber: "CASE006",
        caseSysId: "sys_id_222",
        shortDescription: "new user account",
        companyId: "client_456",
      };

      const clientSettings: ClientSettings = {
        id: 1,
        clientId: "client_456",
        clientName: "Global Corp",
        catalogRedirectEnabled: true,
        catalogRedirectConfidenceThreshold: 0.6,
        catalogRedirectAutoClose: false,
        supportContactInfo: "global-it@corp.com",
        customCatalogMappings: [],
        features: {},
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: null,
        updatedBy: null,
      };

      const detectionResult = {
        isHRRequest: true,
        requestType: "new_account" as const,
        matchedKeywords: ["new account"],
        confidence: 0.65, // Above client threshold but below default
        suggestedCatalogItems: ["HR - New Account Request"],
      };

      mockSettingsRepository.getClientSettings.mockResolvedValue(clientSettings);
      mockDetector.detectHRRequest.mockReturnValue(detectionResult);
      mockDetector.shouldAutoRedirect.mockImplementation((detection: any, threshold: any) => 
        detection.confidence >= threshold
      );
      mockServiceNowClient.getCatalogItemByName.mockResolvedValue(mockCatalogItems[0]);
      mockServiceNowClient.addCaseWorkNote.mockResolvedValue(undefined);

      // Act
      const result = await handler.processCase(input);

      // Assert
      expect(result.redirected).toBe(true);
      expect(result.caseClosed).toBe(false); // Auto-close disabled for client
      expect(result.workNoteAdded).toBe(true);
      expect(result.messageGenerated).toContain("global-it@corp.com");

      expect(mockSettingsRepository.getClientSettings).toHaveBeenCalledWith("client_456");
      expect(mockDetector.shouldAutoRedirect).toHaveBeenCalledWith(detectionResult, 0.6);
    });

    it("should fall back to keyword search when exact catalog item not found", async () => {
      // Arrange
      const input = {
        caseNumber: "CASE007",
        caseSysId: "sys_id_333",
        shortDescription: "account modification needed",
      };

      const detectionResult = {
        isHRRequest: true,
        requestType: "account_modification" as const,
        matchedKeywords: ["account modification"],
        confidence: 0.8,
        suggestedCatalogItems: ["HR - Account Modification Request"],
      };

      mockDetector.detectHRRequest.mockReturnValue(detectionResult);
      mockDetector.shouldAutoRedirect.mockReturnValue(true);
      mockServiceNowClient.getCatalogItemByName.mockResolvedValue(null); // Not found by name
      mockServiceNowClient.getCatalogItems.mockResolvedValue(mockCatalogItems); // Found by search
      mockServiceNowClient.addCaseWorkNote.mockResolvedValue(undefined);
      mockServiceNowClient.updateCase.mockResolvedValue(undefined);

      // Act
      const result = await handler.processCase(input);

      // Assert
      expect(result.redirected).toBe(true);
      expect(result.catalogItems).toEqual(mockCatalogItems);

      expect(mockServiceNowClient.getCatalogItemByName).toHaveBeenCalledWith(
        "HR - Account Modification Request",
        expect.any(Object) // context
      );
      expect(mockServiceNowClient.getCatalogItems).toHaveBeenCalledWith(
        {
          keywords: ["account modification", "HR", "employee"],
          active: true,
          limit: 3,
        },
        expect.any(Object) // context
      );
    });
  });

  describe("testRedirect", () => {
    it("should return wouldRedirect true for HR request above threshold", async () => {
      // Arrange
      const input = {
        shortDescription: "new employee onboarding",
        description: "Need to set up new hire",
      };

      const detectionResult = {
        isHRRequest: true,
        requestType: "onboarding" as const,
        matchedKeywords: ["onboarding", "new employee"],
        confidence: 0.8,
        suggestedCatalogItems: ["HR - Employee Onboarding Request"],
      };

      mockDetector.detectHRRequest.mockReturnValue(detectionResult);
      mockDetector.shouldAutoRedirect.mockReturnValue(true);

      // Act
      const result = await handler.testRedirect(input);

      // Assert
      expect(result.wouldRedirect).toBe(true);
      expect(result.detection).toEqual(detectionResult);
      expect(result.message).toContain("Employee Onboarding Request");
      expect(result.message).toContain("TEST0001");
    });

    it("should return wouldRedirect false for non-HR request", async () => {
      // Arrange
      const input = {
        shortDescription: "computer is broken",
        description: "Need to fix my laptop",
      };

      const detectionResult = {
        isHRRequest: false,
        matchedKeywords: [],
        confidence: 0,
        suggestedCatalogItems: [],
      };

      mockDetector.detectHRRequest.mockReturnValue(detectionResult);

      // Act
      const result = await handler.testRedirect(input);

      // Assert
      expect(result.wouldRedirect).toBe(false);
      expect(result.detection).toEqual(detectionResult);
      expect(result.message).toBeUndefined();
    });
  });

  describe("getStats", () => {
    it("should return current configuration stats", () => {
      // Act
      const stats = handler.getStats();

      // Assert
      expect(stats).toEqual({
        enabled: true,
        confidenceThreshold: 0.5,
        autoCloseEnabled: true,
      });
    });
  });
});
