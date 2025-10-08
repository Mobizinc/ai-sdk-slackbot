/**
 * Test exact production configuration
 * Replicate the exact generateText() call from production
 */

import { createGateway } from "@ai-sdk/gateway";
import { customProvider } from "ai";
import { generateText, tool } from "ai";
import { z } from "zod";

async function testExactConfig() {
  console.log("Testing EXACT production configuration...\n");

  // Use production API key
  const apiKey = "vck_7iT66tXm9Lxvfcz2dA01qhRTYyvpTqQi7X2N";

  const gateway = createGateway({ apiKey });
  const provider = customProvider({
    languageModels: {
      "chat-model": gateway("zai/glm-4.6"),
    },
  });

  console.log("✅ Provider created");
  console.log("📤 Calling with EXACT production config:\n");
  console.log("  - system: Slack bot system prompt");
  console.log("  - messages: Simple user question");
  console.log("  - maxSteps: 10");
  console.log("  - tools: getWeather tool");
  console.log();

  try {
    const result = await generateText({
      model: provider.languageModel("chat-model"),
      system: `You are the Mobiz Service Desk Assistant in Slack for analysts and engineers.

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
      messages: [
        { role: "user", content: "Hello, what is 2+2?" }
      ],
      maxSteps: 10,
      tools: {
        getWeather: tool({
          description: "Get the current weather at a location",
          parameters: z.object({
            city: z.string(),
          }),
          execute: async ({ city }) => {
            console.log(`[Tool Call] getWeather for ${city}`);
            return { temperature: 72, city };
          },
        }),
      },
    });

    console.log("=".repeat(60));
    console.log("RESULT:");
    console.log("=".repeat(60));
    console.log(`Text length: ${result.text?.length || 0}`);
    console.log(`Text: ${result.text}`);
    console.log(`Finish reason: ${result.finishReason}`);
    console.log(`Usage:`, result.usage);
    console.log(`Steps: ${result.steps?.length || 0}`);

    if (result.steps) {
      result.steps.forEach((step: any, i: number) => {
        console.log(`\nStep ${i}:`, {
          stepType: step.stepType,
          text: step.text?.substring(0, 100),
          toolCalls: step.toolCalls?.length || 0,
        });
      });
    }

  } catch (error: any) {
    console.error("❌ ERROR:", error.message);
    console.error("Type:", error.constructor.name);
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
  }
}

testExactConfig();
