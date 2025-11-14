/**
 * Check Drizzle Migrations Table Structure
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function checkMigrations() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  try {
    const sql = neon(databaseUrl);

    // Check if drizzle schema exists
    const schema = await sql`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name = 'drizzle'
    `;

    if (schema.length === 0) {
      console.log("❌ Drizzle schema doesn't exist yet");
      return;
    }

    // Check table structure
    const columns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
      ORDER BY ordinal_position
    `;

    console.log("\n📋 Drizzle migrations table structure:");
    console.table(columns);

    // Show existing migrations
    const migrations = await sql`
      SELECT * FROM drizzle.__drizzle_migrations
      ORDER BY created_at DESC
      LIMIT 10
    `;

    console.log("\n📊 Recent migrations:");
    console.table(migrations);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkMigrations();
