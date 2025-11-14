/**
 * Fix Drizzle Migration Tracking
 * Manually marks migrations as applied when tables already exist in database
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
dotenv.config({ path: ".env.local" });
dotenv.config();

async function fixMigrationTracking() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  console.log("🔄 Fixing migration tracking...");

  try {
    const sql = neon(databaseUrl);

    // Migrations that exist in database but aren't tracked
    const untrackedMigrations = [
      { tag: "0023_add_change_validations", when: 1762400000000 },
      { tag: "0024_add_template_cmdb_types", when: 1762400001000 },
      { tag: "0025_add_project_interests", when: 1762400002000 },
      { tag: "0027_add_muscle_memory", when: 1763097540132 },
    ];

    for (const migration of untrackedMigrations) {
      const migrationFile = path.join(
        __dirname,
        "..",
        "migrations",
        `${migration.tag}.sql`
      );

      if (!fs.existsSync(migrationFile)) {
        console.warn(`⚠️  Migration file not found: ${migrationFile}`);
        continue;
      }

      // Read migration SQL content
      const sqlContent = fs.readFileSync(migrationFile, "utf-8");

      // Generate SHA256 hash (same as drizzle does)
      const hash = crypto.createHash("sha256").update(sqlContent).digest("hex");

      // Check if migration is already tracked by hash
      const existing = await sql`
        SELECT id FROM drizzle.__drizzle_migrations
        WHERE hash = ${hash}
      `;

      if (existing.length > 0) {
        console.log(`✓ Migration already tracked: ${migration.tag}`);
        continue;
      }

      // Insert migration record using the timestamp from journal
      await sql`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${hash}, ${migration.when})
      `;

      console.log(`✅ Marked as applied: ${migration.tag} (hash: ${hash.substring(0, 12)}...)`);
    }

    console.log("\n✅ Migration tracking fixed successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to fix migration tracking:", error);
    process.exit(1);
  }
}

fixMigrationTracking();
