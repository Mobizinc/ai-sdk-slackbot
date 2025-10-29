/**
 * Test that all modules can be imported without errors
 */

console.log("Testing module imports...
");

try {
  console.log("1. Importing Anthropic chat service...");
  const { AnthropicChatService } = require("../lib/services/anthropic-chat");
  AnthropicChatService.getInstance();
  console.log("   ✅ Anthropic chat service loaded");
} catch (error) {
  console.error("   ❌ Error:", (error as Error).message);
  process.exit(1);
}

try {
  console.log("2. Importing generate-response...");
  const { generateResponse } = require("../lib/generate-response");
  console.log("   ✅ Generate response loaded");
} catch (error) {
  console.error("   ❌ Error:", (error as Error).message);
  process.exit(1);
}

try {
  console.log("3. Importing azure-search service...");
  const { createAzureSearchService } = require("../lib/services/azure-search");
  console.log("   ✅ Azure search service loaded");
} catch (error) {
  console.error("   ❌ Error:", (error as Error).message);
  process.exit(1);
}

console.log("
✅ All modules loaded successfully!
");
