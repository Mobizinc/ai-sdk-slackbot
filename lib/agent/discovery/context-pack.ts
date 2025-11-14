import type { CoreMessage } from "../types";
import type { BusinessEntityContext } from "../../services/business-context-service";
import { getBusinessContextService } from "../../services/business-context-service";
import type { CaseContext } from "../../context-manager";
import { getContextManager } from "../../context-manager";
import type { SimilarCase } from "../../services/azure-search";
import { getSearchFacadeService } from "../../services/search-facade";
import { getConfigValue } from "../../config";
import type { ConfigurationItem } from "../../infrastructure/servicenow/types/domain-models";
import { getCmdbRepository } from "../../infrastructure/servicenow/repositories";
import type { PolicySignal } from "../../services/policy-signals";
import { detectPolicySignals } from "../../services/policy-signals";
import type { ClientScopePolicySummary } from "../../services/client-scope-policy-service";
import { getClientScopePolicyService } from "../../services/client-scope-policy-service";
import {
  getDiscoveryContextCache,
  generateCacheKey,
  isCachingEnabled,
} from "./context-cache";
import type { MuscleMemoryExemplarSummary } from "../../services/muscle-memory";

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

export interface DiscoveryCMDBHitSummary {
  name: string;
  className?: string;
  ipAddresses?: string[];
  environment?: string;
  status?: string;
  ownerGroup?: string;
  url?: string;
  matchReason: string;
  relatedItems?: DiscoveryCMDBRelatedItem[];
}

export interface DiscoveryCMDBRelatedItem {
  name: string;
  className?: string;
  ownerGroup?: string;
  environment?: string;
  matchReason: string;
}

const CONTEXT_PACK_SCHEMA_VERSION = "1.1.0";

export interface DiscoveryContextPack {
  schemaVersion: string;
  generatedAt: string;
  metadata: DiscoveryContextPackMetadata;
  businessContext?: DiscoveryBusinessContextSummary;
  clientScopePolicy?: ClientScopePolicySummary;
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
  cmdbHits?: {
    total: number;
    items: DiscoveryCMDBHitSummary[];
  };
  policyAlerts?: PolicySignal[];
  muscleMemoryExemplars?: {
    total: number;
    exemplars: MuscleMemoryExemplarSummary[];
  };
}

export interface GenerateDiscoveryContextPackOptions {
  channelId?: string;
  threadTs?: string;
  caseNumbers?: string[];
  companyName?: string;
  messages?: CoreMessage[];
  businessContext?: BusinessEntityContext | null;
  clientScopePolicy?: ClientScopePolicySummary | null;
  caseContext?: CaseContext;
  similarCases?: SimilarCase[];
  threadHistory?: CoreMessage[];
  caseData?: any; // Case or Incident data for policy signals
  journalText?: string; // Combined journal text for keyword extraction
}

const MAX_MESSAGE_PREVIEW_LENGTH = 280;
const MAX_RELATED_CIS_PER_MATCH = 3;
const MAX_BASE_MATCHES_FOR_RELATIONS = 3;

