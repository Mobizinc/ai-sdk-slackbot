#!/usr/bin/env node
/**
 * Test script for Azure Search vector similarity search
 */

import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

import { createAzureSearchService } from "../lib/services/azure-search";

async function testAzureSearch() {
  console.log("🔍 Testing Azure Search Vector Similarity...\n");

  // Check environment variables
  const requiredEnvVars = {
    AZURE_SEARCH_ENDPOINT: process.env.AZURE_SEARCH_ENDPOINT,
    AZURE_SEARCH_KEY: process.env.AZURE_SEARCH_KEY,
    AZURE_SEARCH_INDEX_NAME: process.env.AZURE_SEARCH_INDEX_NAME,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };

  console.log("Environment Configuration:");
  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (value) {
      const displayValue = key.includes("KEY") ? "***" + value.slice(-4) : value;
      console.log(`  ✅ ${key}: ${displayValue}`);
    } else {
      console.log(`  ❌ ${key}: NOT SET`);
    }
  }
  console.log();

  // Initialize service
  const searchService = createAzureSearchService();

  if (!searchService) {
    console.error("❌ Failed to initialize Azure Search service. Check your environment variables.");
    process.exit(1);
  }

  console.log("✅ Azure Search service initialized\n");

  // Test queries
  const testQueries = [
    "VPN connection timeout error",
    "user cannot access shared folder",
    "password reset issue",
  ];

  for (const query of testQueries) {
    console.log(`\n📝 Query: "${query}"`);
    console.log("─".repeat(60));

    try {
      const results = await searchService.searchSimilarCases(query, {
        topK: 3,
      });

      if (results.length === 0) {
        console.log("  No similar cases found");
      } else {
        console.log(`  Found ${results.length} similar cases:\n`);

        results.forEach((result, idx) => {
          console.log(`  ${idx + 1}. ${result.case_number} (score: ${result.score.toFixed(4)})`);
          const preview = result.content.substring(0, 100).replace(/\n/g, " ");
          console.log(`     ${preview}${result.content.length > 100 ? "..." : ""}`);
          console.log();
        });
      }
    } catch (error) {
      console.error(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("\n✅ Test complete");
}

// Run test
testAzureSearch().catch((error) => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});
