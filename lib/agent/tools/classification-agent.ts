import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "./shared";
import { runClassificationAgent } from "../classification";
import type { DiscoveryContextPack } from "../discovery/context-pack";

const classificationInputSchema = z.object({
  caseNumber: z
    .string()
    .describe("ServiceNow case number (e.g., SCS0001234)"),
  sysId: z
    .string()
    .optional()
    .describe("ServiceNow sys_id. Provide when available for better auditing."),
  shortDescription: z.string().optional().describe("Short description override."),
  description: z.string().optional().describe("Full description or latest updates."),
  priority: z.string().optional(),
  urgency: z.string().optional(),
  currentCategory: z.string().optional(),
  companyName: z.string().optional(),
  companySysId: z.string().optional(),
});

type ClassificationInput = z.infer<typeof classificationInputSchema>;
export type { ClassificationInput as ClassificationAgentInput };

export function createClassificationAgentTool(params: AgentToolFactoryParams) {
  const discoveryPackFromContext = params.contextMetadata?.discovery as DiscoveryContextPack | undefined;

  return createTool({
    name: "run_classification_agent",
    description:
      "Runs the deterministic classification sub-agent using the latest discovery context. Use when you need structured category/summary/next-step output for a specific ServiceNow case without writing back to ServiceNow.",
    inputSchema: classificationInputSchema,
    execute: async (input: ClassificationInput) => {
      if (!input.caseNumber) {
        return { error: "caseNumber is required." };
      }

      const discoveryPack = discoveryPackFromContext ?? buildFallbackPack(input);

      const result = await runClassificationAgent({
        caseNumber: input.caseNumber,
        sysId: input.sysId ?? `temp-${input.caseNumber}`,
        shortDescription: input.shortDescription ?? "Classification request",
        description: input.description,
        priority: input.priority,
        urgency: input.urgency,
        currentCategory: input.currentCategory,
        companyName: input.companyName,
        companySysId: input.companySysId,
        discoveryPack,
      });

      const classification = {
        category: result.category,
        subcategory: result.subcategory,
        confidence: result.confidence_score,
        quick_summary: result.quick_summary,
        immediate_next_steps: result.immediate_next_steps,
        technical_entities: result.technical_entities,
        business_intelligence: result.business_intelligence,
      };

      return {
        success: true,
        workflow: result.workflowId,
        processing_time_ms: result.processingTimeMs,
        classification,
        discovered_entities: result.discoveredEntities,
        business_context_confidence: result.businessContextConfidence,
      };
    },
  });
}

function buildFallbackPack(input: ClassificationInput): DiscoveryContextPack {
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: "1.0.0",
    generatedAt: timestamp,
    metadata: {
      caseNumbers: [input.caseNumber],
      companyName: input.companyName,
    },
    caseContext: {
      caseNumber: input.caseNumber,
      detectedAt: timestamp,
      lastUpdated: timestamp,
      messageCount: 0,
    },
    policyAlerts: [],
  };
}
