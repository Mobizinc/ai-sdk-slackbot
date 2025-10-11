import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createMockMCPClient,
  createMockSearchResponse,
  createMockCodeSampleResponse,
  createMockDocResponse,
  createEmptyResponse,
  createPlainTextResponse,
  createErrorResponse,
} from "./mocks/mcp-client";
import {
  sampleDocResults,
  sampleCodeSamples,
  sampleFullDoc,
  sampleErrors,
  samplePlainTextResponse,
} from "./fixtures/microsoft-learn-responses";

// Mock the MCP SDK modules
vi.mock("@modelcontextprotocol/sdk/client/index.js");
vi.mock("@modelcontextprotocol/sdk/client/sse.js");

describe("MicrosoftLearnMCPClient", () => {
  let client: any;
  let mockMCPClient: ReturnType<typeof createMockMCPClient>;

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();

    // Create mock MCP client
    mockMCPClient = createMockMCPClient();

    // Mock the Client constructor to return our mock
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    vi.mocked(Client).mockImplementation(() => mockMCPClient as any);

    // Import the actual client class
    const { MicrosoftLearnMCPClient } = await import("../lib/tools/microsoft-learn-mcp");
    client = new MicrosoftLearnMCPClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isAvailable", () => {
    it("returns true for public MCP service", () => {
      expect(client.isAvailable()).toBe(true);
    });
  });

  describe("searchDocs", () => {
    it("successfully searches and returns documentation results", async () => {
      mockMCPClient.callTool.mockResolvedValue(
        createMockSearchResponse(sampleDocResults)
      );

      const results = await client.searchDocs("Azure AD password reset", 3);

      expect(mockMCPClient.callTool).toHaveBeenCalledWith({
        name: "microsoft_docs_search",
        arguments: {
          query: "Azure AD password reset",
          limit: 3,
        },
      });

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({
        title: "Reset Azure AD user password with PowerShell",
        url: "https://learn.microsoft.com/en-us/powershell/module/azuread/set-azureaduserpassword",
        content: expect.stringContaining("Set-AzureADUserPassword"),
      });
    });

    it("respects the limit parameter", async () => {
      mockMCPClient.callTool.mockResolvedValue(
        createMockSearchResponse(sampleDocResults)
      );

      const results = await client.searchDocs("Azure", 2);

      expect(results).toHaveLength(2);
    });

    it("returns empty array when no results found", async () => {
      mockMCPClient.callTool.mockResolvedValue(createEmptyResponse());

      const results = await client.searchDocs("nonexistent query");

      expect(results).toEqual([]);
    });

    it("handles plain text responses gracefully", async () => {
      mockMCPClient.callTool.mockResolvedValue(
        createPlainTextResponse(samplePlainTextResponse)
      );

      const results = await client.searchDocs("Microsoft Learn");

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        title: "Microsoft Learn Documentation",
        url: "",
        content: samplePlainTextResponse,
      });
    });

    it("handles malformed JSON gracefully", async () => {
      mockMCPClient.callTool.mockResolvedValue(
        createPlainTextResponse("{ invalid json")
      );

      const results = await client.searchDocs("test");

      expect(results).toHaveLength(1);
      expect(results[0].content).toBe("{ invalid json");
    });

    it("throws error on network failure", async () => {
      mockMCPClient.callTool.mockImplementation(() =>
        createErrorResponse(sampleErrors.networkError.message)
      );

      await expect(client.searchDocs("test")).rejects.toThrow(
        "Failed to search Microsoft Learn docs"
      );
    });

    it("handles connection failure gracefully", async () => {
      // Force connection to fail
      const failingMockClient = createMockMCPClient();
      failingMockClient.connect.mockRejectedValue(new Error("Connection refused"));

      const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
      vi.mocked(Client).mockImplementation(() => failingMockClient as any);

      // Create new client instance that will fail to connect
      const { MicrosoftLearnMCPClient } = await import("../lib/tools/microsoft-learn-mcp");
      const failingClient = new MicrosoftLearnMCPClient();

      await expect(failingClient.searchDocs("test")).rejects.toThrow(
        "Failed to connect to Microsoft Learn MCP server"
      );
    });
  });

  describe("searchCode", () => {
    it("successfully searches and returns code samples", async () => {
      mockMCPClient.callTool.mockResolvedValue(
        createMockCodeSampleResponse(sampleCodeSamples)
      );

      const results = await client.searchCode("Azure PowerShell", "powershell", 2);

      expect(mockMCPClient.callTool).toHaveBeenCalledWith({
        name: "microsoft_code_sample_search",
        arguments: {
          query: "Azure PowerShell",
          language: "powershell",
        },
      });

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        title: "Reset Azure AD Password - PowerShell",
        url: expect.stringContaining("microsoft.com"),
        code: expect.stringContaining("Set-AzureADUserPassword"),
        language: "powershell",
      });
    });

    it("works without language filter", async () => {
      mockMCPClient.callTool.mockResolvedValue(
        createMockCodeSampleResponse(sampleCodeSamples)
      );

      const results = await client.searchCode("Azure code sample");

      expect(mockMCPClient.callTool).toHaveBeenCalledWith({
        name: "microsoft_code_sample_search",
        arguments: {
          query: "Azure code sample",
          language: undefined,
        },
      });

      expect(results).toHaveLength(2);
    });

    it("respects limit parameter", async () => {
      mockMCPClient.callTool.mockResolvedValue(
        createMockCodeSampleResponse(sampleCodeSamples)
      );

      const results = await client.searchCode("test", undefined, 1);

      expect(results).toHaveLength(1);
    });

    it("returns empty array when no code samples found", async () => {
      mockMCPClient.callTool.mockResolvedValue(createEmptyResponse());

      const results = await client.searchCode("nonexistent");

      expect(results).toEqual([]);
    });

    it("handles plain text code gracefully", async () => {
      mockMCPClient.callTool.mockResolvedValue(
        createPlainTextResponse("Get-AzureADUser")
      );

      const results = await client.searchCode("Azure", "powershell");

      expect(results).toHaveLength(1);
      expect(results[0].code).toBe("Get-AzureADUser");
      expect(results[0].language).toBe("powershell");
    });
  });

  describe("fetchDoc", () => {
    it("successfully fetches full documentation", async () => {
      mockMCPClient.callTool.mockResolvedValue(
        createMockDocResponse(sampleFullDoc)
      );

      const doc = await client.fetchDoc(
        "https://learn.microsoft.com/en-us/powershell/module/azuread/set-azureaduserpassword"
      );

      expect(mockMCPClient.callTool).toHaveBeenCalledWith({
        name: "microsoft_docs_fetch",
        arguments: {
          url: "https://learn.microsoft.com/en-us/powershell/module/azuread/set-azureaduserpassword",
        },
      });

      expect(doc).toEqual({
        title: "Set-AzureADUserPassword",
        url: "https://learn.microsoft.com/en-us/powershell/module/azuread/set-azureaduserpassword",
        content: expect.stringContaining("Set-AzureADUserPassword"),
        fullText: expect.stringContaining("## Synopsis"),
      });
    });

    it("validates URL is from Microsoft Learn", async () => {
      await expect(
        client.fetchDoc("https://example.com/docs")
      ).rejects.toThrow("URL must be from Microsoft Learn documentation");
    });

    it("accepts microsoft.com URLs", async () => {
      mockMCPClient.callTool.mockResolvedValue(
        createMockDocResponse(sampleFullDoc)
      );

      const doc = await client.fetchDoc("https://microsoft.com/docs/azure");

      expect(doc).toBeTruthy();
    });

    it("returns null when no content found", async () => {
      mockMCPClient.callTool.mockResolvedValue(createEmptyResponse());

      const doc = await client.fetchDoc("https://learn.microsoft.com/en-us/azure");

      expect(doc).toBeNull();
    });

    it("handles markdown/text responses", async () => {
      mockMCPClient.callTool.mockResolvedValue(
        createPlainTextResponse("# Azure Documentation\n\nSample content here.")
      );

      const doc = await client.fetchDoc("https://learn.microsoft.com/en-us/azure");

      expect(doc).toEqual({
        title: "Microsoft Learn Documentation",
        url: "https://learn.microsoft.com/en-us/azure",
        content: expect.stringContaining("Azure"),
        fullText: "# Azure Documentation\n\nSample content here.",
      });
    });
  });

  describe("searchAndFormat", () => {
    it("formats search results for Slack", async () => {
      mockMCPClient.callTool.mockResolvedValue(
        createMockSearchResponse(sampleDocResults.slice(0, 1))
      );

      const formatted = await client.searchAndFormat("Azure password reset");

      expect(formatted).toContain("📚 *Microsoft Learn Documentation");
      expect(formatted).toContain("Reset Azure AD user password");
      expect(formatted).toContain("🔗 https://learn.microsoft.com");
    });

    it("returns message when no results found", async () => {
      mockMCPClient.callTool.mockResolvedValue(createEmptyResponse());

      const formatted = await client.searchAndFormat("nonexistent");

      expect(formatted).toContain('No Microsoft Learn documentation found for "nonexistent"');
    });

    it("handles errors gracefully", async () => {
      mockMCPClient.callTool.mockImplementation(() =>
        createErrorResponse("Network error")
      );

      const formatted = await client.searchAndFormat("test");

      expect(formatted).toContain("Error searching Microsoft Learn");
      expect(formatted).toContain("Network error");
    });
  });

  describe("connection lifecycle", () => {
    it("connects to MCP server on first search", async () => {
      mockMCPClient.callTool.mockResolvedValue(
        createMockSearchResponse(sampleDocResults)
      );

      await client.searchDocs("test");

      expect(mockMCPClient.connect).toHaveBeenCalledTimes(1);
    });

    it("disconnects from MCP server", async () => {
      mockMCPClient.callTool.mockResolvedValue(
        createMockSearchResponse(sampleDocResults)
      );

      await client.searchDocs("test");
      await client.disconnect();

      expect(mockMCPClient.close).toHaveBeenCalledTimes(1);
    });

    it("handles disconnect errors gracefully", async () => {
      mockMCPClient.close.mockRejectedValue(new Error("Disconnect failed"));

      // Should not throw
      await expect(client.disconnect()).resolves.toBeUndefined();
    });

    it("reuses existing connection for multiple searches", async () => {
      mockMCPClient.callTool.mockResolvedValue(
        createMockSearchResponse(sampleDocResults)
      );

      await client.searchDocs("test1");
      await client.searchDocs("test2");

      // Should only connect once
      expect(mockMCPClient.connect).toHaveBeenCalledTimes(1);
    });
  });
});
