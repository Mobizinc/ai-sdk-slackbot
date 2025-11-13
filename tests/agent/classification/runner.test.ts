import { describe, it, expect, vi, beforeEach } from "vitest";
import { runClassificationAgent } from "../../../lib/agent/classification/runner";
import type { ClassificationAgentInput } from "../../../lib/agent/classification/types";

const mockClassify = vi.fn();

vi.mock("../../../lib/services/case-classifier", () => ({
  getCaseClassifier: () => ({
    classifyCaseEnhanced: mockClassify,
  }),
}));

describe("runClassificationAgent", () => {
  beforeEach(() => {
    mockClassify.mockReset().mockResolvedValue({
      category: "Networking",
      subcategory: "WAN",
      confidence_score: 0.91,
      reasoning: "Sample reasoning",
      keywords: ["vpn"],
      processingTimeMs: 4200,
      workflowId: "default_triage",
      discoveredEntities: [],
      businessContextConfidence: 0.8,
    });
  });

  it("delegates to case classifier with derived fields", async () => {
    const input: ClassificationAgentInput = {
      caseNumber: "SCS0001",
      sysId: "abc123",
      shortDescription: "VPN is down",
      assignmentGroup: "Network Ops",
      discoveryPack: {
        schemaVersion: "1.0.0",
        generatedAt: new Date().toISOString(),
        metadata: {
          caseNumbers: ["SCS0001"],
          companyName: "Altus",
        },
        policyAlerts: [],
        slackRecent: {
          totalMessages: 1,
          messages: [{ role: "user", text: "Site offline", timestamp: "1" }],
        },
      },
    };

    const result = await runClassificationAgent(input);

    expect(mockClassify).toHaveBeenCalledWith(
      expect.objectContaining({
        case_number: "SCS0001",
        company_name: "Altus",
        description: expect.stringContaining("Site offline"),
      })
    );

    expect(result.category).toBe("Networking");
    expect(result.processingTimeMs).toBe(4200);
  });
});
