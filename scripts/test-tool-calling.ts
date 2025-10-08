/**
 * Test tool calling with AI Gateway (GLM-4.6)
 * Tests ServiceNow tool execution
 */

import { generateResponse } from "../lib/generate-response";

async function test() {
  console.log("Testing AI Gateway tool calling with GLM-4.6...\n");

  try {
    const messages = [
      {
        role: "user" as const,
        content: "Get me the details for case SCS0048417"
      }
    ];

    const response = await generateResponse(messages);

    console.log("\n✅ SUCCESS!");
    console.log("Response:\n");
    console.log(response);
  } catch (error: any) {
    console.error("\n❌ ERROR:", error.message);
    if (error.cause) {
      console.error("Cause:", error.cause.message);
    }
    if (error.stack) {
      console.error("\nStack:", error.stack);
    }
    process.exit(1);
  }
}

test();
