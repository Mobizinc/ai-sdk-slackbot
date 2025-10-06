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
  };
}

export interface GenericMessageEvent extends SlackBaseEvent {
  type: "message";
  channel: string;
  channel_type?: string;
  thread_ts?: string;
  ts: string;
  text?: string;
}

export type SlackEvent =
  | AppMentionEvent
  | AssistantThreadStartedEvent
  | GenericMessageEvent;
