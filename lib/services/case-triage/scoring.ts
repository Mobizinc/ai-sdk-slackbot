/**
 * Lightweight helpers for cost/confidence style metrics produced during triage.
 */

/**
 * Calculate approximate LLM cost for a classification result.
 * Keeps the heuristic in a single place so future pricing changes are isolated.
 */
export function calculateClassificationCost(classification: any): number {
  const promptTokens = classification.token_usage_input || 0;
  const completionTokens = classification.token_usage_output || 0;

  const promptCostPer1K = 0.003;
  const completionCostPer1K = 0.004;

  const promptCost = (promptTokens / 1000) * promptCostPer1K;
  const completionCost = (completionTokens / 1000) * completionCostPer1K;

  return promptCost + completionCost;
}
