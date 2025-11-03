/**
 * Shared ServiceNow payload helpers used by both case and incident webhooks.
 * Handles sanitising quirky ServiceNow payloads before parsing to JSON.
 */

/**
 * Extract a snippet of JSON around an error position for debugging.
 */
function extractErrorContext(payload: string, position: number, contextSize = 50): string {
  const start = Math.max(0, position - contextSize);
  const end = Math.min(payload.length, position + contextSize);
  const snippet = payload.slice(start, end);
  const marker = "^".padStart(Math.min(position - start, contextSize) + 1);
  return `...${snippet}...\n   ${marker} (position ${position})`;
}

/**
 * Fix invalid escape sequences in JSON strings.
 * ServiceNow may send paths like "L:\" which need escaping.
 */
export function fixInvalidEscapeSequences(payload: string): string {
  return payload.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
}

/**
 * Remove trailing commas before closing braces/brackets.
 * This fixes malformed JSON like {"key": "value",}
 */
export function removeTrailingCommas(payload: string): string {
  return payload
    .replace(/,(\s*[}\]])/g, "$1");
}

/**
 * Escape control characters inside JSON string values.
 * ServiceNow often sends unescaped newlines/tabs inside string values.
 */
export function escapeControlCharsInStrings(payload: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < payload.length; i++) {
    const char = payload[i];
    const charCode = char.charCodeAt(0);

    // Track if we're inside a string (between unescaped quotes)
    if (char === '"' && !escaped) {
      inString = !inString;
      result += char;
      continue;
    }

    // Track escape sequences
    if (char === '\\' && !escaped) {
      escaped = true;
      result += char;
      continue;
    }

    // If we're inside a string, escape control characters
    if (inString && !escaped) {
      // Escape common control characters
      if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        result += '\\r';
      } else if (char === '\t') {
        result += '\\t';
      } else if (charCode < 0x20 || charCode === 0x7F) {
        // Other control characters - remove them
        continue;
      } else {
        result += char;
      }
    } else {
      result += char;
    }

    // Reset escape flag for next character
    escaped = false;
  }

  return result;
}

/**
 * Fix common quote escaping issues in JSON strings.
 */
export function fixUnescapedQuotes(payload: string): string {
  // Fix unescaped quotes inside strings (heuristic approach)
  // This is a best-effort fix and may not handle all cases
  return payload.replace(/([^\\])"([^":,}\]]+)"([^:,}\]])/g, '$1\\"$2\\"$3');
}

/**
 * Sanitize ServiceNow payload by fixing common JSON issues.
 * This is the main sanitization function that applies multiple fixes.
 */
export function sanitizeServiceNowPayload(payload: string): string {
  let sanitized = payload;

  // 1. Escape control characters inside JSON string values (most important!)
  sanitized = escapeControlCharsInStrings(sanitized);

  // 2. Fix invalid escape sequences (like L:\)
  sanitized = fixInvalidEscapeSequences(sanitized);

  // 3. Remove trailing commas before closing braces/brackets
  sanitized = removeTrailingCommas(sanitized);

  return sanitized;
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
  // Log raw payload preview (first 500 chars) for debugging
  const payloadPreview = rawPayload.length > 500
    ? `${rawPayload.substring(0, 500)}... (${rawPayload.length} total chars)`
    : rawPayload;
  console.log("[ServiceNowPayload] Attempting to parse payload:", {
    length: rawPayload.length,
    preview: payloadPreview,
  });

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

  const errors: Array<{ attempt: string; error: Error; candidate?: string }> = [];

  for (const attempt of attempts) {
    const candidate = attempt.value();
    if (!candidate) continue;
    if (!looksLikeJson(candidate)) continue;

    try {
      const parsed = JSON.parse(candidate);
      if (Object.keys(parsed as Record<string, unknown>).length === 0) {
        continue;
      }
      console.log(`[ServiceNowPayload] Successfully parsed using ${attempt.description}`);
      return parsed;
    } catch (error) {
      const err = error as Error;
      errors.push({ attempt: attempt.description, error: err, candidate });

      // Extract position from error message (e.g., "position 202")
      const positionMatch = err.message.match(/position (\d+)/);
      const position = positionMatch ? parseInt(positionMatch[1], 10) : undefined;

      if (position !== undefined && candidate) {
        const errorContext = extractErrorContext(candidate, position);
        console.warn(
          `[ServiceNowPayload] Failed to parse ${attempt.description}:`,
          err.message,
          "\nError context:",
          errorContext
        );
      } else {
        console.warn(`[ServiceNowPayload] Failed to parse ${attempt.description}:`, err.message);
      }
    }
  }

  // Provide detailed error information
  if (errors.length > 0) {
    const lastError = errors[errors.length - 1];
    console.error("[ServiceNowPayload] All parsing attempts failed:", {
      totalAttempts: errors.length,
      attempts: errors.map(e => ({ attempt: e.attempt, error: e.error.message })),
    });
    throw lastError.error;
  }

  throw new Error("Unable to parse ServiceNow payload: no valid JSON found");
}
