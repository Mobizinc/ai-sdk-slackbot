/**
 * Knowledge Base Article Generator
 * Generates structured KB articles from case conversations with AI assistance
 */

import { z } from "zod";
import type { CaseContext } from "../context-manager";
import { createAzureSearchService } from "./azure-search";
import { getBusinessContextService } from "./business-context-service";
import { config } from "../config";
import { AnthropicChatService } from "./anthropic-chat";

export interface KBArticle {
  title: string;
  problem: string;
  environment: string;
  solution: string;
  rootCause?: string;
  relatedCases: string[];
  tags: string[];
  conversationSummary: string;
}

export interface KBGenerationResult {
  article: KBArticle;
  similarExistingKBs: Array<{
    case_number: string;
    content: string;
    score: number;
  }>;
  isDuplicate: boolean;
  confidence: number;
}

type KBArticlePayload = {
  title: string;
  problem: string;
  environment: string;
  solution: string;
  rootCause?: string;
  relatedCases: string[];
  tags: string[];
  conversationSummary?: string;
};

const KBArticleSchema = z.object({
  title: z.string().min(10).max(120),
  problem: z.string().min(10),
  environment: z.string().min(5),
  solution: z.string().min(10),
  rootCause: z.string().min(5).optional(),
  relatedCases: z.array(z.string()).max(10),
  tags: z.array(z.string().min(2)).max(10),
  conversationSummary: z.string().optional(),
}) as z.ZodTypeAny;

const KB_ARTICLE_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 10, maxLength: 120 },
    problem: { type: "string", minLength: 10 },
    environment: { type: "string", minLength: 5 },
    solution: { type: "string", minLength: 10 },
    rootCause: { type: "string", minLength: 5 },
    relatedCases: {
      type: "array",
      items: { type: "string" },
      maxItems: 10,
    },
    tags: {
      type: "array",
      items: { type: "string", minLength: 2 },
      maxItems: 10,
    },
    conversationSummary: { type: "string" },
  },
  required: ["title", "problem", "environment", "solution", "relatedCases", "tags"],
  additionalProperties: false,
};

export class KBGenerator {
  private azureSearch = createAzureSearchService();

  /**
   * Generate KB article from case context
   */
  async generateArticle(
    context: CaseContext,
    caseDetails?: any
  ): Promise<KBGenerationResult> {
    // Step 1: Search for similar existing KBs
    const conversationText = context.messages.map((m) => m.text).join("\n");
    const similarKBs = await this.findSimilarKBs(conversationText);

    // Step 2: Check if this is likely a duplicate
    const isDuplicate = similarKBs.length > 0 && similarKBs[0].score > 0.85;

    if (isDuplicate) {
      return {
        article: null as any, // Won't be used
        similarExistingKBs: similarKBs,
        isDuplicate: true,
        confidence: 0,
      };
    }

    // Step 3: Generate KB article using LLM
    const article = await this.generateWithLLM(
      context,
      caseDetails,
      similarKBs
    );

    // Step 4: Calculate confidence score
    const confidence = this.calculateConfidence(context, article);

    return {
      article,
      similarExistingKBs: similarKBs,
      isDuplicate: false,
      confidence,
    };
  }

  /**
   * Search for similar KB articles in Azure Search
   */
  private async findSimilarKBs(
    query: string
  ): Promise<Array<{ case_number: string; content: string; score: number }>> {
    if (!this.azureSearch) {
      return [];
    }

    try {
      // Search with KB-specific filters if your index has content_type field
      const results = await this.azureSearch.searchKnowledgeBase(query, {
        topK: config.kbSimilarCasesTopK,
      });

      return results.map((r) => ({
        case_number: r.case_number,
        content: r.content,
        score: r.score,
      }));
    } catch (error) {
      console.error("Error searching similar KBs:", error);
      return [];
    }
  }

  /**
   * Generate KB article using LLM
   */
  private async generateWithLLM(
    context: CaseContext,
    caseDetails: any,
    similarKBs: any[]
  ): Promise<KBArticle> {
    const conversationSummary = context.messages
      .map((m) => `${m.user}: ${m.text}`)
      .join("\n");

    const similarContext =
      similarKBs.length > 0
        ? `\n\nSimilar resolved cases for reference:\n${similarKBs
            .map((kb) => `- ${kb.case_number}: ${kb.content.substring(0, 200)}...`)
            .join("\n")}`
        : "";

    const basePrompt = `You are a technical documentation expert creating a knowledge base article from a support case resolution.

Case Number: ${context.caseNumber}
${caseDetails ? `Case Details: ${JSON.stringify(caseDetails, null, 2)}` : ""}

Conversation that led to resolution:
${conversationSummary}
${similarContext}

When you have finished analysing the conversation, call the \`draft_kb_article\` tool exactly once with:
- title: clear descriptive title (50-80 characters)
- problem: precise summary of symptoms/impact
- environment: relevant systems, versions, configs
- solution: step-by-step resolution in markdown (numbered steps where possible)
- rootCause: why it happened if identified (omit otherwise)
- relatedCases: case numbers referenced in the conversation
- tags: relevant keywords (technology, component, issue type)
- conversationSummary: concise recap of the resolution dialogue

Ensure accuracy, avoid assumptions, and keep the solution actionable.`;

    const businessContextService = getBusinessContextService();
    const enhancedPrompt = await businessContextService.enhancePromptWithContext(
      basePrompt,
      context.channelName,
      (context as any).channelTopic,
      (context as any).channelPurpose
    );

    return await this.generateWithAnthropic(enhancedPrompt, conversationSummary);
  }

