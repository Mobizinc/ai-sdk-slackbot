// Load environment variables FIRST before any imports
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

console.log("\n=== Environment Check ===");
console.log("SERVICENOW_INSTANCE_URL:", process.env.SERVICENOW_INSTANCE_URL);
console.log("SERVICENOW_URL:", process.env.SERVICENOW_URL);
console.log("SERVICENOW_USERNAME:", process.env.SERVICENOW_USERNAME ? "✓ Set" : "✗ Missing");
console.log("SERVICENOW_PASSWORD:", process.env.SERVICENOW_PASSWORD ? "✓ Set" : "✗ Missing");

// Need to load config BEFORE importing ServiceNow services
// Force config to load from env vars
process.env.SERVICENOW_URL = process.env.SERVICENOW_INSTANCE_URL || process.env.SERVICENOW_URL;

console.log("Setting SERVICENOW_URL:", process.env.SERVICENOW_URL);
console.log("========================\n");

// NOW we can load config which will read from env
import { refreshConfig } from "../lib/config";

async function testLeaderboardQuery() {
  console.log("🔄 Refreshing config from environment...");
  const loadedConfig = await refreshConfig();
  console.log("Config loaded:", {
    servicenowUrl: loadedConfig.servicenowUrl,
    servicenowInstanceUrl: loadedConfig.servicenowInstanceUrl,
    servicenowUsername: loadedConfig.servicenowUsername ? "✓ Set" : "✗ Missing",
  });

  // NOW import services AFTER config is loaded
  const { CaseSearchService } = await import("../lib/services/case-search-service");

  const TARGET_ASSIGNMENT_GROUP = "Incident and Case Management";
  const SEARCH_PAGE_SIZE = 50;

  console.log("\n🔍 Testing Leaderboard Query");
  console.log(`Target Group: "${TARGET_ASSIGNMENT_GROUP}"`);
  console.log(`Page Size: ${SEARCH_PAGE_SIZE}\n`);

  const caseSearchService = new CaseSearchService();
  const start = new Date();
  start.setDate(start.getDate() - 7); // Last 7 days

  console.log(`Looking for cases from: ${start.toISOString()}\n`);

  try {
    // Test 1: Get ALL active cases (no date filter - like stale case query)
    console.log("📋 Test 1: Fetching ALL active cases for assignment group...");
    const result = await caseSearchService.searchWithMetadata({
      assignmentGroup: TARGET_ASSIGNMENT_GROUP,
      activeOnly: true,
      includeChildDomains: true,
      limit: SEARCH_PAGE_SIZE,
      offset: 0,
    });

    console.log(`✓ Fetched ${result.cases.length} cases`);
    console.log(`  hasMore: ${result.hasMore}`);
    console.log(`  nextOffset: ${result.nextOffset}`);
    console.log(`  totalCount: ${result.totalFound ?? "N/A"}\n`);

    if (result.cases.length > 0) {
      console.log("Sample cases:");
      result.cases.slice(0, 5).forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.number} - Assigned: ${c.assignedTo ?? "Unassigned"}`);
        console.log(`     Created: ${c.openedAt?.toISOString() ?? "N/A"}`);
        console.log(`     State: ${c.state ?? "N/A"}, Active: ${c.active ?? "N/A"}\n`);
      });

      // Test 2: Filter for cases created in last 7 days
      console.log("📋 Test 2: Filtering cases created in last 7 days...");
      const recentCases = result.cases.filter(c => {
        if (!c.openedAt) return false;
        return c.openedAt.getTime() >= start.getTime();
      });

      console.log(`✓ Found ${recentCases.length} cases created in last 7 days`);

      if (recentCases.length > 0) {
        console.log("Recent cases:");
        recentCases.slice(0, 5).forEach((c, i) => {
          console.log(`  ${i + 1}. ${c.number} - ${c.assignedTo ?? "Unassigned"}`);
          console.log(`     Created: ${c.openedAt?.toISOString()}\n`);
        });
      }

      // Test 3: Aggregate by assignee
      console.log("📋 Test 3: Aggregating by assignee...");
      const byAssignee = new Map<string, number>();
      result.cases.forEach(c => {
        const assignee = c.assignedTo ?? "Unassigned";
        byAssignee.set(assignee, (byAssignee.get(assignee) || 0) + 1);
      });

      console.log(`✓ Found ${byAssignee.size} unique assignees:`);
      const sorted = Array.from(byAssignee.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      sorted.forEach(([name, count], i) => {
        console.log(`  ${i + 1}. ${name}: ${count} cases`);
      });
    } else {
      console.log("⚠️  NO CASES FOUND!");
      console.log("\nThis is the problem. The query should return cases but returns 0.");
      console.log("Possible issues:");
      console.log("1. Assignment group name is incorrect");
      console.log("2. Domain filtering is excluding cases");
      console.log("3. activeOnly filter is too restrictive");
      console.log("4. API credentials lack permissions");
    }

  } catch (error) {
    console.error("\n❌ Error during test:", error);
    if (error instanceof Error) {
      console.error("Stack:", error.stack);
    }
    throw error;
  }
}

testLeaderboardQuery()
  .then(() => {
    console.log("\n✅ Test completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });
