// Direct ServiceNow API test - bypasses all our code
import * as dotenv from "dotenv";
import { Buffer } from "node:buffer";

dotenv.config({ path: ".env.local" });

const INSTANCE_URL = process.env.SERVICENOW_INSTANCE_URL || process.env.SERVICENOW_URL;
const USERNAME = process.env.SERVICENOW_USERNAME;
const PASSWORD = process.env.SERVICENOW_PASSWORD;
const CASE_TABLE = process.env.SERVICENOW_CASE_TABLE || "x_mobit_serv_case_service_case";

console.log("\n=== Direct ServiceNow API Test ===");
console.log("Instance URL:", INSTANCE_URL);
console.log("Username:", USERNAME);
console.log("Table:", CASE_TABLE);
console.log("================================\n");

if (!INSTANCE_URL || !USERNAME || !PASSWORD) {
  console.error("Missing credentials!");
  process.exit(1);
}

async function testDirectAPI() {
  const auth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64");

  // Test 1: Simple query for ANY case (no filters)
  console.log("Test 1: Fetching ANY 5 cases from table...");
  const simpleUrl = `${INSTANCE_URL}/api/now/table/${CASE_TABLE}?sysparm_limit=5`;

  try {
    const response1 = await fetch(simpleUrl, {
      headers: {
        "Authorization": `Basic ${auth}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });

    console.log(`Status: ${response1.status} ${response1.statusText}`);
    const data1 = await response1.json();

    if (response1.ok) {
      console.log(`✓ Success! Found ${data1.result?.length ?? 0} cases`);
      if (data1.result && data1.result.length > 0) {
        const firstCase = data1.result[0];
        console.log("\nFirst case sample:");
        console.log("  Number:", firstCase.number?.display_value ?? firstCase.number);
        console.log("  Short Description:", firstCase.short_description?.display_value ?? firstCase.short_description);
        console.log("  Assignment Group:", firstCase.assignment_group?.display_value ?? "N/A");
        console.log("  Assigned To:", firstCase.assigned_to?.display_value ?? "Unassigned");
        console.log("  Active:", firstCase.active?.display_value ?? firstCase.active);
      }
    } else {
      console.log("✗ Failed:", data1);

      // Try checking permissions on the table
      console.log("\nTest 2: Checking table metadata...");
      const metaUrl = `${INSTANCE_URL}/api/now/table/sys_db_object?sysparm_query=name=${CASE_TABLE}`;
      const response2 = await fetch(metaUrl, {
        headers: {
          "Authorization": `Basic ${auth}`,
          "Accept": "application/json",
        },
      });

      console.log(`Meta Status: ${response2.status}`);
      if (response2.ok) {
        const metaData = await response2.json();
        console.log("Table exists:", metaData.result?.length > 0);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }

  // Test 3: Try querying assignment groups
  console.log("\n\nTest 3: Fetching assignment groups...");
  const groupUrl = `${INSTANCE_URL}/api/now/table/sys_user_group?sysparm_query=nameLIKEIncident%20and%20Case&sysparm_limit=10`;

  try {
    const response3 = await fetch(groupUrl, {
      headers: {
        "Authorization": `Basic ${auth}`,
        "Accept": "application/json",
      },
    });

    console.log(`Status: ${response3.status} ${response3.statusText}`);
    const data3 = await response3.json();

    if (response3.ok) {
      console.log(`✓ Found ${data3.result?.length ?? 0} matching groups`);
      data3.result?.forEach((group: any, i: number) => {
        console.log(`  ${i + 1}. ${group.name?.display_value ?? group.name} (${group.sys_id?.display_value ?? group.sys_id})`);
      });
    } else {
      console.log("✗ Failed:", data3);
    }
  } catch (error) {
    console.error("Error:", error);
  }

  // Test 4: Check user permissions
  console.log("\n\nTest 4: Checking current user info...");
  const userUrl = `${INSTANCE_URL}/api/now/table/sys_user?sysparm_query=user_name=${USERNAME}&sysparm_limit=1`;

  try {
    const response4 = await fetch(userUrl, {
      headers: {
        "Authorization": `Basic ${auth}`,
        "Accept": "application/json",
      },
    });

    console.log(`Status: ${response4.status}`);
    const data4 = await response4.json();

    if (response4.ok && data4.result?.length > 0) {
      const user = data4.result[0];
      console.log(`✓ User: ${user.name?.display_value ?? user.name}`);
      console.log(`  Email: ${user.email?.display_value ?? user.email}`);
      console.log(`  Active: ${user.active?.display_value ?? user.active}`);
      console.log(`  Roles: ${user.roles ?? "N/A"}`);
    } else {
      console.log("Could not fetch user info");
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

testDirectAPI()
  .then(() => {
    console.log("\n✅ Direct API test completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Direct API test failed:", error);
    process.exit(1);
  });
