import { describe, it, expect, beforeEach, vi } from "vitest";
import { createAgentTools } from "../../../lib/agent/tools/factory";

const mockRunClassificationAgent = vi.fn();

vi.mock("../../../lib/agent/classification/runner", () => ({
  runClassificationAgent: (...args: unknown[]) => mockRunClassificationAgent(...args),
}));

describe("classification agent tool", () => {
  beforeEach(() => {
    mockRunClassificationAgent.mockReset().mockResolvedValue({
      category: "Networking",
      subcategory: "VPN",
      confidence_score: 0.92,
      quick_summary: "VPN tunnel unstable",
      immediate_next_steps: ["Check ISP status"],
      technical_entities: { ip_addresses: ["10.0.0.1"] },
      business_intelligence: {},
      processingTimeMs: 3210,
      workflowId: "default_triage",
      discoveredEntities: [],
      businessContextConfidence: 0.88,
    });
  });

  it("runs classification using discovery metadata when available", async () => {
    const tools = createAgentTools({
      messages: [],
      caseNumbers: [],
      contextMetadata: {
        discovery: {
          schemaVersion: "1.0.0",
          generatedAt: new Date().toISOString(),
          metadata: { caseNumbers: ["SCS0001"] },
          policyAlerts: [],
        },
      },
    });

    const result = await (tools as any).runClassificationAgent.execute({
      caseNumber: "SCS0001",
      sysId: "abc123",
    });

    expect(mockRunClassificationAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        caseNumber: "SCS0001",
        sysId: "abc123",
      })
    );

    expect(result.success).toBe(true);
    expect(result.classification.category).toBe("Networking");
  });
});
