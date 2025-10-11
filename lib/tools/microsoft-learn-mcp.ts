/**
 * Microsoft Learn MCP Client
 *
 * Connects to Microsoft Learn's public MCP server to search official
 * Microsoft documentation using stateless HTTP requests with JSON-RPC.
 *
 * Server: https://learn.microsoft.com/api/mcp
 * Documentation: https://learn.microsoft.com/en-us/training/support/mcp
 *
 * Uses HTTP transport with JSON-RPC for serverless-friendly stateless requests.
 */

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
 * Provides access to Microsoft Learn documentation via stateless HTTP requests
 * to the Model Context Protocol server. Perfect for serverless environments.
 */
export class MicrosoftLearnMCPClient {
  private readonly serverUrl = "https://learn.microsoft.com/api/mcp";
  private requestId = 1;

  /**
   * Check if the client is configured and can connect
   */
  public isAvailable(): boolean {
    // Microsoft Learn MCP is a public service, always available
    return true;
  }

  /**
   * Make a JSON-RPC request to the MCP server
   * The server responds with SSE format, so we need to parse SSE events
   */
  private async makeRequest(method: string, params: Record<string, unknown>): Promise<any> {
    try {
      const response = await fetch(this.serverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: this.requestId++,
          method,
          params,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Microsoft Learn MCP responds with SSE format, even for POST requests
      const text = await response.text();

      // Parse SSE format: "event: message\ndata: {...}\n\n"
      const sseEvents = this.parseSSE(text);

      // Find the JSON-RPC response in SSE events
      for (const event of sseEvents) {
        if (event.data) {
          const data = JSON.parse(event.data);
          if (data.error) {
            throw new Error(`JSON-RPC Error: ${data.error.message || JSON.stringify(data.error)}`);
          }
          if (data.result !== undefined) {
            return data.result;
          }
        }
      }

      throw new Error("No valid JSON-RPC response found in SSE stream");
    } catch (error) {
      console.error(`[Microsoft Learn MCP] Request failed (${method}):`, error);
      throw error;
    }
  }

  /**
   * Parse Server-Sent Events (SSE) format
   */
  private parseSSE(text: string): Array<{ event?: string; data?: string }> {
    const events: Array<{ event?: string; data?: string }> = [];
    const lines = text.split('\n');
    let currentEvent: { event?: string; data?: string } = {};

    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent.event = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        currentEvent.data = line.substring(5).trim();
      } else if (line.trim() === '' && (currentEvent.event || currentEvent.data)) {
        // End of event
        events.push(currentEvent);
        currentEvent = {};
      }
    }

    // Add last event if exists
    if (currentEvent.event || currentEvent.data) {
      events.push(currentEvent);
    }

    return events;
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
    try {
      const result = await this.makeRequest("tools/call", {
        name: "microsoft_docs_search",
        arguments: {
          query,
        },
      });

      // Parse MCP tool result
      if (!result || !result.content || result.content.length === 0) {
        return [];
      }

      const textContent = result.content.find((c: any) => c.type === "text");
      if (!textContent || !textContent.text) {
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
    try {
      const result = await this.makeRequest("tools/call", {
        name: "microsoft_code_sample_search",
        arguments: {
          query,
          language: language?.toLowerCase(),
        },
      });

      // Parse MCP tool result
      if (!result || !result.content || result.content.length === 0) {
        return [];
      }

      const textContent = result.content.find((c: any) => c.type === "text");
      if (!textContent || !textContent.text) {
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
    // Validate URL is from Microsoft Learn
    if (!url.includes("learn.microsoft.com") && !url.includes("microsoft.com")) {
      throw new Error("URL must be from Microsoft Learn documentation");
    }

    try {
      const result = await this.makeRequest("tools/call", {
        name: "microsoft_docs_fetch",
        arguments: {
          url,
        },
      });

      // Parse MCP tool result
      if (!result || !result.content || result.content.length === 0) {
        return null;
      }

      const textContent = result.content.find((c: any) => c.type === "text");
      if (!textContent || !textContent.text) {
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
