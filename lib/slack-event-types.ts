export interface SlackBaseEvent {
  type: string;
  subtype?: string;
  bot_id?: string;
  bot_profile?: unknown;
}

export interface AppMentionEvent extends SlackBaseEvent {
  type: "app_mention";
  channel: string;
  thread_ts?: string;
  ts: string;
  text: string;
}

export interface AssistantThreadStartedEvent extends SlackBaseEvent {
  type: "assistant_thread_started";
  assistant_thread: {
    channel_id: string;
    thread_ts: string;
    context?: Record<string, unknown> | null;
  };
}

export interface GenericMessageEvent extends SlackBaseEvent {
  type: "message";
  channel: string;
  channel_type?: string;
  thread_ts?: string;
  ts: string;
  text?: string;
  user?: string;
}

export interface AssistantThreadContextChangedEvent extends SlackBaseEvent {
  type: "assistant_thread_context_changed";
  assistant_thread: {
    channel_id: string;
    thread_ts: string;
  };
  context?: Record<string, unknown> | null;
  previous_context?: Record<string, unknown> | null;
}

export interface ReactionAddedEvent extends SlackBaseEvent {
  type: "reaction_added";
  user: string;
  item: {
    type: string;
    channel: string;
    ts: string;
  };
  reaction: string;
  event_ts: string;
}

export type SlackEvent =
  | AppMentionEvent
  | AssistantThreadStartedEvent
  | AssistantThreadContextChangedEvent
  | GenericMessageEvent
  | ReactionAddedEvent;
