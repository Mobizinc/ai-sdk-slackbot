/**
 * Fix Remaining Snapshot IDs
 * Updates snapshots 0024 and 0026 that still have duplicate IDs
 */

import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

const metaDir = path.join(__dirname, "..", "migrations", "meta");

const baseId = "3c783cc5-a2f2-4655-8cbe-cec5a0eab1fc"; // The duplicate ID from 0022

function fixRemainingSnapshots() {
  console.log("🔄 Fixing remaining duplicate snapshot IDs...\n");

  const snapshotsToFix = [
    { file: "0024_snapshot.json", prevFile: "0023_snapshot.json" },
    { file: "0026_snapshot.json", prevFile: "0025_snapshot.json" },
  ];

  for (const snapshot of snapshotsToFix) {
    const snapshotPath = path.join(metaDir, snapshot.file);
    const prevSnapshotPath = path.join(metaDir, snapshot.prevFile);

    // Read current and previous snapshots
    const currentSnapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
    const prevSnapshot = JSON.parse(fs.readFileSync(prevSnapshotPath, "utf-8"));

    // Check if it still has the base ID
    if (currentSnapshot.id === baseId) {
      currentSnapshot.id = randomUUID();
      currentSnapshot.prevId = prevSnapshot.id;

      fs.writeFileSync(snapshotPath, JSON.stringify(currentSnapshot, null, 2));
      console.log(`✅ Fixed ${snapshot.file}`);
      console.log(`   New ID: ${currentSnapshot.id}`);
      console.log(`   PrevID: ${currentSnapshot.prevId.substring(0, 12)}...\n`);
    } else {
      console.log(`✓ ${snapshot.file} already has unique ID\n`);
    }
  }

  console.log("✅ All snapshot IDs fixed");
}

fixRemainingSnapshots();
