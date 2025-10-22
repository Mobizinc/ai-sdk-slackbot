import { serviceNowClient } from "../lib/tools/servicenow";
import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function testInteractionCreation() {
  console.log("\n🧪 TESTING INTERACTION CREATION WITH PARENT FIELD FIX\n");
  console.log("=".repeat(80));

  try {
    // Test with case SCS0049247
    const caseSysId = "f753b7c08378721039717000feaad385";
    const caseNumber = "SCS0049247";

    console.log("\n=== Creating New Interaction ===\n");
    console.log(`Target Case: ${caseNumber} (${caseSysId})`);

    const result = await serviceNowClient.createPhoneInteraction({
      caseSysId,
      caseNumber,
      channel: "phone",
      direction: "inbound",
      phoneNumber: "+14097906402",
      sessionId: `test-parent-fix-${Date.now()}`,
      startTime: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      endTime: new Date(),
      durationSeconds: 300,
      agentName: "Test Agent",
      queueName: "Support Queue",
      summary: "Test interaction with parent field fix",
      notes: "This interaction was created to verify the parent field fix. It should appear in the case's related interactions list.",
    });

    console.log("\n✓ Interaction Created Successfully!");
    console.log(`  Number: ${result.interaction_number}`);
    console.log(`  Sys ID: ${result.interaction_sys_id}`);
    console.log(`  URL: ${result.interaction_url}`);

    // Verify the interaction has the parent field set
    console.log("\n=== Verifying Parent Field ===\n");

    const axios = await import("axios");
    const SERVICENOW_URL = process.env.SERVICENOW_URL!;
    const auth = {
      username: process.env.SERVICENOW_USERNAME!,
      password: process.env.SERVICENOW_PASSWORD!,
    };

    const response = await axios.default({
      method: "GET",
      url: `${SERVICENOW_URL}/api/now/table/interaction/${result.interaction_sys_id}`,
      params: {
        sysparm_fields: "number,parent,context_document,context_table",
        sysparm_display_value: "all",
      },
      auth,
      headers: { "Content-Type": "application/json" },
    });

    const interaction = response.data.result;
    const displayNumber = typeof interaction.number === 'object'
      ? interaction.number.display_value
      : interaction.number;

    console.log(`Interaction ${displayNumber}:`);
    console.log(`  parent: ${interaction.parent?.value || 'NULL'}`);
    console.log(`  context_document: ${interaction.context_document?.value || 'NULL'}`);
    console.log(`  context_table: ${interaction.context_table?.value || 'NULL'}`);

    if (interaction.parent?.value === caseSysId) {
      console.log("\n✓ PASS: Parent field is correctly set!");
    } else {
      console.log("\n✗ FAIL: Parent field is NOT set correctly!");
    }

    // Query case's interactions to verify it appears in the list
    console.log("\n=== Verifying in Case Related List ===\n");

    const caseInteractionsResponse = await axios.default({
      method: "GET",
      url: `${SERVICENOW_URL}/api/now/table/interaction`,
      params: {
        sysparm_query: `parent=${caseSysId}`,
        sysparm_fields: "number,sys_id",
        sysparm_display_value: "all",
        sysparm_limit: 20,
      },
      auth,
      headers: { "Content-Type": "application/json" },
    });

    console.log(`Found ${caseInteractionsResponse.data.result.length} interactions linked to case ${caseNumber}:`);

    let foundOurInteraction = false;
    caseInteractionsResponse.data.result.forEach((int: any) => {
      const sysId = typeof int.sys_id === 'object' ? int.sys_id.value : int.sys_id;
      const isOurs = sysId === result.interaction_sys_id;
      const num = typeof int.number === 'object' ? int.number.display_value : int.number;
      console.log(`  ${num} (${sysId}) ${isOurs ? '← NEW INTERACTION ✓' : ''}`);
      if (isOurs) foundOurInteraction = true;
    });

    if (foundOurInteraction) {
      console.log("\n✓ SUCCESS: New interaction appears in case related list!");
    } else {
      console.log("\n✗ FAIL: New interaction does NOT appear in case related list!");
    }

    console.log("\n=== Test Complete ===\n");
    console.log("Check ServiceNow UI:");
    console.log(`  Case: ${caseNumber}`);
    console.log(`  Interaction: ${result.interaction_number}`);
    console.log(`  Should be visible in Interactions tab on the case form!`);
    console.log(`  URL: ${result.interaction_url}`);

  } catch (error: any) {
    console.error("\n✗ Test Failed:", error.message);
    if (error.response?.data) {
      console.error("ServiceNow Error:", JSON.stringify(error.response.data, null, 2));
    }
  }

  console.log("\n" + "=".repeat(80));
}

testInteractionCreation().catch(console.error);
