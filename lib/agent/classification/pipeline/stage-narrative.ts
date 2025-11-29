import { AnthropicChatService } from "../../../services/anthropic-chat";
import type { StageContext } from "./context";
import { buildSharedContext } from "./context";
import { parseJsonFromText } from "./json";
import { NarrativeStageSchema, type NarrativeStageResult, type StageExecutionResult, type CategorizationStageResult } from "./types";

export async function runNarrativeStage(
  context: StageContext,
  categorization: CategorizationStageResult
): Promise<StageExecutionResult<NarrativeStageResult>> {
  const chatService = AnthropicChatService.getInstance();
  const sharedContext = buildSharedContext(context);

  const categorizationSummary = JSON.stringify(categorization, null, 2);

  const systemPrompt =
    "You are a senior engineer explaining an incident to a junior colleague. Provide a concise summary and prioritized next steps.";

  const instructions = `
Use the context and prior categorization output to craft:
{
  "quick_summary": string,
  "immediate_next_steps": [string, string, ...],
  "tone": "confident" | "cautious" | "escalate"
}

Summary should be 2-3 sentences: what is happening, likely root cause, and why it matters. Immediate next steps must be 2-4 concrete actions with commands, paths, or data to gather.
Draw from case context, similar cases, and service offerings. Keep steps actionable and ordered.
`;

  const response = await chatService.send({
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `${sharedContext}\n\nPREVIOUS CATEGORIZATION\n${categorizationSummary}\n\n${instructions}`,
      },
    ],
    maxTokens: 700,
    temperature: 0.2,
  });

  const parsed = parseJsonFromText(response.outputText);
  const data = NarrativeStageSchema.parse(parsed);

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
