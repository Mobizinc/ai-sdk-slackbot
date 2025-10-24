/**
 * Simple Gateway test - bypass all the complex bot logic
 */

import { createGateway } from "@ai-sdk/gateway";
import { generateText } from "../lib/instrumented-ai";

async function testSimpleGateway() {
  console.log("Testing Gateway directly...\n");

  // Read API key from Vercel env or .env.local
  const apiKey = process.env.AI_GATEWAY_API_KEY || "vck_7iT66tXm9Lxvfcz2dA01qhRTYyvpTqQi7X2N";

  console.log(`API Key: ${apiKey.substring(0, 15)}...`);

  const gateway = createGateway({
    apiKey: apiKey,
  });

  const model = gateway("zai/glm-4.6");

  console.log("Calling GLM-4.6 with simple prompt...\n");

  try {
    const result = await generateText({
      model,
      prompt: "What is 2+2? Answer in one sentence.",
    });

    console.log("✅ SUCCESS!");
    console.log(`Response: ${result.text}`);
    console.log(`Usage:`, result.usage);
  } catch (error) {
    console.error("❌ ERROR:", error);
  }
}

testSimpleGateway();
