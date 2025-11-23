// Intent detection for handle-app-mention
// Distinguishes between simple queries (direct response) and complex analysis (supervisor review)

export type QueryIntent =
  | 'status_query'        // "what's the status of SCS12345?"
  | 'latest_updates'      // "show me latest updates on INC12345"
  | 'assignment_info'     // "who is assigned to PRB12345?"
  | 'aggregate_query'     // "how many cases are stale?", "count of incidents"
  | 'info_request'        // General informational queries
  | 'complex_analysis'    // triage, diagnose, analyze, recommend
  | 'unknown';            // Ambiguous - may need LLM clarification

export interface IntentDetectionResult {
  intent: QueryIntent;
  confidence: number; // 0-1, how confident we are in the classification
  keywords: string[]; // Keywords that triggered this intent
}

const INTENT_PATTERNS = {
  status_query: [
    /\b(status|state|current|what'?s.*going on|how.*going|progress)\b/i,
    /\b(open|closed|resolved|pending|in progress|work in progress)\b/i,
  ],
  latest_updates: [
    /\b(latest|recent|updates?|changes?|activity|history|timeline)\b/i,
    /\b(what happened|what changed|what's new)\b/i,
  ],
  assignment_info: [
    /\b(assigned to|who'?s.*working|owner|assignee|assigned|responsible)\b/i,
    /\b(who.*handling|who.*working on)\b/i,
  ],
  aggregate_query: [
    /\b(how many|count|number of|total|how much)\b.*\b(incidents?|cases?|tickets?|records?)\b/i,
    /\b(how many|count|number of|total)\b.*\b(stale|old|not.*updated|haven't.*updated)\b/i,
    /\b(how many|count|number of|total)\b.*\b(days?|weeks?|months?)\b/i,
  ],
  complex_analysis: [
    /\b(triage|diagnose|analyze|investigate|recommend|assess|evaluate)\b/i,
    /\b(what should|how to fix|solution|resolution|next steps)\b/i,
    /\b(problem.*with|issue.*with|trouble.*with)\b/i,
  ],
} as const;

const COMPLEX_KEYWORDS = [
  'triage', 'diagnose', 'analyze', 'investigate', 'recommend', 'assess',
  'evaluate', 'fix', 'resolve', 'solution', 'troubleshoot', 'debug'
];

export function detectIntent(message: string): IntentDetectionResult {
  const lowerMessage = message.toLowerCase();
  const words = lowerMessage.split(/\s+/);

  // Check for explicit complex analysis keywords
  const complexMatches = COMPLEX_KEYWORDS.filter(keyword =>
    words.some(word => word.includes(keyword) || keyword.includes(word))
  );

  if (complexMatches.length > 0) {
    return {
      intent: 'complex_analysis',
      confidence: 0.9,
      keywords: complexMatches
    };
  }

  // Pattern-based detection
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    const matches = patterns.filter(pattern => pattern.test(lowerMessage));
    if (matches.length > 0) {
      return {
        intent: intent as QueryIntent,
        confidence: Math.min(0.8, 0.4 + (matches.length * 0.2)), // 0.6-0.8 confidence
        keywords: matches.map(m => m.source)
      };
    }
  }

  // Default to info_request for basic questions
  if (lowerMessage.includes('?') || lowerMessage.startsWith('what') ||
      lowerMessage.startsWith('who') || lowerMessage.startsWith('when') ||
      lowerMessage.startsWith('where')) {
    return {
      intent: 'info_request',
      confidence: 0.6,
      keywords: ['question']
    };
  }

  // Unknown/ambiguous - may need LLM clarification
  return {
    intent: 'unknown',
    confidence: 0.3,
    keywords: []
  };
}

// Hybrid detection with LLM fallback for ambiguous cases
export async function detectIntentHybrid(message: string): Promise<IntentDetectionResult> {
  const ruleBased = detectIntent(message);

  // High confidence results don't need LLM
  if (ruleBased.confidence >= 0.7) {
    return ruleBased;
  }

  // For ambiguous cases, we could add LLM-based disambiguation here
  // For now, default to info_request for safety
  if (ruleBased.intent === 'unknown') {
    return {
      intent: 'info_request',
      confidence: 0.5,
      keywords: ['fallback']
    };
  }

  return ruleBased;
}