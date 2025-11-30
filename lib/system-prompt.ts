import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { getPromptService } from "./services/prompt-service";

const SYSTEM_PROMPT_PATH = join(process.cwd(), "config", "system-prompt.txt");
const SYSTEM_PROMPT_NAME = "system_prompt";

/**
 * Get system prompt with database-first approach
 * Falls back to file if database prompt not found
 */
export async function getSystemPrompt(currentDate?: string): Promise<string> {
  const promptService = getPromptService();

  try {
    // Try database first, fall back to file
    const prompt = await promptService.getPrompt(SYSTEM_PROMPT_NAME, {
      fallbackToFile: "config/system-prompt.txt",
      fallbackToStatic: "You are a helpful assistant.",
      variables: currentDate ? { date: currentDate } : undefined,
    });

    if (!prompt) {
      console.error("[System Prompt] No prompt found in database or file");
      return "You are a helpful assistant.";
    }

    // Add dynamic date if provided and not already substituted via variables
    if (currentDate && !prompt.includes(currentDate)) {
      return `${prompt}\n  • Today: ${currentDate}`;
    }

    return prompt;
  } catch (error) {
    console.error("[System Prompt] Failed to load system prompt:", error);
    // Return fallback prompt
    return "You are a helpful assistant.";
  }
}

/**
 * Get system prompt directly from file (legacy method)
 * Use getSystemPrompt for database-enabled approach
 */
export async function getSystemPromptFromFile(currentDate?: string): Promise<string> {
  try {
    const prompt = await readFile(SYSTEM_PROMPT_PATH, "utf-8");

    // Add dynamic date if provided
    if (currentDate) {
      return `${prompt}\n  • Today: ${currentDate}`;
    }

    return prompt;
  } catch (error) {
    console.error("[System Prompt] Failed to load from file:", error);
    return "You are a helpful assistant.";
  }
}

/**
 * Update system prompt in file
 * Note: For database updates, use the admin API or PromptService directly
 */
export async function updateSystemPrompt(newPrompt: string): Promise<void> {
  await writeFile(SYSTEM_PROMPT_PATH, newPrompt, "utf-8");
}
