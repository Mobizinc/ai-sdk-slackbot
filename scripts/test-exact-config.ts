/**
 * Anthropic chat equivalent of the legacy "exact config" test.
 * Exercises the new runner with a custom tool registry.
 */

import type { CoreMessage } from "../lib/agent/types";
import { runAgent } from "../lib/agent/runner";
import {
  __setToolRegistry,
  type ToolRegistry,
} from "../lib/agent/tool-registry";

class ScriptToolRegistry implements ToolRegistry {
  createTools() {
    return {
      getWeather: {
        description: "Get the current weather at a location",
        inputSchema: {
          type: "object",
          properties: {
            city: { type: "string" },
          },
          required: ["city"],
        },
        execute: async ({ city }: { city?: string }) => {
          const resolvedCity = city ?? "unknown";
          console.log(`[Tool Call] getWeather for ${resolvedCity}`);
          return {
            temperature: 72,
            conditions: "Sunny",
            city: resolvedCity,
          };
        },
      },
    };
  }
}

async function testExactConfig() {
  console.log("Testing Anthropic runner with custom tool registry...\n");

  const messages: CoreMessage[] = [
    {
      role: "system",
      content: `You are the Mobiz Service Desk Assistant in Slack for analysts and engineers.

IMPORTANT: Engineers are actively troubleshooting. Only respond when:
  • You have NEW, actionable information to contribute
  • User explicitly asks you a question
  • Never restate what engineers just said
  • Never generate summaries mid-conversation unless explicitly requested
  • If you would just be agreeing or acknowledging, stay silent
  • Observe and track, but don't interrupt active work

Response format (use Slack markdown):
  *Summary*
  1-2 sentences max. What happened and why it matters. No filler text.

  *Next Actions*
  1. Specific actionable step
  2. Another step if needed`,
    },
    { role: "user", content: "Hello, what is 2+2? Also, what's the weather in Boston?" },
  ];

  __setToolRegistry(new ScriptToolRegistry());

  try {
    const response = await runAgent({
      messages,
    });

    console.log("=".repeat(60));
    console.log("RESULT:");
    console.log("=".repeat(60));
    console.log(response);
  } catch (error: any) {
    console.error("❌ ERROR:", error.message);
    console.error("Type:", error.constructor?.name ?? typeof error);
  } finally {
    __setToolRegistry(null);
  }
}

testExactConfig();
