import { createAgentTools, type AgentToolFactoryParams } from "./tools/factory";

export interface ToolRegistry {
  createTools(params: AgentToolFactoryParams): Record<string, unknown>;
}

class DefaultToolRegistry implements ToolRegistry {
  createTools(params: AgentToolFactoryParams): Record<string, unknown> {
    return createAgentTools(params);
  }
}

let registry: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!registry) {
    registry = new DefaultToolRegistry();
  }
  return registry;
}

export function __setToolRegistry(custom: ToolRegistry | null): void {
  registry = custom;
}

export type { AgentToolFactoryParams };
