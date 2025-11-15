/**
 * Unit Tests for Case Triage Storage Module
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TriageStorage, type CaseClassificationRepository } from "../../lib/services/case-triage/storage";
import type { ServiceNowCaseWebhook } from "../../lib/schemas/servicenow-webhook";
import type { CaseClassification } from "../../lib/services/case-classifier";

describe("TriageStorage", () => {
  let storage: TriageStorage;
  let mockRepository: CaseClassificationRepository;

  beforeEach(() => {
    // Create mock repository
    mockRepository = {
      saveInboundPayload: vi.fn().mockResolvedValue(undefined),
      getUnprocessedPayload: vi.fn().mockResolvedValue({ id: 123 }),
      markPayloadAsProcessed: vi.fn().mockResolvedValue(undefined),
      saveClassificationResult: vi.fn().mockResolvedValue(undefined),
      saveDiscoveredEntities: vi.fn().mockResolvedValue(undefined),
      getLatestClassificationResult: vi.fn().mockResolvedValue(null),
      getClassificationStats: vi.fn().mockResolvedValue({}),
    };

    storage = new TriageStorage(mockRepository);
  });

  describe("recordInbound()", () => {
    const mockWebhook: ServiceNowCaseWebhook = {
      case_number: "SCS0012345",
      sys_id: "abc123",
      assignment_group: "IT Support",
      assigned_to: "john.doe",
      category: "Network",
      subcategory: "Wi-Fi",
      priority: "3",
      state: "Open",
    } as ServiceNowCaseWebhook;

    it("should save inbound payload and return ID", async () => {
      const id = await storage.recordInbound(mockWebhook);

      expect(id).toBe(123);
      expect(mockRepository.saveInboundPayload).toHaveBeenCalledWith({
        caseNumber: "SCS0012345",
        caseSysId: "abc123",
        rawPayload: mockWebhook,
        routingContext: {
          assignmentGroup: "IT Support",
          assignedTo: "john.doe",
          category: "Network",
          subcategory: "Wi-Fi",
          priority: "3",
          state: "Open",
        },
      });
      expect(mockRepository.getUnprocessedPayload).toHaveBeenCalledWith("SCS0012345");
    });

    it("should return null if getUnprocessedPayload returns null", async () => {
      mockRepository.getUnprocessedPayload = vi.fn().mockResolvedValue(null);

      const id = await storage.recordInbound(mockWebhook);

      expect(id).toBeNull();
    });

    it("should return null and log error on save failure", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockRepository.saveInboundPayload = vi.fn().mockRejectedValue(new Error("DB error"));

      const id = await storage.recordInbound(mockWebhook);

      expect(id).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Case Triage Storage] Failed to record inbound payload:",
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it("should handle missing optional fields", async () => {
      const minimalWebhook: ServiceNowCaseWebhook = {
        case_number: "SCS0012345",
        sys_id: "abc123",
      } as ServiceNowCaseWebhook;

      const id = await storage.recordInbound(minimalWebhook);

      expect(id).toBe(123);
      expect(mockRepository.saveInboundPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          caseNumber: "SCS0012345",
          caseSysId: "abc123",
        })
      );
    });
  });

  describe("saveClassification()", () => {
    const mockClassification: CaseClassification = {
      category: "Network",
      subcategory: "Wi-Fi",
      confidence_score: 0.92,
      reasoning: "User reported Wi-Fi connectivity issues",
      keywords: ["wifi", "connection", "timeout"],
      token_usage_input: 15000,
      token_usage_output: 1200,
      total_tokens: 16200,
      model_used: "claude-sonnet-4-5",
      llm_provider: "anthropic",
      similar_cases_count: 3,
      kb_articles_count: 2,
      service_offering: "Network Infrastructure",
      application_service: "Wireless Access",
      business_intelligence: {
        project_scope_detected: true,
        executive_visibility: false,
        compliance_impact: false,
        financial_impact: false,
      },
    };

    it("should save classification with all metadata", async () => {
      await storage.saveClassification({
        caseNumber: "SCS0012345",
        workflowId: "standard",
        classification: mockClassification,
        processingTimeMs: 2500,
        servicenowUpdated: true,
      });

      expect(mockRepository.saveClassificationResult).toHaveBeenCalledWith({
        caseNumber: "SCS0012345",
        workflowId: "standard",
        classificationJson: mockClassification,
        tokenUsage: {
          promptTokens: 15000,
          completionTokens: 1200,
          totalTokens: 16200,
        },
        cost: expect.any(Number), // Calculated by scoring module
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        processingTimeMs: 2500,
        servicenowUpdated: true,
        entitiesCount: 0,
        similarCasesCount: 3,
        kbArticlesCount: 2,
        businessIntelligenceDetected: true,
        confidenceScore: 0.92,
        retryCount: 0,
        serviceOffering: "Network Infrastructure",
        applicationService: "Wireless Access",
      });
    });

    it("should detect business intelligence flags correctly", async () => {
      const biCases = [
        { field: "project_scope_detected", value: true },
        { field: "executive_visibility", value: true },
        { field: "compliance_impact", value: true },
        { field: "financial_impact", value: true },
      ];

      for (const testCase of biCases) {
        mockRepository.saveClassificationResult = vi.fn();
        const classification = {
          ...mockClassification,
          business_intelligence: { [testCase.field]: testCase.value },
        };

        await storage.saveClassification({
          caseNumber: "SCS0012345",
          workflowId: "standard",
          classification,
          processingTimeMs: 1000,
          servicenowUpdated: false,
        });

        expect(mockRepository.saveClassificationResult).toHaveBeenCalledWith(
          expect.objectContaining({
            businessIntelligenceDetected: true,
          })
        );
      }
    });

    it("should handle missing token usage gracefully", async () => {
      const classificationWithoutTokens: CaseClassification = {
        category: "Network",
        confidence_score: 0.85,
        reasoning: "Test",
        keywords: [],
      };

      await storage.saveClassification({
        caseNumber: "SCS0012345",
        workflowId: "standard",
        classification: classificationWithoutTokens,
        processingTimeMs: 1000,
        servicenowUpdated: false,
      });

      expect(mockRepository.saveClassificationResult).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenUsage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
          provider: "unknown",
          model: "unknown",
        })
      );
    });

    it("should not throw on save failure", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockRepository.saveClassificationResult = vi.fn().mockRejectedValue(new Error("DB error"));

      await expect(
        storage.saveClassification({
          caseNumber: "SCS0012345",
          workflowId: "standard",
          classification: mockClassification,
          processingTimeMs: 1000,
          servicenowUpdated: false,
        })
      ).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("saveEntities()", () => {
    const mockClassificationWithEntities: CaseClassification = {
      category: "Network",
      confidence_score: 0.85,
      reasoning: "Test",
      keywords: [],
      technical_entities: {
        ip_addresses: ["192.168.1.100", "10.0.0.5"],
        systems: ["exchange-server-01", "dc-server-02"],
        users: ["john.doe@example.com"],
        software: ["Microsoft Outlook", "VPN Client"],
        error_codes: ["0x80070005"],
        network_devices: ["switch-01"],
      },
    };

    it("should save all entity types correctly", async () => {
      const count = await storage.saveEntities("SCS0012345", "abc123", mockClassificationWithEntities);

      expect(count).toBe(9); // 2 IPs + 2 systems + 1 user + 2 software + 1 error + 1 network device
      expect(mockRepository.saveDiscoveredEntities).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            entityType: "IP_ADDRESS",
            entityValue: "192.168.1.100",
          }),
          expect.objectContaining({
            entityType: "IP_ADDRESS",
            entityValue: "10.0.0.5",
          }),
          expect.objectContaining({
            entityType: "SYSTEM",
            entityValue: "exchange-server-01",
          }),
          expect.objectContaining({
            entityType: "USER",
            entityValue: "john.doe@example.com",
          }),
          expect.objectContaining({
            entityType: "SOFTWARE",
            entityValue: "Microsoft Outlook",
          }),
          expect.objectContaining({
            entityType: "ERROR_CODE",
            entityValue: "0x80070005",
          }),
          expect.objectContaining({
            entityType: "NETWORK_DEVICE",
            entityValue: "switch-01",
          }),
        ])
      );
    });

    it("should return 0 if no technical_entities present", async () => {
      const classificationNoEntities: CaseClassification = {
        category: "Network",
        confidence_score: 0.85,
        reasoning: "Test",
        keywords: [],
      };

      const count = await storage.saveEntities("SCS0012345", "abc123", classificationNoEntities);

      expect(count).toBe(0);
      expect(mockRepository.saveDiscoveredEntities).not.toHaveBeenCalled();
    });

    it("should skip unknown entity types", async () => {
      const classificationUnknownTypes: CaseClassification = {
        category: "Network",
        confidence_score: 0.85,
        reasoning: "Test",
        keywords: [],
        technical_entities: {
          ip_addresses: ["192.168.1.100"],
          unknown_type: ["something"], // Unknown type
        } as any,
      };

      const count = await storage.saveEntities("SCS0012345", "abc123", classificationUnknownTypes);

      expect(count).toBe(1); // Only IP address
    });

    it("should truncate long entity values to 500 chars", async () => {
      const longValue = "a".repeat(600);
      const classificationLongValue: CaseClassification = {
        category: "Network",
        confidence_score: 0.85,
        reasoning: "Test",
        keywords: [],
        technical_entities: {
          systems: [longValue],
        },
      };

      await storage.saveEntities("SCS0012345", "abc123", classificationLongValue);

      expect(mockRepository.saveDiscoveredEntities).toHaveBeenCalledWith([
        expect.objectContaining({
          entityValue: "a".repeat(500),
        }),
      ]);
    });

    it("should set default confidence score if missing", async () => {
      const classificationNoConfidence: CaseClassification = {
        category: "Network",
        reasoning: "Test",
        keywords: [],
        technical_entities: {
          ip_addresses: ["192.168.1.100"],
        },
      };

      await storage.saveEntities("SCS0012345", "abc123", classificationNoConfidence);

      expect(mockRepository.saveDiscoveredEntities).toHaveBeenCalledWith([
        expect.objectContaining({
          confidence: 0.5, // Default
        }),
      ]);
    });

    it("should return 0 and not throw on save failure", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockRepository.saveDiscoveredEntities = vi.fn().mockRejectedValue(new Error("DB error"));

      const count = await storage.saveEntities("SCS0012345", "abc123", mockClassificationWithEntities);

      expect(count).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it("should log entity type counts on success", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await storage.saveEntities("SCS0012345", "abc123", mockClassificationWithEntities);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "[Case Triage Storage] Stored 9 entities for SCS0012345:",
        expect.objectContaining({
          IP_ADDRESS: 2,
          SYSTEM: 2,
          USER: 1,
          SOFTWARE: 2,
          ERROR_CODE: 1,
          NETWORK_DEVICE: 1,
        })
      );

      consoleLogSpy.mockRestore();
    });

    it("should skip non-array entity values", async () => {
      const classificationNonArray: CaseClassification = {
        category: "Network",
        confidence_score: 0.85,
        reasoning: "Test",
        keywords: [],
        technical_entities: {
          ip_addresses: "192.168.1.100", // String instead of array
        } as any,
      };

      const count = await storage.saveEntities("SCS0012345", "abc123", classificationNonArray);

      expect(count).toBe(0);
    });
  });
});
