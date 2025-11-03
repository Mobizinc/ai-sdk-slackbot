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
 * Enhanced to handle unicode escapes and nested structures.
 */
export function escapeControlCharsInStrings(payload: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  let nestingDepth = 0; // Track {[({ nesting for better context

  for (let i = 0; i < payload.length; i++) {
    const char = payload[i];
    const charCode = char.charCodeAt(0);

    // Track nesting depth when not in strings
    if (!inString && !escaped) {
      if (char === '{' || char === '[') {
        nestingDepth++;
      } else if (char === '}' || char === ']') {
        nestingDepth--;
      }
    }

    // Track if we're inside a string (between unescaped quotes)
    if (char === '"' && !escaped) {
      inString = !inString;
      result += char;
      continue;
    }

    // Track escape sequences
    if (char === '\\' && !escaped) {
      // Check if this is a unicode escape sequence (\uXXXX)
      if (i + 5 < payload.length && payload[i + 1] === 'u') {
        const unicodeHex = payload.substring(i + 2, i + 6);
        // If it's a valid unicode escape, keep it as-is
        if (/^[0-9a-fA-F]{4}$/.test(unicodeHex)) {
          result += payload.substring(i, i + 6); // \uXXXX
          i += 5; // Skip the unicode sequence
          continue;
        }
      }

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
      } else if (char === '\b') {
        result += '\\b';
      } else if (char === '\f') {
        result += '\\f';
      } else if (charCode < 0x20 || charCode === 0x7F) {
        // Other control characters - convert to unicode escape
        const hex = charCode.toString(16).padStart(4, '0');
        result += `\\u${hex}`;
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
 * Normalize smart quotes to straight quotes.
 * Converts curly quotes from Word/Outlook to standard JSON quotes.
 * This is the #1 cause of ServiceNow webhook failures per community forums.
 */
export function normalizeQuotes(payload: string): string {
  return payload
    // Smart double quotes → straight quotes
    .replace(/[\u201C\u201D]/g, '"')  // " " → "
    // Smart single quotes → straight quotes
    .replace(/[\u2018\u2019]/g, "'")  // ' ' → '
    // Double prime → straight quote (less common)
    .replace(/\u2033/g, '"')  // ″ → "
    // Single prime → straight quote (less common)
    .replace(/\u2032/g, "'");  // ′ → '
}

/**
 * Remove NULL characters and other dangerous unicode.
 * ServiceNow may send \u0000 (NULL) characters that cause parsing issues.
 */
export function removeNullCharacters(payload: string): string {
  return payload
    // Remove NULL bytes
    .replace(/\u0000/g, '')
    // Remove other problematic unicode control characters
    .replace(/[\uFFFD]/g, '')  // Replacement character (invalid UTF-8)
    .replace(/[\uFEFF]/g, '');  // Zero-width no-break space (BOM handled separately)
}

/**
 * Fix missing commas between JSON fields.
 * ServiceNow script bugs sometimes cause missing commas like:
 * "field1": "value1"\n"field2": "value2"
 */
export function fixMissingCommas(payload: string): string {
  // Add comma between a closing quote and opening quote on different lines
  // Match: "value"<whitespace including newlines>"nextField"
  // Replace with: "value","nextField"
  return payload.replace(/"(\s*\n\s*)"(\w+)":/g, '",\n  "$2":');
}

/**
 * Attempt to fix incomplete JSON payloads (truncated by network/size limits).
 * This is a best-effort recovery - adds missing closing braces/brackets.
 */
export function fixIncompletePayload(payload: string): string {
  const trimmed = payload.trim();

  // Count opening and closing braces/brackets
  let braceDepth = 0;
  let bracketDepth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    // Track string boundaries
    if (char === '"' && !escaped) {
      inString = !inString;
    }

    // Track escape sequences
    escaped = (char === '\\' && !escaped);

    // Count braces/brackets when not in strings
    if (!inString) {
      if (char === '{') braceDepth++;
      else if (char === '}') braceDepth--;
      else if (char === '[') bracketDepth++;
      else if (char === ']') bracketDepth--;
    }
  }

  // If incomplete, try to close it
  let fixed = trimmed;

  // Close any unclosed strings
  if (inString) {
    fixed += '"';
  }

  // Close unclosed brackets
  while (bracketDepth > 0) {
    fixed += ']';
    bracketDepth--;
  }

  // Close unclosed braces
  while (braceDepth > 0) {
    fixed += '}';
    braceDepth--;
  }

  return fixed;
}

/**
 * Sanitize ServiceNow payload by fixing common JSON issues.
 * This is the main sanitization function that applies multiple fixes.
 *
 * Order matters! Each sanitizer assumes previous ones succeeded.
 */
export function sanitizeServiceNowPayload(payload: string): string {
  let sanitized = payload;

  // 1. Remove BOM (done in parseServiceNowPayload, but safe to repeat)
  sanitized = removeBom(sanitized);

  // 2. Normalize smart quotes → straight quotes (CRITICAL for Word/Outlook copy-paste)
  sanitized = normalizeQuotes(sanitized);

  // 3. Remove NULL characters and dangerous unicode
  sanitized = removeNullCharacters(sanitized);

  // 4. Escape control characters inside JSON string values (newlines, tabs, etc.)
  sanitized = escapeControlCharsInStrings(sanitized);

  // 5. Fix invalid escape sequences (like L:\)
  sanitized = fixInvalidEscapeSequences(sanitized);

  // 6. Remove trailing commas before closing braces/brackets
  sanitized = removeTrailingCommas(sanitized);

  // 7. Fix missing commas between fields
  sanitized = fixMissingCommas(sanitized);

  // 8. Attempt to fix incomplete JSON (last resort)
  sanitized = fixIncompletePayload(sanitized);

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
