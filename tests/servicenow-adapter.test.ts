/**
 * ServiceNow Adapter Tests
 *
 * Tests the feature flag routing logic in ServiceNowClient that determines
 * whether to use the NEW repository pattern or OLD legacy implementation.
 *
 * This is critical for validating the "Strangler Fig" migration strategy.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ServiceNowClient } from "../lib/tools/servicenow";
import { featureFlags } from "../lib/infrastructure/feature-flags";
import * as repositoryModule from "../lib/infrastructure/servicenow/repositories";

describe("ServiceNow Adapter - Feature Flag Routing", () => {
  let serviceNowClient: ServiceNowClient;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on console.log to verify path logging
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    serviceNowClient = new ServiceNowClient();

    // Reset feature flags to default (disabled)
    process.env.FEATURE_SERVICENOW_REPOSITORIES_PCT = "0";
    process.env.FEATURE_SERVICENOW_REPOSITORIES_FORCE_ENABLE = "false";
    process.env.FEATURE_SERVICENOW_REPOSITORIES_FORCE_DISABLE = "false";
    featureFlags.refresh();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe("Feature Flag = OFF (default)", () => {
    it("should use OLD path when feature flag is disabled (0%)", async () => {
      // Arrange: Feature flag is 0% (default from beforeEach)
      const mockResponse = {
        result: [
          {
            sys_id: "test_sys_id",
            number: "CS0001234",
            short_description: "Test case",
            state: "open",
            priority: "1",
          },
        ],
      };

      // Mock the legacy fetch call
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      // Act
      const result = await serviceNowClient.getCaseBySysId("test_sys_id");

      // Assert
      expect(result).not.toBeNull();
      expect(result?.number).toBe("CS0001234");

      // Verify OLD path was used
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("getCaseBySysId using OLD path"),
        expect.any(Object),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("OLD path: Using legacy implementation"),
        expect.any(Object),
      );
    });
  });

  describe("Feature Flag = ON (100%)", () => {
    it("should use NEW path when feature flag is force-enabled", async () => {
      // Arrange: Force enable the new repository pattern
      process.env.FEATURE_SERVICENOW_REPOSITORIES_FORCE_ENABLE = "true";
      featureFlags.refresh();

      // Mock the repository's findBySysId method
      const mockCase = {
        sysId: "test_sys_id",
        number: "CS0001234",
        shortDescription: "Test case",
        description: "Test description",
        state: "open",
        priority: "1",
        url: "https://example.service-now.com/nav_to.do?uri=sn_customerservice_case.do?sys_id=test_sys_id",
      };

      const mockCaseRepository = {
        findBySysId: vi.fn().mockResolvedValue(mockCase),
      };

      vi.spyOn(repositoryModule, "getCaseRepository").mockReturnValue(
        mockCaseRepository as any,
      );

      // Act
      const result = await serviceNowClient.getCaseBySysId("test_sys_id");

      // Assert
      expect(result).not.toBeNull();
      expect(result?.number).toBe("CS0001234");
      expect(result?.sys_id).toBe("test_sys_id");

      // Verify NEW path was used
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("getCaseBySysId using NEW path"),
        expect.any(Object),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("NEW path: Successfully retrieved case"),
        expect.any(Object),
      );

      // Verify repository method was called
      expect(mockCaseRepository.findBySysId).toHaveBeenCalledWith("test_sys_id");
    });

    it("should convert domain model to legacy format correctly", async () => {
      // Arrange
      process.env.FEATURE_SERVICENOW_REPOSITORIES_FORCE_ENABLE = "true";
      featureFlags.refresh();

      const mockCase = {
        sysId: "abc123",
        number: "CS9999",
        shortDescription: "Short desc",
        description: "Long description",
        state: "open",
        priority: "2",
        category: "Hardware",
        subcategory: "Laptop",
        openedAt: new Date("2025-01-15T10:00:00Z"),
        assignmentGroup: "IT Support",
        assignedTo: "John Doe",
        openedBy: "Jane Smith",
        callerId: "Jane Smith",
        submittedBy: "Jane Smith",
        contact: "contact_sys_id",
        account: "account_sys_id",
        url: "https://example.service-now.com/nav_to.do?uri=sn_customerservice_case.do?sys_id=abc123",
      };

      const mockCaseRepository = {
        findBySysId: vi.fn().mockResolvedValue(mockCase),
      };

      vi.spyOn(repositoryModule, "getCaseRepository").mockReturnValue(
        mockCaseRepository as any,
      );

      // Act
      const result = await serviceNowClient.getCaseBySysId("abc123");

      // Assert: Verify all fields are correctly mapped
      expect(result).toEqual({
        sys_id: "abc123",
        number: "CS9999",
        short_description: "Short desc",
        description: "Long description",
        state: "open",
        priority: "2",
        category: "Hardware",
        subcategory: "Laptop",
        opened_at: "2025-01-15T10:00:00.000Z",
        assignment_group: "IT Support",
        assigned_to: "John Doe",
        opened_by: "Jane Smith",
        caller_id: "Jane Smith",
        submitted_by: "Jane Smith",
        contact: "contact_sys_id",
        account: "account_sys_id",
        url: "https://example.service-now.com/nav_to.do?uri=sn_customerservice_case.do?sys_id=abc123",
      });
    });

    it("should handle case not found in NEW path", async () => {
      // Arrange
      process.env.FEATURE_SERVICENOW_REPOSITORIES_FORCE_ENABLE = "true";
      featureFlags.refresh();

      const mockCaseRepository = {
        findBySysId: vi.fn().mockResolvedValue(null),
      };

      vi.spyOn(repositoryModule, "getCaseRepository").mockReturnValue(
        mockCaseRepository as any,
      );

      // Act
      const result = await serviceNowClient.getCaseBySysId("nonexistent_id");

      // Assert
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("NEW path: Case not found"),
        expect.any(Object),
      );
    });
  });

  describe("Error Handling & Fallback", () => {
    it("should fall back to OLD path if NEW path throws error", async () => {
      // Arrange
      process.env.FEATURE_SERVICENOW_REPOSITORIES_FORCE_ENABLE = "true";
      featureFlags.refresh();

      // Mock repository to throw error
      const mockCaseRepository = {
        findBySysId: vi.fn().mockRejectedValue(new Error("Repository error")),
      };

      vi.spyOn(repositoryModule, "getCaseRepository").mockReturnValue(
        mockCaseRepository as any,
      );

      // Mock successful OLD path response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: [
            {
              sys_id: "test_sys_id",
              number: "CS0001234",
              short_description: "Test case",
            },
          ],
        }),
      } as Response);

      // Spy on console.error to verify error logging
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Act
      const result = await serviceNowClient.getCaseBySysId("test_sys_id");

      // Assert
      expect(result).not.toBeNull();
      expect(result?.number).toBe("CS0001234");

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("NEW path ERROR - falling back to OLD path"),
        expect.objectContaining({
          error: "Repository error",
        }),
      );

      // Verify OLD path was used as fallback
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("OLD path: Using legacy implementation"),
        expect.any(Object),
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("User/Channel Context", () => {
    it("should pass user context to feature flag check", async () => {
      // Arrange: Enable for specific users
      process.env.FEATURE_SERVICENOW_REPOSITORIES_USERS = "U12345,U67890";
      featureFlags.refresh();

      const mockCase = {
        sysId: "test_sys_id",
        number: "CS0001234",
        shortDescription: "Test",
        url: "https://example.service-now.com/nav_to.do",
      };

      const mockCaseRepository = {
        findBySysId: vi.fn().mockResolvedValue(mockCase),
      };

      vi.spyOn(repositoryModule, "getCaseRepository").mockReturnValue(
        mockCaseRepository as any,
      );

      // Act: Call with user context
      const result = await serviceNowClient.getCaseBySysId("test_sys_id", {
        userId: "U12345",
        channelId: "C123",
      });

      // Assert: Should use NEW path for allowlisted user
      expect(result).not.toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("getCaseBySysId using NEW path"),
        expect.objectContaining({
          userId: "U12345",
          channelId: "C123",
        }),
      );
    });

    it("should use OLD path for non-allowlisted user", async () => {
      // Arrange
      process.env.FEATURE_SERVICENOW_REPOSITORIES_USERS = "U12345";
      featureFlags.refresh();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: [{ sys_id: "test", number: "CS001", short_description: "Test" }],
        }),
      } as Response);

      // Act: Call with different user
      await serviceNowClient.getCaseBySysId("test_sys_id", {
        userId: "U99999", // Not in allowlist
      });

      // Assert: Should use OLD path
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("getCaseBySysId using OLD path"),
        expect.any(Object),
      );
    });
  });

  describe("Percentage-based Rollout", () => {
    it("should route based on percentage when set to 50%", async () => {
      // Arrange
      process.env.FEATURE_SERVICENOW_REPOSITORIES_PCT = "50";
      featureFlags.refresh();

      // Mock repository
      const mockCase = {
        sysId: "test",
        number: "CS001",
        shortDescription: "Test",
        url: "https://example.service-now.com/nav_to.do",
      };

      const mockCaseRepository = {
        findBySysId: vi.fn().mockResolvedValue(mockCase),
      };

      vi.spyOn(repositoryModule, "getCaseRepository").mockReturnValue(
        mockCaseRepository as any,
      );

      // Mock OLD path
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: [{ sys_id: "test", number: "CS001", short_description: "Test" }],
        }),
      } as Response);

      // Act: Call multiple times without userId (uses random)
      // We can't predict which path will be used, but both should work
      const result1 = await serviceNowClient.getCaseBySysId("test");
      const result2 = await serviceNowClient.getCaseBySysId("test");

      // Assert: Both calls should succeed
      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
    });
  });
});
