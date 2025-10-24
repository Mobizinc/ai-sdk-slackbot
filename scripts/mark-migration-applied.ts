/**
 * Mark Migration as Applied
 * Manually adds a migration hash to drizzle.__drizzle_migrations table
 * Use this when a migration was already applied but isn't tracked
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

async function markMigrationApplied() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  // Migration 0011 that's causing issues
  const migrationTag = "0011_cute_skin";
  const migrationPath = path.join(process.cwd(), "migrations", `${migrationTag}.sql`);

  console.log(`🔍 Checking migration: ${migrationTag}`);

  try {
    const sql = neon(databaseUrl);
    const db = drizzle(sql);

    // Check if migration already tracked
    const existing = await sql`
      SELECT * FROM drizzle.__drizzle_migrations
      WHERE tag = ${migrationTag}
    `;

    if (existing.length > 0) {
      console.log(`✅ Migration ${migrationTag} is already tracked`);
      process.exit(0);
    }

    // Read migration file and compute hash
    const migrationSQL = fs.readFileSync(migrationPath, "utf8");
    const hash = crypto.createHash("sha256").update(migrationSQL).digest("hex");

    console.log(`📝 Migration SQL hash: ${hash.substring(0, 16)}...`);

    // Insert into tracking table
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at, tag)
      VALUES (${hash}, ${Date.now()}, ${migrationTag})
    `;

    console.log(`✅ Marked migration ${migrationTag} as applied`);
    console.log(`💡 This migration will now be skipped in future runs`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to mark migration:", error);
    process.exit(1);
  }
}

markMigrationApplied();
