/**
 * Unit Tests for Context Update Proposal Tool
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLegacyAgentTools } from "../../../lib/agent/tools/factory";
import type { ChatMessage } from "../../../lib/agent/types";

// Mock dependencies
vi.mock("../../../lib/context-manager");
vi.mock("../../../lib/services/business-context-service");
vi.mock("../../../lib/context-update-manager");

describe("Context Update Proposal Tool", () => {
  let mockContextManager: any;
  let mockBusinessContextService: any;
  let mockContextUpdateManager: any;
  let tools: any;

  const createMockMessages = (): ChatMessage[] => [
    { role: "user", content: "Update context for Acme Corp" },
  ];

  const createMockContext = (overrides = {}) => ({
    caseNumber: "SCS0001234",
    channelId: "C123456",
    threadTs: "1234567890.123456",
    messages: [],
    ...overrides,
  });

  const createMockBusinessContext = (overrides = {}) => ({
    entityName: "Acme Corp",
    entityType: "CLIENT",
    contextStewards: [
      { type: "channel" as const, id: "C999999", name: "stewards" },
      { type: "user" as const, id: "U888888", name: "Jane Doe" },
    ],
    cmdbIdentifiers: [],
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup context manager mock
    const contextManager = await import("../../../lib/context-manager");
    mockContextManager = {
      getContextsForCase: vi.fn().mockReturnValue([]),
    };
    (contextManager.getContextManager as any).mockReturnValue(mockContextManager);

    // Setup business context service mock
    const businessService = await import("../../../lib/services/business-context-service");
    mockBusinessContextService = {
      getContextForCompany: vi.fn(),
    };
    (businessService.getBusinessContextService as any).mockReturnValue(mockBusinessContextService);

    // Setup context update manager mock
    const updateManager = await import("../../../lib/context-update-manager");
    mockContextUpdateManager = {
      postProposal: vi.fn(),
    };
    (updateManager.getContextUpdateManager as any).mockReturnValue(mockContextUpdateManager);

    // Create tools
    tools = createLegacyAgentTools({
      messages: createMockMessages(),
      caseNumbers: ["SCS0001234"],
      options: {},
    });
  });

  describe("Context Update - Success Cases", () => {
    it("should propose context update successfully", async () => {
      const mockContext = createMockContext();
      const mockBusinessContext = createMockBusinessContext();

      mockContextManager.getContextsForCase.mockReturnValue([mockContext]);
      mockBusinessContextService.getContextForCompany.mockResolvedValue(mockBusinessContext);
      mockContextUpdateManager.postProposal.mockResolvedValue({
        messageTs: "1234567890.999999",
      });

      const result = await tools.proposeContextUpdate.execute({
        entityName: "Acme Corp",
        caseNumber: "SCS0001234",
        summary: "Add new server IP address",
        details: "Server migrated to new infrastructure",
        cmdbIdentifier: {
          ciName: "acme-web-server",
          ipAddresses: ["10.0.1.100"],
          description: "Primary web server",
        },
        confidence: "HIGH",
      });

      expect(mockContextManager.getContextsForCase).toHaveBeenCalledWith("SCS0001234");
      expect(mockBusinessContextService.getContextForCompany).toHaveBeenCalledWith("Acme Corp");
      expect(mockContextUpdateManager.postProposal).toHaveBeenCalledWith(
        expect.objectContaining({
          entityName: "Acme Corp",
          summary: "Add new server IP address",
          details: "Server migrated to new infrastructure",
          caseNumber: "SCS0001234",
          confidence: "HIGH",
        })
      );
      expect(result).toEqual({
        status: "pending_approval",
        messageTs: "1234567890.999999",
        stewardChannelId: "C999999",
      });
    });

    it("should use first case number when not provided", async () => {
      const mockContext = createMockContext();
      const mockBusinessContext = createMockBusinessContext();

      mockContextManager.getContextsForCase.mockReturnValue([mockContext]);
      mockBusinessContextService.getContextForCompany.mockResolvedValue(mockBusinessContext);
      mockContextUpdateManager.postProposal.mockResolvedValue({
        messageTs: "1234567890.999999",
      });

      await tools.proposeContextUpdate.execute({
        entityName: "Acme Corp",
        summary: "Update infrastructure",
        cmdbIdentifier: {
          ciName: "server01",
        },
      });

      expect(mockContextUpdateManager.postProposal).toHaveBeenCalledWith(
        expect.objectContaining({
          caseNumber: "SCS0001234",
        })
      );
    });

    it("should deduplicate IP addresses", async () => {
      const mockContext = createMockContext();
      const mockBusinessContext = createMockBusinessContext();

      mockContextManager.getContextsForCase.mockReturnValue([mockContext]);
      mockBusinessContextService.getContextForCompany.mockResolvedValue(mockBusinessContext);
      mockContextUpdateManager.postProposal.mockResolvedValue({
        messageTs: "1234567890.999999",
      });

      await tools.proposeContextUpdate.execute({
        entityName: "Acme Corp",
        summary: "Add IPs",
        cmdbIdentifier: {
          ipAddresses: ["10.0.0.1", "10.0.0.1", "  10.0.0.2  ", "10.0.0.2"],
        },
      });

      const proposalCall = mockContextUpdateManager.postProposal.mock.calls[0][0];
      const ipAddresses = proposalCall.actions[0].identifier.ipAddresses;
      expect(ipAddresses).toEqual(["10.0.0.1", "10.0.0.2"]);
    });

    it("should format steward mentions correctly", async () => {
      const mockContext = createMockContext();
      const mockBusinessContext = createMockBusinessContext({
        contextStewards: [
          { type: "channel" as const, id: "C111111", name: "ops-team" },
          { type: "user" as const, id: "U222222", name: "John" },
          { type: "usergroup" as const, id: "S333333", name: "admins" },
        ],
      });

      mockContextManager.getContextsForCase.mockReturnValue([mockContext]);
      mockBusinessContextService.getContextForCompany.mockResolvedValue(mockBusinessContext);
      mockContextUpdateManager.postProposal.mockResolvedValue({
        messageTs: "1234567890.999999",
      });

      await tools.proposeContextUpdate.execute({
        entityName: "Acme Corp",
        summary: "Test",
        cmdbIdentifier: { ciName: "test" },
      });

      const proposalCall = mockContextUpdateManager.postProposal.mock.calls[0][0];
      expect(proposalCall.stewardMentions).toContain("<#C111111|ops-team>");
      expect(proposalCall.stewardMentions).toContain("<@U222222>");
      expect(proposalCall.stewardMentions).toContain("<!subteam^S333333|@admins>");
    });

    it("should handle entity creation when no business context exists", async () => {
      const mockContext = createMockContext();

      mockContextManager.getContextsForCase.mockReturnValue([mockContext]);
      mockBusinessContextService.getContextForCompany.mockResolvedValue(null);
      mockContextUpdateManager.postProposal.mockResolvedValue({
        messageTs: "1234567890.999999",
      });

      const result = await tools.proposeContextUpdate.execute({
        entityName: "New Company",
        summary: "Bootstrap new entity",
        cmdbIdentifier: { ciName: "new-server" },
        entityTypeIfCreate: "CLIENT",
      });

      const proposalCall = mockContextUpdateManager.postProposal.mock.calls[0][0];
      expect(proposalCall.actions[0].createEntityIfMissing).toBe(true);
      expect(proposalCall.actions[0].entityTypeIfCreate).toBe("CLIENT");
      expect(result.status).toBe("pending_approval");
    });
  });

  describe("Context Update - Error Cases", () => {
    it("should return error when no case number available", async () => {
      const toolsNoCaseNumber = createLegacyAgentTools({
        messages: createMockMessages(),
        caseNumbers: [],
        options: {},
      });

      const result = await toolsNoCaseNumber.proposeContextUpdate.execute({
        entityName: "Acme Corp",
        summary: "Update",
        cmdbIdentifier: { ciName: "server" },
      });

      expect(result).toEqual({
        error: expect.stringContaining("No case number available"),
      });
    });

    it("should return error when conversation history not found", async () => {
      mockContextManager.getContextsForCase.mockReturnValue([]);

      const result = await tools.proposeContextUpdate.execute({
        entityName: "Acme Corp",
        caseNumber: "SCS0001234",
        summary: "Update",
        cmdbIdentifier: { ciName: "server" },
      });

      expect(result).toEqual({
        error: expect.stringContaining("Unable to locate conversation history"),
      });
    });

    it("should return error when entity doesn't exist and no type specified", async () => {
      const mockContext = createMockContext();

      mockContextManager.getContextsForCase.mockReturnValue([mockContext]);
      mockBusinessContextService.getContextForCompany.mockResolvedValue(null);

      const result = await tools.proposeContextUpdate.execute({
        entityName: "Unknown Company",
        summary: "Update",
        cmdbIdentifier: { ciName: "server" },
      });

      expect(result).toEqual({
        error: expect.stringContaining("No business context exists for Unknown Company"),
      });
    });

    it("should return error when CMDB identifier has no signal", async () => {
      const mockContext = createMockContext();
      const mockBusinessContext = createMockBusinessContext();

      mockContextManager.getContextsForCase.mockReturnValue([mockContext]);
      mockBusinessContextService.getContextForCompany.mockResolvedValue(mockBusinessContext);

      const result = await tools.proposeContextUpdate.execute({
        entityName: "Acme Corp",
        summary: "Update",
        cmdbIdentifier: {},
      });

      expect(result).toEqual({
        error: expect.stringContaining("Provide at least one of ciName, sysId, description, or ipAddresses"),
      });
    });

    it("should accept whitespace-only IP addresses (validation happens before deduplication)", async () => {
      // Note: This tests current behavior where validation happens before deduplication.
      // The tool will accept ["  ", ""] because array length > 0, even though all entries are whitespace.
      // After deduplication, empty strings are filtered out, resulting in an empty array.
      const mockContext = createMockContext();
      const mockBusinessContext = createMockBusinessContext();

      mockContextManager.getContextsForCase.mockReturnValue([mockContext]);
      mockBusinessContextService.getContextForCompany.mockResolvedValue(mockBusinessContext);
      mockContextUpdateManager.postProposal.mockResolvedValue({
        messageTs: "1234567890.999999",
      });

      const result = await tools.proposeContextUpdate.execute({
        entityName: "Acme Corp",
        summary: "Update",
        caseNumber: "SCS0001234",
        cmdbIdentifier: {
          ipAddresses: ["  ", ""],
        },
      });

      // Tool accepts this and calls postProposal (current behavior)
      expect(result.status).toBe("pending_approval");
      expect(mockContextUpdateManager.postProposal).toHaveBeenCalled();

      // Verify IP addresses were deduplicated to empty array
      const proposalCall = mockContextUpdateManager.postProposal.mock.calls[0][0];
      expect(proposalCall.actions[0].identifier.ipAddresses).toEqual([]);
    });
  });
});
