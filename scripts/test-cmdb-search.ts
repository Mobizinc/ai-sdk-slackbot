#!/usr/bin/env ts-node
/**
 * Quick Test: CMDB Configuration Item Search
 * Search for IP address 10.252.0.40
 */

import { serviceNowClient } from "../lib/tools/servicenow";

async function main() {
  console.log("🔍 Testing CMDB Search for IP: 10.252.0.40\n");

  if (!serviceNowClient.isConfigured()) {
    console.error("❌ ServiceNow not configured");
    console.error("Required: SERVICENOW_INSTANCE_URL and credentials");
    process.exit(1);
  }

  try {
    console.log("Searching ServiceNow CMDB...\n");

    const results = await serviceNowClient.searchConfigurationItems({
      ipAddress: "10.252.0.40",
      limit: 10,
    });

    if (results.length === 0) {
      console.log("❌ No configuration items found for IP 10.252.0.40");
      return;
    }

    console.log(`✅ Found ${results.length} configuration item(s):\n`);

    results.forEach((item, index) => {
      console.log(`--- Configuration Item ${index + 1} ---`);
      console.log(`Name: ${item.name}`);
      console.log(`Sys ID: ${item.sys_id}`);
      if (item.sys_class_name) console.log(`Type: ${item.sys_class_name}`);
      if (item.fqdn) console.log(`FQDN: ${item.fqdn}`);
      if (item.host_name) console.log(`Hostname: ${item.host_name}`);
      if (item.ip_addresses.length > 0) {
        console.log(`IP Addresses: ${item.ip_addresses.join(", ")}`);
      }
      if (item.owner_group) console.log(`Owner: ${item.owner_group}`);
      if (item.support_group) console.log(`Support Group: ${item.support_group}`);
      if (item.location) console.log(`Location: ${item.location}`);
      if (item.environment) console.log(`Environment: ${item.environment}`);
      if (item.status) console.log(`Status: ${item.status}`);
      if (item.description) console.log(`Description: ${item.description}`);
      console.log(`URL: ${item.url}`);
      console.log();
    });

  } catch (error) {
    console.error("❌ Error searching CMDB:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message);
    }
    process.exit(1);
  }
}

main();
