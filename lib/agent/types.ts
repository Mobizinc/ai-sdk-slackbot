import type { ChatMessage } from "../services/anthropic-chat";

export type UpdateStatusFn = (status: string) => void;

export interface GenerateResponseOptions {
  channelId?: string;
  channelName?: string;
  threadTs?: string;
  model?: string;
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
 * @deprecated Use ChatMessage instead. CoreMessage will be removed in v2.0.0.
 * Migration: Replace all imports of CoreMessage with ChatMessage from ../services/anthropic-chat
 */
export type CoreMessage = ChatMessage;
