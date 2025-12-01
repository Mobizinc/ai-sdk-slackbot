import { AnthropicChatService } from "../../../services/anthropic-chat";
import type { StageContext } from "./context";
import { buildSharedContext } from "./context";
import { parseJsonWithSchema } from "./json";
import { CategorizationStageSchema, type CategorizationStageResult, type StageExecutionResult } from "./types";

export async function runCategorizationStage(
  context: StageContext
): Promise<StageExecutionResult<CategorizationStageResult>> {
  const chatService = AnthropicChatService.getInstance();
  const sharedContext = buildSharedContext(context);

  const systemPrompt =
    "You are a ServiceNow triage specialist. Determine the most accurate classification, record type, and urgency based on the case context. " +
    "Always align categories with ServiceNow taxonomy and return well-structured JSON.";

  const instructions = `
Analyze the case context below and respond with JSON containing:
{
  "category": string,
  "subcategory": string | null,
  "incident_category": string | null,
  "incident_subcategory": string | null,
  "confidence_score": number (0-1),
  "reasoning": string,
  "keywords": string[],
  "technical_entities": {
    "ip_addresses": string[],
    "systems": string[],
    "users": string[],
    "software": string[],
    "error_codes": string[]
  },
  "urgency_level": "Low" | "Medium" | "High" | "Critical",
  "record_type_suggestion": {
    "type": "Problem" | "Incident" | "Change" | "Case",
    "is_major_incident": boolean,
    "reasoning": string
  },
  "service_offering": string,
  "application_service": string | null
}

Focus on classification accuracy first. Prefer specific subcategories when possible. Use keywords to capture notable entities or technologies.
`;

  const response = await chatService.send({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `${sharedContext}\n\n${instructions}` },
    ],
    maxTokens: 900,
    temperature: 0,
  });

  const rawData = parseJsonWithSchema(response.outputText, CategorizationStageSchema, "categorization");

  const data = {
    ...rawData,
    keywords: rawData.keywords || [],
    technical_entities: rawData.technical_entities ? {
      ip_addresses: rawData.technical_entities.ip_addresses || [],
      systems: rawData.technical_entities.systems || [],
      users: rawData.technical_entities.users || [],
      software: rawData.technical_entities.software || [],
      error_codes: rawData.technical_entities.error_codes || []
    } : undefined,
    record_type_suggestion: rawData.record_type_suggestion ? {
      ...rawData.record_type_suggestion,
      is_major_incident: rawData.record_type_suggestion.is_major_incident ?? false
    } : undefined
  };

  return {
    data,
    usage: response.usage
      ? {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        }
      : undefined,
  };
}
