import axios from "axios";
import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const SERVICENOW_URL = process.env.SERVICENOW_URL!;
const SERVICENOW_USERNAME = process.env.SERVICENOW_USERNAME!;
const SERVICENOW_PASSWORD = process.env.SERVICENOW_PASSWORD!;

console.log(`Using ServiceNow instance: ${SERVICENOW_URL}`);

const auth = {
  username: SERVICENOW_USERNAME,
  password: SERVICENOW_PASSWORD,
};

const baseURL = SERVICENOW_URL;

/**
 * Step 1: Get the interaction table schema to find all reference fields
 */
async function getInteractionTableSchema() {
  console.log("\n=== INTERACTION TABLE SCHEMA ===\n");

  try {
    const response = await axios({
      method: "GET",
      url: `${baseURL}/api/now/table/sys_dictionary`,
      params: {
        sysparm_query: `name=interaction^ORname=customer_interaction`,
        sysparm_fields: "element,column_label,internal_type,reference",
        sysparm_limit: 200,
      },
      auth,
      headers: { "Content-Type": "application/json" },
    });

    console.log("Interaction table fields:");
    response.data.result.forEach((field: any) => {
      if (field.internal_type === "reference") {
        console.log(`  ${field.element} (${field.column_label})`);
        console.log(`    -> References: ${field.reference}`);
      }
    });

    // Look specifically for case-related fields
    const caseFields = response.data.result.filter((field: any) =>
      field.element.toLowerCase().includes('case') ||
      field.element.toLowerCase().includes('parent') ||
      field.element.toLowerCase().includes('task') ||
      field.reference === 'x_mobit_serv_case_service_case'
    );

    console.log("\n=== CASE-RELATED FIELDS ===");
    caseFields.forEach((field: any) => {
      console.log(`${field.element}: ${field.column_label} (${field.internal_type})`);
      if (field.reference) console.log(`  References: ${field.reference}`);
    });

    return response.data.result;
  } catch (error: any) {
    console.error("Schema query error:", error.response?.data || error.message);
  }
}

/**
 * Step 2: Query our test interaction to see ALL its fields
 */
async function getOurInteractionDetails() {
  console.log("\n=== OUR INTERACTION (IMS0001476) DETAILS ===\n");

  try {
    const response = await axios({
      method: "GET",
      url: `${baseURL}/api/now/table/interaction/4dcd53ec47bc361085733525d36d43d6`,
      auth,
      headers: { "Content-Type": "application/json" },
    });

    const interaction = response.data.result;
    console.log("All fields on our interaction:");
    Object.entries(interaction).forEach(([key, value]) => {
      if (value && typeof value === 'object' && 'value' in value) {
        console.log(`  ${key}: ${(value as any).value} (${(value as any).display_value || 'N/A'})`);
      } else if (value) {
        console.log(`  ${key}: ${value}`);
      }
    });

    return interaction;
  } catch (error: any) {
    console.error("Get interaction error:", error.response?.data || error.message);
  }
}

/**
 * Step 3: Query the target case to see its related interactions
 */
async function getCaseInteractions() {
  console.log("\n=== CASE (SCS0049247) RELATED INTERACTIONS ===\n");

  try {
    // Try multiple query approaches
    const queries = [
      `context_document=f753b7c08378721039717000feaad385`,
      `context_table=x_mobit_serv_case_service_case^context_document=f753b7c08378721039717000feaad385`,
      `parent=f753b7c08378721039717000feaad385`,
      `task=f753b7c08378721039717000feaad385`,
    ];

    for (const query of queries) {
      console.log(`\nQuerying with: ${query}`);
      const response = await axios({
        method: "GET",
        url: `${baseURL}/api/now/table/interaction`,
        params: {
          sysparm_query: query,
          sysparm_fields: "number,sys_id,context_table,context_document,parent,task,opened_for",
          sysparm_limit: 10,
        },
        auth,
        headers: { "Content-Type": "application/json" },
      });

      console.log(`  Found: ${response.data.result.length} interactions`);
      response.data.result.forEach((int: any) => {
        console.log(`    ${int.number}: context_table=${int.context_table?.value}, context_doc=${int.context_document?.value}`);
        if (int.parent) console.log(`      parent: ${int.parent.value}`);
        if (int.task) console.log(`      task: ${int.task.value}`);
        if (int.opened_for) console.log(`      opened_for: ${int.opened_for.value}`);
      });
    }
  } catch (error: any) {
    console.error("Case interactions query error:", error.response?.data || error.message);
  }
}

