/**
 * Azure AI Search Client Tests
 * Tests keyword search and MSP attribution logic
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AzureSearchClient, getClientLabel } from "../lib/services/azure-search-client";
import type { SimilarCaseResult } from "../lib/schemas/servicenow-webhook";

describe("Azure Search Client", () => {
  describe("getClientLabel", () => {
    it("should return [Your Organization] for same client", () => {
      const label = getClientLabel(true, "Neighbors");

      expect(label).toBe("[Your Organization]");
    });

    it("should return client name for different client with name", () => {
      const label = getClientLabel(false, "Exceptional");

      expect(label).toBe("[Exceptional]");
    });

    it("should return [Different Client] for different client without name", () => {
      const label = getClientLabel(false, null);

      expect(label).toBe("[Different Client]");
    });

    it("should return [Different Client] for different client with undefined name", () => {
      const label = getClientLabel(false, undefined);

      expect(label).toBe("[Different Client]");
    });
  });

  describe("AzureSearchClient", () => {
    let client: AzureSearchClient;

    beforeEach(() => {
      // Create client with test configuration
      client = new AzureSearchClient({
        endpoint: "https://test-search.search.windows.net",
        apiKey: "test-api-key",
        indexName: "case-intelligence-test",
      });
    });

    describe("searchSimilarCases", () => {
      it("should build correct search request for cross-client search", async () => {
        // Mock fetch to intercept the request
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            value: [
              {
                case_number: "SCS0001",
                client_id: "client123",
                client_name: "Test Client",
                short_description: "Test case",
                category: "Hardware",
                "@search.score": 25.5,
              },
            ],
          }),
        });

        global.fetch = mockFetch;

        await client.searchSimilarCases("test query", {
          accountSysId: "myClient456",
          topK: 5,
          crossClient: true,
        });

        // Verify fetch was called with correct parameters
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining("/indexes/case-intelligence-test/docs/search"),
          expect.objectContaining({
            method: "POST",
            headers: expect.objectContaining({
              "api-key": "test-api-key",
              "Content-Type": "application/json",
            }),
          })
        );

        // Verify search body
        const callArgs = mockFetch.mock.calls[0];
        const requestBody = JSON.parse(callArgs[1].body);

        expect(requestBody.search).toBe("test query");
        expect(requestBody.top).toBe(5);
        expect(requestBody.searchFields).toBe("short_description,description");
        expect(requestBody.filter).toBeUndefined(); // Cross-client search has no filter
      });

      it("should add client filter for single-client search", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ value: [] }),
        });

        global.fetch = mockFetch;

        await client.searchSimilarCases("test query", {
          accountSysId: "myClient456",
          topK: 5,
          crossClient: false, // Single-client search
        });

        const callArgs = mockFetch.mock.calls[0];
        const requestBody = JSON.parse(callArgs[1].body);

        expect(requestBody.filter).toBe("client_id eq 'myClient456'");
      });

      it("should correctly set same_client flag for MSP attribution", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            value: [
              {
                case_number: "SCS0001",
                client_id: "myClient456", // Same as request
                client_name: "My Company",
                short_description: "Test case 1",
                "@search.score": 30.0,
              },
              {
                case_number: "SCS0002",
                client_id: "otherClient789", // Different from request
                client_name: "Other Company",
                short_description: "Test case 2",
                "@search.score": 25.0,
              },
            ],
          }),
        });

        global.fetch = mockFetch;

        const results = await client.searchSimilarCases("test query", {
          accountSysId: "myClient456",
          topK: 5,
          crossClient: true,
        });

        expect(results.length).toBe(2);

        // First result: same client
        expect(results[0].case_number).toBe("SCS0001");
        expect(results[0].same_client).toBe(true);
        expect(results[0].client_name).toBe("My Company");

        // Second result: different client
        expect(results[1].case_number).toBe("SCS0002");
        expect(results[1].same_client).toBe(false);
        expect(results[1].client_name).toBe("Other Company");
      });

      it("should handle missing client information gracefully", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            value: [
              {
                case_number: "SCS0003",
                // No client_id or client_name
                short_description: "Test case",
                "@search.score": 20.0,
              },
            ],
          }),
        });

        global.fetch = mockFetch;

        const results = await client.searchSimilarCases("test query", {
          accountSysId: "myClient456",
          topK: 5,
        });

        expect(results.length).toBe(1);
        expect(results[0].same_client).toBe(false); // No client_id means not same client
        expect(results[0].client_name).toBeUndefined();
      });

      it("should return empty array on API error", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          text: async () => "Error details",
        });

        global.fetch = mockFetch;

        const results = await client.searchSimilarCases("test query");

        expect(results).toEqual([]);
      });

      it("should return empty array on network error", async () => {
        const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));

        global.fetch = mockFetch;

        const results = await client.searchSimilarCases("test query");

        expect(results).toEqual([]);
      });
    });

    describe("testConnection", () => {
      it("should return success when index exists", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            name: "case-intelligence-test",
            fields: [],
          }),
        });

        global.fetch = mockFetch;

        const result = await client.testConnection();

        expect(result.success).toBe(true);
        expect(result.message).toBe("Connected successfully");
        expect(result.indexName).toBe("case-intelligence-test");
      });

      it("should return failure when index not found", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          statusText: "Not Found",
        });

        global.fetch = mockFetch;

        const result = await client.testConnection();

        expect(result.success).toBe(false);
        expect(result.message).toContain("404");
      });
    });
  });

  describe("MSP Attribution Integration Test", () => {
    it("should produce correct work note labels for mixed client results", () => {
      const similarCases: SimilarCaseResult[] = [
        {
          case_number: "SCS0001",
          short_description: "Same client case",
          client_id: "myClient",
          client_name: "My Company",
          same_client: true,
          similarity_score: 35.0,
        },
        {
          case_number: "SCS0002",
          short_description: "Different client case",
          client_id: "otherClient",
          client_name: "Neighbors",
          same_client: false,
          similarity_score: 30.0,
        },
        {
          case_number: "SCS0003",
          short_description: "Unknown client case",
          client_id: "unknownClient",
          same_client: false,
          similarity_score: 25.0,
        },
      ];

      // Generate labels for work note
      const labels = similarCases.map((c) => getClientLabel(c.same_client, c.client_name));

      expect(labels[0]).toBe("[Your Organization]");
      expect(labels[1]).toBe("[Neighbors]");
      expect(labels[2]).toBe("[Different Client]");

      // Verify work note format
      const workNoteLines = similarCases.map((c, i) => {
        const label = labels[i];
        return `${i + 1}. ${c.case_number} ${label} - ${c.short_description} (Score: ${c.similarity_score.toFixed(2)})`;
      });

      expect(workNoteLines[0]).toBe(
        "1. SCS0001 [Your Organization] - Same client case (Score: 35.00)"
      );
      expect(workNoteLines[1]).toBe(
        "2. SCS0002 [Neighbors] - Different client case (Score: 30.00)"
      );
      expect(workNoteLines[2]).toBe(
        "3. SCS0003 [Different Client] - Unknown client case (Score: 25.00)"
      );
    });
  });
});
