import { z } from "zod";

/**
 * Extract and parse JSON from an LLM response with schema validation.
 *
 * - Strips code fences if present
 * - Grabs the first JSON object substring
 * - Validates with the provided Zod schema
 * - Throws a descriptive error for upstream retry/fallback
 */
export function parseJsonWithSchema<T>(
  text: string | undefined,
  schema: z.ZodSchema<T>,
  context?: string,
): T {
  if (!text) {
    throw new Error("No text returned from model");
  }

  let candidate = text.trim();

  if (candidate.startsWith("```")) {
    const fenceEnd = candidate.lastIndexOf("```");
    if (fenceEnd > 3) {
      candidate = candidate.slice(candidate.indexOf("\n") + 1, fenceEnd).trim();
    }
  }

  const jsonMatch = candidate.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON object found in model response${context ? ` (${context})` : ""}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (error) {
    throw new Error(
      `Failed to parse JSON response${context ? ` (${context})` : ""}: ${(error as Error).message}`,
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `JSON did not match schema${context ? ` (${context})` : ""}: ${result.error.message}`,
    );
  }

  return result.data;
}
