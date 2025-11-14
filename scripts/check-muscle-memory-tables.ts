/**
 * Check if muscle memory tables exist in database
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function checkTables() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  try {
    const sql = neon(databaseUrl);

    // Check if pgvector extension exists
    const pgvectorExt = await sql`
      SELECT * FROM pg_extension WHERE extname = 'vector'
    `;

    console.log("\n🔍 pgvector extension:");
    if (pgvectorExt.length > 0) {
      console.log("✅ pgvector extension is installed");
    } else {
      console.log("❌ pgvector extension is NOT installed");
    }

    // Check if muscle_memory_exemplars table exists
    const exemplarsTable = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'muscle_memory_exemplars'
    `;

    console.log("\n🔍 muscle_memory_exemplars table:");
    if (exemplarsTable.length > 0) {
      console.log("✅ Table exists");

      // Check table structure
      const columns = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'muscle_memory_exemplars'
        ORDER BY ordinal_position
      `;

      console.log("\n📋 Table structure:");
      console.table(columns);
    } else {
      console.log("❌ Table does NOT exist");
    }

    // Check if exemplar_quality_signals table exists
    const signalsTable = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'exemplar_quality_signals'
    `;

    console.log("\n🔍 exemplar_quality_signals table:");
    if (signalsTable.length > 0) {
      console.log("✅ Table exists");
    } else {
      console.log("❌ Table does NOT exist");
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkTables();
