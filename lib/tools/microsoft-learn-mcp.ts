/**
 * Microsoft Learn MCP Client
 *
 * Connects to Microsoft Learn's public MCP server to search official
 * Microsoft documentation, code samples, and fetch detailed articles.
 *
 * Server: https://learn.microsoft.com/api/mcp
 * Documentation: https://learn.microsoft.com/en-us/training/support/mcp
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export interface MicrosoftLearnSearchResult {
  title: string;
  url: string;
  content: string;
}

export interface MicrosoftLearnCodeSample {
  title: string;
  url: string;
  code: string;
  language?: string;
}

export interface MicrosoftLearnDocumentation {
  title: string;
  url: string;
  content: string;
  fullText: string;
}

/**
 * Microsoft Learn MCP Client
 *
 * Provides access to Microsoft Learn documentation via the Model Context Protocol.
 * Automatically handles connection lifecycle and provides typed results.
 */
export class MicrosoftLearnMCPClient {
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;
  private readonly serverUrl = "https://learn.microsoft.com/api/mcp";

  /**
   * Check if the client is configured and can connect
   */
  public isAvailable(): boolean {
    // Microsoft Learn MCP is a public service, always available
    return true;
  }

  /**
   * Ensure the client is connected
   */
  private async ensureConnected(): Promise<void> {
    if (this.client) {
      return;
    }

    // If already connecting, wait for that to complete
    if (this.connecting) {
      await this.connecting;
      return;
    }

    // Start connection
    this.connecting = this.connect();
    await this.connecting;
    this.connecting = null;
  }

