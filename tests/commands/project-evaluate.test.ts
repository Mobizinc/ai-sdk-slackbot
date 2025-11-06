import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/strategy/event-subscribers", () => ({}));

import { parseDemandRequest } from "../../api/commands/project-evaluate";

describe("parseDemandRequest", () => {
  it("parses a fully populated command string", () => {
    const input =
      "Mobizinc AI Assistant | Automate ticket triage | Reduce MTTR by 30% | 150% | 3 months | 2 ServiceNow engineers, 1 PM | 4 | cloud-infrastructure, data-ai | Healthcare | ServiceNow, Azure";

    const result = parseDemandRequest(input);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.request.projectName).toBe("Mobizinc AI Assistant");
      expect(result.request.teamSize).toBe(4);
      expect(result.request.strategicAlignment).toEqual([
        "cloud-infrastructure",
        "data-ai",
      ]);
      expect(result.request.partnerTechnologies).toEqual(["ServiceNow", "Azure"]);
      expect(result.request.targetIndustry).toBe("Healthcare");
    }
  });

  it("fails when required fields are missing", () => {
    const result = parseDemandRequest("Only | Three | Fields");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/expected at least 8 fields/i);
    }
  });

  it("fails when team size is not a positive number", () => {
    const result = parseDemandRequest(
      "Project | Purpose | Value | 120% | 2 months | Engineers | zero | growth | finance | ",
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/team size must be a positive number/i);
    }
  });

  it("fails when no strategic pillars are provided", () => {
    const result = parseDemandRequest(
      "Project | Purpose | Value | 120% | 2 months | Engineers | 3 | , | finance | ",
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/at least one strategic alignment pillar/i);
    }
  });
});
