import axios from "axios";
import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const SERVICENOW_URL = process.env.SERVICENOW_URL!;
const SERVICENOW_USERNAME = process.env.SERVICENOW_USERNAME!;
const SERVICENOW_PASSWORD = process.env.SERVICENOW_PASSWORD!;

const auth = {
  username: SERVICENOW_USERNAME,
  password: SERVICENOW_PASSWORD,
};

const baseURL = SERVICENOW_URL;

async function fixInteractionParent() {
  console.log("\n🔧 FIXING INTERACTION PARENT FIELD\n");
  console.log("=".repeat(80));

  const interactionSysId = "4dcd53ec47bc361085733525d36d43d6"; // IMS0001476
  const caseSysId = "f753b7c08378721039717000feaad385"; // SCS0049247

  try {
    // Get current state
    console.log("\n=== BEFORE UPDATE ===\n");
    const beforeResponse = await axios({
      method: "GET",
      url: `${baseURL}/api/now/table/interaction/${interactionSysId}`,
      params: {
        sysparm_display_value: "all",
        sysparm_fields: "number,parent,context_document,context_table",
      },
      auth,
      headers: { "Content-Type": "application/json" },
    });

    const before = beforeResponse.data.result;
    const interactionNumber = typeof before.number === 'object' ? before.number.display_value : before.number;
    console.log(`Interaction: ${interactionNumber}`);
    console.log(`  parent: ${before.parent?.value || 'NULL'}`);
    console.log(`  context_document: ${before.context_document?.value || 'NULL'}`);
    console.log(`  context_table: ${before.context_table?.value || 'NULL'}`);

    // Update the parent field
    console.log("\n=== UPDATING PARENT FIELD ===\n");
    const updateResponse = await axios({
      method: "PATCH",
      url: `${baseURL}/api/now/table/interaction/${interactionSysId}`,
      data: {
        parent: caseSysId,
      },
      auth,
      headers: { "Content-Type": "application/json" },
    });

    console.log(`✓ Updated interaction ${interactionNumber}`);
    console.log(`  Set parent to: ${caseSysId}`);

    // Get updated state
    console.log("\n=== AFTER UPDATE ===\n");
    const afterResponse = await axios({
      method: "GET",
      url: `${baseURL}/api/now/table/interaction/${interactionSysId}`,
      params: {
        sysparm_display_value: "all",
        sysparm_fields: "number,parent,context_document,context_table",
      },
      auth,
      headers: { "Content-Type": "application/json" },
    });

    const after = afterResponse.data.result;
    const afterNumber = typeof after.number === 'object' ? after.number.display_value : after.number;
    console.log(`Interaction: ${afterNumber}`);
    console.log(`  parent: ${after.parent?.value || 'NULL'} (${after.parent?.display_value || 'N/A'})`);
    console.log(`  context_document: ${after.context_document?.value || 'NULL'}`);
    console.log(`  context_table: ${after.context_table?.value || 'NULL'}`);

    // Verify it now appears in the case's interactions
    console.log("\n=== VERIFYING IN CASE RELATED LIST ===\n");
    const caseInteractionsResponse = await axios({
      method: "GET",
      url: `${baseURL}/api/now/table/interaction`,
      params: {
        sysparm_query: `parent=${caseSysId}`,
        sysparm_fields: "number,sys_id,parent",
        sysparm_display_value: "all",
      },
      auth,
      headers: { "Content-Type": "application/json" },
    });

    console.log(`Interactions with parent=${caseSysId}:`);
    caseInteractionsResponse.data.result.forEach((int: any) => {
      const isOurs = int.sys_id === interactionSysId;
      const num = typeof int.number === 'object' ? int.number.display_value : int.number;
      console.log(`  ${num} ${isOurs ? '← OUR INTERACTION ✓' : ''}`);
    });

    console.log("\n=== SUCCESS ===\n");
    console.log("The interaction should now appear in the case's related list!");
    console.log("\nGo to ServiceNow and check:");
    console.log(`  Case: SCS0049247`);
    console.log(`  Interaction: ${interactionNumber}`);
    console.log(`  Should now be visible in the Interactions related list!`);

  } catch (error: any) {
    console.error("Error:", error.response?.data || error.message);
  }

  console.log("\n" + "=".repeat(80));
}

fixInteractionParent().catch(console.error);
