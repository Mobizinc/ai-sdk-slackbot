export const StandupActions = {
  OPEN_MODAL: "project_standup_open_modal",
} as const;

export const StandupCallbackIds = {
  MODAL: "project_standup_modal",
} as const;

export const DEFAULT_STANDUP_COLLECTION_MINUTES = 120;
export const DEFAULT_STANDUP_REMINDER_MINUTES = 60;
export const DEFAULT_STANDUP_MAX_REMINDERS = 2;
export const STANDUP_TRIGGER_WINDOW_MINUTES = 30;
export const STANDUP_REMINDER_BUFFER_MINUTES = 10;
