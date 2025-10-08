/**
 * Final Gateway test with proper environment
 * Tests GLM-4.6 via AI Gateway
 */

import { generateResponse } from "../lib/generate-response";

async function test() {
  console.log("Testing AI Gateway with GLM-4.6...\n");

  try {
    const messages = [
      { role: "user" as const, content: "What is 2+2? Answer in one word." }
    ];

    const response = await generateResponse(messages);

    console.log("\n✅ SUCCESS!");
    console.log("Response:", response);
  } catch (error: any) {
    console.error("\n❌ ERROR:", error.message);
    if (error.cause) {
      console.error("Cause:", error.cause.message);
    }
    process.exit(1);
  }
}

test();