  /**
   * Connect to Microsoft Learn MCP server
   */
  private async connect(): Promise<void> {
    try {
      const transport = new SSEClientTransport(new URL(this.serverUrl));
      this.client = new Client(
        {
          name: "peterpool-bot",
          version: "1.0.0",
        },
        {
          capabilities: {},
        },
      );

      await this.client.connect(transport);
      console.log("[Microsoft Learn MCP] Connected successfully");
    } catch (error) {
      console.error("[Microsoft Learn MCP] Connection failed:", error);
      this.client = null;
      throw new Error(
        `Failed to connect to Microsoft Learn MCP server: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Disconnect from the MCP server
   */
  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        console.error("[Microsoft Learn MCP] Disconnect error:", error);
      }
      this.client = null;
    }
  }

  /**
   * Search Microsoft Learn documentation
   *
   * @param query - Search query (e.g., "Azure AD authentication", "PowerShell get users")
   * @param limit - Maximum number of results (default: 5)
   * @returns Array of search results with title, URL, and content excerpts
   */
  public async searchDocs(
    query: string,
    limit = 5,
  ): Promise<MicrosoftLearnSearchResult[]> {
    await this.ensureConnected();

    if (!this.client) {
      throw new Error("MCP client not connected");
    }

    try {
      const result = await this.client.callTool({
        name: "microsoft_docs_search",
        arguments: {
          query,
          limit,
        },
      });

      // Parse MCP tool result
      const content = result.content as Array<{ type: string; text?: string }>;
      if (!content || content.length === 0) {
        return [];
      }

      const textContent = content.find((c: any) => c.type === "text");
      if (!textContent || textContent.type !== "text" || !textContent.text) {
        return [];
      }

      // The MCP server returns results in a structured format
      // Parse the text content to extract results
      const results: MicrosoftLearnSearchResult[] = [];
      try {
        const parsed = JSON.parse(textContent.text);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            results.push({
              title: item.title || "",
              url: item.url || "",
              content: item.content || item.excerpt || "",
            });
          }
        }
      } catch {
        // If JSON parsing fails, treat the whole response as a single result
        results.push({
          title: "Microsoft Learn Documentation",
          url: "",
          content: textContent.text || "",
        });
      }

      return results.slice(0, limit);
    } catch (error) {
      console.error("[Microsoft Learn MCP] Search docs error:", error);
      throw new Error(
        `Failed to search Microsoft Learn docs: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Search for code samples in Microsoft Learn documentation
   *
   * @param query - Search query (e.g., "Azure authenticate PowerShell")
   * @param language - Optional programming language filter (e.g., "powershell", "python", "csharp")
   * @param limit - Maximum number of results (default: 5)
   * @returns Array of code samples with title, URL, code, and language
   */
  public async searchCode(
    query: string,
    language?: string,
    limit = 5,
  ): Promise<MicrosoftLearnCodeSample[]> {
    await this.ensureConnected();

    if (!this.client) {
      throw new Error("MCP client not connected");
    }

    try {
      const result = await this.client.callTool({
        name: "microsoft_code_sample_search",
        arguments: {
          query,
          language: language?.toLowerCase(),
        },
      });

      // Parse MCP tool result
      const content = result.content as Array<{ type: string; text?: string }>;
      if (!content || content.length === 0) {
        return [];
      }

      const textContent = content.find((c: any) => c.type === "text");
      if (!textContent || textContent.type !== "text" || !textContent.text) {
        return [];
      }

      // Parse code samples
      const samples: MicrosoftLearnCodeSample[] = [];
      try {
        const parsed = JSON.parse(textContent.text);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            samples.push({
              title: item.title || "",
              url: item.url || "",
              code: item.code || item.content || "",
              language: item.language || language,
            });
          }
        }
      } catch {
        // If JSON parsing fails, treat as plain text code
        samples.push({
          title: "Microsoft Learn Code Sample",
          url: "",
          code: textContent.text || "",
          language,
        });
      }

      return samples.slice(0, limit);
    } catch (error) {
      console.error("[Microsoft Learn MCP] Search code error:", error);
      throw new Error(
        `Failed to search Microsoft Learn code samples: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Fetch full documentation from a Microsoft Learn URL
   *
   * @param url - Microsoft Learn documentation URL
   * @returns Full documentation content with title, URL, and complete text
   */
  public async fetchDoc(url: string): Promise<MicrosoftLearnDocumentation | null> {
    await this.ensureConnected();

    if (!this.client) {
      throw new Error("MCP client not connected");
    }

    // Validate URL is from Microsoft Learn
    if (!url.includes("learn.microsoft.com") && !url.includes("microsoft.com")) {
      throw new Error("URL must be from Microsoft Learn documentation");
    }

    try {
      const result = await this.client.callTool({
        name: "microsoft_docs_fetch",
        arguments: {
          url,
        },
      });

      // Parse MCP tool result
      const content = result.content as Array<{ type: string; text?: string }>;
      if (!content || content.length === 0) {
        return null;
      }

      const textContent = content.find((c: any) => c.type === "text");
      if (!textContent || textContent.type !== "text" || !textContent.text) {
        return null;
      }

      // Try to parse as structured data first
      try {
        const parsed = JSON.parse(textContent.text);
        return {
          title: parsed.title || "Microsoft Learn Documentation",
          url: url,
          content: parsed.content || parsed.excerpt || "",
          fullText: parsed.fullText || textContent.text || "",
        };
      } catch {
        // If JSON parsing fails, return as markdown/text
        return {
          title: "Microsoft Learn Documentation",
          url: url,
          content: textContent.text.substring(0, 500),
          fullText: textContent.text,
        };
      }
    } catch (error) {
      console.error("[Microsoft Learn MCP] Fetch doc error:", error);
      throw new Error(
        `Failed to fetch Microsoft Learn documentation: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Search for documentation and return a formatted summary
   * Useful for Slack bot responses
   */
  public async searchAndFormat(query: string): Promise<string> {
    try {
      const results = await this.searchDocs(query, 3);

      if (results.length === 0) {
        return `No Microsoft Learn documentation found for "${query}".`;
      }

      let formatted = `📚 *Microsoft Learn Documentation for "${query}":*\n\n`;

      for (const result of results) {
        formatted += `*${result.title}*\n`;
        formatted += `${result.content.substring(0, 200)}...\n`;
        if (result.url) {
          formatted += `🔗 ${result.url}\n`;
        }
        formatted += `\n`;
      }

      return formatted;
    } catch (error) {
      console.error("[Microsoft Learn MCP] Search and format error:", error);
      return `Error searching Microsoft Learn: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }
}

// Singleton instance
export const microsoftLearnMCP = new MicrosoftLearnMCPClient();
