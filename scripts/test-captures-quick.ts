import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getCapturesByTaskIds } from "../lib/services/webex-contact-center";

async function main() {
  // Use task IDs from the recent 7-day call retrieval
  const testTaskIds = [
    "b3707701-9723-472b-9ca5-943655da98ca",
    "431371ce-b98b-44ac-8e1b-0db1af5f3077",
    "de0300b3-71a6-4cbd-b7e6-4d995d3a6985",
    "7971ab86-2857-4291-9e4f-35100394ed6c",
    "fc2c1910-17f9-4f8f-970d-3023295090aa"
  ];

  console.log("Testing Captures API with recent task IDs...\n");
  console.log(`Task IDs: ${testTaskIds.length}`);

  try {
    const captures = await getCapturesByTaskIds(testTaskIds, 3600);

    console.log(`\n✅ Captures API Success!`);
    console.log(`Found ${captures.length} recordings\n`);

    if (captures.length > 0) {
      captures.forEach((capture, idx) => {
        console.log(`${idx + 1}. Capture ID: ${capture.id}`);
        console.log(`   Task ID: ${capture.taskId}`);
        console.log(`   Format: ${capture.format || 'N/A'}`);
        console.log(`   Duration: ${capture.durationMs ? Math.round(capture.durationMs / 1000) + 's' : 'N/A'}`);
        console.log(`   Download URL: ${capture.filepath ? 'Available' : 'N/A'}`);
        console.log(`   Expires: ${capture.expiresAt || 'N/A'}\n`);
      });
    } else {
      console.log("⚠️  No recordings found for these tasks");
      console.log("Possible reasons:");
      console.log("- Recordings not yet processed");
      console.log("- Recording not enabled for these queues");
      console.log("- Recordings expired (typically 24-48h retention)");
    }

  } catch (error) {
    console.error("❌ Captures API Failed:");
    console.error(error);
  }
}

main().catch(console.error);
