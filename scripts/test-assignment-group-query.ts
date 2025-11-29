// Test the specific assignment group query that's failing
import * as dotenv from "dotenv";
import { Buffer } from "node:buffer";

dotenv.config({ path: ".env.local" });

const INSTANCE_URL = process.env.SERVICENOW_INSTANCE_URL || process.env.SERVICENOW_URL;
const USERNAME = process.env.SERVICENOW_USERNAME;
const PASSWORD = process.env.SERVICENOW_PASSWORD;
const CASE_TABLE = process.env.SERVICENOW_CASE_TABLE || "x_mobit_serv_case_service_case";

console.log("\n=== Testing Assignment Group Queries ===\n");

if (!INSTANCE_URL || !USERNAME || !PASSWORD) {
  console.error("Missing credentials!");
  process.exit(1);
}

async function testQueries() {
  const auth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64");
  const headers = {
    "Authorization": `Basic ${auth}`,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };

  // Query 1: Use sys_id (the right way)
  console.log("Query 1: Using assignment group sys_id...");
  const query1 = `ORDERBYDESCopened_at^assignment_group=83dfe6f0c3ad3d10e78a0cbdc001312a^active=true`;
  const url1 = `${INSTANCE_URL}/api/now/table/${CASE_TABLE}?sysparm_query=${encodeURIComponent(query1)}&sysparm_limit=50&sysparm_offset=0&sysparm_display_value=all`;

  console.log("URL:", url1);
  try {
    const response = await fetch(url1, { headers });
    console.log(`Status: ${response.status} ${response.statusText}`);
    const data = await response.json();

    if (response.ok) {
      console.log(`✓ Found ${data.result?.length ?? 0} cases`);
      if (data.result && data.result.length > 0) {
        console.log("\nSample cases:");
        data.result.slice(0, 3).forEach((c: any, i: number) => {
          console.log(`  ${i + 1}. ${c.number?.display_value ?? c.number}`);
          console.log(`     Assigned: ${c.assigned_to?.display_value ?? "Unassigned"}`);
          console.log(`     Group: ${c.assignment_group?.display_value ?? "N/A"}`);
          console.log(`     Opened: ${c.opened_at?.display_value ?? c.opened_at}\n`);
        });
      }
    } else {
      console.log("✗ Failed:", JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error("Error:", error);
  }

  // Query 2: Use assignment_group.name with exact match
  console.log("\n\nQuery 2: Using assignment_group.name (exact)...");
  const query2 = `ORDERBYDESCopened_at^assignment_group.name=Incident and Case Management^active=true`;
  const url2 = `${INSTANCE_URL}/api/now/table/${CASE_TABLE}?sysparm_query=${encodeURIComponent(query2)}&sysparm_limit=50&sysparm_offset=0&sysparm_display_value=all`;

  console.log("Query:", query2);
  try {
    const response = await fetch(url2, { headers });
    console.log(`Status: ${response.status} ${response.statusText}`);
    const data = await response.json();

    if (response.ok) {
      console.log(`✓ Found ${data.result?.length ?? 0} cases`);
    } else {
      console.log("✗ Failed:", JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error("Error:", error);
  }

  // Query 3: The complex LIKE query that was failing
  console.log("\n\nQuery 3: Complex LIKE query (what our code generates)...");
  const query3 = `ORDERBYDESCopened_at^(assignment_group.nameLIKEIncident and Case Management^ORassignment_group.nameLIKEIncidentandCaseManagement^OR(assignment_group.nameLIKEIncident^assignment_group.nameLIKEand^assignment_group.nameLIKECase^assignment_group.nameLIKEManagement))^active=true`;
  const url3 = `${INSTANCE_URL}/api/now/table/${CASE_TABLE}?sysparm_query=${encodeURIComponent(query3)}&sysparm_limit=50&sysparm_offset=0&sysparm_display_value=all`;

  console.log("Query:", query3.substring(0, 150) + "...");
  try {
    const response = await fetch(url3, { headers });
    console.log(`Status: ${response.status} ${response.statusText}`);
    const data = await response.json();

    if (response.ok) {
      console.log(`✓ Found ${data.result?.length ?? 0} cases`);
    } else {
      console.log("✗ Failed:", JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error("Error:", error);
  }

  // Query 4: Get some recent cases to see what assignment groups exist
  console.log("\n\nQuery 4: Recent active cases (any group)...");
  const query4 = `ORDERBYDESCopened_at^active=true`;
  const url4 = `${INSTANCE_URL}/api/now/table/${CASE_TABLE}?sysparm_query=${encodeURIComponent(query4)}&sysparm_limit=20&sysparm_display_value=all`;

  try {
    const response = await fetch(url4, { headers });
    console.log(`Status: ${response.status}`);
    const data = await response.json();

    if (response.ok) {
      console.log(`✓ Found ${data.result?.length ?? 0} active cases`);

      // Count by assignment group
      const groupCounts = new Map<string, number>();
      data.result?.forEach((c: any) => {
        const group = c.assignment_group?.display_value ?? "Unassigned";
        groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
      });

      console.log("\nAssignment group distribution:");
      const sorted = Array.from(groupCounts.entries()).sort((a, b) => b[1] - a[1]);
      sorted.forEach(([group, count]) => {
        console.log(`  ${group}: ${count} cases`);
      });
    } else {
      console.log("✗ Failed:", data);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

testQueries()
  .then(() => {
    console.log("\n✅ Query testing completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Query testing failed:", error);
    process.exit(1);
  });
