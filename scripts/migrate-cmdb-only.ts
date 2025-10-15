/**
 * Targeted Migration Script for CMDB Reconciliation Table
 * This script manually creates only the cmdb_reconciliation_results table
 * to bypass the broken migration system
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function runCmdbMigration() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  console.log("🔄 Creating cmdb_reconciliation_results table...");

  try {
    const sql = neon(databaseUrl);

    // Check if table already exists
    const checkResult = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'cmdb_reconciliation_results'
      );
    `;

    const tableExists = checkResult[0]?.exists;

    if (tableExists) {
      console.log("✅ cmdb_reconciliation_results table already exists");
      process.exit(0);
    }

    // Create the table
    await sql`
      CREATE TABLE "cmdb_reconciliation_results" (
        "id" serial PRIMARY KEY NOT NULL,
        "case_number" text NOT NULL,
        "case_sys_id" text NOT NULL,
        "entity_value" text NOT NULL,
        "entity_type" text NOT NULL,
        "original_entity_value" text NOT NULL,
        "resolved_entity_value" text,
        "reconciliation_status" text NOT NULL,
        "cmdb_sys_id" text,
        "cmdb_name" text,
        "cmdb_class" text,
        "cmdb_url" text,
        "confidence" real NOT NULL,
        "business_context_match" text,
        "child_task_number" text,
        "child_task_sys_id" text,
        "error_message" text,
        "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `;

    // Create indexes
    await sql`CREATE INDEX "idx_cmdb_reconcile_case_number" ON "cmdb_reconciliation_results" USING btree ("case_number");`;
    await sql`CREATE INDEX "idx_cmdb_reconcile_case_sys_id" ON "cmdb_reconciliation_results" USING btree ("case_sys_id");`;
    await sql`CREATE INDEX "idx_cmdb_reconcile_entity_value" ON "cmdb_reconciliation_results" USING btree ("entity_value");`;
    await sql`CREATE INDEX "idx_cmdb_reconcile_entity_type" ON "cmdb_reconciliation_results" USING btree ("entity_type");`;
    await sql`CREATE INDEX "idx_cmdb_reconcile_status" ON "cmdb_reconciliation_results" USING btree ("reconciliation_status");`;
    await sql`CREATE INDEX "idx_cmdb_reconcile_confidence" ON "cmdb_reconciliation_results" USING btree ("confidence");`;
    await sql`CREATE INDEX "idx_cmdb_reconcile_created_at" ON "cmdb_reconciliation_results" USING btree ("created_at");`;

    console.log("✅ cmdb_reconciliation_results table created successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runCmdbMigration();