export async function generateDiscoveryContextPack(
  options: GenerateDiscoveryContextPackOptions
): Promise<DiscoveryContextPack> {
  // Check cache first
  if (isCachingEnabled()) {
    const cacheKey = generateCacheKey({
      caseNumber: options.caseNumbers?.[0],
      channelId: options.channelId,
      threadTs: options.threadTs,
      companyName: options.companyName,
    });

    const cache = getDiscoveryContextCache();
    const cached = cache.get(cacheKey);

    if (cached) {
      console.log(`[Discovery] Cache hit for key: ${cacheKey}`);
      return cached;
    }

    console.log(`[Discovery] Cache miss for key: ${cacheKey}, generating fresh pack`);
  }

  const metadata: DiscoveryContextPackMetadata = {
    caseNumbers: options.caseNumbers ?? [],
    channelId: options.channelId,
    threadTs: options.threadTs,
    companyName: options.companyName,
  };

  const pack: DiscoveryContextPack = {
    schemaVersion: CONTEXT_PACK_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    metadata,
    policyAlerts: [],
  };

  const businessContext = await resolveBusinessContext(options);
  if (businessContext) {
    pack.businessContext = summariseBusinessContext(businessContext);
  }

  const clientPolicy = resolveClientScopePolicy(options, businessContext);
  if (clientPolicy) {
    pack.clientScopePolicy = clientPolicy;
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

  // CMDB/CI matching - extract keywords and search for configuration items
  const cmdbHits = await resolveCMDBHits(options, slackSummary);
  if (cmdbHits.length > 0) {
    pack.cmdbHits = {
      total: cmdbHits.length,
      items: cmdbHits.map((ci) => ({
        name: ci.name ?? "Unknown",
        className: ci.className,
        ipAddresses: ci.ipAddresses,
        environment: ci.environment,
        status: ci.status,
        ownerGroup: ci.ownerGroup,
        url: ci.url,
        matchReason: ci.matchReason,
        relatedItems: (ci as any).relatedItems,
      })),
    };
  }

  // Policy signals - maintenance windows, SLA breaches, high-risk customers
  const policySignals = await resolvePolicySignals(options, businessContext);
  if (policySignals.signals.length > 0) {
    pack.policyAlerts = policySignals.signals;
  }

  // Retrieve muscle memory exemplars (if enabled)
  const muscleMemoryEnabled = getConfigValue("muscleMemoryRetrievalEnabled");
  if (muscleMemoryEnabled) {
    try {
      const { retrievalService } = await import("../../services/muscle-memory");
      const exemplars = await retrievalService.findExemplarsForContext(pack);

      if (exemplars.length > 0) {
        pack.muscleMemoryExemplars = {
          total: exemplars.length,
          exemplars,
        };
        console.log(`[Discovery] Added ${exemplars.length} muscle memory exemplars to context pack`);
      }
    } catch (error) {
      console.error("[Discovery] Error retrieving muscle memory exemplars:", error);
      // Continue without muscle memory (graceful degradation)
    }
  }

  // Cache the generated pack
  if (isCachingEnabled()) {
    const cacheKey = generateCacheKey({
      caseNumber: options.caseNumbers?.[0],
      channelId: options.channelId,
      threadTs: options.threadTs,
      companyName: options.companyName,
    });

    const cache = getDiscoveryContextCache();
    cache.set(cacheKey, pack);
  }

  return pack;
}

function resolveClientScopePolicy(
  options: GenerateDiscoveryContextPackOptions,
  businessContext?: BusinessEntityContext | null
): ClientScopePolicySummary | null {
  if (options.clientScopePolicy) {
    return options.clientScopePolicy;
  }

  const policyService = getClientScopePolicyService();
  const searchTerms = new Set<string>();

  if (options.companyName) {
    searchTerms.add(options.companyName);
  }

  if (businessContext) {
    searchTerms.add(businessContext.entityName);
    for (const alias of businessContext.aliases ?? []) {
      searchTerms.add(alias);
    }
  }

  for (const term of searchTerms) {
    const summary = policyService.getPolicySummary(term);
    if (summary) {
      return summary;
    }
  }

  return null;
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

async function resolveCMDBHits(
  options: GenerateDiscoveryContextPackOptions,
  slackSummary: { messages: DiscoverySlackMessageSummary[] }
): Promise<Array<ConfigurationItem & { matchReason: string }>> {
  // Feature flag check
  const enabled = getConfigValue("discoveryContextPackEnabled");
  if (!enabled) {
    return [];
  }

  try {
    const cmdbRepo = getCmdbRepository();

    // Extract text from journals and Slack messages
    const textSources: string[] = [];

    if (options.journalText) {
      textSources.push(options.journalText);
    }

    slackSummary.messages.forEach((msg) => {
      textSources.push(msg.text);
    });

    const combinedText = textSources.join("\n").slice(0, 2000); // Limit to 2000 chars

    // Extract potential CI names, IP addresses, and FQDNs
    const keywords = extractCMDBKeywords(combinedText);

    const foundCIs: Array<ConfigurationItem & { matchReason: string }> = [];
    const seenSysIds = new Set<string>();

    // Search by IP addresses
    for (const ip of keywords.ipAddresses.slice(0, 3)) {
      try {
        const results = await cmdbRepo.findByIpAddress(ip);
        for (const ci of results) {
          if (!seenSysIds.has(ci.sysId)) {
            foundCIs.push({ ...ci, matchReason: `IP: ${ip}` });
            seenSysIds.add(ci.sysId);
          }
        }
      } catch (error) {
        console.warn(`[Discovery] CMDB search by IP ${ip} failed:`, error);
      }
    }

    // Search by FQDNs
    for (const fqdn of keywords.fqdns.slice(0, 3)) {
      try {
        const results = await cmdbRepo.findByFqdn(fqdn);
        for (const ci of results) {
          if (!seenSysIds.has(ci.sysId)) {
            foundCIs.push({ ...ci, matchReason: `FQDN: ${fqdn}` });
            seenSysIds.add(ci.sysId);
          }
        }
      } catch (error) {
        console.warn(`[Discovery] CMDB search by FQDN ${fqdn} failed:`, error);
      }
    }

    // Search by CI names (if company context available)
    if (options.companyName) {
      for (const name of keywords.potentialCINames.slice(0, 2)) {
        try {
          const results = await cmdbRepo.search({
            name,
            company: options.companyName,
            limit: 3,
          });
          for (const ci of results) {
            if (!seenSysIds.has(ci.sysId)) {
              foundCIs.push({ ...ci, matchReason: `Name: ${name}` });
              seenSysIds.add(ci.sysId);
            }
          }
        } catch (error) {
          console.warn(`[Discovery] CMDB search by name ${name} failed:`, error);
        }
      }
    }

    const limitedCIs = foundCIs.slice(0, 5);

    // Fetch related CIs for top matches to provide dependency hints
    await enrichWithRelatedCIs(limitedCIs, cmdbRepo);

    return limitedCIs;
  } catch (error) {
    console.warn("[Discovery] CMDB resolution failed:", error);
    return [];
  }
}

async function enrichWithRelatedCIs(
  cis: Array<ConfigurationItem & { matchReason: string }>,
  cmdbRepo: ReturnType<typeof getCmdbRepository>
) {
  const candidates = cis.slice(0, MAX_BASE_MATCHES_FOR_RELATIONS);

  await Promise.all(
    candidates.map(async (ci) => {
      if (!ci.sysId) {
        return;
      }
      try {
        const related = await cmdbRepo.getRelatedCIs(ci.sysId);
        if (related.length === 0) {
          return;
        }

        const relatedItems: DiscoveryCMDBRelatedItem[] = related
          .slice(0, MAX_RELATED_CIS_PER_MATCH)
          .map((relatedCi) => ({
            name: relatedCi.name ?? "Unknown",
            className: relatedCi.className,
            ownerGroup: relatedCi.ownerGroup,
            environment: relatedCi.environment,
            matchReason: `Related to ${ci.name ?? "matching CI"}`,
          }));

        if (relatedItems.length > 0) {
          (ci as any).relatedItems = relatedItems;
        }
      } catch (error) {
        console.warn(`[Discovery] Failed to fetch related CIs for ${ci.name ?? ci.sysId}:`, error);
      }
    })
  );
}

async function resolvePolicySignals(
  options: GenerateDiscoveryContextPackOptions,
  businessContext: BusinessEntityContext | null
): Promise<{ signals: PolicySignal[] }> {
  try {
    const result = await detectPolicySignals({
      caseOrIncident: options.caseData,
      businessContext,
      channelId: options.channelId,
    });

    return { signals: result.signals };
  } catch (error) {
    console.warn("[Discovery] Policy signals detection failed:", error);
    return { signals: [] };
  }
}

/**
 * Extract potential CMDB keywords from text
 */
function extractCMDBKeywords(text: string): {
  ipAddresses: string[];
  fqdns: string[];
  potentialCINames: string[];
} {
  const ipv4Regex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  const fqdnRegex = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]\b/gi;

  const ipAddresses = Array.from(new Set(text.match(ipv4Regex) ?? []));
  const fqdns = Array.from(
    new Set(
      (text.match(fqdnRegex) ?? []).filter(
        (fqdn) => fqdn.includes(".") && fqdn.split(".").length >= 2
      )
    )
  );

  // Extract potential CI names (servers, switches, routers)
  // Look for patterns like: SERVERNAME-01, SWITCH-CORE-01, RTR-EDGE-01
  const ciNameRegex = /\b[A-Z]{2,}[-_][A-Z0-9-_]+\b/g;
  const potentialCINames = Array.from(new Set(text.match(ciNameRegex) ?? []));

  return {
    ipAddresses: ipAddresses.slice(0, 5),
    fqdns: fqdns.slice(0, 5),
    potentialCINames: potentialCINames.slice(0, 5),
  };
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
