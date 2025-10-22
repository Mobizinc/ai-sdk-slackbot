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

async function compareInteractions() {
  console.log("\n🔍 COMPARING WORKING vs NON-WORKING INTERACTIONS\n");
  console.log("=".repeat(80));

  try {
    // Get the WORKING interaction (shows on case)
    console.log("\n=== WORKING INTERACTION: IMS0001458 (shows on case) ===\n");
    const workingResponse = await axios({
      method: "GET",
      url: `${baseURL}/api/now/table/interaction`,
      params: {
        sysparm_query: "number=IMS0001458",
        sysparm_display_value: "all",
      },
      auth,
      headers: { "Content-Type": "application/json" },
    });

    const working = workingResponse.data.result[0];
    console.log("Key fields:");
    console.log(`  parent: ${working.parent?.value || 'NULL'} (${working.parent?.display_value || 'N/A'})`);
    console.log(`  context_document: ${working.context_document?.value || 'NULL'}`);
    console.log(`  context_table: ${working.context_table?.value || 'NULL'}`);
    console.log(`  task: ${working.task?.value || 'NULL'}`);
    console.log(`  opened_for: ${working.opened_for?.value || 'NULL'} (${working.opened_for?.display_value || 'N/A'})`);

    // Get our NON-WORKING interaction
    console.log("\n=== NON-WORKING INTERACTION: IMS0001476 (doesn't show on case) ===\n");
    const notWorkingResponse = await axios({
      method: "GET",
      url: `${baseURL}/api/now/table/interaction`,
      params: {
        sysparm_query: "number=IMS0001476",
        sysparm_display_value: "all",
      },
      auth,
      headers: { "Content-Type": "application/json" },
    });

    const notWorking = notWorkingResponse.data.result[0];
    console.log("Key fields:");
    console.log(`  parent: ${notWorking.parent?.value || 'NULL'} (${notWorking.parent?.display_value || 'N/A'})`);
    console.log(`  context_document: ${notWorking.context_document?.value || 'NULL'}`);
    console.log(`  context_table: ${notWorking.context_table?.value || 'NULL'}`);
    console.log(`  task: ${notWorking.task?.value || 'NULL'}`);
    console.log(`  opened_for: ${notWorking.opened_for?.value || 'NULL'} (${notWorking.opened_for?.display_value || 'N/A'})`);

    // Compare
    console.log("\n=== FIELD COMPARISON ===\n");
    console.log("Field                 | Working (IMS0001458) | Not Working (IMS0001476)");
    console.log("-".repeat(80));
    console.log(`parent                | ${working.parent?.value || 'NULL'} | ${notWorking.parent?.value || 'NULL'}`);
    console.log(`context_document      | ${working.context_document?.value || 'NULL'} | ${notWorking.context_document?.value || 'NULL'}`);
    console.log(`context_table         | ${working.context_table?.value || 'NULL'} | ${notWorking.context_table?.value || 'NULL'}`);
    console.log(`task                  | ${working.task?.value || 'NULL'} | ${notWorking.task?.value || 'NULL'}`);
    console.log(`opened_for            | ${working.opened_for?.value || 'NULL'} | ${notWorking.opened_for?.value || 'NULL'}`);

    console.log("\n=== DIAGNOSIS ===\n");
    console.log("The 'parent' field is the KEY difference!");
    console.log(`  Working interaction has: parent = ${working.parent?.value || 'NULL'}`);
    console.log(`  Not working has: parent = ${notWorking.parent?.value || 'NULL'}`);
    console.log("\nTo make interactions appear on case related lists:");
    console.log("  SET: parent = <case_sys_id>");
    console.log("\nThe context_document and context_table fields are for metadata only.");
    console.log("They don't create the relationship visible in the UI!");

  } catch (error: any) {
    console.error("Error:", error.response?.data || error.message);
  }

  console.log("\n" + "=".repeat(80));
}

compareInteractions().catch(console.error);
