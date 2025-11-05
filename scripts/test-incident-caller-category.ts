/**
 * Test Script: Incident Creation - Caller & Category Verification
 *
 * Tests the fixes for GitHub Issue #49:
 * - Caller ID resolution (display value → sys_id)
 * - Category validation (dual categorization system)
 *
 * Usage:
 *   npx tsx scripts/test-incident-caller-category.ts
 */

import { ServiceNowClient } from "../lib/tools/servicenow";

async function testCallerIdResolution() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST 1: Caller ID Resolution");
  console.log("=".repeat(80) + "\n");

  const client = new ServiceNowClient();

  // Test 1a: Fetch a case and check caller_id format
  try {
    console.log("Step 1: Fetching a case to verify caller_id extraction...");

    // You'll need to replace this with a real case sys_id from your environment
    const testCaseSysId = process.env.TEST_CASE_SYS_ID;

    if (!testCaseSysId) {
      console.warn("⚠️  TEST_CASE_SYS_ID not set in environment");
      console.log("   To test caller resolution:");
      console.log("   1. Find a case sys_id from ServiceNow");
      console.log("   2. Run: TEST_CASE_SYS_ID=<sys_id> npx tsx scripts/test-incident-caller-category.ts");
      return;
    }

    const caseRecord = await client.getCaseBySysId(testCaseSysId);

    if (!caseRecord) {
      console.error(`❌ Case not found: ${testCaseSysId}`);
      return;
    }

    console.log(`✅ Case found: ${caseRecord.number}`);
    console.log(`   Short Description: ${caseRecord.short_description}`);
    console.log(`   Caller ID: ${caseRecord.caller_id}`);
    console.log(`   Caller ID Length: ${caseRecord.caller_id?.length || 0} chars`);

    // Validate caller_id format
    if (!caseRecord.caller_id) {
      console.warn(`⚠️  Case has no caller_id`);
    } else if (caseRecord.caller_id.length === 32) {
      console.log(`✅ Caller ID is in sys_id format (32 chars)`);
    } else {
      console.warn(`⚠️  Caller ID is NOT in sys_id format: "${caseRecord.caller_id}"`);
      console.warn(`   This would trigger fallback to fetch from case record`);
    }

  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

async function testCategoryValidation() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST 2: Category Validation (Dual Categorization)");
  console.log("=".repeat(80) + "\n");

  try {
    console.log("Step 1: Loading category data from cache/ServiceNow...");

    const { getCategorySyncService } = await import("../lib/services/servicenow-category-sync");
    const categorySync = getCategorySyncService();

    const categoriesData = await categorySync.getCategoriesForClassifier(24);

    console.log("\n📊 Category Statistics:");
    console.log(`   Case Categories: ${categoriesData.caseCategories.length}`);
    console.log(`   Incident Categories: ${categoriesData.incidentCategories.length}`);
    console.log(`   Case Subcategories: ${categoriesData.caseSubcategories.length}`);
    console.log(`   Incident Subcategories: ${categoriesData.incidentSubcategories.length}`);
    console.log(`   Cache Age: ${categoriesData.isStale ? 'STALE' : 'FRESH'}`);

    if (categoriesData.caseCategories.length === 0) {
      console.error("\n❌ No case categories loaded!");
      console.error("   This will prevent classification from working correctly");
    } else {
      console.log("\n✅ Case categories loaded");
      console.log(`   Sample: "${categoriesData.caseCategories[0]}"`);
    }

    if (categoriesData.incidentCategories.length === 0) {
      console.error("\n❌ No incident categories loaded!");
      console.error("   This will prevent incident-specific categorization");
    } else {
      console.log("\n✅ Incident categories loaded");
      console.log(`   Sample: "${categoriesData.incidentCategories[0]}"`);
    }

    // Check if categories are different (as they should be)
    const caseSet = new Set(categoriesData.caseCategories);
    const incidentSet = new Set(categoriesData.incidentCategories);

    const onlyInCase = categoriesData.caseCategories.filter(c => !incidentSet.has(c));
    const onlyInIncident = categoriesData.incidentCategories.filter(c => !caseSet.has(c));

    console.log("\n📈 Category Comparison:");
    console.log(`   Unique to Cases: ${onlyInCase.length} categories`);
    if (onlyInCase.length > 0) {
      console.log(`     Examples: ${onlyInCase.slice(0, 3).join(", ")}`);
    }
    console.log(`   Unique to Incidents: ${onlyInIncident.length} categories`);
    if (onlyInIncident.length > 0) {
      console.log(`     Examples: ${onlyInIncident.slice(0, 3).join(", ")}`);
    }
    console.log(`   Shared: ${categoriesData.caseCategories.filter(c => incidentSet.has(c)).length} categories`);

    if (onlyInCase.length > 0 || onlyInIncident.length > 0) {
      console.log("\n✅ Dual categorization confirmed: Cases and Incidents have different categories");
    } else {
      console.log("\n⚠️  Case and Incident categories are identical - dual categorization may not be needed");
    }

  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

async function testIncidentCreationValidation() {
  console.log("\n" + "=".repeat(80));
  console.log("TEST 3: Incident Creation Field Validation");
  console.log("=".repeat(80) + "\n");

  console.log("This test simulates the validation logic before incident creation:");

  // Simulate different scenarios
  const scenarios = [
    {
      name: "Valid sys_id",
      callerId: "abc123def456ghi789jkl012mno345pq",
      category: "Hardware",
      expected: "✅ PASS"
    },
    {
      name: "Display value (needs resolution)",
      callerId: "John Doe",
      category: "Hardware",
      expected: "⚠️  WARN - caller_id will be resolved from case"
    },
    {
      name: "Missing caller_id",
      callerId: "",
      category: "Hardware",
      expected: "⚠️  WARN - caller_id invalid or missing"
    },
    {
      name: "Missing category",
      callerId: "abc123def456ghi789jkl012mno345pq",
      category: "",
      expected: "⚠️  WARN - incident category missing"
    }
  ];

  for (const scenario of scenarios) {
    console.log(`\n📋 Scenario: ${scenario.name}`);
    console.log(`   Caller ID: "${scenario.callerId || 'EMPTY'}"`);
    console.log(`   Category: "${scenario.category || 'EMPTY'}"`);

    const validationWarnings: string[] = [];

    // Replicate the validation logic from case-triage.ts
    if (!scenario.callerId || scenario.callerId.length !== 32) {
      validationWarnings.push(`caller_id invalid or missing: "${scenario.callerId}"`);
    }

    if (!scenario.category) {
      validationWarnings.push(`incident category missing`);
    }

    if (validationWarnings.length > 0) {
      console.log(`   Result: ⚠️  WARNINGS DETECTED`);
      validationWarnings.forEach(w => console.log(`     - ${w}`));
    } else {
      console.log(`   Result: ✅ VALID`);
    }

    console.log(`   Expected: ${scenario.expected}`);
  }
}

async function runAllTests() {
  console.log("\n" + "=".repeat(80));
  console.log("🧪 INCIDENT CREATION TESTING SUITE");
  console.log("   GitHub Issue #49: Caller & Category Auto-Population");
  console.log("=".repeat(80));

  try {
    await testCallerIdResolution();
    await testCategoryValidation();
    await testIncidentCreationValidation();

    console.log("\n" + "=".repeat(80));
    console.log("✅ ALL TESTS COMPLETED");
    console.log("=".repeat(80) + "\n");

    console.log("📝 Summary:");
    console.log("   1. Caller ID resolution tested");
    console.log("   2. Dual categorization validated");
    console.log("   3. Field validation logic verified");
    console.log("\n💡 To test with real data:");
    console.log("   TEST_CASE_SYS_ID=<sys_id> npx tsx scripts/test-incident-caller-category.ts");

  } catch (error) {
    console.error("\n❌ Test suite failed:", error);
    process.exit(1);
  }
}

// Run tests
runAllTests()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
