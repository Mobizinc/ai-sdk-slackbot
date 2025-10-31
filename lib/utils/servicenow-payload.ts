/**
 * Shared ServiceNow payload helpers used by both case and incident webhooks.
 * Handles sanitising quirky ServiceNow payloads before parsing to JSON.
 */

/**
 * Fix invalid escape sequences in JSON strings.
 * ServiceNow may send paths like "L:\" which need escaping.
 */
export function fixInvalidEscapeSequences(payload: string): string {
  return payload.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
}

/**
 * Remove unescaped control characters that break JSON.parse(),
 * while keeping properly escaped newlines/tabs/carriage returns.
 */
export function sanitizeServiceNowPayload(payload: string): string {
  const sanitized = fixInvalidEscapeSequences(payload);
  return sanitized
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[\u2028\u2029]/g, "");
}

export function removeBom(payload: string): string {
  return payload.replace(/^\uFEFF/, "");
}

export function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

export function isProbablyBase64(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length % 4 !== 0) return false;
  if (/[^A-Za-z0-9+/=\r\n]/.test(trimmed)) return false;
  if (trimmed.includes("{") || trimmed.includes('"')) return false;
  return true;
}

export function decodeFormEncodedPayload(payload: string): string | null {
  const trimmed = payload.trim();
  if (!trimmed) return null;

  try {
    if (trimmed.includes("=")) {
      const params = new URLSearchParams(trimmed);
      const possibleKeys = ["payload", "body", "data", "json"];
      for (const key of possibleKeys) {
        const value = params.get(key);
        if (value) return value;
      }
    }

    if (/^%7B/i.test(trimmed) || trimmed.includes("%7B")) {
      return decodeURIComponent(trimmed);
    }
  } catch (error) {
    console.warn("[ServiceNowPayload] Failed to decode form payload:", error);
  }

  return null;
}

export function decodeBase64Payload(payload: string): string | null {
  if (!isProbablyBase64(payload)) {
    return null;
  }

  try {
    return Buffer.from(payload.trim(), "base64").toString("utf8");
  } catch (error) {
    console.warn("[ServiceNowPayload] Failed to decode base64 payload:", error);
    return null;
  }
}

/**
 * Best-effort parsing of ServiceNow webhook payloads.
 * Tries a series of sanitisation/decoding attempts before parsing.
 */
export function parseServiceNowPayload(rawPayload: string): unknown {
  const attempts: Array<{ description: string; value: () => string | null }> = [
    {
      description: "trimmed payload",
      value: () => removeBom(rawPayload).trim(),
    },
    {
      description: "sanitized payload",
      value: () => sanitizeServiceNowPayload(removeBom(rawPayload)),
    },
    {
      description: "form-encoded payload",
      value: () => decodeFormEncodedPayload(rawPayload),
    },
    {
      description: "base64-decoded payload",
      value: () => decodeBase64Payload(rawPayload),
    },
    {
      description: "sanitized base64 payload",
      value: () => {
        const decoded = decodeBase64Payload(rawPayload);
        return decoded ? sanitizeServiceNowPayload(decoded) : null;
      },
    },
  ];

  const errors: Error[] = [];

  for (const attempt of attempts) {
    const candidate = attempt.value();
    if (!candidate) continue;
    if (!looksLikeJson(candidate)) continue;

    try {
      const parsed = JSON.parse(candidate);
      if (Object.keys(parsed as Record<string, unknown>).length === 0) {
        continue;
      }
      return parsed;
    } catch (error) {
      errors.push(error as Error);
      console.warn(`[ServiceNowPayload] Failed to parse ${attempt.description}:`, error);
    }
  }

  if (errors.length > 0) {
    throw errors[errors.length - 1];
  }

  throw new Error("Unable to parse ServiceNow payload");
}
