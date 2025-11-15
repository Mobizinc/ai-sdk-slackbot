export function parseJsonFromText<T>(text?: string): T {
  if (!text) {
    throw new Error("No text returned from model");
  }

  let candidate = text.trim();

  // Remove code fences if present
  if (candidate.startsWith("```")) {
    const fenceEnd = candidate.lastIndexOf("```\n");
    if (fenceEnd > 3) {
      candidate = candidate.slice(candidate.indexOf("\n") + 1, fenceEnd).trim();
    }
  }

  const jsonMatch = candidate.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object found in model response");
  }

  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch (error) {
    throw new Error(`Failed to parse JSON response: ${(error as Error).message}`);
  }
}
