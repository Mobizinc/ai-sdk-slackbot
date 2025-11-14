/**
 * Context Loader (Phase 3C Complete)
 *
 * Aggregates case context, business context, search results, and enrichment
 * signals needed by the agent before generating a response.
 */

import type { CoreMessage } from "./types";
import { getContextManager, type CaseContext } from "../context-manager";
import { getBusinessContextService, type BusinessEntityContext } from "../services/business-context-service";
import { getSearchFacadeService } from "../services/search-facade";
import { getSlackMessagingService } from "../services/slack-messaging";
import type { SimilarCase } from "../services/azure-search";
import { getConfigValue } from "../config";
import { generateDiscoveryContextPack } from "./discovery/context-pack";
import { maybePrefetchCmdb } from "./cmdb-prefetch";

export interface ContextLoaderInput {
  messages: CoreMessage[];
  channelId?: string;
  threadTs?: string;
  explicitCaseNumbers?: string[];
}

export interface ContextLoaderResult {
  messages: CoreMessage[];
  metadata: Record<string, unknown>;
}

export async function loadContext(input: ContextLoaderInput): Promise<ContextLoaderResult> {
  const metadata: Record<string, unknown> = {};

  const contextManager = getContextManager();
  const businessContextService = getBusinessContextService();
  const searchFacade = getSearchFacadeService();
  const slackMessaging = getSlackMessagingService();

  // Determine case numbers from explicit input or regex extraction
  const caseNumbers = (input.explicitCaseNumbers && input.explicitCaseNumbers.length > 0)
    ? input.explicitCaseNumbers
    : extractCaseNumbersFromMessages(contextManager, input.messages);

  metadata.caseNumbers = caseNumbers;

  if (caseNumbers.length > 0) {
    const contexts = contextManager.getContextsForCase(caseNumbers[0]);
    if (contexts.length > 0) {
      metadata.caseContext = contexts[0];
    }
  }

  // PRIORITY 1: Try channel-based context lookup (most accurate)
  if (input.channelId) {
    try {
      const channelContext = await businessContextService.getContextForSlackChannel(input.channelId);
      if (channelContext) {
        metadata.businessContext = channelContext;
        metadata.companyName = channelContext.entityName;
        console.log(`✅ [Context Loader] Auto-detected from Slack channel ID: ${input.channelId} → ${channelContext.entityName}`);
      }
    } catch (error) {
      console.warn("[Context Loader] Failed to lookup business context by channel ID:", error);
    }
  }

  // PRIORITY 2: Resolve company name from case context or detect from message text
  if (!metadata.businessContext) {
    let companyName = resolveCompanyName(metadata);

    if (!companyName) {
      const messageText = input.messages
        .map((msg) => normalizeContent(msg.content))
        .join(" ");
      companyName = await detectCompanyFromMessageText(messageText);
    }

    if (companyName) {
      metadata.companyName = companyName;
      try {
        const businessContext = await businessContextService.getContextForCompany(companyName);
        // Explicitly set businessContext: will be null if not found, or the context object if found
        metadata.businessContext = businessContext ?? null;
      } catch (error) {
        // On error, explicitly set to null
        metadata.businessContext = null;
        console.warn("[Context Loader] Failed to load business context:", error);
      }
    }
  }

  // Load Slack thread history if threadTs is provided
  if (input.threadTs && input.channelId) {
    try {
      const botUserId = await slackMessaging.getBotUserId();
      const threadMessages = await slackMessaging.getThread(
        input.channelId,
        input.threadTs,
        botUserId
      );
      if (threadMessages.length > 0) {
        metadata.threadHistory = threadMessages;
      }
    } catch (error) {
      console.warn("[Context Loader] Failed to load thread history:", error);
      // Continue without thread history
    }
  }

  if (searchFacade.isAzureSearchConfigured()) {
    const userTranscript = input.messages
      .filter((msg) => msg.role === "user")
      .map((msg) => normalizeContent(msg.content))
      .join("\n")
      .slice(0, 500);

    if (userTranscript.length > 0) {
      const similarCases = await searchFacade.searchSimilarCases(userTranscript, {
        clientId: metadata.companyName as string | undefined,
        topK: 3,
      });

      if (similarCases.length > 0) {
        metadata.similarCases = similarCases;
      }
    }
  }

  if (getConfigValue("discoveryContextPackEnabled")) {
    try {
      const discoveryPack = await generateDiscoveryContextPack({
        channelId: input.channelId,
        threadTs: input.threadTs,
        caseNumbers,
        companyName: typeof metadata.companyName === "string" ? metadata.companyName : undefined,
        messages: input.messages,
        businessContext: (metadata.businessContext ?? null) as BusinessEntityContext | null,
        caseContext: metadata.caseContext as CaseContext | undefined,
        similarCases: metadata.similarCases as SimilarCase[] | undefined,
        threadHistory: metadata.threadHistory as CoreMessage[] | undefined,
      });
      metadata.discovery = discoveryPack;
    } catch (error) {
      console.warn("[Context Loader] Failed to generate discovery context pack:", error);
    }
  }

  let enrichedMessages = input.messages;

  if (getConfigValue("autoCmdbLookupEnabled")) {
    const cmdbPrefetch = await maybePrefetchCmdb(input.messages, {
      channelId: input.channelId,
      companyName: metadata.companyName as string | undefined,
    });

    if (cmdbPrefetch) {
      enrichedMessages = [...enrichedMessages, cmdbPrefetch.message];
      metadata.cmdbPrefetch = cmdbPrefetch.metadata;
    }
  }

  return {
    messages: enrichedMessages,
    metadata,
  };
}

function extractCaseNumbersFromMessages(
  contextManager: ReturnType<typeof getContextManager>,
  messages: CoreMessage[],
): string[] {
  const combined = messages
    .map((msg) => normalizeContent(msg.content))
    .join("\n");
  return contextManager.extractCaseNumbers(combined);
}

function normalizeContent(content: CoreMessage["content"]): string {
  // CoreMessage content can be string | undefined based on ChatMessage type
  // String() handles undefined gracefully, converting to empty string
  return String(content);
}

function resolveCompanyName(metadata: Record<string, unknown>): string | undefined {
  const context = metadata.caseContext as { channelName?: string } | undefined;
  if (context?.channelName) {
    return context.channelName;
  }
  const businessContext = metadata.businessContext as { entityName?: string } | undefined;
  return businessContext?.entityName;
}

/**
 * Detect company name from message text by searching for known company names/aliases
 * in the business context repository
 */
async function detectCompanyFromMessageText(messageText: string): Promise<string | undefined> {
  if (!messageText || messageText.trim().length === 0) {
    return undefined;
  }

  try {
    const businessContextRepository = await import("../db/repositories/business-context-repository");
    const repo = businessContextRepository.getBusinessContextRepository();

    // Search for company mentions in message text
    const allContexts = await repo.getAllActive();
    for (const ctx of allContexts) {
      const namesToCheck = [ctx.entityName, ...(ctx.aliases || [])];
      for (const name of namesToCheck) {
        if (messageText.toLowerCase().includes(name.toLowerCase())) {
          console.log(`📋 [Context Loader] Detected company "${ctx.entityName}" from message text (matched: "${name}")`);
          return ctx.entityName;
        }
      }
    }
  } catch (error) {
    console.warn("[Context Loader] Failed to search message text for company names:", error);
  }

  return undefined;
}
