// Smart retry logic with fallback agents
import { isAgentAvailable, recordAgentSuccess, recordAgentFailure } from './agent-health-monitor';

interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  fallbackAgents?: string[];
}

interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  agentUsed: string;
  fallbackUsed: boolean;
}

export async function executeWithFallbacks<T>(
  primaryAgent: string,
  operation: (agentId: string) => Promise<T>,
  options: RetryOptions = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
    fallbackAgents: []
  }
): Promise<RetryResult<T>> {
  const { maxAttempts, baseDelay, maxDelay, backoffFactor, fallbackAgents = [] } = options;
  const allAgents = [primaryAgent, ...fallbackAgents];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    for (const agentId of allAgents) {
      // Check if agent is available (circuit breaker)
      if (!isAgentAvailable(agentId)) {
        console.log(`[SmartRetry] Agent ${agentId} unavailable, skipping`);
        continue;
      }

      try {
        console.log(`[SmartRetry] Attempting operation with agent ${agentId} (attempt ${attempt + 1})`);
        const result = await operation(agentId);

        // Record success for circuit breaker
        recordAgentSuccess(agentId);

        return {
          success: true,
          result,
          attempts: attempt + 1,
          agentUsed: agentId,
          fallbackUsed: agentId !== primaryAgent
        };
      } catch (error) {
        console.warn(`[SmartRetry] Agent ${agentId} failed:`, error);

        // Record failure for circuit breaker
        recordAgentFailure(agentId);

        // If this is the last agent in the list, continue to next attempt
        if (agentId === allAgents[allAgents.length - 1]) {
          break;
        }
      }
    }

    // Wait before next attempt (exponential backoff)
    if (attempt < maxAttempts - 1) {
      const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt), maxDelay);
      console.log(`[SmartRetry] Waiting ${delay}ms before retry`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return {
    success: false,
    error: new Error(`All agents failed after ${maxAttempts} attempts`),
    attempts: maxAttempts,
    agentUsed: primaryAgent,
    fallbackUsed: false
  };
}