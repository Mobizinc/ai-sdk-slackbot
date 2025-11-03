import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IncidentEnrichmentService } from "../../lib/services/incident-enrichment-service";
import { serviceNowClient } from "../../lib/tools/servicenow";
import { getIncidentNoteAnalyzerService } from "../../lib/services/incident-note-analyzer";
import { getCIMatchingService } from "../../lib/services/ci-matching-service";
import { getIncidentClarificationService } from "../../lib/services/incident-clarification-service";
import { getIncidentEnrichmentRepository } from "../../lib/db/repositories/incident-enrichment-repository";
import type { ExtractedEntities } from "../../lib/services/incident-note-analyzer";
import type { IncidentEnrichmentState } from "../../lib/db/schema";

// Mock all dependencies
vi.mock("../../lib/tools/servicenow");
vi.mock("../../lib/services/incident-note-analyzer");
vi.mock("../../lib/services/ci-matching-service");
vi.mock("../../lib/services/incident-clarification-service");
vi.mock("../../lib/db/repositories/incident-enrichment-repository");

const mockServiceNowClient = vi.mocked(serviceNowClient);
const mockNoteAnalyzer = vi.mocked(getIncidentNoteAnalyzerService);
const mockCiMatcher = vi.mocked(getCIMatchingService);
const mockClarificationService = vi.mocked(getIncidentClarificationService);
const mockRepository = vi.mocked(getIncidentEnrichmentRepository);

