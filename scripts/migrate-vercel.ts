/**
 * Vercel Migration Script
 * Handles migrations for Vercel deployments with special handling for problematic migrations
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as crypto from "crypto";
import * as path from "path";

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function runVercelMigrations() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  console.log("🔄 Running Vercel database migrations...");

  try {
    const sql = neon(databaseUrl);

    // Check and mark migration 0011 if columns already exist
    console.log("🔍 Checking migration 0011 columns (service_offering, application_service)...");
    const migration0011Check = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'case_classifications'
      AND column_name = 'service_offering'
    `;

    if (migration0011Check.length > 0) {
      console.log("✅ Migration 0011 columns already exist");

      const migration0011Tracked = await sql`
        SELECT * FROM drizzle.__drizzle_migrations
        WHERE tag = '0011_cute_skin'
      `;

      if (migration0011Tracked.length === 0) {
        console.log("📝 Marking migration 0011 as applied...");
        const migrationPath = path.join(process.cwd(), "migrations", "0011_cute_skin.sql");
        const migrationSQL = fs.readFileSync(migrationPath, "utf8");
        const hash = crypto.createHash("sha256").update(migrationSQL).digest("hex");

        await sql`
          INSERT INTO drizzle.__drizzle_migrations (hash, created_at, tag)
          VALUES (${hash}, ${Date.now()}, '0011_cute_skin')
        `;

        console.log("✅ Migration 0011 marked as applied");
      }
    }

    // Check and mark migration 0014 if columns already exist
    console.log("🔍 Checking migration 0014 columns (incident_number, problem_number, etc.)...");
    const migration0014Check = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'case_classification_results'
      AND column_name = 'incident_number'
    `;

    if (migration0014Check.length > 0) {
      console.log("✅ Migration 0014 columns already exist");

      const migration0014Tracked = await sql`
        SELECT * FROM drizzle.__drizzle_migrations
        WHERE tag = '0014_greedy_tusk'
      `;

      if (migration0014Tracked.length === 0) {
        console.log("📝 Marking migration 0014 as applied...");
        const migrationPath = path.join(process.cwd(), "migrations", "0014_greedy_tusk.sql");
        const migrationSQL = fs.readFileSync(migrationPath, "utf8");
        const hash = crypto.createHash("sha256").update(migrationSQL).digest("hex");

        await sql`
          INSERT INTO drizzle.__drizzle_migrations (hash, created_at, tag)
          VALUES (${hash}, ${Date.now()}, '0014_greedy_tusk')
        `;

        console.log("✅ Migration 0014 marked as applied");
      }
    }

    // Now run normal migrations
    console.log("🔄 Running remaining migrations...");
    const { migrate } = await import("drizzle-orm/neon-http/migrator");
    const db = drizzle(sql);

    await migrate(db, { migrationsFolder: "./migrations" });

    console.log("✅ All migrations completed successfully");

    // Show migration stats
    const applied = await sql`SELECT COUNT(*) as count FROM drizzle.__drizzle_migrations`;
    console.log(`📊 Total migrations tracked: ${applied[0].count}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runVercelMigrations();
