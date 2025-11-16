import { describe, it, expect } from "vitest";

const baseUrl = process.env.DEMAND_API_BASE_URL;
const apiKey = process.env.DEMAND_API_KEY;

describe("Demand API smoke", () => {
  if (!baseUrl || !apiKey) {
    it.skip("DEMAND_API_BASE_URL and DEMAND_API_KEY must be set to run this smoke test", () => {});
    return;
  }

  const schemaUrl = `${baseUrl.replace(/\/$/, "")}/api/demand/schema`;

  it("fetches live schema", async () => {
    const response = await fetch(schemaUrl, {
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.ok).toBe(true);

    const data = (await response.json()) as {
      servicePillars: Array<{ id: string; name: string }>;
      technologyPartners: string[];
      targetMarkets: Array<{ industry: string }>;
    };

    expect(Array.isArray(data.servicePillars)).toBe(true);
    expect(data.servicePillars.length).toBeGreaterThan(0);
    expect(Array.isArray(data.technologyPartners)).toBe(true);
    expect(Array.isArray(data.targetMarkets)).toBe(true);
  });
});
