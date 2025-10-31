/**
 * Unit Tests for Case Triage Retrieval Module
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchCategories,
  fetchApplicationServices,
  enrichClassificationContext,
  type CategorySyncService,
} from "../../lib/services/case-triage/retrieval";
import type { ServiceNowCaseWebhook } from "../../lib/schemas/servicenow-webhook";
import type { ServiceNowContext } from "../../lib/infrastructure/servicenow-context";

// Mock serviceNowClient
vi.mock("../../lib/tools/servicenow", () => ({
  serviceNowClient: {
    getApplicationServicesForCompany: vi.fn(),
  },
}));

describe("Case Triage Retrieval", () => {
  let mockCategorySyncService: CategorySyncService;
  let mockSnContext: ServiceNowContext;

  beforeEach(() => {
    mockCategorySyncService = {
      getCategoriesForClassifier: vi.fn().mockResolvedValue({
        caseCategories: ["Network", "Software", "Hardware"],
        incidentCategories: ["Network", "Application"],
        caseSubcategories: ["Wi-Fi", "VPN"],
        incidentSubcategories: ["Connectivity"],
        tablesCovered: ["sn_customerservice_case", "incident"],
        isStale: false,
      }),
    };

    mockSnContext = { source: "test" } as ServiceNowContext;
  });

  describe("fetchCategories()", () => {
    it("should fetch categories with timing", async () => {
      const result = await fetchCategories(mockCategorySyncService, 13);

      expect(result.data.caseCategories).toHaveLength(3);
      expect(result.data.incidentCategories).toHaveLength(2);
      expect(result.data.tablesCovered).toHaveLength(2);
      expect(result.fetchTimeMs).toBeGreaterThanOrEqual(0);
      expect(mockCategorySyncService.getCategoriesForClassifier).toHaveBeenCalledWith(13);
    });

    it("should use default max age if not provided", async () => {
      await fetchCategories(mockCategorySyncService);

      expect(mockCategorySyncService.getCategoriesForClassifier).toHaveBeenCalledWith(13); // CATEGORIES_MAX_AGE_HOURS
    });

    it("should warn if categories are stale", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      mockCategorySyncService.getCategoriesForClassifier = vi.fn().mockResolvedValue({
        caseCategories: [],
        incidentCategories: [],
        caseSubcategories: [],
        incidentSubcategories: [],
        tablesCovered: [],
        isStale: true, // Stale data
      });

      await fetchCategories(mockCategorySyncService);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[Case Triage Retrieval] Categories are stale - consider running sync"
      );

      consoleWarnSpy.mockRestore();
    });

    it("should log category counts", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await fetchCategories(mockCategorySyncService);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Cases (3 categories)"),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Incidents (2 categories)"),
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe("fetchApplicationServices()", () => {
    const mockWebhook: ServiceNowCaseWebhook = {
      case_number: "SCS0012345",
      sys_id: "abc123",
      company: "company-sys-id-123",
      account_id: "ACME Corp",
    } as ServiceNowCaseWebhook;

    it("should return empty array if no company sys_id", async () => {
      const webhookNoCompany = {
        ...mockWebhook,
        company: undefined,
      } as ServiceNowCaseWebhook;

      const result = await fetchApplicationServices(webhookNoCompany, mockSnContext);

      expect(result.services).toEqual([]);
      expect(result.fetchTimeMs).toBe(0);
    });

    it("should fetch application services for company", async () => {
      const { serviceNowClient } = await import("../../lib/tools/servicenow");
      (serviceNowClient.getApplicationServicesForCompany as any) = vi.fn().mockResolvedValue([
        { name: "Email Service", sys_id: "email-123" },
        { name: "CRM Application", sys_id: "crm-456" },
      ]);

      const result = await fetchApplicationServices(mockWebhook, mockSnContext);

      expect(result.services).toHaveLength(2);
      expect(result.fetchTimeMs).toBeGreaterThanOrEqual(0);
      expect(serviceNowClient.getApplicationServicesForCompany).toHaveBeenCalledWith(
        {
          companySysId: "company-sys-id-123",
          parentServiceOffering: "Application Administration",
          limit: 100,
        },
        mockSnContext
      );
    });

    it("should log service count on success", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { serviceNowClient } = await import("../../lib/tools/servicenow");
      (serviceNowClient.getApplicationServicesForCompany as any) = vi.fn().mockResolvedValue([
        { name: "Email Service" },
        { name: "CRM Application" },
      ]);

      await fetchApplicationServices(mockWebhook, mockSnContext);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Loaded 2 application services")
      );

      consoleLogSpy.mockRestore();
    });

    it("should log warning when no services found", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { serviceNowClient } = await import("../../lib/tools/servicenow");
      (serviceNowClient.getApplicationServicesForCompany as any) = vi.fn().mockResolvedValue([]);

      await fetchApplicationServices(mockWebhook, mockSnContext);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("No application services found")
      );

      consoleLogSpy.mockRestore();
    });

    it("should return empty array on API error", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { serviceNowClient } = await import("../../lib/tools/servicenow");
      (serviceNowClient.getApplicationServicesForCompany as any) = vi.fn().mockRejectedValue(
        new Error("API error")
      );

      const result = await fetchApplicationServices(mockWebhook, mockSnContext);

      expect(result.services).toEqual([]);
      expect(result.fetchTimeMs).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fetch application services"),
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe("enrichClassificationContext()", () => {
    const mockWebhook: ServiceNowCaseWebhook = {
      case_number: "SCS0012345",
      sys_id: "abc123",
      company: "company-sys-id-123",
      account_id: "ACME Corp",
    } as ServiceNowCaseWebhook;

    it("should combine both fetches into single result", async () => {
      const { serviceNowClient } = await import("../../lib/tools/servicenow");
      (serviceNowClient.getApplicationServicesForCompany as any) = vi.fn().mockResolvedValue([
        { name: "Email Service" },
      ]);

      const result = await enrichClassificationContext(
        mockWebhook,
        mockCategorySyncService,
        mockSnContext
      );

      expect(result.categories.data.caseCategories).toHaveLength(3);
      expect(result.categories.fetchTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.applicationServices).toHaveLength(1);
      expect(result.applicationsFetchTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should handle case with no company (no app services)", async () => {
      const webhookNoCompany = {
        ...mockWebhook,
        company: undefined,
      } as ServiceNowCaseWebhook;

      const result = await enrichClassificationContext(
        webhookNoCompany,
        mockCategorySyncService,
        mockSnContext
      );

      expect(result.categories.data.caseCategories).toHaveLength(3);
      expect(result.applicationServices).toEqual([]);
      expect(result.applicationsFetchTimeMs).toBe(0);
    });

    it("should have timing metrics for both operations", async () => {
      const { serviceNowClient } = await import("../../lib/tools/servicenow");
      (serviceNowClient.getApplicationServicesForCompany as any) = vi.fn().mockResolvedValue([]);

      const result = await enrichClassificationContext(
        mockWebhook,
        mockCategorySyncService,
        mockSnContext
      );

      expect(typeof result.categories.fetchTimeMs).toBe("number");
      expect(typeof result.applicationsFetchTimeMs).toBe("number");
      expect(result.categories.fetchTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.applicationsFetchTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});
