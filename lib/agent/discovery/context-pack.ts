import type { CoreMessage } from "../types";
import type { BusinessEntityContext } from "../../services/business-context-service";
import { getBusinessContextService } from "../../services/business-context-service";
import type { CaseContext } from "../../context-manager";
import { getContextManager } from "../../context-manager";
import type { SimilarCase } from "../../services/azure-search";
import { getSearchFacadeService } from "../../services/search-facade";
import { getConfigValue } from "../../config";

export interface DiscoveryContextPackMetadata {
  caseNumbers: string[];
  channelId?: string;
  threadTs?: string;
  companyName?: string;
}

export interface DiscoveryBusinessContextSummary {
  entityName: string;
  entityType?: string;
  industry?: string;
  aliases?: string[];
  technologyPortfolio?: string;
  serviceDetails?: string;
  notes?: string;
}

export interface DiscoverySlackMessageSummary {
  role: "user" | "assistant";
  text: string;
  timestamp?: string;
}

export interface DiscoverySimilarCaseSummary {
  caseNumber: string;
  score: number;
  excerpt: string;
  url?: string;
}

export interface DiscoveryContextPack {
  generatedAt: string;
  metadata: DiscoveryContextPackMetadata;
  businessContext?: DiscoveryBusinessContextSummary;
  caseContext?: {
    caseNumber: string;
    channelId?: string;
    threadTs?: string;
    detectedAt?: string;
    lastUpdated?: string;
    messageCount?: number;
  };
  slackRecent?: {
    totalMessages: number;
    messages: DiscoverySlackMessageSummary[];
  };
  similarCases?: {
    total: number;
    cases: DiscoverySimilarCaseSummary[];
  };
  policyAlerts?: string[];
}

export interface GenerateDiscoveryContextPackOptions {
  channelId?: string;
  threadTs?: string;
  caseNumbers?: string[];
  companyName?: string;
  messages?: CoreMessage[];
  businessContext?: BusinessEntityContext | null;
  caseContext?: CaseContext;
  similarCases?: SimilarCase[];
  threadHistory?: CoreMessage[];
}

const MAX_MESSAGE_PREVIEW_LENGTH = 280;

export async function generateDiscoveryContextPack(
  options: GenerateDiscoveryContextPackOptions
): Promise<DiscoveryContextPack> {
  const metadata: DiscoveryContextPackMetadata = {
    caseNumbers: options.caseNumbers ?? [],
    channelId: options.channelId,
    threadTs: options.threadTs,
    companyName: options.companyName,
  };

  const pack: DiscoveryContextPack = {
    generatedAt: new Date().toISOString(),
    metadata,
    policyAlerts: [],
  };

  const businessContext = await resolveBusinessContext(options);
  if (businessContext) {
    pack.businessContext = summariseBusinessContext(businessContext);
  }

  const caseContext = await resolveCaseContext(options);
  if (caseContext) {
    pack.caseContext = summariseCaseContext(caseContext);
  }

  const slackSummary = buildSlackSummary(options);
  if (slackSummary.messages.length > 0) {
    pack.slackRecent = slackSummary;
  }

  const similarCases = await resolveSimilarCases(options, slackSummary);
  if (similarCases.length > 0) {
    pack.similarCases = {
      total: similarCases.length,
      cases: similarCases.map((item) => ({
        caseNumber: item.case_number,
        score: Math.round((item.score ?? 0) * 100),
        excerpt: truncateText(item.content ?? "", 280),
        url: item.filename,
      })),
    };
  }

  return pack;
}

async function resolveBusinessContext(options: GenerateDiscoveryContextPackOptions) {
  if (options.businessContext) {
    return options.businessContext;
  }

  const businessService = getBusinessContextService();

  if (options.channelId) {
    try {
      const byChannel = await businessService.getContextForSlackChannel(
        options.channelId,
        undefined
      );
      if (byChannel) {
        return byChannel;
      }
    } catch (error) {
      console.warn("[Discovery] Failed channel-based business context lookup:", error);
    }
  }

  if (options.companyName) {
    try {
      return await businessService.getContextForCompany(options.companyName);
    } catch (error) {
      console.warn("[Discovery] Failed company-based context lookup:", error);
    }
  }

  return null;
}

