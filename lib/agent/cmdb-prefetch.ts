import type { CoreMessage } from "./types";
import { serviceNowClient } from "../tools/servicenow";
import type { ServiceNowConfigurationItem } from "../tools/servicenow";
import { createServiceNowContext } from "../infrastructure/servicenow-context";
import { formatConfigurationItemsForLLM } from "../services/servicenow-formatters";

interface PrefetchOptions {
  channelId?: string;
  companyName?: string;
  maxQueries?: number;
}

interface PrefetchQuery {
  label: string;
  search: {
    name?: string;
    className?: string;
    company?: string;
    limit?: number;
  };
  reason: string;
}

interface PrefetchResult {
  message: CoreMessage;
  metadata: {
    triggers: string[];
    totalResults: number;
    queries: Array<{ label: string; count: number }>;
  };
}

const SERVER_KEYWORDS = ["server", "servers", "cmdb", "infrastructure", "environment", "domain controller"];

export async function maybePrefetchCmdb(
  messages: CoreMessage[],
  options: PrefetchOptions,
): Promise<PrefetchResult | null> {
  if (!serviceNowClient.isConfigured()) {
    return null;
  }

  const lastUserMessage = [...messages].reverse().find((msg) => msg.role === "user");
  if (!lastUserMessage) {
    return null;
  }

  const text = normalizeText(lastUserMessage.content);
  if (!text) {
    return null;
  }

  const triggers = detectTriggers(text);
  if (triggers.length === 0) {
    return null;
  }

  const queries = buildQueries(triggers, options);
  if (queries.length === 0) {
    return null;
  }

  const cmdbContext = createServiceNowContext(undefined, options.channelId);
  const aggregated = new Map<string, ServiceNowConfigurationItem>();
  const querySummaries: Array<{ label: string; count: number }> = [];

  try {
    for (const query of queries.slice(0, options.maxQueries ?? 3)) {
      const results =
        (await serviceNowClient.searchConfigurationItems(
          query.search,
          cmdbContext,
        )) ?? [];
      results.forEach((item) => aggregated.set(item.sys_id, item));
      querySummaries.push({ label: query.label, count: results.length });
      if (aggregated.size >= 25) {
        break;
      }
    }

    let summaryText = "Summary\nNo configuration items found.";
    if (aggregated.size > 0) {
      const formatted = formatConfigurationItemsForLLM(Array.from(aggregated.values()));
      summaryText = formatted?.summary ?? summaryText;
    }

    const messageLines = ["[Auto CMDB Lookup]", "", summaryText];
    if (querySummaries.length > 0) {
      messageLines.push("", "Queries:");
      querySummaries.forEach((q) => {
        messageLines.push(`• ${q.label} (${q.count} ${q.count === 1 ? "result" : "results"})`);
      });
    }

    return {
      message: {
        role: "assistant",
        content: messageLines.join("\n"),
      },
      metadata: {
        triggers,
        totalResults: aggregated.size,
        queries: querySummaries,
      },
    };
  } catch (error) {
    console.error("[Auto CMDB Lookup] Prefetch failed:", error);
    return null;
  }
}

function normalizeText(content: CoreMessage["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block: any) => (typeof block === "string" ? block : block?.text ?? ""))
      .join(" ");
  }
  if (typeof content === "object" && content !== null && "text" in content) {
    return String((content as any).text ?? "");
  }
  return "";
}

function detectTriggers(text: string): string[] {
  const triggers: string[] = [];
  const lower = text.toLowerCase();

  if (SERVER_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    triggers.push("servers");
  }

  const hostTokens = extractHostTokens(text);
  hostTokens.forEach((token) => triggers.push(`host:${token}`));

  return triggers;
}

function extractHostTokens(text: string): string[] {
  const matches = text.match(/\b[A-Za-z][A-Za-z0-9_-]{3,}\b/g) ?? [];
  return matches
    .filter((token) => /[0-9]/.test(token) && /[A-Za-z]/.test(token))
    .slice(0, 3);
}

function buildQueries(triggers: string[], options: PrefetchOptions): PrefetchQuery[] {
  const queries: PrefetchQuery[] = [];

  if (triggers.includes("servers")) {
    queries.push({
      label: options.companyName
        ? `Servers for ${options.companyName}`
        : "Servers (all companies)",
      search: {
        className: "cmdb_ci_server",
        company: options.companyName,
        limit: 5,
      },
      reason: "servers",
    });
  }

  triggers
    .filter((trigger) => trigger.startsWith("host:"))
    .forEach((trigger) => {
      const host = trigger.split(":")[1];
      queries.push({
        label: `Host ${host}`,
        search: {
          name: host,
          limit: 5,
        },
        reason: trigger,
      });
    });

  return queries;
}
