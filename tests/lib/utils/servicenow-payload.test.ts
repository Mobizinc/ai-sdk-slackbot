import { describe, expect, it } from "vitest";
import {
  fixInvalidUnicodeEscapes,
  sanitizeServiceNowPayload,
} from "../../../lib/utils/servicenow-payload";
import { ServiceNowParser } from "../../../lib/utils/servicenow-parser";

describe("ServiceNow payload sanitizers", () => {
  it("fixInvalidUnicodeEscapes should escape sequences without hex digits", () => {
    const raw = '{"description":"C:\\usern"}';
    expect(() => JSON.parse(raw)).toThrow();

    const fixed = fixInvalidUnicodeEscapes(raw);
    const parsed = JSON.parse(fixed);

    expect(parsed.description).toBe("C:\\usern");
  });

  it("sanitizeServiceNowPayload should recover payloads with invalid unicode sequences", () => {
    const rawPayload = '{"case_number":"CASE001099","description":"Path C:\\usern"}';
    const sanitized = sanitizeServiceNowPayload(rawPayload);
    const parser = new ServiceNowParser();
    const result = parser.parse(rawPayload);

    expect(() => JSON.parse(sanitized)).not.toThrow();
    expect(result.success).toBe(true);
    expect((result.data as any).case_number).toBe("CASE001099");
  });
});
