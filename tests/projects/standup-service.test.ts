import { describe, expect, it } from "vitest";
import { getStandupConfig, isStandupDue, computeScheduledTime } from "../../lib/projects/standup-service";

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
});
