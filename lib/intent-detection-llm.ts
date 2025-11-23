// Haiku-powered intent detection for complex queries
import { AnthropicChatService } from "./services/anthropic-chat";
import { detectIntent, IntentDetectionResult, QueryIntent } from "./intent-detection";

export type { QueryIntent };

export interface LLMIntentRequest {
  message: string;
  context?: {
    conversationHistory?: string[];
    userRole?: string;
    recentIntents?: QueryIntent[];
    lastCaseNumber?: string;
  };
}

export interface LLMIntentResponse {
  intent: QueryIntent;
  confidence: number;
  reasoning: string;
  extractedEntities?: {
    caseNumbers?: string[];
    timeframes?: string[];
    categories?: string[];
    daysThreshold?: number;
    recordTypes?: string[];
  };
}

const INTENT_DETECTION_PROMPT = `You are an expert at classifying ServiceNow support bot queries. Analyze the user's message and classify their intent.

Available intents:
- status_query: Asking about current state/status of specific case(s) or tickets
- latest_updates: Want to see recent changes, updates, or activity for specific case(s)
- assignment_info: Asking who is assigned to/owns/working on specific case(s)
- aggregate_query: Statistics, counts, or reports across multiple cases (how many, totals, summaries)
- complex_analysis: Triage, diagnose, analyze, investigate, or recommend solutions for specific case(s)
- info_request: General questions about processes, capabilities, or non-specific case information

Message: "{message}"

{context_section}

Return a JSON object with:
- intent: One of the intent types above
- confidence: Number between 0-1 indicating how confident you are
- reasoning: Brief explanation of your classification
- extractedEntities: Object with any extracted information (case numbers, timeframes, categories, etc.)

Example response:
{
  "intent": "aggregate_query",
  "confidence": 0.9,
  "reasoning": "User is asking for counts of stale records across multiple types",
  "extractedEntities": {
    "recordTypes": ["incidents", "cases"],
    "daysThreshold": 3
  }
}`;

const INTENT_CACHE = new Map<string, { result: LLMIntentResponse; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function createCacheKey(message: string, context?: LLMIntentRequest['context']): string {
  const contextStr = context ? JSON.stringify(context) : '';
  return `${message}:${contextStr}`.slice(0, 200); // Limit key length
}

function getCachedResult(cacheKey: string): LLMIntentResponse | null {
  const cached = INTENT_CACHE.get(cacheKey);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > CACHE_TTL) {
    INTENT_CACHE.delete(cacheKey);
    return null;
  }

  return cached.result;
}

function setCachedResult(cacheKey: string, result: LLMIntentResponse): void {
  INTENT_CACHE.set(cacheKey, { result, timestamp: Date.now() });
}

export async function detectIntentWithLLM(request: LLMIntentRequest): Promise<LLMIntentResponse> {
  const { message, context } = request;

  // Check cache first
  const cacheKey = createCacheKey(message, context);
  const cached = getCachedResult(cacheKey);
  if (cached) {
    console.log('[Intent LLM] Using cached result');
    return cached;
  }

  try {
    const chatService = AnthropicChatService.getInstance();

    // Build context section for prompt
    let contextSection = '';
    if (context) {
      contextSection = '\nContext:\n';
      if (context.conversationHistory?.length) {
        contextSection += `Recent conversation: ${context.conversationHistory.slice(-2).join(' → ')}\n`;
      }
      if (context.recentIntents?.length) {
        contextSection += `Recent intents: ${context.recentIntents.slice(-3).join(', ')}\n`;
      }
      if (context.lastCaseNumber) {
        contextSection += `Last discussed case: ${context.lastCaseNumber}\n`;
      }
    }

    const prompt = INTENT_DETECTION_PROMPT
      .replace('{message}', message)
      .replace('{context_section}', contextSection);

    const response = await chatService.send({
      messages: [{ role: 'user', content: prompt }],
      model: 'claude-haiku-4',
      maxTokens: 500,
      temperature: 0.1, // Low temperature for consistent classification
    });

    const parsed = JSON.parse(response.outputText || '{}') as LLMIntentResponse;

    // Validate response
    if (!parsed.intent || !parsed.reasoning || typeof parsed.confidence !== 'number') {
      throw new Error('Invalid intent detection response structure');
    }

    // Cache the result
    setCachedResult(cacheKey, parsed);

    console.log(`[Intent LLM] Classified "${message.slice(0, 50)}..." as ${parsed.intent} (${parsed.confidence})`);
    return parsed;

  } catch (error) {
    console.error('[Intent LLM] Detection failed:', error);

    // Fallback to rule-based detection
    const ruleResult = detectIntent(message);
    return {
      intent: ruleResult.intent,
      confidence: Math.min(ruleResult.confidence, 0.5), // Reduce confidence for fallback
      reasoning: `LLM detection failed, using rule-based fallback: ${ruleResult.keywords.join(', ')}`,
      extractedEntities: {}
    };
  }
}

// Hybrid detection: Rules first, LLM for complex/ambiguous cases
export async function detectIntentHybrid(request: LLMIntentRequest): Promise<IntentDetectionResult> {
  const { message, context } = request;

  // First try rule-based detection (fast)
  const ruleResult = detectIntent(message);

  // If high confidence and simple intent, use immediately
  if (ruleResult.confidence >= 0.8) {
    return ruleResult;
  }

  // For complex queries or low confidence, use LLM
  const llmResult = await detectIntentWithLLM(request);

  // Use LLM result if confidence is higher
  if (llmResult.confidence > ruleResult.confidence) {
    return {
      intent: llmResult.intent,
      confidence: llmResult.confidence,
      keywords: llmResult.extractedEntities ? Object.keys(llmResult.extractedEntities) : []
    };
  }

  // Otherwise stick with rule-based
  return ruleResult;
}