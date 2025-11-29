import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { getTableApiClient } from '../lib/infrastructure/servicenow/repositories/factory';
import { buildFlexibleLikeQuery } from '../lib/infrastructure/servicenow/repositories/query-builders';

async function testQuery() {
  const tableApiClient = getTableApiClient();

  // Test 1: Simple assignment group query (just active cases)
  const groups = ["Incident and Case Management", "Network Engineers"];
  const clauses = groups
    .map((group) => buildFlexibleLikeQuery("assignment_group.name", group))
    .filter((clause): clause is string => clause !== undefined);
  const filter = clauses.length > 1 ? `(${clauses.join("^OR")})` : clauses[0];

  console.log("Test 1: Simple query - just assignment group + active");
  console.log("Query:", `${filter}^active=true`);

  try {
    const results = await tableApiClient.fetchAll('sn_customerservice_case', {
      sysparm_query: `${filter}^active=true`,
      sysparm_fields: 'sys_id,number,assignment_group,assigned_to',
      sysparm_display_value: 'all',
      pageSize: 5,
      maxRecords: 5,
    });

    console.log(`✅ SUCCESS! Found ${results.length} active cases\n`);
    if (results.length > 0) {
      console.log(`First case: ${results[0].number}`);
    }
  } catch (error) {
    console.error("❌ FAILED:", error instanceof Error ? error.message : error);
  }
}

testQuery().catch(console.error);
