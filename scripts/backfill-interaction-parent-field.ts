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

interface Interaction {
  sys_id: string;
  number: string;
  parent?: { value: string };
  context_document?: { value: string };
  context_table?: { value: string };
}

async function backfillParentField() {
  console.log("\n🔧 BACKFILLING PARENT FIELD FOR EXISTING INTERACTIONS\n");
  console.log("=".repeat(80));

  try {
    // Query for interactions that have context_document but no parent
    console.log("\n=== Querying for Interactions Missing Parent Field ===\n");

    const queryResponse = await axios({
      method: "GET",
      url: `${baseURL}/api/now/table/interaction`,
      params: {
        sysparm_query: "context_table=x_mobit_serv_case_service_case^context_documentISNOTEMPTY^parentISEMPTY",
        sysparm_fields: "sys_id,number,parent,context_document,context_table",
        sysparm_display_value: "all",
        sysparm_limit: 100, // Process in batches
      },
      auth,
      headers: { "Content-Type": "application/json" },
    });

    const interactions: Interaction[] = queryResponse.data.result;

    console.log(`Found ${interactions.length} interactions needing parent field backfill`);

    if (interactions.length === 0) {
      console.log("\n✓ No interactions need backfilling. All done!");
      return;
    }

    // Display first 10 for review
    console.log("\nSample interactions (first 10):");
    interactions.slice(0, 10).forEach((int) => {
      const num = typeof int.number === 'object' ? (int.number as any).display_value : int.number;
      const contextDoc = int.context_document?.value || 'NULL';
      console.log(`  ${num}: context_document=${contextDoc}, parent=NULL`);
    });

    // Confirm before proceeding
    console.log(`\n⚠️  About to update ${interactions.length} interaction records`);
    console.log("This will set parent = context_document for each interaction");

    // For safety, require explicit confirmation in production
    const isDryRun = process.env.DRY_RUN !== "false";
    if (isDryRun) {
      console.log("\n🔍 DRY RUN MODE - No changes will be made");
      console.log("Set DRY_RUN=false to apply changes");
      console.log("\nWould update the following interactions:");
      interactions.forEach((int) => {
        const num = typeof int.number === 'object' ? (int.number as any).display_value : int.number;
        const contextDoc = int.context_document?.value || 'NULL';
        console.log(`  ${num}: SET parent = ${contextDoc}`);
      });
      return;
    }

    // Proceed with updates
    console.log("\n=== Updating Interactions ===\n");

    let successCount = 0;
    let failureCount = 0;
    const errors: Array<{ number: string; error: string }> = [];

    for (const interaction of interactions) {
      const num = typeof interaction.number === 'object'
        ? (interaction.number as any).display_value
        : interaction.number;
      const caseSysId = interaction.context_document?.value;
      const interactionSysId = typeof interaction.sys_id === 'object'
        ? (interaction.sys_id as any).value
        : interaction.sys_id;

      if (!caseSysId) {
        console.log(`⚠️  Skipping ${num}: No context_document value`);
        failureCount++;
        continue;
      }

      if (!interactionSysId) {
        console.log(`⚠️  Skipping ${num}: No sys_id value`);
        failureCount++;
        continue;
      }

      try {
        await axios({
          method: "PATCH",
          url: `${baseURL}/api/now/table/interaction/${interactionSysId}`,
          data: {
            parent: caseSysId,
          },
          auth,
          headers: { "Content-Type": "application/json" },
        });

        successCount++;
        console.log(`✓ Updated ${num}: parent = ${caseSysId}`);
      } catch (error: any) {
        failureCount++;
        const errorMsg = error.response?.data?.error?.message || error.message;
        errors.push({ number: num, error: errorMsg });
        console.error(`✗ Failed ${num} (sys_id: ${interactionSysId}): ${errorMsg}`);
      }
    }

    // Summary
    console.log("\n=== BACKFILL SUMMARY ===\n");
    console.log(`Total interactions processed: ${interactions.length}`);
    console.log(`✓ Successfully updated: ${successCount}`);
    console.log(`✗ Failed: ${failureCount}`);

    if (errors.length > 0) {
      console.log("\nErrors:");
      errors.forEach(({ number, error }) => {
        console.log(`  ${number}: ${error}`);
      });
    }

    console.log("\n✓ Backfill complete!");
    console.log("\nAll interactions should now appear in their respective case related lists.");

  } catch (error: any) {
    console.error("\n✗ Backfill failed:", error.message);
    if (error.response?.data) {
      console.error("ServiceNow Error:", JSON.stringify(error.response.data, null, 2));
    }
  }

  console.log("\n" + "=".repeat(80));
}

backfillParentField().catch(console.error);
