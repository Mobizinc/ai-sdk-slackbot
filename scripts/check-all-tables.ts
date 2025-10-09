/**
 * Check all database tables and their columns
 */
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import * as dotenv from "dotenv";

dotenv.config({ path: '.env.local' });
dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

const neonClient = neon(databaseUrl);
const db = drizzle(neonClient);

async function checkTables() {
  console.log("📋 All Tables and Columns:\n");

  const expectedTables = ['case_contexts', 'case_messages', 'kb_generation_states', 'business_contexts'];

  for (const table of expectedTables) {
    const columns = await db.execute(sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table}
      ORDER BY ordinal_position;
    `);

    if (columns.rows.length === 0) {
      console.log(`\n❌ ${table} - TABLE NOT FOUND`);
    } else {
      console.log(`\n✅ ${table} (${columns.rows.length} columns):`);
      columns.rows.forEach((row: any) => {
        console.log(`   - ${row.column_name} (${row.data_type})`);
      });
    }
  }
}

checkTables().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
