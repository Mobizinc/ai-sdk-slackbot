/**
 * Unit Tests for Create Case Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCreateCaseTool } from "../../../../../lib/agent/tools/servicenow/case/create-case.tool";
import type { Case } from "../../../../../lib/infrastructure/servicenow/types/domain-models";

vi.mock("../../../../../lib/infrastructure/servicenow/repositories", () => ({
  getCaseRepository: vi.fn(),
}));

import { getCaseRepository } from "../../../../../lib/infrastructure/servicenow/repositories";

describe("Create Case Tool", () => {
  let mockCaseRepo: any;
  let tool: any;
  const mockUpdateStatus = vi.fn();

  const createMockCase = (overrides?: Partial<Case>): Case => ({
    sysId: "case-sys-id-new",
    number: "SCS1234567",
    shortDescription: "New customer case",
    description: "Customer reported an issue",
    state: "Open",
    priority: "3",
    assignedTo: "John Doe",
    assignmentGroup: "Customer Support",
    url: "https://instance.service-now.com/case.do?sys_id=case-sys-id-new",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockCaseRepo = {
      create: vi.fn(),
    };
    (getCaseRepository as any).mockReturnValue(mockCaseRepo);
    tool = createCreateCaseTool({
      messages: [],
      caseNumbers: [],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful Case Creation", () => {
    it("should create case with required shortDescription only", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.create.mockResolvedValue(mockCase);

      const result = await tool.execute({
        shortDescription: "Customer billing inquiry",
      });

      expect(mockCaseRepo.create).toHaveBeenCalledWith({
        shortDescription: "Customer billing inquiry",
        description: undefined,
        callerId: undefined,
        contact: undefined,
        account: undefined,
        category: undefined,
        subcategory: undefined,
        priority: undefined,
        assignmentGroup: undefined,
      });
      expect(result.success).toBe(true);
      expect(result.data?.case.number).toBe("SCS1234567");
      expect(result.data?.message).toContain("Successfully created case SCS1234567");
    });

    it("should create case with all optional fields", async () => {
      const mockCase = createMockCase({
        category: "Billing",
        priority: "2",
      });
      mockCaseRepo.create.mockResolvedValue(mockCase);

      const result = await tool.execute({
        shortDescription: "Premium support request",
        description: "Customer needs priority support",
        callerId: "caller-123",
        contact: "contact-456",
        account: "account-789",
        category: "Billing",
        subcategory: "Payment",
        priority: "2",
        assignmentGroup: "Premium Support",
      });

      expect(mockCaseRepo.create).toHaveBeenCalledWith({
        shortDescription: "Premium support request",
        description: "Customer needs priority support",
        callerId: "caller-123",
        contact: "contact-456",
        account: "account-789",
        category: "Billing",
        subcategory: "Payment",
        priority: "2",
        assignmentGroup: "Premium Support",
      });
      expect(result.success).toBe(true);
    });

    it("should return formatted case object with all fields", async () => {
      const mockCase = createMockCase({
        number: "SCS9999999",
        state: "Open",
      });
      mockCaseRepo.create.mockResolvedValue(mockCase);

      const result = await tool.execute({
        shortDescription: "Website login issue",
        category: "Technical",
        priority: "2",
      });

      expect(result.success).toBe(true);
      expect(result.data?.case).toMatchObject({
        sysId: "case-sys-id-new",
        number: "SCS9999999",
        shortDescription: "New customer case",
        state: "Open",
        url: expect.stringContaining("case.do"),
      });
    });

    it("should update status during creation", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.create.mockResolvedValue(mockCase);

      await tool.execute({
        shortDescription: "Test case",
      });

      expect(mockUpdateStatus).toHaveBeenCalledWith("is creating case...");
    });

    it("should handle special characters in description", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.create.mockResolvedValue(mockCase);

      const specialDescription = "Issue with & special < > chars";
      const result = await tool.execute({
        shortDescription: "Test case",
        description: specialDescription,
      });

      expect(mockCaseRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: specialDescription,
        })
      );
      expect(result.success).toBe(true);
    });
  });

  describe("Required Field Validation", () => {
    it("should require shortDescription parameter", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.create.mockResolvedValue(mockCase);

      const result = await tool.execute({
        shortDescription: "Valid description",
      });

      expect(mockCaseRepo.create).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("should accept valid case data with all fields", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.create.mockResolvedValue(mockCase);

      const result = await tool.execute({
        shortDescription: "Complete case information",
        description: "Full details here",
        category: "Technical",
      });

      expect(mockCaseRepo.create).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle repository creation error", async () => {
      mockCaseRepo.create.mockRejectedValue(
        new Error("Failed to save case in ServiceNow")
      );

      const result = await tool.execute({
        shortDescription: "Test case",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Failed to save case in ServiceNow");
      expect(result.error?.details).toEqual({
        shortDescription: "Test case",
      });
    });

    it("should handle authentication errors", async () => {
      mockCaseRepo.create.mockRejectedValue(
        new Error("Unauthorized: Invalid credentials")
      );

      const result = await tool.execute({
        shortDescription: "Urgent support",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toContain("Unauthorized");
    });

    it("should handle network timeout errors", async () => {
      mockCaseRepo.create.mockRejectedValue(
        new Error("Request timeout after 30 seconds")
      );

      const result = await tool.execute({
        shortDescription: "Support request",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toContain("timeout");
    });

    it("should handle non-Error objects thrown from repository", async () => {
      mockCaseRepo.create.mockRejectedValue("String error thrown");

      const result = await tool.execute({
        shortDescription: "Test case",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
      expect(result.error?.message).toBe("Failed to create case");
    });

    it("should include request details in error for debugging", async () => {
      mockCaseRepo.create.mockRejectedValue(
        new Error("Validation failed: Invalid category")
      );

      const result = await tool.execute({
        shortDescription: "Test case",
        category: "InvalidCategory",
      });

      expect(result.success).toBe(false);
      expect(result.error?.details).toEqual({
        shortDescription: "Test case",
      });
    });

    it("should handle invalid category error", async () => {
      mockCaseRepo.create.mockRejectedValue(
        new Error("Category 'Unknown' is not valid")
      );

      const result = await tool.execute({
        shortDescription: "Test case",
        category: "Unknown",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("FETCH_ERROR");
    });
  });

  describe("Repository Method Called with Correct Parameters", () => {
    it("should pass all parameters to repository.create", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.create.mockResolvedValue(mockCase);

      const input = {
        shortDescription: "Technical support needed",
        description: "Customer cannot access their account",
        callerId: "user@example.com",
        contact: "contact-id",
        account: "account-id",
        category: "Technical",
        subcategory: "Access",
        priority: "1",
        assignmentGroup: "Technical Support",
      };

      await tool.execute(input);

      expect(mockCaseRepo.create).toHaveBeenCalledWith(input);
    });

    it("should call repository.create exactly once", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.create.mockResolvedValue(mockCase);

      await tool.execute({
        shortDescription: "Test case",
      });

      expect(mockCaseRepo.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("Result Format Validation", () => {
    it("should use createSuccessResult for successful operations", async () => {
      const mockCase = createMockCase();
      mockCaseRepo.create.mockResolvedValue(mockCase);

      const result = await tool.execute({
        shortDescription: "Test case",
      });

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("data");
      expect(result).not.toHaveProperty("error");
      expect(result.data).toMatchObject({
        case: expect.any(Object),
        message: expect.any(String),
      });
    });

    it("should use createErrorResult for failures", async () => {
      mockCaseRepo.create.mockRejectedValue(new Error("Creation failed"));

      const result = await tool.execute({
        shortDescription: "Test case",
      });

      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("error");
      expect(result.error).toMatchObject({
        code: "FETCH_ERROR",
        message: expect.any(String),
        details: expect.any(Object),
      });
      expect(result).not.toHaveProperty("data");
    });

    it("should include case number in success message", async () => {
      const mockCase = createMockCase({
        number: "SCS9876543",
      });
      mockCaseRepo.create.mockResolvedValue(mockCase);

      const result = await tool.execute({
        shortDescription: "Support request",
      });

      expect(result.success).toBe(true);
      expect(result.data?.message).toContain("SCS9876543");
    });
  });

  describe("Logging", () => {
    it("should log case creation start", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");
      const mockCase = createMockCase();
      mockCaseRepo.create.mockResolvedValue(mockCase);

      await tool.execute({
        shortDescription: "Test case creation",
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("[create_case] Creating case:")
      );

      consoleLogSpy.mockRestore();
    });

    it("should log errors with context", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error");
      mockCaseRepo.create.mockRejectedValue(new Error("DB connection failed"));

      await tool.execute({
        shortDescription: "Test case",
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[create_case] Error:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
