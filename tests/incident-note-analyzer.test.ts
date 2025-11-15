import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IncidentNoteAnalyzerService } from "../lib/services/incident-note-analyzer";
import { getAnthropicClient } from "../lib/anthropic-provider";
import { anthropicModel } from "../lib/model-provider";
import type Anthropic from "@anthropic-ai/sdk";

// Mock the dependencies
vi.mock("../lib/anthropic-provider");
vi.mock("../lib/model-provider", () => ({
  anthropicModel: "claude-3-sonnet-20240229",
}));

const mockAnthropicClient = {
  messages: {
    create: vi.fn(),
  },
};

describe("IncidentNoteAnalyzerService", () => {
  let service: IncidentNoteAnalyzerService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAnthropicClient).mockReturnValue(mockAnthropicClient as any);
    service = new IncidentNoteAnalyzerService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Entity Extraction", () => {
    it("✓ Extracts IP addresses from work notes", async () => {
      const mockResponse = {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ip_addresses: ["192.168.1.100", "10.0.0.1"],
              hostnames: [],
              edge_names: [],
              error_messages: [],
              system_names: [],
              account_numbers: [],
              summary: "Network connectivity issues detected",
              confidence: 0.9,
            }),
          },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const workNotes = [
        { value: "Server at 192.168.1.100 is down", sys_created_on: "2025-01-01T12:00:00Z" },
        { value: "Also cannot reach 10.0.0.1", sys_created_on: "2025-01-01T12:05:00Z" },
      ];

      const result = await service.analyzeNotes("INC001001", "Network outage", workNotes);

      expect(result.entities.ip_addresses).toEqual(["192.168.1.100", "10.0.0.1"]);
      expect(result.confidence).toBe(0.9);
      expect(result.summary).toBe("Network connectivity issues detected");
    });

    it("✓ Extracts hostnames from work notes", async () => {
      const mockResponse = {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ip_addresses: [],
              hostnames: ["webserver.example.com", "db01.internal"],
              edge_names: [],
              error_messages: [],
              system_names: [],
              account_numbers: [],
              summary: "Server connectivity issues",
              confidence: 0.85,
            }),
          },
        ],
        usage: {
          input_tokens: 80,
          output_tokens: 40,
        },
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const workNotes = [
        { value: "Cannot connect to webserver.example.com", sys_created_on: "2025-01-01T12:00:00Z" },
        { value: "Database db01.internal also unreachable", sys_created_on: "2025-01-01T12:05:00Z" },
      ];

      const result = await service.analyzeNotes("INC001002", "Server issues", workNotes);

      expect(result.entities.hostnames).toEqual(["webserver.example.com", "db01.internal"]);
      expect(result.confidence).toBe(0.85);
    });

    it("✓ Extracts edge names from work notes", async () => {
      const mockResponse = {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ip_addresses: [],
              hostnames: [],
              edge_names: ["edge-ACCT0242146-01", "Branch-Office-Edge"],
              error_messages: [],
              system_names: [],
              account_numbers: [],
              summary: "VeloCloud edge connectivity problems",
              confidence: 0.95,
            }),
          },
        ],
        usage: {
          input_tokens: 120,
          output_tokens: 60,
        },
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const workNotes = [
        { value: "edge-ACCT0242146-01 is offline", sys_created_on: "2025-01-01T12:00:00Z" },
        { value: "Branch-Office-Edge showing disconnected status", sys_created_on: "2025-01-01T12:05:00Z" },
      ];

      const result = await service.analyzeNotes("INC001003", "Edge issues", workNotes);

      expect(result.entities.edge_names).toEqual(["edge-ACCT0242146-01", "Branch-Office-Edge"]);
      expect(result.confidence).toBe(0.95);
    });

    it("✓ Extracts account numbers (ACCT format)", async () => {
      const mockResponse = {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ip_addresses: [],
              hostnames: [],
              edge_names: [],
              error_messages: [],
              system_names: [],
              account_numbers: ["ACCT0242146", "ACCT0242147"],
              summary: "Issues affecting multiple customer accounts",
              confidence: 0.9,
            }),
          },
        ],
        usage: {
          input_tokens: 90,
          output_tokens: 45,
        },
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const workNotes = [
        { value: "Customer ACCT0242146 reporting connectivity loss", sys_created_on: "2025-01-01T12:00:00Z" },
        { value: "ACCT0242147 also affected by same issue", sys_created_on: "2025-01-01T12:05:00Z" },
      ];

      const result = await service.analyzeNotes("INC001004", "Customer issues", workNotes);

      expect(result.entities.account_numbers).toEqual(["ACCT0242146", "ACCT0242147"]);
      expect(result.confidence).toBe(0.9);
    });

    it("✓ Extracts error messages", async () => {
      const mockResponse = {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ip_addresses: [],
              hostnames: [],
              edge_names: [],
              error_messages: ["Connection timeout", "HTTP 503 Service Unavailable", "SSL certificate expired"],
              system_names: [],
              account_numbers: [],
              summary: "Multiple service errors detected",
              confidence: 0.88,
            }),
          },
        ],
        usage: {
          input_tokens: 110,
          output_tokens: 55,
        },
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const workNotes = [
        { value: "Getting Connection timeout errors", sys_created_on: "2025-01-01T12:00:00Z" },
        { value: "HTTP 503 Service Unavailable on main endpoint", sys_created_on: "2025-01-01T12:05:00Z" },
        { value: "SSL certificate expired warning", sys_created_on: "2025-01-01T12:10:00Z" },
      ];

      const result = await service.analyzeNotes("INC001005", "Service errors", workNotes);

      expect(result.entities.error_messages).toEqual([
        "Connection timeout",
        "HTTP 503 Service Unavailable",
        "SSL certificate expired",
      ]);
      expect(result.confidence).toBe(0.88);
    });

    it("✓ Returns confidence score", async () => {
      const mockResponse = {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ip_addresses: ["192.168.1.100"],
              hostnames: [],
              edge_names: [],
              error_messages: [],
              system_names: [],
              account_numbers: [],
              summary: "Single IP address identified",
              confidence: 0.75,
            }),
          },
        ],
        usage: {
          input_tokens: 70,
          output_tokens: 35,
        },
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const workNotes = [
        { value: "Server 192.168.1.100 is down", sys_created_on: "2025-01-01T12:00:00Z" },
      ];

      const result = await service.analyzeNotes("INC001006", "Server down", workNotes);

      expect(result.confidence).toBe(0.75);
    });
  });

  describe("Summary Generation", () => {
    it("✓ Generates enrichment summary markdown", () => {
      const entities = {
        ip_addresses: ["192.168.1.100", "10.0.0.1"],
        hostnames: ["webserver.example.com"],
        edge_names: ["edge-ACCT0242146-01"],
        error_messages: ["Connection timeout"],
        system_names: ["database-server"],
        account_numbers: ["ACCT0242146"],
      };

      const summary = service.generateEnrichmentSummary(entities);

      expect(summary).toContain("## Automated Incident Enrichment");
      expect(summary).toContain("**Account Numbers:** ACCT0242146");
      expect(summary).toContain("**Edge/Network Devices:** edge-ACCT0242146-01");
      expect(summary).toContain("**IP Addresses:** 192.168.1.100, 10.0.0.1");
      expect(summary).toContain("**Hostnames:** webserver.example.com");
      expect(summary).toContain("**Systems:** database-server");
      expect(summary).toContain("**Error Messages:**");
      expect(summary).toContain("- Connection timeout");
      expect(summary).toContain("*This enrichment was generated automatically*");
    });

    it("✓ Handles empty entities gracefully", () => {
      const entities = {
        ip_addresses: [],
        hostnames: [],
        edge_names: [],
        error_messages: [],
        system_names: [],
        account_numbers: [],
      };

      const summary = service.generateEnrichmentSummary(entities);

      expect(summary).toContain("## Automated Incident Enrichment");
      expect(summary).toContain("The following technical entities were identified:");
      expect(summary).not.toContain("**Account Numbers:**");
      expect(summary).not.toContain("**IP Addresses:**");
      expect(summary).toContain("*This enrichment was generated automatically*");
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("✓ Handles empty work notes gracefully", async () => {
      const mockResponse = {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ip_addresses: [],
              hostnames: [],
              edge_names: [],
              error_messages: [],
              system_names: [],
              account_numbers: [],
              summary: "No technical entities found in empty notes",
              confidence: 0.0,
            }),
          },
        ],
        usage: {
          input_tokens: 50,
          output_tokens: 25,
        },
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const workNotes: Array<{ value: string; sys_created_on: string }> = [];

      const result = await service.analyzeNotes("INC001007", "Empty incident", workNotes);

      expect(result.entities.ip_addresses).toEqual([]);
      expect(result.entities.hostnames).toEqual([]);
      expect(result.confidence).toBe(0.0);
      expect(result.summary).toBe("No technical entities found in empty notes");
    });

    it("✓ Regex fallback extracts account numbers when LLM fails", async () => {
      // Test the regex fallback method directly
      const text = "Customer ACCT0242146 and ACCT0242147 are experiencing issues with acct0242148";
      const accountNumbers = service.extractAccountNumbersRegex(text);

      expect(accountNumbers).toEqual(["ACCT0242146", "ACCT0242147", "ACCT0242148"]);
    });

    it("✓ Regex fallback extracts IP addresses when LLM fails", async () => {
      // Test the regex fallback method directly
      const text = "Servers at 192.168.1.100 and 10.0.0.1 are down. Invalid IP: 999.999.999.999";
      const ipAddresses = service.extractIPAddressesRegex(text);

      expect(ipAddresses).toEqual(["192.168.1.100", "10.0.0.1"]);
      expect(ipAddresses).not.toContain("999.999.999.999");
    });

    it("✓ Uses configured anthropicModel (not hardcoded)", async () => {
      const mockResponse = {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ip_addresses: [],
              hostnames: [],
              edge_names: [],
              error_messages: [],
              system_names: [],
              account_numbers: [],
              summary: "Test",
              confidence: 0.5,
            }),
          },
        ],
        usage: {
          input_tokens: 50,
          output_tokens: 25,
        },
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const workNotes = [{ value: "Test note", sys_created_on: "2025-01-01T12:00:00Z" }];

      await service.analyzeNotes("INC001008", "Test", workNotes);

      expect(mockAnthropicClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "claude-3-sonnet-20240229",
        })
      );
    });

    it("✓ Tracks token usage", async () => {
      const mockResponse = {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ip_addresses: ["192.168.1.100"],
              hostnames: [],
              edge_names: [],
              error_messages: [],
              system_names: [],
              account_numbers: [],
              summary: "Test",
              confidence: 0.8,
            }),
          },
        ],
        usage: {
          input_tokens: 150,
          output_tokens: 75,
        },
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const workNotes = [{ value: "Server 192.168.1.100 is down", sys_created_on: "2025-01-01T12:00:00Z" }];

      const result = await service.analyzeNotes("INC001009", "Token test", workNotes);

      expect(result.tokenUsage).toEqual({
        input: 150,
        output: 75,
        total: 225,
      });
    });

    it("✓ Handles LLM API errors gracefully", async () => {
      mockAnthropicClient.messages.create.mockRejectedValue(new Error("API rate limit exceeded"));

      const workNotes = [{ value: "Test note", sys_created_on: "2025-01-01T12:00:00Z" }];

      const result = await service.analyzeNotes("INC001010", "Error test", workNotes);

      expect(result.entities.ip_addresses).toEqual([]);
      expect(result.entities.hostnames).toEqual([]);
      expect(result.confidence).toBe(0);
      expect(result.summary).toBe("Failed to analyze notes");
    });

    it("✓ Handles malformed JSON response", async () => {
      const mockResponse = {
        content: [
          {
            type: "text",
            text: "This is not valid JSON",
          },
        ],
        usage: {
          input_tokens: 50,
          output_tokens: 25,
        },
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const workNotes = [{ value: "Test note", sys_created_on: "2025-01-01T12:00:00Z" }];

      const result = await service.analyzeNotes("INC001011", "Malformed test", workNotes);

      expect(result.confidence).toBe(0);
      expect(result.summary).toBe("Failed to analyze notes");
    });

    it("✓ Handles non-text response type", async () => {
      const mockResponse = {
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: "fake" },
          },
        ],
        usage: {
          input_tokens: 50,
          output_tokens: 25,
        },
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const workNotes = [{ value: "Test note", sys_created_on: "2025-01-01T12:00:00Z" }];

      const result = await service.analyzeNotes("INC001012", "Non-text test", workNotes);

      expect(result.confidence).toBe(0);
      expect(result.summary).toBe("Failed to analyze notes");
    });
  });

  describe("Input Processing", () => {
    it("✓ Combines short description and work notes correctly", async () => {
      const mockResponse = {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ip_addresses: ["192.168.1.100"],
              hostnames: [],
              edge_names: [],
              error_messages: [],
              system_names: [],
              account_numbers: [],
              summary: "Test",
              confidence: 0.8,
            }),
          },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const workNotes = [
        { value: "Work note 1", sys_created_on: "2025-01-01T12:00:00Z" },
        { value: "Work note 2", sys_created_on: "2025-01-01T12:05:00Z" },
      ];

      await service.analyzeNotes("INC001013", "Short description", workNotes);

      expect(mockAnthropicClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: "user",
              content: "Short Description: Short description\n\nWork Notes:\nWork note 1\n\nWork note 2",
            },
          ],
        })
      );
    });

    it("✓ Handles work notes with sys_created_by field", async () => {
      const mockResponse = {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ip_addresses: [],
              hostnames: [],
              edge_names: [],
              error_messages: [],
              system_names: [],
              account_numbers: [],
              summary: "Test",
              confidence: 0.5,
            }),
          },
        ],
        usage: {
          input_tokens: 50,
          output_tokens: 25,
        },
      };

      mockAnthropicClient.messages.create.mockResolvedValue(mockResponse);

      const workNotes = [
        { 
          value: "Test note", 
          sys_created_on: "2025-01-01T12:00:00Z",
          sys_created_by: "admin.user"
        },
      ];

      await service.analyzeNotes("INC001014", "Test", workNotes);

      expect(mockAnthropicClient.messages.create).toHaveBeenCalled();
    });
  });
});