async function resolveCaseContext(options: GenerateDiscoveryContextPackOptions) {
  if (options.caseContext) {
    return options.caseContext;
  }

  const contextManager = getContextManager();
  const [primaryCase] = options.caseNumbers ?? [];
  if (!primaryCase) {
    return undefined;
  }

  if (options.threadTs) {
    const context = contextManager.getContextSync(primaryCase, options.threadTs);
    if (context) {
      return context;
    }
  }

  const contexts = contextManager.getContextsForCase(primaryCase);
  return contexts.length > 0 ? contexts[0] : undefined;
}

function summariseBusinessContext(context: BusinessEntityContext): DiscoveryBusinessContextSummary {
  return {
    entityName: context.entityName,
    entityType: context.entityType,
    industry: context.industry,
    aliases: context.aliases?.slice(0, 5),
    technologyPortfolio: context.technologyPortfolio,
    serviceDetails: context.serviceDetails,
    notes: context.description,
  };
}

function summariseCaseContext(context: CaseContext) {
  return {
    caseNumber: context.caseNumber,
    channelId: context.channelId,
    threadTs: context.threadTs,
    detectedAt: serializeDate(context.detectedAt),
    lastUpdated: serializeDate(context.lastUpdated),
    messageCount: context.messages?.length ?? 0,
  };
}

function buildSlackSummary(options: GenerateDiscoveryContextPackOptions) {
  const limit = ensurePositiveInt(getConfigValue("discoverySlackMessageLimit"), 5);
  const recordSource = options.threadHistory ?? options.messages ?? [];
  const flattened = recordSource
    .filter((msg) => msg.role === "user" || msg.role === "assistant")
    .map((msg) => ({
      role: msg.role as "user" | "assistant",
      text: truncateText(normalizeMessageContent(msg.content), MAX_MESSAGE_PREVIEW_LENGTH),
      timestamp: extractTimestamp(msg),
    }));

  return {
    totalMessages: Math.min(flattened.length, limit),
    messages: flattened.slice(-limit),
  };
}

async function resolveSimilarCases(
  options: GenerateDiscoveryContextPackOptions,
  slackSummary: { messages: DiscoverySlackMessageSummary[] }
): Promise<SimilarCase[]> {
  if (options.similarCases && options.similarCases.length > 0) {
    return options.similarCases;
  }

  const transcript = slackSummary.messages
    .filter((msg) => msg.role === "user")
    .map((msg) => msg.text)
    .join("\n")
    .slice(0, 800);

  if (!transcript) {
    return [];
  }

  const searchFacade = getSearchFacadeService();
  if (!searchFacade.isAzureSearchConfigured()) {
    return [];
  }

  try {
    const topK = ensurePositiveInt(getConfigValue("discoverySimilarCasesTopK"), 3);
    return await searchFacade.searchSimilarCases(transcript, {
      topK,
      clientId: options.companyName,
    });
  } catch (error) {
    console.warn("[Discovery] Similar case lookup failed:", error);
    return [];
  }
}

function normalizeMessageContent(content: CoreMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block: any) => {
        if (block?.type === "text" && typeof block.text === "string") {
          return block.text;
        }
        if (typeof block === "string") {
          return block;
        }
        return JSON.stringify(block);
      })
      .join(" ");
  }
  return String(content ?? "");
}

function truncateText(text: string, maxLength: number): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 3)}...`;
}

function ensurePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
}

function extractTimestamp(message: CoreMessage): string | undefined {
  const anyMessage = message as any;
  if (typeof anyMessage?.ts === "string") {
    return anyMessage.ts;
  }
  if (typeof anyMessage?.timestamp === "string") {
    return anyMessage.timestamp;
  }
  return undefined;
}

function serializeDate(value: any): string | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return undefined;
}
