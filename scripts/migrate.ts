/**
 * Database Migration Script
 * Runs Drizzle migrations against Neon Postgres
 */

import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

// Load environment variables
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

    await migrate(db, { migrationsFolder: "./migrations" });

    console.log("✅ Migrations completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigrations();
