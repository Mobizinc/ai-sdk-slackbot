/**
 * Test with OpenAI fallback to verify the code works
 * This bypasses the Gateway OIDC issue for local testing
 */

import * as dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

// Temporarily unset AI_GATEWAY_API_KEY to force OpenAI fallback
delete process.env.AI_GATEWAY_API_KEY;

import { generateResponse } from "../lib/generate-response";

async function test() {
  console.log("Testing with OpenAI fallback (gpt-5-mini)...\n");

  try {
    const messages = [
      { role: "user" as const, content: "What is 2+2? Answer briefly." }
    ];

    const response = await generateResponse(messages);

    console.log("\n✅ SUCCESS!");
    console.log("Response:", response);
  } catch (error: any) {
    console.error("\n❌ ERROR:", error.message);
  }
}

test();
