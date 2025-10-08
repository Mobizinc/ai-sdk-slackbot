/**
 * Test to verify environment setup for production Gateway usage
 * Shows what auth tokens are available
 */

import * as dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

console.log("=".repeat(60));
console.log("PRODUCTION ENVIRONMENT CHECK");
console.log("=".repeat(60));
console.log();

console.log("AI Gateway Configuration:");
console.log(`  AI_GATEWAY_API_KEY: ${process.env.AI_GATEWAY_API_KEY ? `${process.env.AI_GATEWAY_API_KEY.substring(0, 15)}...` : "NOT SET"}`);
console.log(`  VERCEL_OIDC_TOKEN: ${process.env.VERCEL_OIDC_TOKEN ? "SET (expires in 12h)" : "NOT SET"}`);
console.log();

console.log("OpenAI Fallback:");
console.log(`  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? "SET" : "NOT SET"}`);
console.log(`  OPENAI_FALLBACK_MODEL: ${process.env.OPENAI_FALLBACK_MODEL || "gpt-5-mini (default)"}`);
console.log();

console.log("Expected behavior:");
if (process.env.VERCEL_OIDC_TOKEN) {
  console.log("  ✅ Gateway will use OIDC token (production environment)");
} else if (process.env.AI_GATEWAY_API_KEY) {
  console.log("  ⚠️  Gateway API key present but OIDC token missing");
  console.log("      This is expected locally - deploy to test Gateway");
  console.log("      Production environment will have OIDC token automatically");
} else {
  console.log("  ℹ️  No Gateway configured - using OpenAI fallback");
}
console.log();

console.log("Current AI SDK version:");
const pkg = require("../package.json");
console.log(`  ai: ${pkg.dependencies.ai}`);
console.log(`  @ai-sdk/gateway: ${pkg.dependencies["@ai-sdk/gateway"]}`);
console.log(`  @ai-sdk/openai: ${pkg.dependencies["@ai-sdk/openai"]}`);
console.log();

console.log("=".repeat(60));
