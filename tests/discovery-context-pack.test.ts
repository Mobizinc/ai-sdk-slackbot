import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateDiscoveryContextPack } from "../lib/agent/discovery/context-pack";
import type { BusinessEntityContext } from "../lib/services/business-context-service";

const mockBusinessContextService = {
  getContextForSlackChannel: vi.fn(),
  getContextForCompany: vi.fn(),
};

vi.mock("../lib/services/business-context-service", () => ({
  getBusinessContextService: () => mockBusinessContextService,
}));

const mockContextManager = {
  getContextSync: vi.fn(),
  getContextsForCase: vi.fn().mockReturnValue([]),
};

vi.mock("../lib/context-manager", () => ({
  getContextManager: () => mockContextManager,
}));

const mockSearchFacade = {
  isAzureSearchConfigured: vi.fn().mockReturnValue(false),
  searchSimilarCases: vi.fn(),
};

vi.mock("../lib/services/search-facade", () => ({
  getSearchFacadeService: () => mockSearchFacade,
}));

const configValues: Record<string, any> = {
  discoverySlackMessageLimit: 5,
  discoverySimilarCasesTopK: 3,
};

vi.mock("../lib/config", () => ({
  getConfigValue: (key: string) => configValues[key],
  getConfig: vi.fn(),
  getConfigSync: vi.fn(),
  config: {},
}));

describe("generateDiscoveryContextPack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBusinessContextService.getContextForSlackChannel.mockReset();
    mockBusinessContextService.getContextForCompany.mockReset();
    mockContextManager.getContextSync.mockReset();
    mockContextManager.getContextsForCase.mockReset().mockReturnValue([]);
    mockSearchFacade.isAzureSearchConfigured.mockReturnValue(false);
  });

  it("builds pack using provided data", async () => {
    const businessContext: BusinessEntityContext = {
      entityName: "Acme Health",
      entityType: "CLIENT",
      industry: "Healthcare",
      aliases: ["Acme"],
      relatedEntities: [],
      keyContacts: [],
      slackChannels: [],
      cmdbIdentifiers: [],
      contextStewards: [],
      technologyPortfolio: "Azure",
      serviceDetails: "Managed services",
      description: "Primary healthcare partner",
    };

    const pack = await generateDiscoveryContextPack({
      caseNumbers: ["SCS001"],
      companyName: "Acme Health",
      businessContext,
      caseContext: {
        caseNumber: "SCS001",
        channelId: "C123",
        threadTs: "1700.0",
        messages: [],
        detectedAt: new Date("2024-01-01T00:00:00Z"),
        lastUpdated: new Date("2024-01-02T00:00:00Z"),
        channelName: "acme-support",
      } as any,
      messages: [
        { role: "user", content: "Having VPN issues" },
        { role: "assistant", content: "Looking into it" },
      ],
      similarCases: [
        {
          case_number: "SCS100",
          content: "VPN gateway offline",
          filename: "https://example.com/case/SCS100",
          id: "1",
          score: 0.82,
        },
      ],
    });

    expect(pack.metadata.caseNumbers).toEqual(["SCS001"]);
    expect(pack.businessContext?.entityName).toBe("Acme Health");
    expect(pack.caseContext?.caseNumber).toBe("SCS001");
    expect(pack.slackRecent?.messages.length).toBe(2);
    expect(pack.similarCases?.cases[0].caseNumber).toBe("SCS100");
    expect(pack.schemaVersion).toBe("1.0.0");
  });

  it("fetches business context when not provided", async () => {
    mockBusinessContextService.getContextForSlackChannel.mockResolvedValue({
      entityName: "Globex",
      entityType: "CLIENT",
      aliases: [],
      relatedEntities: [],
      keyContacts: [],
      slackChannels: [],
      cmdbIdentifiers: [],
      contextStewards: [],
    });

    const pack = await generateDiscoveryContextPack({
      channelId: "C999",
      messages: [{ role: "user", content: "Help Globex" }],
    });

    expect(mockBusinessContextService.getContextForSlackChannel).toHaveBeenCalledWith("C999", undefined);
    expect(pack.businessContext?.entityName).toBe("Globex");
  });

  it("falls back to search facade for similar cases", async () => {
    mockSearchFacade.isAzureSearchConfigured.mockReturnValue(true);
    mockSearchFacade.searchSimilarCases.mockResolvedValue([
      { case_number: "CS900", content: "printer outage", filename: "", id: "a", score: 0.65 },
    ]);

    const pack = await generateDiscoveryContextPack({
      messages: [{ role: "user", content: "Printer outage" }],
      companyName: "Widgets Inc",
    });

    expect(mockSearchFacade.searchSimilarCases).toHaveBeenCalled();
    expect(pack.similarCases?.cases[0].caseNumber).toBe("CS900");
  });
});
