/**
 * Incident Note Analyzer Service
 * Uses LLM to extract technical entities from incident work notes and descriptions
 */

import { getAnthropicClient } from "../anthropic-provider";
import type Anthropic from "@anthropic-ai/sdk";

export interface ExtractedEntities {
  ip_addresses?: string[];
  hostnames?: string[];
  edge_names?: string[];
  error_messages?: string[];
  system_names?: string[];
  account_numbers?: string[];
}

export interface IssueIntent {
  issue_type: "internal_ci" | "external_dependency" | "hybrid" | "unknown";
  confidence: number;
  reasoning: string;
  external_providers?: Array<{
    type: string; // "ISP", "Carrier", "Cloud Provider"
    name?: string; // "AT&T", "TPX", "Azure"
  }>;
}

export interface NoteAnalysisResult {
  entities: ExtractedEntities;
  summary: string;
  confidence: number;
  intent?: IssueIntent;
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
}

export class IncidentNoteAnalyzerService {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = getAnthropicClient();
  }

  /**
   * Analyze incident notes and extract technical entities
   */
  public async analyzeNotes(
    incidentNumber: string,
    shortDescription: string,
    workNotes: Array<{ value: string; sys_created_on: string; sys_created_by?: string }>,
    model: string = "claude-haiku-4-5"
  ): Promise<NoteAnalysisResult> {
    console.log(`[Incident Note Analyzer] Analyzing notes for incident ${incidentNumber}`, {
      workNotesCount: workNotes.length,
    });

    // Combine all note text
    const noteText = workNotes.map((note) => note.value).join("\n\n");
    const fullText = `Short Description: ${shortDescription}\n\nWork Notes:\n${noteText}`;

    // Build extraction prompt
    const systemPrompt = `You are a technical entity extraction specialist for IT service management. Your task is to extract technical entities AND classify the issue type.

**1. EXTRACT ENTITIES:**
- IP Addresses (IPv4/IPv6)
- Hostnames (FQDNs, server names)
- Edge/Network Device Names (VeloCloud edges, routers, switches)
- Error Messages (error codes, stack traces)
- System Names (servers, services, applications)
- Account Numbers (ACCT + 7 digits, e.g., ACCT0242146)

**2. CLASSIFY ISSUE TYPE:**
- "internal_ci" - Problem with managed infrastructure (server down, firewall issue, application crash)
- "external_dependency" - ISP issue, carrier problem, external service outage, payment/billing
- "hybrid" - Both internal CI and external component involved
- "unknown" - Cannot determine from description

**EXTERNAL KEYWORDS:** ISP, internet provider, carrier, billing, payment, external service, cloud provider outage, VeloCloud orchestrator, third-party

Return JSON:
{
  "ip_addresses": [],
  "hostnames": [],
  "edge_names": [],
  "error_messages": [],
  "system_names": [],
  "account_numbers": [],
  "summary": "Brief 1-2 sentence summary",
  "confidence": 0.85,
  "intent": {
    "issue_type": "internal_ci",
    "confidence": 0.9,
    "reasoning": "Server crash mentioned",
    "external_providers": [{"type": "ISP", "name": "AT&T"}]
  }
}

Rules:
- Only extract explicitly mentioned entities
- Normalize IPs (remove ports/CIDR)
- Confidence 0-1.0 based on clarity
- If ISP/billing mentioned → external_dependency
- If managed CI mentioned → internal_ci`;

    try {
      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 1500, // Reduced for cost efficiency
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: fullText,
          },
        ],
      });

      // Extract response text
      const content = response.content[0];
      if (content.type !== "text") {
        throw new Error("Unexpected response type from Claude");
      }

      // Parse JSON response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Failed to extract JSON from response");
      }

      const extracted = JSON.parse(jsonMatch[0]);

      const result: NoteAnalysisResult = {
        entities: {
          ip_addresses: extracted.ip_addresses || [],
          hostnames: extracted.hostnames || [],
          edge_names: extracted.edge_names || [],
          error_messages: extracted.error_messages || [],
          system_names: extracted.system_names || [],
          account_numbers: extracted.account_numbers || [],
        },
        summary: extracted.summary || "",
        confidence: extracted.confidence || 0.5,
        intent: extracted.intent || {
          issue_type: "unknown",
          confidence: 0,
          reasoning: "Intent not provided by LLM",
        },
        tokenUsage: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
          total: response.usage.input_tokens + response.usage.output_tokens,
        },
      };

      console.log(`[Incident Note Analyzer] Analysis complete for ${incidentNumber}`, {
        ipCount: result.entities.ip_addresses?.length || 0,
        hostnameCount: result.entities.hostnames?.length || 0,
        edgeNameCount: result.entities.edge_names?.length || 0,
        accountCount: result.entities.account_numbers?.length || 0,
        confidence: result.confidence,
        tokens: result.tokenUsage?.total,
      });

      return result;
    } catch (error) {
      console.error(`[Incident Note Analyzer] Error analyzing notes for ${incidentNumber}:`, error);

      // Return empty result on error
      return {
        entities: {
          ip_addresses: [],
          hostnames: [],
          edge_names: [],
          error_messages: [],
          system_names: [],
          account_numbers: [],
        },
        summary: "Failed to analyze notes",
        confidence: 0,
      };
    }
  }

  /**
   * Extract account numbers using regex (fallback if LLM fails)
   */
  public extractAccountNumbersRegex(text: string): string[] {
    const accountPattern = /ACCT\d{7}/gi;
    const matches = text.match(accountPattern) || [];
    return [...new Set(matches.map((m) => m.toUpperCase()))];
  }

  /**
   * Extract IP addresses using regex (fallback if LLM fails)
   */
  public extractIPAddressesRegex(text: string): string[] {
    // IPv4 pattern
    const ipv4Pattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
    const matches = text.match(ipv4Pattern) || [];

    // Filter out invalid IPs (like 999.999.999.999)
    return [...new Set(matches)].filter((ip) => {
      const parts = ip.split(".");
      return parts.every((part) => parseInt(part, 10) <= 255);
    });
  }

  /**
   * Generate enrichment summary for work notes
   * Creates a formatted summary of entities found for adding to incident
   */
  public generateEnrichmentSummary(entities: ExtractedEntities): string {
    const parts: string[] = [];

    parts.push("## Automated Incident Enrichment");
    parts.push("");
    parts.push("The following technical entities were identified:");
    parts.push("");

    if (entities.account_numbers && entities.account_numbers.length > 0) {
      parts.push(`**Account Numbers:** ${entities.account_numbers.join(", ")}`);
    }

    if (entities.edge_names && entities.edge_names.length > 0) {
      parts.push(`**Edge/Network Devices:** ${entities.edge_names.join(", ")}`);
    }

    if (entities.ip_addresses && entities.ip_addresses.length > 0) {
      parts.push(`**IP Addresses:** ${entities.ip_addresses.join(", ")}`);
    }

    if (entities.hostnames && entities.hostnames.length > 0) {
      parts.push(`**Hostnames:** ${entities.hostnames.join(", ")}`);
    }

    if (entities.system_names && entities.system_names.length > 0) {
      parts.push(`**Systems:** ${entities.system_names.join(", ")}`);
    }

    if (entities.error_messages && entities.error_messages.length > 0) {
      parts.push("");
      parts.push("**Error Messages:**");
      entities.error_messages.forEach((error) => {
        parts.push(`- ${error}`);
      });
    }

    parts.push("");
    parts.push("---");
    parts.push("*This enrichment was generated automatically by the AI-powered incident analysis system.*");

    return parts.join("\n");
  }
}

// Singleton instance
let serviceInstance: IncidentNoteAnalyzerService | null = null;

export function getIncidentNoteAnalyzerService(): IncidentNoteAnalyzerService {
  if (!serviceInstance) {
    serviceInstance = new IncidentNoteAnalyzerService();
  }
  return serviceInstance;
}
