/**
 * Fix Drizzle Snapshot Chain
 * Updates prevId and id fields to create a proper migration chain
 */

import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

const metaDir = path.join(__dirname, "..", "migrations", "meta");

// Snapshots that need fixing
const snapshots = [
  { file: "0023_snapshot.json", prevFile: "0022_snapshot.json" },
  { file: "0024_snapshot.json", prevFile: "0023_snapshot.json" },
  { file: "0025_snapshot.json", prevFile: "0024_snapshot.json" },
  { file: "0026_snapshot.json", prevFile: "0025_snapshot.json" },
  { file: "0027_snapshot.json", prevFile: "0026_snapshot.json" },
];

function fixSnapshotChain() {
  console.log("🔄 Fixing snapshot chain...\n");

  for (const snapshot of snapshots) {
    const snapshotPath = path.join(metaDir, snapshot.file);
    const prevSnapshotPath = path.join(metaDir, snapshot.prevFile);

    if (!fs.existsSync(snapshotPath)) {
      console.warn(`⚠️  Snapshot not found: ${snapshot.file}`);
      continue;
    }

    if (!fs.existsSync(prevSnapshotPath)) {
      console.warn(`⚠️  Previous snapshot not found: ${snapshot.prevFile}`);
      continue;
    }

    // Read current and previous snapshots
    const currentSnapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
    const prevSnapshot = JSON.parse(fs.readFileSync(prevSnapshotPath, "utf-8"));

    // Generate new UUID for current snapshot (only if it's a duplicate)
    const currentId = currentSnapshot.id;
    const prevId = prevSnapshot.id;

    // Check if current snapshot has the same ID as the previous (indicating duplicate)
    if (currentId === prevId) {
      currentSnapshot.id = randomUUID();
      console.log(`  Generated new ID for ${snapshot.file}: ${currentSnapshot.id}`);
    }

    // Update prevId to point to previous snapshot
    if (currentSnapshot.prevId !== prevId) {
      currentSnapshot.prevId = prevId;
      console.log(`  Updated prevId for ${snapshot.file}: ${prevId.substring(0, 8)}...`);
    }

    // Write updated snapshot
    fs.writeFileSync(snapshotPath, JSON.stringify(currentSnapshot, null, 2));
    console.log(`✅ Fixed ${snapshot.file}\n`);
  }

  console.log("✅ Snapshot chain fixed successfully");
}

fixSnapshotChain();