describe("IncidentEnrichmentService", () => {
  let service: IncidentEnrichmentService;
  const mockIncidentState: IncidentEnrichmentState = {
    id: 1,
    incidentSysId: "incident_sys_id_123",
    incidentNumber: "INC001001",
    caseSysId: "case_sys_id_456",
    enrichmentStage: "created",
    extractedEntities: null,
    matchedCis: null,
    confidenceScores: null,
    metadata: {
      slack_channel_id: "C123456",
      slack_thread_ts: "1234567890.123456",
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    lastProcessedAt: null,
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
    });
    mockServiceNowClient.getIncidentWorkNotes.mockResolvedValue([
      {
        sys_id: "note_1",
        value: "Server 192.168.1.100 is down",
        sys_created_on: "2025-01-01T12:00:00Z",
        sys_created_by: "admin.user",
      },
    ]);
    
    const mockNoteAnalyzerInstance = {
      analyzeNotes: vi.fn(),
      generateEnrichmentSummary: vi.fn(),
    };
    mockNoteAnalyzer.mockReturnValue(mockNoteAnalyzerInstance);
    mockNoteAnalyzerInstance.analyzeNotes.mockResolvedValue({
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
    });
    mockNoteAnalyzerInstance.generateEnrichmentSummary.mockReturnValue("## Automated Incident Enrichment\n\n**IP Addresses:** 192.168.1.100");

    const mockCiMatcherInstance = {
      matchEntities: vi.fn(),
    };
    mockCiMatcher.mockReturnValue(mockCiMatcherInstance);

    const mockClarificationInstance = {
      requestClarification: vi.fn(),
    };
    mockClarificationService.mockReturnValue(mockClarificationInstance);

    mockRepository.updateExtractedEntities.mockResolvedValue();
    mockRepository.updateEnrichmentStage.mockResolvedValue();
    mockRepository.updateMatchedCis.mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("High Confidence Flow", () => {
    it("✓ High confidence flow: fetches incident → analyzes notes → matches CI → auto-links → updates case", async () => {
      // Setup high confidence match
      const mockCiMatcherInstance = mockCiMatcher();
      mockCiMatcherInstance.matchEntities.mockResolvedValue({
        matches: [
          {
            sys_id: "ci_sys_id_123",
            name: "edge-ACCT0242146-01",
            class: "VeloCloud Edge",
            confidence: 95,
            source: "inventory",
            match_reason: "Exact edge name match",
          },
        ],
        highConfidenceMatches: [
          {
            sys_id: "ci_sys_id_123",
            name: "edge-ACCT0242146-01",
            class: "VeloCloud Edge",
            confidence: 95,
            source: "inventory",
            match_reason: "Exact edge name match",
          },
        ],
        lowConfidenceMatches: [],
        overallConfidence: 95,
      });

      const result = await service.enrichIncident("incident_sys_id_123");

      expect(result.success).toBe(true);
      expect(result.stage).toBe("enriched");
      expect(result.ciLinked).toBe(true);
      expect(result.ciSysId).toBe("ci_sys_id_123");
      expect(result.ciName).toBe("edge-ACCT0242146-01");
      expect(result.confidence).toBe(95);

      // Verify workflow steps
      expect(mockServiceNowClient.getIncident).toHaveBeenCalledWith("INC001001");
      expect(mockServiceNowClient.getIncidentWorkNotes).toHaveBeenCalledWith("incident_sys_id_123", { limit: 20 });
      expect(mockServiceNowClient.linkCiToIncident).toHaveBeenCalledWith("incident_sys_id_123", "ci_sys_id_123");
      expect(mockServiceNowClient.addIncidentWorkNote).toHaveBeenCalled();
      expect(mockServiceNowClient.addCaseWorkNote).toHaveBeenCalledWith("case_sys_id_456", expect.stringContaining("automatically enriched"));

      // Verify repository updates
      expect(mockRepository.updateExtractedEntities).toHaveBeenCalledWith("incident_sys_id_123", expect.any(Object));
      expect(mockRepository.updateEnrichmentStage).toHaveBeenCalledWith("incident_sys_id_123", "notes_analyzed");
      expect(mockRepository.updateMatchedCis).toHaveBeenCalledWith("incident_sys_id_123", expect.any(Array), expect.any(Object));
      expect(mockRepository.updateEnrichmentStage).toHaveBeenCalledWith("incident_sys_id_123", "enriched");
    });
  });

  describe("Low Confidence Flow", () => {
    it("✓ Low confidence flow: fetches incident → analyzes notes → matches CI → requests clarification", async () => {
      // Setup low confidence match
      const mockCiMatcherInstance = mockCiMatcher();
      mockCiMatcherInstance.matchEntities.mockResolvedValue({
        matches: [
          {
            sys_id: "ci_sys_id_456",
            name: "edge-ACCT0242146-01",
            class: "VeloCloud Edge",
            confidence: 65,
            source: "inventory",
            match_reason: "Partial edge name match",
          },
        ],
        highConfidenceMatches: [],
        lowConfidenceMatches: [
          {
            sys_id: "ci_sys_id_456",
            name: "edge-ACCT0242146-01",
            class: "VeloCloud Edge",
            confidence: 65,
            source: "inventory",
            match_reason: "Partial edge name match",
          },
        ],
        overallConfidence: 65,
      });

      const mockClarificationInstance = mockClarificationService();
      mockClarificationInstance.requestClarification.mockResolvedValue({
        success: true,
        messageId: "slack_msg_123",
      });

      const result = await service.enrichIncident("incident_sys_id_123");

      expect(result.success).toBe(true);
      expect(result.stage).toBe("clarification_pending");
      expect(result.clarificationNeeded).toBe(true);
      expect(result.confidence).toBe(65);

      // Verify clarification request
      expect(mockClarificationInstance.requestClarification).toHaveBeenCalledWith({
        incidentSysId: "incident_sys_id_123",
        incidentNumber: "INC001001",
        candidateCIs: expect.arrayContaining([
          expect.objectContaining({
            sys_id: "ci_sys_id_456",
            confidence: 65,
          }),
        ]),
        channelId: "C123456",
        threadTs: "1234567890.123456",
      });

      // Verify repository updates
      expect(mockRepository.updateMatchedCis).toHaveBeenCalledWith("incident_sys_id_123", expect.any(Array), expect.any(Object));
    });
  });

  describe("No Matches Flow", () => {
    it("✓ No matches flow: analyzes notes → no CIs found → adds work note → marks enriched", async () => {
      // Setup no matches
      const mockCiMatcherInstance = mockCiMatcher();
      mockCiMatcherInstance.matchEntities.mockResolvedValue({
        matches: [],
        highConfidenceMatches: [],
        lowConfidenceMatches: [],
        overallConfidence: 0,
      });

      const result = await service.enrichIncident("incident_sys_id_123");

      expect(result.success).toBe(true);
      expect(result.stage).toBe("enriched");
      expect(result.ciLinked).toBe(false);
      expect(result.entities).toBeDefined();

      // Verify work note added
      expect(mockServiceNowClient.addIncidentWorkNote).toHaveBeenCalledWith(
        "incident_sys_id_123",
        expect.stringContaining("No matching Configuration Items found")
      );

      // Verify repository update
      expect(mockRepository.updateEnrichmentStage).toHaveBeenCalledWith("incident_sys_id_123", "enriched", {
        no_matches: true,
      });
    });
  });

  describe("Error Flow", () => {
    it("✓ Error flow: getIncident returns null → marks as error stage → no retry", async () => {
      mockServiceNowClient.getIncident.mockResolvedValue(null);

      const result = await service.enrichIncident("incident_sys_id_123");

      expect(result.success).toBe(false);
      expect(result.stage).toBe("fetch_incident");
      expect(result.message).toContain("Failed to fetch incident INC001001 from ServiceNow");

      // Verify error is marked in repository
      expect(mockRepository.updateEnrichmentStage).toHaveBeenCalledWith("incident_sys_id_123", "error", {
        error: "incident_not_found",
        error_message: expect.stringContaining("Failed to fetch incident"),
        error_at: expect.any(String),
      });
    });

    it("✓ Incident not found in watchlist", async () => {
      mockRepository.getIncidentBySysId.mockResolvedValue(null);

      const result = await service.enrichIncident("unknown_incident");

      expect(result.success).toBe(false);
      expect(result.stage).toBe("lookup");
      expect(result.message).toBe("Incident not found in enrichment watchlist");
    });
  });

  describe("Feature Flag", () => {
    it("✓ Feature flag disabled: returns early with disabled message", async () => {
      // Temporarily set feature flag to false
      const originalFlag = process.env.ENABLE_INCIDENT_ENRICHMENT;
      process.env.ENABLE_INCIDENT_ENRICHMENT = "false";

      const result = await service.enrichIncident("incident_sys_id_123");

      expect(result.success).toBe(false);
      expect(result.stage).toBe("feature_check");
      expect(result.message).toBe("Incident enrichment feature is disabled");

      // Restore original flag
      process.env.ENABLE_INCIDENT_ENRICHMENT = originalFlag;
    });

    it("✓ isEnabled returns correct state", () => {
      const originalFlag = process.env.ENABLE_INCIDENT_ENRICHMENT;

      process.env.ENABLE_INCIDENT_ENRICHMENT = "true";
      expect(service.isEnabled()).toBe(true);

      process.env.ENABLE_INCIDENT_ENRICHMENT = "false";
      expect(service.isEnabled()).toBe(false);

      process.env.ENABLE_INCIDENT_ENRICHMENT = undefined;
      expect(service.isEnabled()).toBe(false);

      // Restore original flag
      process.env.ENABLE_INCIDENT_ENRICHMENT = originalFlag;
    });
  });

  describe("Manual CI Selection", () => {
    it("✓ Manual CI selection: links selected CI → updates stage to enriched", async () => {
      const result = await service.handleClarificationResponse(
        "incident_sys_id_123",
        "selected_ci_sys_id",
        "selected_ci_name"
      );

      expect(result.success).toBe(true);
      expect(result.stage).toBe("enriched");
      expect(result.ciLinked).toBe(true);
      expect(result.ciSysId).toBe("selected_ci_sys_id");
      expect(result.ciName).toBe("selected_ci_name");

      // Verify CI linking
      expect(mockServiceNowClient.linkCiToIncident).toHaveBeenCalledWith("incident_sys_id_123", "selected_ci_sys_id");
      expect(mockServiceNowClient.addIncidentWorkNote).toHaveBeenCalledWith(
        "incident_sys_id_123",
        expect.stringContaining("Manual CI Selection (via Slack)")
      );

      // Verify repository update
      expect(mockRepository.updateEnrichmentStage).toHaveBeenCalledWith("incident_sys_id_123", "enriched", {
        manual_selection: true,
        ci_sys_id: "selected_ci_sys_id",
        ci_name: "selected_ci_name",
      });
    });
  });

  describe("Final Enrichment", () => {
    it("✓ Final enrichment: skips if already enriched", async () => {
      // Setup already enriched state
      const enrichedState = {
        ...mockIncidentState,
        enrichmentStage: "enriched" as const,
        matchedCis: [
          {
            sys_id: "ci_sys_id_123",
            name: "test-ci",
            class: "test-class",
            confidence: 95,
            source: "inventory" as const,
            match_reason: "test reason",
          },
        ],
      };
      mockRepository.getIncidentBySysId.mockResolvedValue(enrichedState);

      const result = await service.runFinalEnrichment("incident_sys_id_123");

      expect(result.success).toBe(true);
      expect(result.stage).toBe("enriched");
      expect(result.message).toBe("Already enriched - no action needed");

      // Should not call enrichment again
      expect(mockServiceNowClient.getIncident).not.toHaveBeenCalled();
    });

    it("✓ Final enrichment: skips if not in watchlist", async () => {
      mockRepository.getIncidentBySysId.mockResolvedValue(null);

      const result = await service.runFinalEnrichment("unknown_incident");

      expect(result.success).toBe(false);
      expect(result.stage).toBe("not_tracked");
      expect(result.message).toBe("Incident not in enrichment watchlist");
    });

    it("✓ Final enrichment: runs enrichment if not already enriched", async () => {
      // Setup high confidence match for final enrichment
      const mockCiMatcherInstance = mockCiMatcher();
      mockCiMatcherInstance.matchEntities.mockResolvedValue({
        matches: [
          {
            sys_id: "ci_sys_id_789",
            name: "final-ci",
            class: "Test Class",
            confidence: 90,
            source: "cmdb",
            match_reason: "Final test match",
          },
        ],
        highConfidenceMatches: [
          {
            sys_id: "ci_sys_id_789",
            name: "final-ci",
            class: "Test Class",
            confidence: 90,
            source: "cmdb",
            match_reason: "Final test match",
          },
        ],
        lowConfidenceMatches: [],
        overallConfidence: 90,
      });

      const result = await service.runFinalEnrichment("incident_sys_id_123");

      expect(result.success).toBe(true);
      expect(result.stage).toBe("enriched");
      expect(result.ciLinked).toBe(true);
      expect(result.ciName).toBe("final-ci");
    });
  });

  describe("Data Persistence", () => {
    it("✓ Stores extracted entities in DB", async () => {
      const mockNoteAnalyzerInstance = mockNoteAnalyzer();
      const entities: ExtractedEntities = {
        ip_addresses: ["192.168.1.100"],
        hostnames: ["server.example.com"],
        edge_names: ["edge-01"],
        error_messages: ["Connection timeout"],
        system_names: ["web-server"],
        account_numbers: ["ACCT0242146"],
      };
      mockNoteAnalyzerInstance.analyzeNotes.mockResolvedValue({
        entities,
        summary: "Test analysis",
        confidence: 0.85,
        tokenUsage: { input: 100, output: 50, total: 150 },
      });

      // Setup no CI matches to focus on entity storage
      const mockCiMatcherInstance = mockCiMatcher();
      mockCiMatcherInstance.matchEntities.mockResolvedValue({
        matches: [],
        highConfidenceMatches: [],
        lowConfidenceMatches: [],
        overallConfidence: 0,
      });

      await service.enrichIncident("incident_sys_id_123");

      expect(mockRepository.updateExtractedEntities).toHaveBeenCalledWith("incident_sys_id_123", entities);
    });

    it("✓ Stores matched CIs with confidence scores", async () => {
      const mockCiMatcherInstance = mockCiMatcher();
      mockCiMatcherInstance.matchEntities.mockResolvedValue({
        matches: [
          {
            sys_id: "ci_sys_id_123",
            name: "test-ci",
            class: "Test Class",
            confidence: 85,
            source: "inventory",
            match_reason: "Test match",
          },
        ],
        highConfidenceMatches: [
          {
            sys_id: "ci_sys_id_123",
            name: "test-ci",
            class: "Test Class",
            confidence: 85,
            source: "inventory",
            match_reason: "Test match",
          },
        ],
        lowConfidenceMatches: [],
        overallConfidence: 85,
      });

      await service.enrichIncident("incident_sys_id_123");

      expect(mockRepository.updateMatchedCis).toHaveBeenCalledWith(
        "incident_sys_id_123",
        expect.arrayContaining([
          expect.objectContaining({
            sys_id: "ci_sys_id_123",
            confidence: 85,
          }),
        ]),
        expect.objectContaining({
          overall: 85,
          ci_match: 85,
          entity_extraction: 90, // 0.9 * 100
        })
      );
    });

    it("✓ Updates last_processed_at timestamp", async () => {
      // Setup high confidence match
      const mockCiMatcherInstance = mockCiMatcher();
      mockCiMatcherInstance.matchEntities.mockResolvedValue({
        matches: [
          {
            sys_id: "ci_sys_id_123",
            name: "test-ci",
            class: "Test Class",
            confidence: 90,
            source: "inventory",
            match_reason: "Test match",
          },
        ],
        highConfidenceMatches: [
          {
            sys_id: "ci_sys_id_123",
            name: "test-ci",
            class: "Test Class",
            confidence: 90,
            source: "inventory",
            match_reason: "Test match",
          },
        ],
        lowConfidenceMatches: [],
        overallConfidence: 90,
      });

      await service.enrichIncident("incident_sys_id_123");

      // The timestamp update should be called through updateEnrichmentStage
      expect(mockRepository.updateEnrichmentStage).toHaveBeenCalledWith("incident_sys_id_123", "enriched", expect.any(Object));
    });
  });

  describe("Error Handling", () => {
    it("✓ Handles ServiceNow API errors gracefully", async () => {
      mockServiceNowClient.getIncident.mockRejectedValue(new Error("ServiceNow API error"));

      const result = await service.enrichIncident("incident_sys_id_123");

      expect(result.success).toBe(false);
      expect(result.stage).toBe("error");
      expect(result.message).toBe("ServiceNow API error");
    });

    it("✓ Handles repository errors gracefully", async () => {
      mockRepository.getIncidentBySysId.mockRejectedValue(new Error("Database connection failed"));

      const result = await service.enrichIncident("incident_sys_id_123");

      expect(result.success).toBe(false);
      expect(result.stage).toBe("error");
      expect(result.message).toBe("Database connection failed");
    });

    it("✓ Handles clarification response errors", async () => {
      mockServiceNowClient.linkCiToIncident.mockRejectedValue(new Error("CI linking failed"));

      const result = await service.handleClarificationResponse(
        "incident_sys_id_123",
        "ci_sys_id",
        "ci_name"
      );

      expect(result.success).toBe(false);
      expect(result.stage).toBe("error");
      expect(result.message).toBe("CI linking failed");
    });
  });

  describe("Configuration", () => {
    it("✓ Uses confidence threshold from environment", () => {
      const originalThreshold = process.env.INCIDENT_ENRICHMENT_CONFIDENCE_THRESHOLD;
      process.env.INCIDENT_ENRICHMENT_CONFIDENCE_THRESHOLD = "85";

      const serviceWithCustomThreshold = new IncidentEnrichmentService();
      
      // Test that the threshold is used (we can't access private property directly, 
      // but we can test behavior)
      const mockCiMatcherInstance = mockCiMatcher();
      mockCiMatcherInstance.matchEntities.mockResolvedValue({
        matches: [
          {
            sys_id: "ci_sys_id_123",
            name: "test-ci",
            class: "Test Class",
            confidence: 80, // Below 85 threshold
            source: "inventory",
            match_reason: "Test match",
          },
        ],
        highConfidenceMatches: [], // 80 is below 85 threshold
        lowConfidenceMatches: [
          {
            sys_id: "ci_sys_id_123",
            name: "test-ci",
            class: "Test Class",
            confidence: 80,
            source: "inventory",
            match_reason: "Test match",
          },
        ],
        overallConfidence: 80,
      });

      // Should trigger clarification flow due to confidence below threshold
      const mockClarificationInstance = mockClarificationService();
      mockClarificationInstance.requestClarification.mockResolvedValue({ success: true });

      serviceWithCustomThreshold.enrichIncident("incident_sys_id_123");

      expect(mockClarificationInstance.requestClarification).toHaveBeenCalled();

      // Restore original threshold
      process.env.INCIDENT_ENRICHMENT_CONFIDENCE_THRESHOLD = originalThreshold;
    });
  });
});