/**
 * Pull Service Desk queue snapshot from Azure SQL and persist to Neon.
 */

import * as dotenv from "dotenv";

// Load environment variables (.env.local first, then fallback to .env)
dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
  const { pullAndStoreCaseQueueSnapshot, previewAzureCaseQueue } = await import(
    "../lib/services/case-queue-snapshots"
  );

  const dryRun = process.argv.includes("--dry-run");

  if (dryRun) {
    const rows = await previewAzureCaseQueue();
    console.log(
      "✅ Preview succeeded — top rows:",
      rows.slice(0, 10).map((row) => ({
        assignedToName: row.assignedToName,
        openCases: row.openCases,
        highPriorityCases: row.highPriorityCases,
        escalatedCases: row.escalatedCases,
        lastSeenUtc: row.lastSeenUtc,
      }))
    );
    console.log(`ℹ️ Total rows: ${rows.length}`);
    return;
  }

  const result = await pullAndStoreCaseQueueSnapshot();
  const { snapshotAt, inserted } = result;
  const snapshotIso = snapshotAt instanceof Date
    ? snapshotAt.toISOString()
    : new Date(snapshotAt).toISOString();

  console.log(
    `✅ Stored case queue snapshot @ ${snapshotIso} (${inserted} rows)`
  );
}

main().catch((error) => {
  console.error("❌ Failed to pull case queue snapshot", error);
  process.exit(1);
});
