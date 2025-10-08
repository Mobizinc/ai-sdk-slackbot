/**
 * Test that all modules can be imported without errors
 */

console.log("Testing module imports...\n");

try {
  console.log("1. Importing model-provider...");
  const { modelProvider, getActiveModelId } = require("../lib/model-provider");
  console.log(`   ✅ Model provider loaded, active model: ${getActiveModelId()}`);
} catch (error: any) {
  console.error(`   ❌ Error:`, error.message);
  process.exit(1);
}

try {
  console.log("2. Importing generate-response...");
  const { generateResponse } = require("../lib/generate-response");
  console.log(`   ✅ Generate response loaded`);
} catch (error: any) {
  console.error(`   ❌ Error:`, error.message);
  process.exit(1);
}

try {
  console.log("3. Importing azure-search service...");
  const { createAzureSearchService } = require("../lib/services/azure-search");
  console.log(`   ✅ Azure search service loaded`);
} catch (error: any) {
  console.error(`   ❌ Error:`, error.message);
  process.exit(1);
}

console.log("\n✅ All modules loaded successfully!");
console.log("TypeScript compilation issue is unrelated to module imports.\n");
