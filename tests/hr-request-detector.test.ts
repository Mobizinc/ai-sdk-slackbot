import { describe, it, expect, vi, beforeEach } from "vitest";
import { HRRequestDetector, getHRRequestDetector } from "../lib/services/hr-request-detector";
import type { HRRequestType, CatalogItemMapping } from "../lib/services/hr-request-detector";

describe("HRRequestDetector", () => {
  let detector: HRRequestDetector;

  beforeEach(() => {
    detector = new HRRequestDetector();
  });

  describe("detectHRRequest", () => {
    it("should detect onboarding request with high confidence", () => {
      const result = detector.detectHRRequest({
        shortDescription: "New employee onboarding for John Doe",
        description: "Need to set up accounts and equipment for new hire starting Monday",
        category: "HR",
        subcategory: "Onboarding",
      });

      expect(result.isHRRequest).toBe(true);
      expect(result.requestType).toBe("onboarding");
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.matchedKeywords).toContain("onboarding");
      expect(result.matchedKeywords).toContain("new employee");
      expect(result.suggestedCatalogItems).toContain("HR - Employee Onboarding Request");
    });

    it("should detect termination request", () => {
      const result = detector.detectHRRequest({
        shortDescription: "Employee termination - Jane Smith",
        description: "Last day is Friday, need to revoke access",
        category: "HR",
      });

      expect(result.isHRRequest).toBe(true);
      expect(result.requestType).toBe("termination");
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.matchedKeywords).toContain("termination");
      expect(result.matchedKeywords).toContain("employee");
    });

    it("should detect offboarding request", () => {
      const result = detector.detectHRRequest({
        shortDescription: "Offboarding user access",
        description: "Need to deactivate account and remove access",
      });

      expect(result.isHRRequest).toBe(true);
      expect(result.requestType).toBe("offboarding");
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.matchedKeywords).toContain("offboarding");
      expect(result.matchedKeywords).toContain("deactivate");
    });

    it("should detect new account request", () => {
      const result = detector.detectHRRequest({
        shortDescription: "Create new account for contractor",
        description: "Need to provision user access for new contractor",
      });

      expect(result.isHRRequest).toBe(true);
      expect(result.requestType).toBe("new_account");
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.matchedKeywords).toContain("new account");
      expect(result.matchedKeywords).toContain("provision user");
    });

    it("should detect account modification request", () => {
      const result = detector.detectHRRequest({
        shortDescription: "Account modification needed",
        description: "Need to change permissions and role for existing user",
      });

      expect(result.isHRRequest).toBe(true);
      expect(result.requestType).toBe("account_modification");
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.matchedKeywords).toContain("account modification");
    });

    it("should detect transfer request", () => {
      const result = detector.detectHRRequest({
        shortDescription: "Employee transfer to new department",
        description: "User is moving from Sales to Marketing, need to update access",
      });

      expect(result.isHRRequest).toBe(true);
      expect(result.requestType).toBe("transfer");
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.matchedKeywords).toContain("transfer");
    });

    it("should not detect HR request in technical issues", () => {
      const result = detector.detectHRRequest({
        shortDescription: "Computer is running slow",
        description: "Need to troubleshoot performance issues with laptop",
        category: "Hardware",
        subcategory: "Performance",
      });

      expect(result.isHRRequest).toBe(false);
      expect(result.requestType).toBeUndefined();
      expect(result.confidence).toBe(0);
      expect(result.matchedKeywords).toEqual([]);
      expect(result.suggestedCatalogItems).toEqual([]);
    });

    it("should use custom mappings when provided", () => {
      const customMappings: CatalogItemMapping[] = [
        {
          requestType: "onboarding",
          keywords: ["custom_onboard", "special_hire"],
          catalogItemNames: ["Custom Onboarding Request"],
          priority: 15,
        },
      ];

      const customDetector = new HRRequestDetector(customMappings);

      const result = customDetector.detectHRRequest({
        shortDescription: "custom_onboard request",
        description: "Need to process special_hire",
        customMappings,
      });

      expect(result.isHRRequest).toBe(true);
      expect(result.requestType).toBe("onboarding");
      expect(result.matchedKeywords).toContain("custom_onboard");
      expect(result.matchedKeywords).toContain("special_hire");
      expect(result.suggestedCatalogItems).toContain("Custom Onboarding Request");
    });

    it("should handle case-insensitive matching", () => {
      const result = detector.detectHRRequest({
        shortDescription: "NEW EMPLOYEE ONBOARDING",
        description: "Need to set up NEW HIRE",
      });

      expect(result.isHRRequest).toBe(true);
      expect(result.requestType).toBe("onboarding");
      expect(result.matchedKeywords).toContain("onboarding");
      expect(result.matchedKeywords).toContain("new employee");
    });

    it("should prioritize higher priority mappings", () => {
      const customMappings: CatalogItemMapping[] = [
        {
          requestType: "termination",
          keywords: ["leave"],
          catalogItemNames: ["Low Priority Termination"],
          priority: 1,
        },
        {
          requestType: "transfer",
          keywords: ["leave"],
          catalogItemNames: ["High Priority Transfer"],
          priority: 20,
        },
      ];

      const customDetector = new HRRequestDetector(customMappings);

      const result = customDetector.detectHRRequest({
        shortDescription: "Employee leave request",
        customMappings,
      });

      expect(result.isHRRequest).toBe(true);
      expect(result.requestType).toBe("transfer"); // Higher priority wins
      expect(result.suggestedCatalogItems).toContain("High Priority Transfer");
    });

    it("should calculate confidence based on multiple factors", () => {
      const result = detector.detectHRRequest({
        shortDescription: "new employee onboarding request",
        description: "starting employee first day new team member",
        category: "HR",
        subcategory: "Onboarding",
      });

      expect(result.isHRRequest).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.7); // Multiple keywords should increase confidence
      expect(result.matchedKeywords.length).toBeGreaterThan(3);
    });
  });

  describe("shouldAutoRedirect", () => {
    it("should return true for high confidence HR request", () => {
      const detectionResult = {
        isHRRequest: true,
        requestType: "onboarding" as HRRequestType,
        matchedKeywords: ["onboarding"],
        confidence: 0.8,
        suggestedCatalogItems: ["HR - Employee Onboarding Request"],
      };

      const shouldRedirect = detector.shouldAutoRedirect(detectionResult, 0.5);
      expect(shouldRedirect).toBe(true);
    });

    it("should return false for low confidence HR request", () => {
      const detectionResult = {
        isHRRequest: true,
        requestType: "onboarding" as HRRequestType,
        matchedKeywords: ["onboarding"],
        confidence: 0.3,
        suggestedCatalogItems: ["HR - Employee Onboarding Request"],
      };

      const shouldRedirect = detector.shouldAutoRedirect(detectionResult, 0.5);
      expect(shouldRedirect).toBe(false);
    });

    it("should return false for non-HR request", () => {
      const detectionResult = {
        isHRRequest: false,
        matchedKeywords: [],
        confidence: 0,
        suggestedCatalogItems: [],
      };

      const shouldRedirect = detector.shouldAutoRedirect(detectionResult, 0.5);
      expect(shouldRedirect).toBe(false);
    });

    it("should use default threshold when not provided", () => {
      const detectionResult = {
        isHRRequest: true,
        requestType: "onboarding" as HRRequestType,
        matchedKeywords: ["onboarding"],
        confidence: 0.6,
        suggestedCatalogItems: ["HR - Employee Onboarding Request"],
      };

      const shouldRedirect = detector.shouldAutoRedirect(detectionResult);
      expect(shouldRedirect).toBe(true); // Default threshold is 0.5
    });
  });

  describe("getCatalogItemNamesForType", () => {
    it("should return catalog item names for valid request type", () => {
      const names = detector.getCatalogItemNamesForType("onboarding");
      expect(names).toContain("HR - Employee Onboarding Request");
      expect(names).toContain("Employee Onboarding");
    });

    it("should return empty array for invalid request type", () => {
      const names = detector.getCatalogItemNamesForType("invalid" as HRRequestType);
      expect(names).toEqual([]);
    });
  });

  describe("addMapping", () => {
    it("should add new mapping", () => {
      const newMapping: CatalogItemMapping = {
        requestType: "onboarding", // Use existing type to avoid type errors
        keywords: ["custom", "special"],
        catalogItemNames: ["Custom Request"],
        priority: 5,
      };

      detector.addMapping(newMapping);

      const result = detector.detectHRRequest({
        shortDescription: "custom request needed",
      });

      expect(result.isHRRequest).toBe(true);
      expect(result.requestType).toBe("onboarding");
    });

    it("should update existing mapping", () => {
      const updatedMapping: CatalogItemMapping = {
        requestType: "onboarding",
        keywords: ["updated_onboard"],
        catalogItemNames: ["Updated Onboarding Request"],
        priority: 25,
      };

      detector.addMapping(updatedMapping);

      const result = detector.detectHRRequest({
        shortDescription: "updated_onboard request",
      });

      expect(result.isHRRequest).toBe(true);
      expect(result.requestType).toBe("onboarding");
      expect(result.suggestedCatalogItems).toContain("Updated Onboarding Request");
    });
  });

  describe("getSupportedRequestTypes", () => {
    it("should return all supported request types", () => {
      const types = detector.getSupportedRequestTypes();
      expect(types).toContain("onboarding");
      expect(types).toContain("termination");
      expect(types).toContain("offboarding");
      expect(types).toContain("new_account");
      expect(types).toContain("account_modification");
      expect(types).toContain("transfer");
    });
  });

  describe("getStats", () => {
    it("should return detector statistics", () => {
      const stats = detector.getStats();
      expect(stats.totalMappings).toBeGreaterThan(0);
      expect(stats.totalKeywords).toBeGreaterThan(0);
      expect(stats.requestTypes.length).toBeGreaterThan(0);
      expect(stats.requestTypes).toContain("onboarding");
    });
  });

  describe("fromConfig", () => {
    it("should create detector from valid config", () => {
      const config = JSON.stringify({
        mappings: [
          {
            requestType: "onboarding",
            keywords: ["custom", "onboard"],
            catalogItemNames: ["Custom Onboarding"],
            priority: 10,
          },
        ],
      });

      const detectorFromConfig = HRRequestDetector.fromConfig(config);
      const result = detectorFromConfig.detectHRRequest({
        shortDescription: "custom onboard request",
      });

      expect(result.isHRRequest).toBe(true);
      expect(result.requestType).toBe("onboarding");
    });

    it("should return default detector for invalid config", () => {
      const detectorFromConfig = HRRequestDetector.fromConfig("invalid json");
      expect(detectorFromConfig).toBeInstanceOf(HRRequestDetector);
    });

    it("should return default detector for empty config", () => {
      const detectorFromConfig = HRRequestDetector.fromConfig("");
      expect(detectorFromConfig).toBeInstanceOf(HRRequestDetector);
    });
  });
});

describe("getHRRequestDetector", () => {
  it("should return singleton instance", () => {
    const detector1 = getHRRequestDetector();
    const detector2 = getHRRequestDetector();
    expect(detector1).toBe(detector2);
  });

  it("should use environment config when available", async () => {
    const originalEnv = process.env.HR_REQUEST_DETECTOR_CONFIG;
    process.env.HR_REQUEST_DETECTOR_CONFIG = JSON.stringify({
      mappings: [
        {
          requestType: "onboarding",
          keywords: ["env_test"],
          catalogItemNames: ["Env Test"],
          priority: 10,
        },
      ],
    });

    // Clear the singleton to force re-creation
    vi.resetModules();
    
    const module = await import("../lib/services/hr-request-detector");
    const getFreshDetector = module.getHRRequestDetector;
    const detector = getFreshDetector();
    
    const result = detector.detectHRRequest({
      shortDescription: "env_test request",
    });

    expect(result.isHRRequest).toBe(true);
    expect(result.requestType).toBe("onboarding");

    // Restore original env
    process.env.HR_REQUEST_DETECTOR_CONFIG = originalEnv;
  });
});
