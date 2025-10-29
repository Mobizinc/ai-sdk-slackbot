import { createLegacyAgentTools, type AgentToolFactoryParams } from "./tools/factory";

export interface ToolRegistry {
  createTools(params: AgentToolFactoryParams): Record<string, unknown>;
}

class LegacyToolRegistry implements ToolRegistry {
  createTools(params: AgentToolFactoryParams): Record<string, unknown> {
    return createLegacyAgentTools(params);
  }
}

let registry: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!registry) {
    registry = new LegacyToolRegistry();
  }
  return registry;
}

export function __setToolRegistry(custom: ToolRegistry | null): void {
  registry = custom;
}

export type { AgentToolFactoryParams };
