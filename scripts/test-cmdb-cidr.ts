#!/usr/bin/env ts-node
import { serviceNowClient } from "../lib/tools/servicenow";

async function main() {
  console.log("🔍 Searching CMDB for 10.252.0.0/x CIDR block...\n");

  // Search for any IP starting with 10.252
  const results = await serviceNowClient.searchConfigurationItems({
    ipAddress: "10.252",
    limit: 20,
  });

  if (results.length === 0) {
    console.log("❌ No configuration items found in 10.252.0.0 network range");
    console.log("\nTrying broader search for any 10.252.* IPs...\n");

    // Try searching by name/hostname in case they're not indexed by IP
    const nameResults = await serviceNowClient.searchConfigurationItems({
      name: "10.252",
      limit: 20,
    });

    if (nameResults.length === 0) {
      console.log("❌ No results found with '10.252' in name either");
      console.log("\n💡 The 10.252.0.0/x network is NOT documented in CMDB");
      return;
    }

    console.log(`✅ Found ${nameResults.length} items with '10.252' in name:\n`);
    nameResults.forEach((item, i) => {
      console.log(`${i+1}. ${item.name}`);
      console.log(`   Class: ${item.sys_class_name || 'N/A'}`);
      console.log(`   IPs: ${item.ip_addresses.join(", ") || "none"}`);
      console.log(`   URL: ${item.url}\n`);
    });
    return;
  }

  console.log(`✅ Found ${results.length} configuration items in 10.252.0.0 range:\n`);

  // Group by subnet to show CIDR coverage
  const ipGroups: Record<string, typeof results> = {};

  results.forEach((item) => {
    item.ip_addresses.forEach((ip) => {
      if (ip.startsWith("10.252")) {
        const subnet = ip.split(".").slice(0, 3).join("."); // Get /24 subnet
        if (!ipGroups[subnet]) {
          ipGroups[subnet] = [];
        }
        if (!ipGroups[subnet].includes(item)) {
          ipGroups[subnet].push(item);
        }
      }
    });
  });

  console.log("📊 Coverage by subnet:\n");
  Object.keys(ipGroups).sort().forEach((subnet) => {
    console.log(`${subnet}.0/24: ${ipGroups[subnet].length} CIs`);
  });

  console.log("\n📋 Full list:\n");
  results.forEach((item, i) => {
    const relevantIps = item.ip_addresses.filter(ip => ip.startsWith("10.252"));
    console.log(`${i+1}. ${item.name}`);
    console.log(`   Class: ${item.sys_class_name || 'N/A'}`);
    console.log(`   IPs: ${relevantIps.join(", ")}`);
    if (item.location) console.log(`   Location: ${item.location}`);
    if (item.owner_group) console.log(`   Owner: ${item.owner_group}`);
    console.log(`   URL: ${item.url}\n`);
  });
}

main();
