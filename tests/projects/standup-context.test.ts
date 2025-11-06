import { describe, expect, it } from "vitest";
import { composeAdaptiveQuestions } from "../../lib/projects/standup-context";
import type { StandupQuestion } from "../../lib/projects/types";

const baseQuestions: StandupQuestion[] = [
  { id: "yesterday", prompt: "What did you work on since the last check-in?" },
  { id: "today", prompt: "What do you plan to accomplish before the next check-in?" },
  { id: "blockers", prompt: "Do you have any blockers or need support?", helper: "If none, reply with 'none'." },
];

describe("composeAdaptiveQuestions", () => {
  it("enriches prompts and adds follow-up when context exists", () => {
    const context = {
      participantId: "U123",
      previousPlan: "Finish GH#123 and prep SPM-45",
      previousBlockers: "Waiting on API deploy",
      issueReferences: [
        { raw: "#123", source: "github", normalizedId: "123" },
        { raw: "SPM-45", source: "spm", normalizedId: "45" },
      ],
      dependencyNotes: ["Tracked GitHub items: #123", "Tracked SPM items: SPM-45"],
      contextSummary: "Last plan: Finish GH#123 and prep SPM-45",
    } as any;

    const questions = composeAdaptiveQuestions(baseQuestions, context);

    expect(questions[0]?.id).toBe("plan_followup");
    expect(questions[0]?.prompt).toContain("#123");

    const yesterday = questions.find((q) => q.id === "yesterday");
    expect(yesterday?.prompt).toContain("Finish GH#123");

    const today = questions.find((q) => q.id === "today");
    expect(today?.helper).toContain("Tracked GitHub items");

    const blockers = questions.find((q) => q.id === "blockers");
    expect(blockers?.helper).toContain("Waiting on API deploy");
  });

  it("returns clones of base questions when context missing", () => {
    const questions = composeAdaptiveQuestions(baseQuestions, undefined);
    expect(questions).toHaveLength(baseQuestions.length);
    expect(questions[0]).not.toBe(baseQuestions[0]);
    expect(questions[0]?.prompt).toBe(baseQuestions[0]?.prompt);
  });
});
