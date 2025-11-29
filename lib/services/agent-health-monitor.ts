import { listSpecialistAgents, SpecialistAgentDefinition } from "../agent/specialist-registry";

type AgentHealthStatus = 'healthy' | 'degraded' | 'down';

interface AgentHealth {
  id: string;
  status: AgentHealthStatus;
  lastChecked: Date;
  circuitBreaker: {
    state: 'closed' | 'open' | 'half-open';
    failures: number;
    lastFailureTime: number;
    nextAttemptTime: number;
  };
}

const agentHealthCache = new Map<string, AgentHealth>();
const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const CIRCUIT_BREAKER_RESET_TIMEOUT = 5 * 60 * 1000; // 5 minutes

async function checkAgentHealth(agent: SpecialistAgentDefinition): Promise<AgentHealthStatus> {
  if (!agent.healthCheck) {
    return 'healthy';
  }

  try {
    const isHealthy = await agent.healthCheck();
    return isHealthy ? 'healthy' : 'down';
  } catch (error) {
    console.error(`[AgentHealthMonitor] Health check failed for agent ${agent.id}:`, error);
    return 'degraded';
  }
}

export async function checkAllAgents(): Promise<void> {
  const agents = listSpecialistAgents();
  const healthChecks = agents.map(async (agent) => {
    const status = await checkAgentHealth(agent);
    const existingHealth = agentHealthCache.get(agent.id);
    agentHealthCache.set(agent.id, {
      id: agent.id,
      status,
      lastChecked: new Date(),
      circuitBreaker: existingHealth?.circuitBreaker || {
        state: 'closed',
        failures: 0,
        lastFailureTime: 0,
        nextAttemptTime: 0
      },
    });
  });

  await Promise.all(healthChecks);
  console.log('[AgentHealthMonitor] Finished checking health of all agents.');
}

export function getAgentHealth(agentId: string): AgentHealth | undefined {
  const health = agentHealthCache.get(agentId);
  if (!health) return undefined;

  // Check if cache is stale
  if (Date.now() - health.lastChecked.getTime() > CACHE_TTL_MS) {
    agentHealthCache.delete(agentId);
    return undefined;
  }

  return health;
}

export function recordAgentFailure(agentId: string): void {
  const health = agentHealthCache.get(agentId);
  if (!health) return;

  health.circuitBreaker.failures++;
  health.circuitBreaker.lastFailureTime = Date.now();

  if (health.circuitBreaker.failures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
    health.circuitBreaker.state = 'open';
    health.circuitBreaker.nextAttemptTime = Date.now() + CIRCUIT_BREAKER_RESET_TIMEOUT;
    console.warn(`[AgentHealthMonitor] Circuit breaker opened for agent ${agentId} after ${health.circuitBreaker.failures} failures`);
  }

  agentHealthCache.set(agentId, health);
}

export function recordAgentSuccess(agentId: string): void {
  const health = agentHealthCache.get(agentId);
  if (!health) return;

  health.circuitBreaker.failures = 0;
  health.circuitBreaker.state = 'closed';
  health.circuitBreaker.nextAttemptTime = 0;

  agentHealthCache.set(agentId, health);
}

export function isAgentAvailable(agentId: string): boolean {
  const health = getAgentHealth(agentId);
  if (!health) return true; // Assume healthy if not checked

  // Check circuit breaker
  if (health.circuitBreaker.state === 'open') {
    if (Date.now() < health.circuitBreaker.nextAttemptTime) {
      return false; // Still in timeout
    }
    // Try half-open
    health.circuitBreaker.state = 'half-open';
    agentHealthCache.set(agentId, health);
  }

  return health.status === 'healthy' || health.circuitBreaker.state === 'half-open';
}

export function getAvailableAgents(agentIds: string[]): string[] {
  return agentIds.filter(agentId => isAgentAvailable(agentId));
}

export function startHealthChecks(): void {
  console.log('[AgentHealthMonitor] Starting periodic health checks...');
  checkAllAgents(); // Initial check
  setInterval(checkAllAgents, HEALTH_CHECK_INTERVAL_MS);
}
