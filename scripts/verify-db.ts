/**
 * Database Verification Script
 * Checks that tables exist and database connection works
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import { sql } from "drizzle-orm";

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function verifyDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  console.log("🔍 Verifying database connection and tables...\n");

  try {
    const neonClient = neon(databaseUrl);
    const db = drizzle(neonClient);

    // Query to list all tables in the public schema
    const tables = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log("✅ Database connection successful!");
    console.log(`\n📊 Found ${tables.rows.length} tables:\n`);

    const expectedTables = ['case_contexts', 'case_messages', 'kb_generation_states'];
    const foundTables = tables.rows.map((row: any) => row.table_name);

    for (const expectedTable of expectedTables) {
      if (foundTables.includes(expectedTable)) {
        console.log(`  ✅ ${expectedTable}`);
      } else {
        console.log(`  ❌ ${expectedTable} (MISSING)`);
      }
    }

    // Check for indexes on case_contexts
    const indexes = await db.execute(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'case_contexts'
      ORDER BY indexname;
    `);

    console.log(`\n🔑 Found ${indexes.rows.length} indexes on case_contexts:`);
    indexes.rows.forEach((row: any) => {
      console.log(`  - ${row.indexname}`);
    });

    console.log("\n✅ Database verification complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Database verification failed:", error);
    process.exit(1);
  }
}

verifyDatabase();
