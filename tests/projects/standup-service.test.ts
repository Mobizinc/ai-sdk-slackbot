import { describe, expect, it } from "vitest";
import {
  getStandupConfig,
  isStandupDue,
  computeScheduledTime,
  computeReminderRecipients,
} from "../../lib/projects/standup-service";

const baseProject: any = {
  id: "project-123",
  name: "Sample Project",
  status: "active",
  standup: {
    enabled: true,
    schedule: {
      frequency: "weekdays",
      timeUtc: "16:00",
    },
    participants: ["U123"],
    includeMentor: false,
    includeAcceptedCandidates: false,
    questions: [],
  },
};

describe("standup service", () => {
  it("returns normalized standup config", () => {
    const config = getStandupConfig(baseProject);
    expect(config).toBeDefined();
    expect(config?.questions.length).toBeGreaterThan(0); // defaults applied
  });

  it("computes scheduled time in UTC", () => {
    const config = getStandupConfig(baseProject)!;
    const now = new Date("2024-01-15T15:45:00Z");
    const scheduled = computeScheduledTime(config, now);
    expect(scheduled.toISOString()).toBe("2024-01-15T16:00:00.000Z");
  });

  it("detects standup due within trigger window", () => {
    const config = getStandupConfig(baseProject)!;
    const withinWindow = new Date("2024-01-15T16:10:00Z");
    expect(isStandupDue(config, withinWindow)).toBe(true);

    const beforeWindow = new Date("2024-01-15T15:30:00Z");
    expect(isStandupDue(config, beforeWindow)).toBe(false);

    const outsideWindow = new Date("2024-01-15T17:05:00Z");
    expect(isStandupDue(config, outsideWindow)).toBe(false);
  });

  it("computes reminder recipients when within reminder window", () => {
    const project = {
      ...baseProject,
      standup: {
        ...baseProject.standup,
        collectionWindowMinutes: 60,
        reminderMinutesBeforeDue: 30,
        maxReminders: 2,
        participants: ["U123", "U456"],
      },
    };
    const config = getStandupConfig(project)!;
    const scheduledFor = new Date("2024-01-15T16:00:00Z");
    const collectUntil = new Date("2024-01-15T17:00:00Z");
    const now = new Date("2024-01-15T16:40:00Z");

    const recipients = computeReminderRecipients({
      participants: ["U123", "U456"],
      responded: ["U123"],
      metadata: {
        participants: ["U123", "U456"],
        reminderCounts: { U123: 0, U456: 0 },
        reminders: [],
      } as any,
      config,
      scheduledFor,
      collectUntil,
      now,
    });

    expect(recipients).toEqual(["U456"]);
  });

  it("skips reminders when max reminders reached or outside window", () => {
    const project = {
      ...baseProject,
      standup: {
        ...baseProject.standup,
        collectionWindowMinutes: 60,
        reminderMinutesBeforeDue: 30,
        maxReminders: 1,
        participants: ["U123", "U456"],
      },
    };
    const config = getStandupConfig(project)!;
    const scheduledFor = new Date("2024-01-15T16:00:00Z");
    const collectUntil = new Date("2024-01-15T17:00:00Z");

    // Before reminder window
    const earlyRecipients = computeReminderRecipients({
      participants: ["U123", "U456"],
      responded: [],
      metadata: {
        participants: ["U123", "U456"],
        reminderCounts: {},
        reminders: [],
      } as any,
      config,
      scheduledFor,
      collectUntil,
      now: new Date("2024-01-15T16:10:00Z"),
    });
    expect(earlyRecipients).toEqual([]);

    // Within window but already reminded
    const lateRecipients = computeReminderRecipients({
      participants: ["U123", "U456"],
      responded: [],
      metadata: {
        participants: ["U123", "U456"],
        reminderCounts: { U123: 1, U456: 1 },
        reminders: [{ sentAt: "2024-01-15T16:35:00Z", participants: ["U123", "U456"] }],
      } as any,
      config,
      scheduledFor,
      collectUntil,
      now: new Date("2024-01-15T16:40:00Z"),
    });
    expect(lateRecipients).toEqual([]);
  });
});
