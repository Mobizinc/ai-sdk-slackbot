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

async function verifyCaseInteractions() {
  console.log("\n✅ VERIFYING CASE INTERACTIONS AFTER FIX\n");
  console.log("=".repeat(80));

  try {
    // Check the main test case
    const caseSysId = "f753b7c08378721039717000feaad385"; // SCS0049247
    const caseNumber = "SCS0049247";

    console.log(`\n=== Case: ${caseNumber} ===\n`);

    // Get case details
    const caseResponse = await axios({
      method: "GET",
      url: `${SERVICENOW_URL}/api/now/table/x_mobit_serv_case_service_case/${caseSysId}`,
      params: {
        sysparm_fields: "number,short_description,state",
        sysparm_display_value: "all",
      },
      auth,
      headers: { "Content-Type": "application/json" },
    });

    const caseData = caseResponse.data.result;
    console.log(`Case Number: ${caseData.number?.display_value || caseData.number}`);
    console.log(`Description: ${caseData.short_description?.display_value || caseData.short_description}`);
    console.log(`State: ${caseData.state?.display_value || caseData.state}`);

    // Get all interactions linked to this case via parent field
    console.log("\n=== Interactions Linked via Parent Field ===\n");

    const parentInteractionsResponse = await axios({
      method: "GET",
      url: `${SERVICENOW_URL}/api/now/table/interaction`,
      params: {
        sysparm_query: `parent=${caseSysId}`,
        sysparm_fields: "number,sys_id,type,direction,opened_at,closed_at,short_description,parent",
        sysparm_display_value: "all",
        sysparm_order_by: "^ORDERBYDESCopened_at",
      },
      auth,
      headers: { "Content-Type": "application/json" },
    });

    const parentInteractions = parentInteractionsResponse.data.result;
    console.log(`Found ${parentInteractions.length} interactions with parent=${caseSysId}`);

    if (parentInteractions.length > 0) {
      console.log("\nInteraction Details:");
      parentInteractions.forEach((int: any, index: number) => {
        const num = int.number?.display_value || int.number;
        const type = int.type?.display_value || int.type;
        const direction = int.direction?.display_value || int.direction;
        const openedAt = int.opened_at?.display_value || int.opened_at;
        const desc = int.short_description?.display_value || int.short_description;

        console.log(`\n  ${index + 1}. ${num}`);
        console.log(`     Type: ${type}`);
        console.log(`     Direction: ${direction}`);
        console.log(`     Opened: ${openedAt}`);
        console.log(`     Description: ${desc?.substring(0, 80)}${desc?.length > 80 ? '...' : ''}`);
        console.log(`     Parent: ${int.parent?.value || 'NULL'} ✓`);
      });
    }

    // Also check context_document for comparison
    console.log("\n=== Interactions via Context Document (for comparison) ===\n");

    const contextInteractionsResponse = await axios({
      method: "GET",
      url: `${SERVICENOW_URL}/api/now/table/interaction`,
      params: {
        sysparm_query: `context_document=${caseSysId}^parentISEMPTY`,
        sysparm_fields: "number,parent,context_document",
        sysparm_display_value: "all",
      },
      auth,
      headers: { "Content-Type": "application/json" },
    });

    const orphanedInteractions = contextInteractionsResponse.data.result;
    console.log(`Found ${orphanedInteractions.length} interactions with context_document but NO parent field`);

    if (orphanedInteractions.length > 0) {
      console.log("\n⚠️  WARNING: These interactions still need parent field backfill:");
      orphanedInteractions.forEach((int: any) => {
        const num = int.number?.display_value || int.number;
        console.log(`  ${num}: context_document=${int.context_document?.value}, parent=NULL`);
      });
    } else {
      console.log("✓ All interactions have parent field set!");
    }

    // Summary
    console.log("\n=== VERIFICATION SUMMARY ===\n");
    console.log(`✓ Case: ${caseNumber}`);
    console.log(`✓ Interactions with parent field: ${parentInteractions.length}`);
    console.log(`✓ Interactions without parent field: ${orphanedInteractions.length}`);

    if (parentInteractions.length > 0 && orphanedInteractions.length === 0) {
      console.log("\n✅ SUCCESS: All interactions are properly linked to the case!");
      console.log("They should all be visible in the ServiceNow UI on the case form.");
    } else if (orphanedInteractions.length > 0) {
      console.log("\n⚠️  WARNING: Some interactions are missing parent field.");
      console.log("Run the backfill script to fix them:");
      console.log("  DRY_RUN=false npx tsx scripts/backfill-interaction-parent-field.ts");
    }

  } catch (error: any) {
    console.error("\n✗ Verification failed:", error.message);
    if (error.response?.data) {
      console.error("ServiceNow Error:", JSON.stringify(error.response.data, null, 2));
    }
  }

  console.log("\n" + "=".repeat(80));
}

verifyCaseInteractions().catch(console.error);
