import { AnthropicChatService } from "../../../services/anthropic-chat";
import type { StageContext } from "./context";
import { buildSharedContext } from "./context";
import { parseJsonFromText } from "./json";
import {
  BusinessIntelStageSchema,
  type BusinessIntelStageResult,
  type CategorizationStageResult,
  type NarrativeStageResult,
  type StageExecutionResult,
} from "./types";

export async function runBusinessIntelStage(
  context: StageContext,
  categorization: CategorizationStageResult,
  narrative: NarrativeStageResult
): Promise<StageExecutionResult<BusinessIntelStageResult>> {
  const chatService = AnthropicChatService.getInstance();
  const sharedContext = buildSharedContext(context);

  const systemPrompt =
    "You are a policy/risk analyst ensuring ServiceNow responses respect client contracts, service hours, and escalation triggers.";

  const instructions = `
Use the case context plus the prior categorization + narrative outputs to determine business intelligence flags.
Return JSON with a single field "business_intelligence" matching the ServiceNow schema (project_scope_detected, executive_visibility, compliance_impact, financial_impact, systemic_issue, outside_service_hours, service_hours_note, etc.).

Only flag items when evidence exists. Provide short reasons referencing the context.
`;

  const response = await chatService.send({
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          `${sharedContext}\n\nPREVIOUS OUTPUTS\nCategorization: ${JSON.stringify(categorization)}\nNarrative: ${JSON.stringify(narrative)}\n\n${instructions}`,
      },
    ],
    maxTokens: 700,
    temperature: 0,
  });

  const parsed = parseJsonFromText(response.outputText);
  const data = BusinessIntelStageSchema.parse(parsed);

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
