/**
 * Environment sanity check for Anthropic-native runtime
 */

import * as dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

console.log("=".repeat(60));
console.log("ANTHROPIC CONFIGURATION CHECK");
console.log("=".repeat(60));
console.log();

console.log("Anthropic:");
console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "SET" : "NOT SET"}`);
console.log(`  ANTHROPIC_MODEL: ${process.env.ANTHROPIC_MODEL || "(default)"}`);
console.log();

console.log("OpenAI Embeddings:");
console.log(`  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? "SET" : "NOT SET"}`);
console.log(`  CASE_EMBEDDING_MODEL: ${process.env.CASE_EMBEDDING_MODEL || "text-embedding-3-small"}`);
console.log();

console.log("LangSmith:");
console.log(`  LANGSMITH_API_KEY: ${process.env.LANGSMITH_API_KEY ? "SET" : "NOT SET"}`);
console.log(`  LANGSMITH_TRACING: ${process.env.LANGSMITH_TRACING || "false"}`);
console.log();

console.log("Current SDK versions:");
const pkg = require("../package.json");
console.log(`  @anthropic-ai/sdk: ${pkg.dependencies["@anthropic-ai/sdk"]}`);
console.log(`  openai: ${pkg.dependencies.openai}`);
console.log();

console.log("=".repeat(60));
