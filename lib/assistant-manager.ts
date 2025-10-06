import {
  assistantThreadMessage,
  handleNewAssistantMessage,
} from "./handle-messages";
import type {
  AssistantThreadContextChangedEvent,
  AssistantThreadStartedEvent,
  GenericMessageEvent,
} from "./slack-event-types";

export interface ThreadContext {
  threadTs: string;
  channelId: string;
  context?: Record<string, unknown> | null;
  previousContext?: Record<string, unknown> | null;
}

class AssistantManager {
  private contexts = new Map<string, ThreadContext>();

  private storeContext(context: ThreadContext) {
    this.contexts.set(context.threadTs, context);
  }

  public getContext(threadTs: string | undefined): ThreadContext | undefined {
    if (!threadTs) return undefined;
    return this.contexts.get(threadTs);
  }

  public async handleThreadStarted(event: AssistantThreadStartedEvent) {
    const { channel_id, thread_ts } = event.assistant_thread;
    this.storeContext({
      channelId: channel_id,
      threadTs: thread_ts,
      context: event.assistant_thread?.context ?? null,
      previousContext: null,
    });

    await assistantThreadMessage(event);
  }

  public handleThreadContextChanged(
    event: AssistantThreadContextChangedEvent,
  ) {
    const { channel_id, thread_ts } = event.assistant_thread;
    const existing = this.contexts.get(thread_ts);

    this.storeContext({
      channelId: channel_id,
      threadTs: thread_ts,
      context: event.context ?? existing?.context ?? null,
      previousContext: event.previous_context ?? existing?.previousContext ?? null,
    });
  }

  public async handleUserMessage(
    event: GenericMessageEvent,
    botUserId: string,
  ) {
    const threadContext = this.getContext(event.thread_ts);
    await handleNewAssistantMessage(event, botUserId, { threadContext });
  }
}

export const assistantManager = new AssistantManager();
