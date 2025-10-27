import type { ChatMessage } from "../services/anthropic-chat";

export type UpdateStatusFn = (status: string) => void;

export interface GenerateResponseOptions {
  channelId?: string;
  channelName?: string;
  threadTs?: string;
}

export interface LegacyExecutorDeps {
  legacyExecutor?: (
    messages: ChatMessage[],
    updateStatus?: UpdateStatusFn,
    options?: GenerateResponseOptions,
  ) => Promise<string>;
}

// Re-export ChatMessage as the canonical message type
export type { ChatMessage };

/**
 * @deprecated Use ChatMessage instead. Will be removed in v2.0.0.
 */
export type CoreMessage = ChatMessage;
