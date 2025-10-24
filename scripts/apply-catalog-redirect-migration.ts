/**
 * Apply Catalog Redirect Migration
 * Manually applies the catalog redirect tables to the database
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function applyMigration() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  console.log("🔄 Applying catalog redirect migration...");

  try {
    const sql = neon(databaseUrl);

    // Check if tables already exist
    const existingTables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('client_settings', 'catalog_redirect_log')
    `;
    console.log(`📊 Found ${existingTables.length} existing table(s): ${existingTables.map((t: any) => t.table_name).join(', ') || 'none'}`);

    // Create client_settings table if it doesn't exist
    if (!existingTables.find((t: any) => t.table_name === 'client_settings')) {
      console.log("➕ Creating client_settings table...");
      await sql`
        CREATE TABLE "client_settings" (
          "id" serial PRIMARY KEY NOT NULL,
          "client_id" text NOT NULL,
          "client_name" text NOT NULL,
          "catalog_redirect_enabled" boolean DEFAULT true NOT NULL,
          "catalog_redirect_confidence_threshold" real DEFAULT 0.5 NOT NULL,
          "catalog_redirect_auto_close" boolean DEFAULT false NOT NULL,
          "support_contact_info" text,
          "custom_catalog_mappings" jsonb DEFAULT '[]'::jsonb NOT NULL,
          "features" jsonb DEFAULT '{}'::jsonb NOT NULL,
          "notes" text,
          "created_at" timestamp DEFAULT now() NOT NULL,
          "updated_at" timestamp DEFAULT now() NOT NULL,
          "created_by" text,
          "updated_by" text,
          CONSTRAINT "client_settings_client_id_unique" UNIQUE("client_id")
        )
      `;

      // Create indexes
      await sql`CREATE INDEX "idx_client_id" ON "client_settings" USING btree ("client_id")`;
      await sql`CREATE INDEX "idx_client_name" ON "client_settings" USING btree ("client_name")`;
      await sql`CREATE INDEX "idx_catalog_redirect_enabled" ON "client_settings" USING btree ("catalog_redirect_enabled")`;

      console.log("✅ Created client_settings table with indexes");
    } else {
      console.log("⏭️  client_settings table already exists, skipping");
    }

    // Create catalog_redirect_log table if it doesn't exist
    if (!existingTables.find((t: any) => t.table_name === 'catalog_redirect_log')) {
      console.log("➕ Creating catalog_redirect_log table...");
      await sql`
        CREATE TABLE "catalog_redirect_log" (
          "id" serial PRIMARY KEY NOT NULL,
          "case_number" text NOT NULL,
          "case_sys_id" text NOT NULL,
          "client_id" text,
          "client_name" text,
          "request_type" text NOT NULL,
          "confidence" real NOT NULL,
          "confidence_threshold" real NOT NULL,
          "catalog_items_provided" integer NOT NULL,
          "catalog_item_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
          "case_closed" boolean NOT NULL,
          "close_state" text,
          "matched_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
          "submitted_by" text,
          "short_description" text,
          "category" text,
          "subcategory" text,
          "redirected_at" timestamp DEFAULT now() NOT NULL
        )
      `;

      // Create indexes
      await sql`CREATE INDEX "idx_redirect_case_number" ON "catalog_redirect_log" USING btree ("case_number")`;
      await sql`CREATE INDEX "idx_redirect_case_sys_id" ON "catalog_redirect_log" USING btree ("case_sys_id")`;
      await sql`CREATE INDEX "idx_redirect_client_id" ON "catalog_redirect_log" USING btree ("client_id")`;
      await sql`CREATE INDEX "idx_redirect_request_type" ON "catalog_redirect_log" USING btree ("request_type")`;
      await sql`CREATE INDEX "idx_redirect_redirected_at" ON "catalog_redirect_log" USING btree ("redirected_at")`;
      await sql`CREATE INDEX "idx_redirect_case_closed" ON "catalog_redirect_log" USING btree ("case_closed")`;

      console.log("✅ Created catalog_redirect_log table with indexes");
    } else {
      console.log("⏭️  catalog_redirect_log table already exists, skipping");
    }

    console.log("✅ Migration completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

applyMigration();
