import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const SYSTEM_PROMPT_PATH = join(process.cwd(), "config", "system-prompt.txt");

export async function getSystemPrompt(currentDate?: string): Promise<string> {
  try {
    const prompt = await readFile(SYSTEM_PROMPT_PATH, "utf-8");

    // Add dynamic date if provided
    if (currentDate) {
      return `${prompt}\n  • Today: ${currentDate}`;
    }

    return prompt;
  } catch (error) {
    console.error("Failed to load system prompt:", error);
    // Return fallback prompt
    return "You are a helpful assistant.";
  }
}

export async function updateSystemPrompt(newPrompt: string): Promise<void> {
  await writeFile(SYSTEM_PROMPT_PATH, newPrompt, "utf-8");
}
