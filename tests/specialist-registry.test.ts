import { describe, it, expect } from "vitest";
import { buildToolAllowList, matchSpecialistAgents } from "../lib/agent/specialist-registry";

const makeMessage = (text: string) => ({ role: "user", content: text });

describe("specialist registry", () => {
  it("prioritizes ServiceNow orchestration when triage intent is detected", () => {
    const routing = buildToolAllowList({
      messages: [makeMessage("Please triage SCS0048123 for Altus")],
      caseNumbers: ["SCS0048123"],
    });

    expect(routing.allowlist).toBeDefined();
    expect(routing?.allowlist).toContain("orchestrateServiceNowCase");
    expect(routing?.allowlist).toContain("serviceNow");
    expect(routing.matches[0]?.agent.id).toBe("servicenow_orchestration");
  });

  it("selects KB tooling for knowledge base requests", () => {
    const routing = buildToolAllowList({
      messages: [
        makeMessage(
          "Can you draft a knowledge base article for the VPN token reset workflow?"
        ),
      ],
    });

    expect(routing.allowlist).toBeDefined();
    expect(routing.allowlist).toContain("generateKBArticle");
  });

  it("falls back to full toolset when no specialist match occurs", () => {
    const routing = buildToolAllowList({
      messages: [makeMessage("Tell me a joke")],
    });

    expect(routing.allowlist).toBeUndefined();
  });

  it("returns match metadata for telemetry", () => {
    const matches = matchSpecialistAgents({
      messages: [makeMessage("Need firewall status for Fortinet core device")],
    });

    const ids = matches.map((m) => m.agent.id);
    expect(ids).toContain("connectivity_reasoning_agent");
  });
});
