/**
 * Unit Tests for Case Triage Tool
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAgentTools } from "../../../lib/agent/tools/factory";
import type { ChatMessage } from "../../../lib/agent/types";

// Mock dependencies
vi.mock("../../../lib/tools/servicenow");
vi.mock("../../../lib/services/case-triage");

describe("Case Triage Tool", () => {
  let mockServiceNowClient: any;
  let mockCaseTriageService: any;
  let tools: any;
  const mockUpdateStatus = vi.fn();

  const createMockMessages = (): ChatMessage[] => [
    { role: "user", content: "Triage case SCS0001234" },
  ];

  const createMockCaseDetails = (overrides = {}) => ({
    number: "SCS0001234",
    sys_id: "abc123xyz",
    short_description: "Email delivery issues",
    description: "Users cannot send emails to external recipients",
    priority: "2",
    state: "Open",
    category: "Email",
    subcategory: "Delivery",
    assignment_group: "Email Support",
    assigned_to: "John Doe",
    caller_id: "user123",
    ...overrides,
  });

  const createMockTriageResult = (overrides = {}) => ({
    caseNumber: "SCS0001234",
    classification: {
      category: "Email",
      subcategory: "Email Delivery",
      confidence_score: 0.92,
      urgency_level: "High",
      quick_summary: "Email delivery failure to external recipients",
      reasoning: "Based on error patterns and user impact",
      immediate_next_steps: ["Check email gateway logs", "Verify DNS records"],
      technical_entities: ["Exchange Online", "SMTP", "DNS"],
    },
    similarCases: [
      {
        case_number: "SCS0001111",
        similarity_score: 0.88,
        short_description: "Cannot send emails externally",
      },
    ],
    kbArticles: [
      {
        kb_number: "KB0001",
        title: "Troubleshooting email delivery issues",
        similarity_score: 0.85,
      },
    ],
    processingTimeMs: 1250,
    cached: false,
    recordTypeSuggestion: "incident",
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup ServiceNow client mock
    const serviceNow = await import("../../../lib/tools/servicenow");
    mockServiceNowClient = serviceNow.serviceNowClient as any;
    mockServiceNowClient.isConfigured = vi.fn().mockReturnValue(true);
    mockServiceNowClient.getCase = vi.fn();

    // Setup case triage service mock
    const caseTriage = await import("../../../lib/services/case-triage");
    mockCaseTriageService = {
      triageCase: vi.fn(),
    };
    (caseTriage.getCaseTriageService as any).mockReturnValue(mockCaseTriageService);

    // Create tools
    tools = createAgentTools({
      messages: createMockMessages(),
      caseNumbers: ["SCS0001234"],
      updateStatus: mockUpdateStatus,
      options: {},
    });
  });

  describe("Case Triage - Success Cases", () => {
    it("should triage case successfully", async () => {
      const mockCase = createMockCaseDetails();
      const mockTriageResult = createMockTriageResult();

      mockServiceNowClient.getCase.mockResolvedValue(mockCase);
      mockCaseTriageService.triageCase.mockResolvedValue(mockTriageResult);

      const result = await tools.triageCase.execute({
        caseNumber: "SCS0001234",
      });

      expect(mockServiceNowClient.getCase).toHaveBeenCalledWith(
        "SCS0001234",
        expect.any(Object),
      );
      expect(mockUpdateStatus).toHaveBeenCalledWith(
        "is triaging case SCS0001234..."
      );
      expect(mockCaseTriageService.triageCase).toHaveBeenCalledWith(
        expect.objectContaining({
          case_number: "SCS0001234",
          sys_id: "abc123xyz",
        }),
        expect.objectContaining({
          enableCaching: true,
          enableSimilarCases: true,
          enableKBArticles: true,
          enableBusinessContext: true,
          enableWorkflowRouting: true,
          writeToServiceNow: false,
        })
      );
      expect(result).toEqual({
        success: true,
        case_number: "SCS0001234",
        classification: {
          category: "Email",
          subcategory: "Email Delivery",
          confidence: "92%",
          urgency_level: "High",
          quick_summary: "Email delivery failure to external recipients",
          reasoning: "Based on error patterns and user impact",
          immediate_next_steps: ["Check email gateway logs", "Verify DNS records"],
          technical_entities: ["Exchange Online", "SMTP", "DNS"],
          keywords: [],
        },
        similar_cases_found: 1,
        similar_cases: [
          {
            case_number: "SCS0001111",
            similarity: "88%",
            summary: "Cannot send emails externally",
          },
        ],
        kb_articles_found: 1,
        kb_articles: [
          {
            number: "KB0001",
            title: "Troubleshooting email delivery issues",
            relevance: expect.any(String),
          },
        ],
        processing_time_ms: 1250,
        cached: false,
        record_type_suggestion: "incident",
        message: expect.stringContaining("Email > Email Delivery"),
      });
    });

    it("should handle high confidence triage", async () => {
      const mockCase = createMockCaseDetails();
      const mockTriageResult = createMockTriageResult({
        classification: {
          ...createMockTriageResult().classification,
          confidence_score: 0.98,
        },
      });

      mockServiceNowClient.getCase.mockResolvedValue(mockCase);
      mockCaseTriageService.triageCase.mockResolvedValue(mockTriageResult);

      const result = await tools.triageCase.execute({
        caseNumber: "SCS0001234",
      });

      expect(result.classification.confidence).toBe("98%");
    });

    it("should handle triage with no similar cases", async () => {
      const mockCase = createMockCaseDetails();
      const mockTriageResult = createMockTriageResult({
        similarCases: [],
      });

      mockServiceNowClient.getCase.mockResolvedValue(mockCase);
      mockCaseTriageService.triageCase.mockResolvedValue(mockTriageResult);

      const result = await tools.triageCase.execute({
        caseNumber: "SCS0001234",
      });

      expect(result.similar_cases_found).toBe(0);
      expect(result.similar_cases).toEqual([]);
    });

    it("should handle triage with no KB articles", async () => {
      const mockCase = createMockCaseDetails();
      const mockTriageResult = createMockTriageResult({
        kbArticles: [],
      });

      mockServiceNowClient.getCase.mockResolvedValue(mockCase);
      mockCaseTriageService.triageCase.mockResolvedValue(mockTriageResult);

      const result = await tools.triageCase.execute({
        caseNumber: "SCS0001234",
      });

      expect(result.kb_articles_found).toBe(0);
      expect(result.kb_articles).toEqual([]);
    });

    it("should limit similar cases to top 3", async () => {
      const mockCase = createMockCaseDetails();
      const mockTriageResult = createMockTriageResult({
        similarCases: [
          { case_number: "SCS0001", similarity_score: 0.90, short_description: "Case 1" },
          { case_number: "SCS0002", similarity_score: 0.85, short_description: "Case 2" },
          { case_number: "SCS0003", similarity_score: 0.80, short_description: "Case 3" },
          { case_number: "SCS0004", similarity_score: 0.75, short_description: "Case 4" },
        ],
      });

      mockServiceNowClient.getCase.mockResolvedValue(mockCase);
      mockCaseTriageService.triageCase.mockResolvedValue(mockTriageResult);

      const result = await tools.triageCase.execute({
        caseNumber: "SCS0001234",
      });

      expect(result.similar_cases_found).toBe(4);
      expect(result.similar_cases?.length).toBe(3);
    });

    it("should handle cached triage results", async () => {
      const mockCase = createMockCaseDetails();
      const mockTriageResult = createMockTriageResult({
        cached: true,
        processingTimeMs: 50,
      });

      mockServiceNowClient.getCase.mockResolvedValue(mockCase);
      mockCaseTriageService.triageCase.mockResolvedValue(mockTriageResult);

      const result = await tools.triageCase.execute({
        caseNumber: "SCS0001234",
      });

      expect(result.cached).toBe(true);
      expect(result.processing_time_ms).toBe(50);
    });
  });

  describe("Case Triage - Error Cases", () => {
    it("should return error when ServiceNow not configured", async () => {
      mockServiceNowClient.isConfigured.mockReturnValue(false);

      const result = await tools.triageCase.execute({
        caseNumber: "SCS0001234",
      });

      expect(result).toEqual({
        error: expect.stringContaining("ServiceNow integration is not configured"),
      });
    });

    it("should return error when case number is empty", async () => {
      const result = await tools.triageCase.execute({
        caseNumber: "",
      });

      expect(result).toEqual({
        error: "Case number is required for triage.",
      });
    });

    it("should return error when case number is whitespace", async () => {
      const result = await tools.triageCase.execute({
        caseNumber: "   ",
      });

      expect(result).toEqual({
        error: "Case number is required for triage.",
      });
    });

    it("should return error when case not found", async () => {
      mockServiceNowClient.getCase.mockResolvedValue(null);

      const result = await tools.triageCase.execute({
        caseNumber: "SCS9999999",
      });

      expect(result).toEqual({
        error: expect.stringContaining("Case SCS9999999 not found in ServiceNow"),
      });
    });

    it("should handle triage service errors", async () => {
      const mockCase = createMockCaseDetails();
      mockServiceNowClient.getCase.mockResolvedValue(mockCase);
      mockCaseTriageService.triageCase.mockRejectedValue(
        new Error("Triage AI service unavailable")
      );

      const result = await tools.triageCase.execute({
        caseNumber: "SCS0001234",
      });

      expect(result).toEqual({
        error: "Triage AI service unavailable",
      });
    });

    it("should handle non-Error exceptions", async () => {
      const mockCase = createMockCaseDetails();
      mockServiceNowClient.getCase.mockResolvedValue(mockCase);
      mockCaseTriageService.triageCase.mockRejectedValue("String error");

      const result = await tools.triageCase.execute({
        caseNumber: "SCS0001234",
      });

      expect(result).toEqual({
        error: "Failed to triage case. Please try again or contact support.",
      });
    });
  });
});
