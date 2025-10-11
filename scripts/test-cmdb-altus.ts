#!/usr/bin/env ts-node
import { serviceNowClient } from "../lib/tools/servicenow";

async function main() {
  console.log("🔍 Searching for 'altus' in CMDB...\n");

  const results = await serviceNowClient.searchConfigurationItems({
    name: "altus",
    limit: 5,
  });

  if (results.length === 0) {
    console.log("❌ No CIs found containing 'altus'");
    return;
  }

  console.log(`✅ Found ${results.length} configuration items:\n`);
  results.forEach((item, i) => {
    console.log(`${i+1}. ${item.name}`);
    console.log(`   IPs: ${item.ip_addresses.join(", ") || "none"}`);
    console.log(`   URL: ${item.url}\n`);
  });
}

main();
