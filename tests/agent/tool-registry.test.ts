import { describe, it, expect } from "vitest";
import { getToolRegistry } from "../../lib/agent/tool-registry";

describe("Agent Tool Registry", () => {
  it("creates legacy toolset with expected keys", () => {
    const registry = getToolRegistry();
    const tools = registry.createTools({
      messages: [],
      caseNumbers: [],
    });

    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining([
        "getWeather",
        "searchWeb",
        "serviceNow",
        "searchSimilarCases",
        "generateKBArticle",
        "proposeContextUpdate",
        "fetchCurrentIssues",
        "microsoftLearnSearch",
        "triageCase",
      ]),
    );
  });
});
