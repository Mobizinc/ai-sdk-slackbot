import { z } from "zod";
import { TechnicalEntitiesSchema, RecordTypeSuggestionSchema, BusinessIntelligenceSchema } from "../../../schemas/servicenow-webhook";

export const CategorizationStageSchema = z.object({
  category: z.string().min(1),
  subcategory: z.string().optional(),
  incident_category: z.string().optional(),
  incident_subcategory: z.string().optional(),
  confidence_score: z.number().min(0).max(1).optional(),
  reasoning: z.string().min(4),
  keywords: z.array(z.string()).default([]),
  technical_entities: TechnicalEntitiesSchema.optional(),
  urgency_level: z.string().optional(),
  record_type_suggestion: RecordTypeSuggestionSchema.optional(),
  service_offering: z.string().optional(),
  application_service: z.string().optional(),
});

export type CategorizationStageResult = z.infer<typeof CategorizationStageSchema>;

export const NarrativeStageSchema = z.object({
  quick_summary: z.string().min(8),
  immediate_next_steps: z.array(z.string().min(4)).min(1).max(5),
  tone: z.enum(["confident", "cautious", "escalate"]).optional(),
});

export type NarrativeStageResult = z.infer<typeof NarrativeStageSchema>;

export const BusinessIntelStageSchema = z.object({
  business_intelligence: BusinessIntelligenceSchema,
});

export type BusinessIntelStageResult = z.infer<typeof BusinessIntelStageSchema>;

export interface StageExecutionResult<T> {
  data: T;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}
