import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IncidentEnrichmentService } from "../lib/services/incident-enrichment-service";
import { serviceNowClient } from "../lib/tools/servicenow";
import { getIncidentNoteAnalyzerService } from "../lib/services/incident-note-analyzer";
import { getCIMatchingService } from "../lib/services/ci-matching-service";
import { getIncidentClarificationService } from "../lib/services/incident-clarification-service";
import { getIncidentEnrichmentRepository } from "../lib/db/repositories/incident-enrichment-repository";
import type { ExtractedEntities } from "../lib/services/incident-note-analyzer";
import type { IncidentEnrichmentState } from "../lib/db/schema";

// Mock all dependencies
vi.mock("../lib/tools/servicenow");
vi.mock("../lib/services/incident-note-analyzer");
vi.mock("../lib/services/ci-matching-service");
vi.mock("../lib/services/incident-clarification-service");
vi.mock("../lib/db/repositories/incident-enrichment-repository");

const mockServiceNowClient = vi.mocked(serviceNowClient);
const mockNoteAnalyzer = vi.mocked(getIncidentNoteAnalyzerService);
const mockCiMatcher = vi.mocked(getCIMatchingService);
const mockClarificationService = vi.mocked(getIncidentClarificationService);

// Create proper mock repository
const mockRepository = {
  getIncidentBySysId: vi.fn(),
  updateExtractedEntities: vi.fn(),
  updateEnrichmentStage: vi.fn(),
  updateMatchedCis: vi.fn(),
  recordIncident: vi.fn(),
  getActiveIncidents: vi.fn(),
  updateConfidenceScores: vi.fn(),
  updateLastProcessedAt: vi.fn(),
};

// Mock the factory function
vi.mocked(getIncidentEnrichmentRepository).mockReturnValue(mockRepository);

