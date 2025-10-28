import { generateResponse as runAgent } from "./agent";
import type { ChatMessage, UpdateStatusFn, GenerateResponseOptions } from "./agent/types";

export type { UpdateStatusFn, GenerateResponseOptions, CoreMessage } from "./agent/types";

export async function generateResponse(
  messages: ChatMessage[],
  updateStatus?: UpdateStatusFn,
  options?: GenerateResponseOptions,
): Promise<string> {
  return runAgent(messages, updateStatus, options);
}
