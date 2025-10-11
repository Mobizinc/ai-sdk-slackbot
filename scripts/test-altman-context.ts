import { config } from "dotenv";
config({ path: ".env.local" });

import { getBusinessContextRepository } from "../lib/db/repositories/business-context-repository";

async function testAltmanContext() {
  const repo = getBusinessContextRepository();

  console.log("Testing Altman Plants business context...\n");

  const altman = await repo.findByName("Altman Plants");

  if (altman) {
    console.log("✅ Altman Plants found in database:");
    console.log("  Entity Name:", altman.entityName);
    console.log("  Aliases:", altman.aliases);
    console.log("  Service Details:", altman.serviceDetails);
    console.log("\nTesting alias match:");
    console.log("  'Citrix (altmanplants1)' in aliases:", altman.aliases?.includes("Citrix (altmanplants1)"));
    console.log("  'altmanplants1' in aliases:", altman.aliases?.some(a => a.toLowerCase().includes("altmanplants1")));
  } else {
    console.log("❌ Altman Plants NOT found in database");
  }

  console.log("\n\nTesting message text detection:");
  const messageText = "provide details for SCS0048730 Case Details: - Short Description: I need to request a quota increase on Azure Subscription (Citrix altmanplants1 #1303812) from 16 to 70";

  const allContexts = await repo.getAllActive();
  console.log(`Found ${allContexts.length} active contexts in database`);

  for (const ctx of allContexts) {
    const namesToCheck = [ctx.entityName, ...(ctx.aliases || [])];
    for (const name of namesToCheck) {
      if (messageText.toLowerCase().includes(name.toLowerCase())) {
        console.log(`✅ Match found: "${ctx.entityName}" matched on "${name}"`);
        break;
      }
    }
  }
}

testAltmanContext().catch(console.error);
