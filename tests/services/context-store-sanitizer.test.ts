import { describe, it, expect } from "vitest";
import { sanitizeContextMessage } from "../../lib/services/context-store-sanitizer";
import type { CaseMessage } from "../../lib/context-manager";

function buildMessage(text: string): CaseMessage {
  return {
    user: "U123",
    text,
    timestamp: "123456.789",
    thread_ts: "123456.000",
  };
}

describe("Context Store Sanitizer", () => {
  it("redacts common PII patterns individually", () => {
    const samples: Array<{ text: string; expectedToken: string }> = [
      { text: "email me at test.user+demo@example.com today", expectedToken: "[REDACTED_EMAIL]" },
      { text: "call +1 (555) 123-4567 ASAP", expectedToken: "[REDACTED_PHONE]" },
      { text: "patient SSN is 123-45-6789", expectedToken: "[REDACTED_SSN]" },
      { text: "card 4242 4242 4242 4242 failed auth", expectedToken: "[REDACTED_PAN]" },
      { text: "MRN: 9988776655 attached to chart", expectedToken: "[REDACTED_MRN]" },
    ];

    for (const sample of samples) {
      const { message, redactions } = sanitizeContextMessage(buildMessage(sample.text));
      expect(message.text).toContain(sample.expectedToken);
      expect(redactions.length).toBe(1);
    }
  });

  it("redacts multiple PII values in the same message", () => {
    const text =
      "Reach John at john@example.com or +1-713-555-0199; MRN 123456789 and card 4111-1111-1111-1111.";
    const { message, redactions } = sanitizeContextMessage(buildMessage(text));

    expect(message.text).not.toContain("john@example.com");
    expect(message.text).not.toContain("+1-713-555-0199");
    expect(message.text).not.toContain("4111-1111-1111-1111");
    expect(message.text).not.toContain("MRN 123456789");
    expect(new Set(redactions)).toEqual(
      new Set(["email", "phone", "credit_card", "mrn"])
    );
  });

  it("leaves safe text untouched", () => {
    const safeText = "Issue still reproduces on prod router R1. Need logs.";
    const { message, redactions } = sanitizeContextMessage(buildMessage(safeText));
    expect(message.text).toBe(safeText);
    expect(redactions).toHaveLength(0);
  });
});
