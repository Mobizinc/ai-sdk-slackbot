import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { getTableApiClient } from "../lib/infrastructure/servicenow/repositories/factory";

async function listGroups(partial: string) {
  const client = getTableApiClient();
  const query = partial ? `nameLIKE${partial}` : "ORDERBYname";
  const rows = await client.fetchAll("sys_user_group", {
    sysparm_query: query,
    sysparm_fields: "sys_id,name,description",
    sysparm_display_value: "all",
    pageSize: 20,
    maxRecords: 50,
  });

  console.log(`Found ${rows.length} groups for filter "${partial || "(all)"}":`);
  rows.forEach((row: any, index: number) => {
    const name =
      typeof row.name === "object" ? row.name.display_value : row.name;
    console.log(`${index + 1}. ${name ?? "(no name)"} (${row.sys_id})`);
  });
}

const partial = process.argv[2] ?? "";

listGroups(partial).catch((err) => {
  console.error("Failed to list groups:", err);
  process.exit(1);
});
