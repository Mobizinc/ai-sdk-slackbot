export function stripJsonFence(raw: string): string {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}
