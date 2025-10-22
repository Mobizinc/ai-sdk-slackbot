import {
  generateText as baseGenerateText,
} from "ai";
import { traceGenerateText, isLangSmithEnabled } from "./observability/langsmith-tracer";

type BaseGenerateText = typeof baseGenerateText;
type GenerateTextArgs = Parameters<BaseGenerateText>[0];
type GenerateTextReturn = Awaited<ReturnType<BaseGenerateText>>;

export async function generateText(args: GenerateTextArgs): Promise<GenerateTextReturn> {
  if (!isLangSmithEnabled()) {
    return baseGenerateText(args);
  }

  return traceGenerateText(args, () => baseGenerateText(args));
}

export { tool, stepCountIs, type CoreMessage } from "ai";