  private async generateWithAnthropic(
    enhancedPrompt: string,
    conversationSummary: string,
  ): Promise<KBArticle> {
    const chatService = AnthropicChatService.getInstance();

    const response = await chatService.send({
      messages: [
        {
          role: "system",
          content:
            "You are a meticulous knowledge base author. You MUST call the `draft_kb_article` tool exactly once with your final structured article.",
        },
        {
          role: "user",
          content: enhancedPrompt,
        },
      ],
      tools: [
        {
          name: "draft_kb_article",
          description:
            "Return the fully structured knowledge base article as your final output. Call this exactly once.",
          inputSchema: KB_ARTICLE_JSON_SCHEMA,
        },
      ],
      maxSteps: 3,
    });

    if (response.toolCalls.length > 0) {
      const firstCall = response.toolCalls[0];
      const parsed = KBArticleSchema.parse(firstCall.input) as KBArticlePayload;
      return {
        ...parsed,
        conversationSummary: parsed.conversationSummary ?? conversationSummary,
      };
    }

    if (response.outputText) {
      try {
        const parsed = KBArticleSchema.parse(JSON.parse(response.outputText)) as KBArticlePayload;
        return {
          ...parsed,
          conversationSummary: parsed.conversationSummary ?? conversationSummary,
        };
      } catch (error) {
        console.warn("Failed to parse Anthropic text output as KB article:", error);
      }
    }

    throw new Error("Anthropic response did not include KB article tool call or parsable output.");
  }


  /**
   * Fallback KB article if LLM fails
   */
  private createFallbackArticle(
    context: CaseContext,
    caseDetails: any
  ): KBArticle {
    const conversationSummary = context.messages
      .map((m) => `${m.user}: ${m.text}`)
      .join("\n");

    return {
      title: `Resolution for ${context.caseNumber}`,
      problem: caseDetails?.short_description || "Issue details from conversation",
      environment: "See conversation details",
      solution: conversationSummary,
      rootCause: "See conversation for analysis",
      relatedCases: [context.caseNumber],
      tags: ["needs-review"],
      conversationSummary,
    };
  }

  /**
   * Calculate confidence score for generated KB
   */
  private calculateConfidence(
    context: CaseContext,
    article: KBArticle
  ): number {
    let score = 0;

    // Factor 1: Conversation length (more = better)
    if (context.messages.length >= 5) score += 30;
    else if (context.messages.length >= 3) score += 20;
    else score += 10;

    // Factor 2: Solution detail
    if (article.solution.length > 200) score += 25;
    else if (article.solution.length > 100) score += 15;
    else score += 5;

    // Factor 3: Has environment details
    if (article.environment && article.environment.length > 20) score += 15;

    // Factor 4: Has root cause
    if (article.rootCause && article.rootCause.length > 20) score += 15;

    // Factor 5: Has meaningful tags
    if (article.tags.length >= 3) score += 15;
    else if (article.tags.length >= 1) score += 10;

    return Math.min(score, 100);
  }

  /**
   * Format KB article for Slack display
   */
  formatForSlack(article: KBArticle): string {
    let formatted = `📚 *Knowledge Base Article Draft*\n\n`;
    formatted += `*Title:* ${article.title}\n\n`;
    formatted += `*Problem:*\n${article.problem}\n\n`;

    if (article.environment) {
      formatted += `*Environment:*\n${article.environment}\n\n`;
    }

    formatted += `*Solution:*\n${article.solution}\n\n`;

    if (article.rootCause) {
      formatted += `*Root Cause:*\n${article.rootCause}\n\n`;
    }

    if (article.relatedCases.length > 0) {
      formatted += `*Related Cases:* ${article.relatedCases.join(", ")}\n\n`;
    }

    if (article.tags.length > 0) {
      formatted += `*Tags:* ${article.tags.join(", ")}\n`;
    }

    return formatted;
  }

  /**
   * Format similar KBs warning for Slack
   */
  formatSimilarKBsWarning(
    similarKBs: Array<{ case_number: string; content: string; score: number }>
  ): string {
    let message = `⚠️ *Similar KB Articles Found*\n\n`;
    message += `This issue may already be documented:\n\n`;

    similarKBs.slice(0, 3).forEach((kb, idx) => {
      const preview = kb.content.substring(0, 150);
      message += `${idx + 1}. *${kb.case_number}* (${(kb.score * 100).toFixed(0)}% match)\n`;
      message += `   ${preview}${kb.content.length > 150 ? "..." : ""}\n\n`;
    });

    message += `_Consider updating an existing article instead of creating a new one._`;

    return message;
  }
}

// Singleton instance
let kbGenerator: KBGenerator | null = null;

export function getKBGenerator(): KBGenerator {
  if (!kbGenerator) {
    kbGenerator = new KBGenerator();
  }
  return kbGenerator;
}
