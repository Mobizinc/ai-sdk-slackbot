// Load environment variables BEFORE any other imports
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { getTableApiClient } from '../lib/infrastructure/servicenow/repositories/factory';

async function testQuery() {
  const tableApiClient = getTableApiClient();

  // Build the query exactly as the leaderboard does
  const groups = ["Incident and Case Management", "Network Engineers"];
  const baseFilter = groups
    .map((group) => `assignment_group.nameLIKE${group}`)
    .join("^OR");

  const startDate = "2025-11-08 00:00:00";
  const query = `(${baseFilter})^(opened_at>=${startDate}^ORresolved_at>=${startDate}^ORclosed_at>=${startDate}^ORactive=true)`;

  console.log("Testing ServiceNow query:");
  console.log("Query:", query);
  console.log("\nFetching from sn_customerservice_case table...\n");

  try {
    const results = await tableApiClient.fetchAll('sn_customerservice_case', {
      sysparm_query: query,
      sysparm_fields: 'sys_id,number,assignment_group,assigned_to,opened_at,resolved_at,closed_at,active,state',
      sysparm_display_value: 'all',
      pageSize: 10,
      maxRecords: 10,
    });

    console.log(`✅ Query succeeded! Found ${results.length} records`);

    if (results.length > 0) {
      console.log("\nFirst few records:");
      results.slice(0, 3).forEach((record, i) => {
        console.log(`\n${i + 1}. ${record.number}`);
        console.log(`   Assignment Group: ${typeof record.assignment_group === 'object' ? record.assignment_group.display_value : record.assignment_group}`);
        console.log(`   Assigned To: ${typeof record.assigned_to === 'object' ? record.assigned_to.display_value : record.assigned_to}`);
        console.log(`   Opened: ${record.opened_at}`);
        console.log(`   Resolved: ${record.resolved_at || 'N/A'}`);
        console.log(`   Active: ${record.active}`);
      });
    } else {
      console.log("\n⚠️  No records found matching the query");
      console.log("This means either:");
      console.log("1. The query syntax is still wrong");
      console.log("2. There really are no cases in Nov 8-15 period");
      console.log("3. The assignment group names don't match");
    }

  } catch (error) {
    console.error("❌ Query failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
  }
}

testQuery().catch(console.error);
