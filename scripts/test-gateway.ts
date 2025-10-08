/**
 * Test script for AI Gateway integration
 * Tests GLM-4.6 model with a simple prompt
 *
 * Usage: npx tsx scripts/test-gateway.ts
 */

// IMPORTANT: Load .env.local BEFORE any imports that use env vars
import * as dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

// Now import modules that read env vars at module load time
import { generateResponse } from "../lib/generate-response";

async function testGateway() {
  console.log("=".repeat(60));
  console.log("Testing AI Gateway with GLM-4.6");
  console.log("=".repeat(60));
  console.log();

  // Debug: Check env vars
  console.log("🔍 Environment Check:");
  console.log(`  AI_GATEWAY_API_KEY: ${process.env.AI_GATEWAY_API_KEY ? '✅ SET (' + process.env.AI_GATEWAY_API_KEY.substring(0, 10) + '...)' : '❌ NOT SET'}`);
  console.log(`  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ SET (' + process.env.OPENAI_API_KEY.substring(0, 10) + '...)' : '❌ NOT SET'}`);
  console.log();

  try {
    console.log("📤 Sending test message: 'Hello, what is 2+2?'");
    console.log();

    const messages = [
      { role: "user" as const, content: "Hello, what is 2+2?" }
    ];

    const response = await generateResponse(messages);

    console.log();
    console.log("=".repeat(60));
    console.log("✅ SUCCESS - Response received:");
    console.log("=".repeat(60));
    console.log(response);
    console.log();
  } catch (error) {
    console.log();
    console.log("=".repeat(60));
    console.log("❌ ERROR:");
    console.log("=".repeat(60));
    console.error(error);
    console.log();
    process.exit(1);
  }
}

testGateway();