/**
 * Step 4: Find interactions that ARE showing on cases and inspect them
 */
async function findWorkingInteractions() {
  console.log("\n=== FINDING WORKING INTERACTIONS ON CASES ===\n");

  try {
    // Get recent cases
    const casesResponse = await axios({
      method: "GET",
      url: `${baseURL}/api/now/table/x_mobit_serv_case_service_case`,
      params: {
        sysparm_query: "sys_created_onONLast 30 days@javascript:gs.daysAgoStart(30)@javascript:gs.daysAgoEnd(0)",
        sysparm_fields: "number,sys_id",
        sysparm_limit: 5,
      },
      auth,
      headers: { "Content-Type": "application/json" },
    });

    console.log(`Found ${casesResponse.data.result.length} recent cases`);

    // For each case, try to find linked interactions
    for (const serviceCase of casesResponse.data.result) {
      console.log(`\nCase ${serviceCase.number} (${serviceCase.sys_id}):`);

      const intResponse = await axios({
        method: "GET",
        url: `${baseURL}/api/now/table/interaction`,
        params: {
          sysparm_query: `context_document=${serviceCase.sys_id}`,
          sysparm_fields: "number,sys_id,context_table,context_document,parent,task,opened_for,state,channel",
          sysparm_limit: 5,
        },
        auth,
        headers: { "Content-Type": "application/json" },
      });

      if (intResponse.data.result.length > 0) {
        console.log(`  Found ${intResponse.data.result.length} linked interactions!`);

        // Inspect the first working interaction in detail
        const workingInt = intResponse.data.result[0];
        console.log("\n  === WORKING INTERACTION DETAILS ===");
        Object.entries(workingInt).forEach(([key, value]) => {
          if (value && typeof value === 'object' && 'value' in value) {
            console.log(`    ${key}: ${(value as any).value} (${(value as any).display_value || 'N/A'})`);
          } else if (value) {
            console.log(`    ${key}: ${value}`);
          }
        });

        break; // Found a working example, stop here
      }
    }
  } catch (error: any) {
    console.error("Working interactions query error:", error.response?.data || error.message);
  }
}

/**
 * Step 5: Check for relationship/junction tables
 */
async function checkRelationshipTables() {
  console.log("\n=== CHECKING FOR RELATIONSHIP TABLES ===\n");

  try {
    // Look for tables that might link interactions to cases
    const tableNames = [
      'task_relations',
      'interaction_relations',
      'case_interaction',
      'x_mobit_serv_case_interaction',
    ];

    for (const tableName of tableNames) {
      try {
        const response = await axios({
          method: "GET",
          url: `${baseURL}/api/now/table/${tableName}`,
          params: {
            sysparm_limit: 1,
          },
          auth,
          headers: { "Content-Type": "application/json" },
        });
        console.log(`✓ Table '${tableName}' exists with ${response.data.result.length} records (sample)`);
      } catch (error: any) {
        if (error.response?.status === 404) {
          console.log(`✗ Table '${tableName}' does not exist`);
        } else {
          console.log(`? Table '${tableName}' check failed: ${error.message}`);
        }
      }
    }
  } catch (error: any) {
    console.error("Relationship tables check error:", error.message);
  }
}

/**
 * Step 6: Check the case table schema for interaction-related fields
 */
async function getCaseTableSchema() {
  console.log("\n=== CASE TABLE SCHEMA (INTERACTION FIELDS) ===\n");

  try {
    const response = await axios({
      method: "GET",
      url: `${baseURL}/api/now/table/sys_dictionary`,
      params: {
        sysparm_query: `name=x_mobit_serv_case_service_case^elementLIKEinteraction`,
        sysparm_fields: "element,column_label,internal_type,reference",
      },
      auth,
      headers: { "Content-Type": "application/json" },
    });

    console.log("Case table interaction-related fields:");
    response.data.result.forEach((field: any) => {
      console.log(`  ${field.element}: ${field.column_label} (${field.internal_type})`);
      if (field.reference) console.log(`    References: ${field.reference}`);
    });
  } catch (error: any) {
    console.error("Case schema query error:", error.response?.data || error.message);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log("🔍 DIAGNOSING INTERACTION-TO-CASE LINKAGE ISSUE");
  console.log("=".repeat(60));

  await getInteractionTableSchema();
  await getOurInteractionDetails();
  await getCaseInteractions();
  await findWorkingInteractions();
  await checkRelationshipTables();
  await getCaseTableSchema();

  console.log("\n" + "=".repeat(60));
  console.log("✓ Diagnosis complete");
}

main().catch(console.error);
