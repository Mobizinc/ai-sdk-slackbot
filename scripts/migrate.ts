/**
 * Database Migration Script
 * Runs Drizzle migrations against Neon Postgres
 *
 * FIXED: Drizzle ORM creates and manages its own __drizzle_migrations table
 * in the 'drizzle' schema with SHA256 hashes of migration SQL files.
 */

import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

// Load environment variables
// Load .env.local first (if exists), then .env as fallback
dotenv.config({ path: '.env.local' });
dotenv.config();

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  console.log("🔄 Running database migrations...");

  try {
    const sql = neon(databaseUrl);
    const db = drizzle(sql);

    // Run migrations
    // Drizzle automatically creates and manages the __drizzle_migrations table
    // in the 'drizzle' schema with SHA256 hashes for tracking
    await migrate(db, { migrationsFolder: "./migrations" });

    console.log("✅ Migrations completed successfully");

    // Show migration stats
    const applied = await sql`SELECT COUNT(*) as count FROM drizzle.__drizzle_migrations`;
    console.log(`📊 Total migrations tracked: ${applied[0].count}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    console.error("\n💡 TIP: If you see 'relation already exists' errors:");
    console.error("   This means a table/column from a migration already exists in the database.");
    console.error("   To fix this, you need to:");
    console.error("   1. Manually verify the database state matches the migration");
    console.error("   2. Add the migration hash to drizzle.__drizzle_migrations table");
    console.error("   3. Use: npx tsx fix-drizzle-schema-migrations.ts\n");
    process.exit(1);
  }
}

runMigrations();
