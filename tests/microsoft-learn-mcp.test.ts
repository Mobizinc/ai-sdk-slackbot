import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MicrosoftLearnMCPClient } from "../lib/tools/microsoft-learn-mcp";
import {
  sampleDocResults,
  sampleCodeSamples,
  sampleFullDoc,
  samplePlainTextResponse,
  sampleErrors,
} from "./fixtures/microsoft-learn-responses";

// Helper to build SSE payloads coming back from the MCP service
const buildSSE = (payload: unknown) =>
  `event: message\n` + `data: ${JSON.stringify(payload)}\n\n`;

const buildJsonRpcResult = (result: unknown) =>
  buildSSE({ jsonrpc: "2.0", id: 1, result });

const buildJsonRpcError = (message: string) =>
  buildSSE({ jsonrpc: "2.0", id: 1, error: { message } });

describe("MicrosoftLearnMCPClient", () => {
  const fetchMock = vi.fn();
  let client: MicrosoftLearnMCPClient;

  beforeEach(() => {
    vi.resetAllMocks();
    // @ts-expect-error override global fetch for tests
    global.fetch = fetchMock;
    client = new MicrosoftLearnMCPClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockFetchResponse = (body: string, init: ResponseInit = { status: 200 }) => {
    fetchMock.mockResolvedValue(
      new Response(body, {
        headers: { "Content-Type": "text/event-stream" },
        ...init,
      })
    );
  };

  describe("isAvailable", () => {
    it("returns true because the MCP endpoint is public", () => {
      expect(client.isAvailable()).toBe(true);
    });
  });

  describe("searchDocs", () => {
    it("parses JSON results from the MCP endpoint", async () => {
      const responsePayload = {
        content: [
          {
            type: "text",
            text: JSON.stringify(sampleDocResults),
          },
        ],
      };

      mockFetchResponse(buildJsonRpcResult(responsePayload));

      const results = await client.searchDocs("Azure AD password reset", 2);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, requestInit] = fetchMock.mock.calls[0] ?? [];
      expect(JSON.parse((requestInit as RequestInit).body as string)).toMatchObject({
        method: "tools/call",
        params: {
          name: "microsoft_docs_search",
          arguments: { query: "Azure AD password reset" },
        },
      });
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe(sampleDocResults[0].title);
    });

    it("returns empty array when no content is returned", async () => {
      mockFetchResponse(buildJsonRpcResult({ content: [] }));

      const results = await client.searchDocs("missing");
      expect(results).toEqual([]);
    });

    it("falls back to plain text when JSON parsing fails", async () => {
      mockFetchResponse(
        buildJsonRpcResult({
          content: [{ type: "text", text: samplePlainTextResponse }],
        })
      );

      const results = await client.searchDocs("plain");
      expect(results).toEqual([
        {
          title: "Microsoft Learn Documentation",
          url: "",
          content: samplePlainTextResponse,
        },
      ]);
    });

    it("wraps network errors with a helpful message", async () => {
      fetchMock.mockRejectedValue(sampleErrors.networkError);

      await expect(client.searchDocs("test")).rejects.toThrow(
        /Failed to connect to Microsoft Learn MCP server: Network timeout/
      );
    });
  });

  describe("searchCode", () => {
    it("parses code samples", async () => {
      const responsePayload = {
        content: [
          {
            type: "text",
            text: JSON.stringify(sampleCodeSamples),
          },
        ],
      };

      mockFetchResponse(buildJsonRpcResult(responsePayload));

      const results = await client.searchCode("Azure PowerShell", "powershell", 1);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe(sampleCodeSamples[0].title);
      expect(results[0].language).toBe("powershell");
    });

    it("returns empty array when response has no content", async () => {
      mockFetchResponse(buildJsonRpcResult({ content: [] }));

      const results = await client.searchCode("missing");
      expect(results).toEqual([]);
    });

    it("treats plain text responses as a generic sample", async () => {
      mockFetchResponse(
        buildJsonRpcResult({
          content: [{ type: "text", text: "Get-AzureADUser" }],
        })
      );

      const [sample] = await client.searchCode("Azure", "powershell");
      expect(sample.code).toBe("Get-AzureADUser");
      expect(sample.language).toBe("powershell");
    });
  });

  describe("fetchDoc", () => {
    it("fetches and formats documentation", async () => {
      const responsePayload = {
        content: [
          {
            type: "text",
            text: JSON.stringify(sampleFullDoc),
          },
        ],
      };

      mockFetchResponse(buildJsonRpcResult(responsePayload));

      const doc = await client.fetchDoc(
        "https://learn.microsoft.com/en-us/powershell/module/azuread/set-azureaduserpassword"
      );

      expect(doc).toMatchObject({
        title: sampleFullDoc.title,
        url: "https://learn.microsoft.com/en-us/powershell/module/azuread/set-azureaduserpassword",
      });
    });

    it("validates Microsoft Learn URLs", async () => {
      await expect(client.fetchDoc("https://example.com"))
        .rejects.toThrow("URL must be from Microsoft Learn documentation");
    });

    it("returns null when no content is returned", async () => {
      mockFetchResponse(buildJsonRpcResult({ content: [] }));

      const doc = await client.fetchDoc("https://learn.microsoft.com/en-us/azure");
      expect(doc).toBeNull();
    });

    it("handles plain text documentation", async () => {
      const markdown = "# Azure\nSample";
      mockFetchResponse(
        buildJsonRpcResult({
          content: [{ type: "text", text: markdown }],
        })
      );

      const doc = await client.fetchDoc("https://learn.microsoft.com/en-us/azure");
      expect(doc).toEqual({
        title: "Microsoft Learn Documentation",
        url: "https://learn.microsoft.com/en-us/azure",
        content: markdown,
        fullText: markdown,
      });
    });
  });

  describe("searchAndFormat", () => {
    it("formats Slack copy when results exist", async () => {
      const responsePayload = {
        content: [
          {
            type: "text",
            text: JSON.stringify(sampleDocResults.slice(0, 1)),
          },
        ],
      };

      mockFetchResponse(buildJsonRpcResult(responsePayload));

      const message = await client.searchAndFormat("Azure password reset");

      expect(message).toContain("📚 *Microsoft Learn Documentation for \"Azure password reset\":*");
      expect(message).toContain(sampleDocResults[0].title);
    });

    it("returns friendly message when nothing is found", async () => {
      mockFetchResponse(buildJsonRpcResult({ content: [] }));

      const message = await client.searchAndFormat("nonexistent");
      expect(message).toContain('No Microsoft Learn documentation found for "nonexistent"');
    });

    it("surfaces errors from the service", async () => {
      mockFetchResponse(buildJsonRpcError("Service unavailable"));

      const message = await client.searchAndFormat("test");
      expect(message).toContain("Error searching Microsoft Learn");
      expect(message).toContain("Service unavailable");
    });
  });

  describe("error handling", () => {
    it("throws when the HTTP call fails", async () => {
      mockFetchResponse("Server error", { status: 500, statusText: "Server Error" });

      await expect(client.searchDocs("test")).rejects.toThrow(/HTTP 500/);
    });
  });
});