describe("IncidentEnrichmentService", () => {
  let service: IncidentEnrichmentService;
  const mockIncidentState: IncidentEnrichmentState = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    incidentSysId: "incident_sys_id_123",
    incidentNumber: "INC001001",
    caseSysId: "case_sys_id_456",
    caseNumber: null,
    enrichmentStage: "created",
    extractedEntities: {
      ip_addresses: [],
      hostnames: [],
      edge_names: [],
      error_messages: [],
      system_names: [],
      account_numbers: [],
    },
    matchedCis: [],
    confidenceScores: {
      overall: 0,
      ci_match: 0,
      entity_extraction: 0,
    },
    clarificationRequestedAt: null,
    clarificationSlackTs: null,
    enrichmentAttempts: 0,
    lastWorkNoteAt: null,
    metadata: {
      slack_channel_id: "C123456",
      slack_thread_ts: "1234567890.123456",
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    lastProcessedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IncidentEnrichmentService();
    
    // Setup default mocks
    mockRepository.getIncidentBySysId.mockResolvedValue(mockIncidentState);
    mockServiceNowClient.getIncident.mockResolvedValue({
      sys_id: "incident_sys_id_123",
      number: "INC001001",
      short_description: "Network outage",
      description: "Customers reporting connectivity issues",
      url: "https://test.service-now.com/incident.do?sys_id=incident_sys_id_123",
    });
    mockServiceNowClient.getIncidentWorkNotes.mockResolvedValue([
      {
        sys_id: "note_1",
        element: "comments",
        element_id: "incident_sys_id_123",
        value: "Server 192.168.1.100 is down",
        sys_created_on: "2025-01-01T12:00:00Z",
        sys_created_by: "admin.user",
      },
    ]);
    
    // Create proper mock for note analyzer with all required properties
    const mockNoteAnalyzerInstance = {
      anthropic: null,
      extractAccountNumbersRegex: /\bACCT\d{7}\b/gi,
      extractIPAddressesRegex: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
      analyzeNotes: vi.fn().mockResolvedValue({
        entities: {
          ip_addresses: ["192.168.1.100"],
          hostnames: [],
          edge_names: [],
          error_messages: [],
          system_names: [],
          account_numbers: [],
        },
        summary: "Network connectivity issues detected",
        confidence: 0.9,
        tokenUsage: { input: 100, output: 50, total: 150 },
      }),
      generateEnrichmentSummary: vi.fn().mockReturnValue("## Automated Incident Enrichment\n\n**IP Addresses:** 192.168.1.100"),
    };
    mockNoteAnalyzer.mockReturnValue(mockNoteAnalyzerInstance);

    // Create proper mock for CI matcher
    const mockCiMatcherInstance = {
      confidenceThreshold: 70,
      matchCMDB: vi.fn(),
      getRecommendedCI: vi.fn(),
      matchEntities: vi.fn().mockResolvedValue({
        matches: [{
          sysId: "ci-123",
          name: "server01",
          class: "cmdb_ci_server",
          confidence: 95,
          source: "cmdb" as const,
          matchedAt: "2025-01-01T12:00:00Z",
          matchReason: "IP address match: 192.168.1.100",
        }],
        highConfidenceMatches: [{
          sysId: "ci-123",
          name: "server01",
          class: "cmdb_ci_server",
          confidence: 95,
          source: "cmdb" as const,
          matchedAt: "2025-01-01T12:00:00Z",
          matchReason: "IP address match: 192.168.1.100",
        }],
        lowConfidenceMatches: [],
        overallConfidence: 95,
      }),
    };
    mockCiMatcher.mockReturnValue(mockCiMatcherInstance);

    // Create proper mock for clarification service
    const mockClarificationInstance = {
      pendingClarifications: new Map(),
      clarificationTTL: 24 * 60 * 60 * 1000, // 24 hours in ms
      handleClarificationResponse: vi.fn(),
      handleSkipAction: vi.fn(),
      requestClarification: vi.fn().mockResolvedValue({
        success: true,
        messageTs: "1234567890.123456",
      }),
      getPendingClarification: vi.fn(),
      cleanupExpiredClarifications: vi.fn(),
    };
    mockClarificationService.mockReturnValue(mockClarificationInstance);

    // Setup repository mocks
    mockRepository.updateExtractedEntities.mockResolvedValue();
    mockRepository.updateEnrichmentStage.mockResolvedValue();
    mockRepository.updateMatchedCis.mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("High Confidence Flow", () => {
    it("✓ High confidence flow: fetches incident → analyzes notes → matches CI → auto-links → updates case", async () => {
      const result = await service.enrichIncident("INC001001");

      expect(result.success).toBe(true);
      expect(result.stage).toBe("completed");
      expect(result.ciLinked).toBe(true);
      expect(result.ciSysId).toBe("ci-123");
      expect(result.ciName).toBe("server01");
      expect(result.clarificationNeeded).toBe(false);

      // Verify repository calls
      expect(mockRepository.updateExtractedEntities).toHaveBeenCalledWith(
        "incident_sys_id_123",
        expect.objectContaining({
          ip_addresses: ["192.168.1.100"],
        })
      );
      expect(mockRepository.updateMatchedCis).toHaveBeenCalledWith(
        "incident_sys_id_123",
        expect.arrayContaining([
          expect.objectContaining({
            sysId: "ci-123",
            confidence: 95,
          }),
        ])
      );
      expect(mockRepository.updateEnrichmentStage).toHaveBeenCalledWith(
        "incident_sys_id_123",
        "completed"
      );
    });
  });

  describe("Low Confidence Flow", () => {
    it("✓ Low confidence flow: fetches incident → analyzes notes → matches CI → requests clarification", async () => {
      // Mock low confidence match
      const mockCiMatcherInstance = {
        confidenceThreshold: 70,
        matchCMDB: vi.fn(),
        getRecommendedCI: vi.fn(),
        matchEntities: vi.fn().mockResolvedValue({
          matches: [{
            sysId: "ci-low",
            name: "low-confidence-server",
            class: "cmdb_ci_server",
            confidence: 60, // Below threshold
            source: "cmdb" as const,
            matchedAt: "2025-01-01T12:00:00Z",
            matchReason: "Partial name match",
          }],
          highConfidenceMatches: [],
          lowConfidenceMatches: [{
            sysId: "ci-low",
            name: "low-confidence-server",
            class: "cmdb_ci_server",
            confidence: 60,
            source: "cmdb" as const,
            matchedAt: "2025-01-01T12:00:00Z",
            matchReason: "Partial name match",
          }],
          overallConfidence: 60,
        }),
      };
      mockCiMatcher.mockReturnValue(mockCiMatcherInstance);

      const result = await service.enrichIncident("INC001001");

      expect(result.success).toBe(true);
      expect(result.stage).toBe("clarification_pending");
      expect(result.clarificationNeeded).toBe(true);
      expect(result.ciLinked).toBe(false);

      // Verify clarification was requested
      expect(mockClarificationService().requestClarification).toHaveBeenCalled();
    });
  });

  describe("No Matches Flow", () => {
    it("✓ No matches flow: analyzes notes → no CIs found → adds work note → marks enriched", async () => {
      // Mock no matches
      const mockCiMatcherInstance = {
        confidenceThreshold: 70,
        matchCMDB: vi.fn(),
        getRecommendedCI: vi.fn(),
        matchEntities: vi.fn().mockResolvedValue({
          matches: [],
          highConfidenceMatches: [],
          lowConfidenceMatches: [],
          overallConfidence: 0,
        }),
      };
      mockCiMatcher.mockReturnValue(mockCiMatcherInstance);

      const result = await service.enrichIncident("INC001001");

      expect(result.success).toBe(true);
      expect(result.stage).toBe("completed");
      expect(result.ciLinked).toBe(false);
      expect(result.clarificationNeeded).toBe(false);
    });
  });

  describe("Error Flow", () => {
    it("✓ Error flow: getIncident returns null → marks as error stage → no retry", async () => {
      mockServiceNowClient.getIncident.mockResolvedValue(null);

      const result = await service.enrichIncident("INC001001");

      expect(result.success).toBe(false);
      expect(result.stage).toBe("error");
      expect(result.message).toContain("Incident not found");
    });

    it("✓ Incident not found in watchlist", async () => {
      mockRepository.getIncidentBySysId.mockResolvedValue(null);

      const result = await service.enrichIncident("INC001001");

      expect(result.success).toBe(false);
      expect(result.message).toContain("not found in watchlist");
    });
  });

  describe("Feature Flag", () => {
    it("✓ Feature flag disabled: returns early with disabled message", async () => {
      // Mock feature flag as disabled
      vi.doMock("../lib/services/app-settings", () => ({
        getAppSettingWithFallback: vi.fn().mockResolvedValue("false"),
      }));

      const disabledService = new IncidentEnrichmentService();
      const result = await disabledService.processIncident("INC001001");

      expect(result.success).toBe(false);
      expect(result.message).toContain("disabled");
    });
  });
});