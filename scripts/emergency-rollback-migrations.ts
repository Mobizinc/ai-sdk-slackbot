/**
 * EMERGENCY ROLLBACK SCRIPT
 *
 * ⚠️  USE WITH EXTREME CAUTION ⚠️
 *
 * This script provides emergency rollback procedures for migrations 0009, 0010, 0011
 * Only use this if deployment has failed and you need to revert database changes.
 *
 * IMPORTANT: This does NOT restore data, only removes schema changes.
 * Always restore from backup for full rollback.
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import * as readline from "readline";

dotenv.config({ path: '.env.local' });
dotenv.config();

interface RollbackOperation {
  migration: string;
  description: string;
  sql: string[];
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
}

const ROLLBACK_OPERATIONS: RollbackOperation[] = [
  {
    migration: '0011_cute_skin',
    description: 'Remove service_offering and application_service columns',
    sql: [
      'ALTER TABLE case_classification_results DROP COLUMN IF EXISTS service_offering;',
      'ALTER TABLE case_classification_results DROP COLUMN IF EXISTS application_service;',
      'ALTER TABLE case_classifications DROP COLUMN IF EXISTS service_offering;',
      'ALTER TABLE case_classifications DROP COLUMN IF EXISTS application_service;',
    ],
    risk: 'MEDIUM'
  },
  {
    migration: '0010_new_colleen_wing',
    description: 'Drop cmdb_reconciliation_results table',
    sql: [
      'DROP TABLE IF EXISTS cmdb_reconciliation_results CASCADE;',
    ],
    risk: 'MEDIUM'
  },
  {
    migration: '0009_fat_kulan_gath',
    description: 'Drop catalog redirect tables',
    sql: [
      'DROP TABLE IF EXISTS catalog_redirect_log CASCADE;',
      'DROP TABLE IF EXISTS client_settings CASCADE;',
      'DROP TABLE IF EXISTS case_queue_snapshots CASCADE;',
      'DROP TABLE IF EXISTS app_settings CASCADE;',
    ],
    risk: 'HIGH'
  }
];

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${question} (type 'YES' to confirm): `, (answer) => {
      rl.close();
      resolve(answer.trim() === 'YES');
    });
  });
}

async function emergencyRollback() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  console.log("🚨 EMERGENCY ROLLBACK PROCEDURE");
  console.log("=" .repeat(80));
  console.log("⚠️  WARNING: This will REMOVE database schema changes");
  console.log("⚠️  WARNING: This may result in DATA LOSS");
  console.log("⚠️  WARNING: Only use this after deployment failure\n");

  console.log(`📅 Time: ${new Date().toISOString()}`);
  console.log(`🌐 Database: ${databaseUrl.split('@')[1]?.split('/')[0] || 'unknown'}\n`);

  console.log("This script will rollback the following migrations:");
  console.log("-".repeat(80));
  for (const op of ROLLBACK_OPERATIONS) {
    console.log(`❌ ${op.migration}`);
    console.log(`   ${op.description}`);
    console.log(`   Risk Level: ${op.risk === 'HIGH' ? '🔴' : op.risk === 'MEDIUM' ? '🟡' : '🟢'} ${op.risk}`);
    console.log(`   SQL Operations: ${op.sql.length}`);
    console.log();
  }

  console.log("=" .repeat(80));
  console.log("🔄 RECOMMENDED: Restore from Neon backup instead of using this script");
  console.log("=" .repeat(80));
  console.log();

  const shouldProceed = await confirm("Are you ABSOLUTELY SURE you want to proceed with rollback?");

  if (!shouldProceed) {
    console.log("✅ Rollback cancelled. Good choice - consider restoring from backup instead.");
    process.exit(0);
  }

  console.log();
  console.log("⚠️  FINAL WARNING: This is irreversible without a backup restore");
  const finalConfirm = await confirm("Type 'YES' one more time to confirm rollback");

  if (!finalConfirm) {
    console.log("✅ Rollback cancelled.");
    process.exit(0);
  }

  console.log();
  console.log("🔄 Starting rollback process...\n");

  const sql = neon(databaseUrl);

  try {
    // Rollback in reverse order (newest first)
    for (const op of ROLLBACK_OPERATIONS) {
      console.log(`🔄 Rolling back: ${op.migration}`);
      console.log(`   ${op.description}`);

      for (const sqlStatement of op.sql) {
        try {
          console.log(`   Executing: ${sqlStatement}`);
          await sql(sqlStatement);
          console.log(`   ✅ Success`);
        } catch (error) {
          console.error(`   ⚠️  Error: ${error}`);
          console.log(`   ⚠️  Continuing with next operation...`);
        }
      }

      console.log(`   ✅ ${op.migration} rollback complete\n`);
    }

    console.log("🔄 Removing migration tracking entries...");
    try {
      // Remove migration hashes from tracking table
      const migrations = ['0009_fat_kulan_gath', '0010_new_colleen_wing', '0011_cute_skin'];

      // Note: We don't know the exact hashes without reading files, so we'll provide instructions
      console.log("⚠️  Manual step required:");
      console.log("   You need to manually remove migration hashes from drizzle.__drizzle_migrations");
      console.log("   Run this SQL to see tracked migrations:");
      console.log("   SELECT * FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 5;");
      console.log("   Then delete the entries for migrations 0009, 0010, 0011");
    } catch (error) {
      console.error(`   ⚠️  Error accessing migration tracking: ${error}`);
    }

    console.log();
    console.log("=" .repeat(80));
    console.log("✅ ROLLBACK COMPLETE");
    console.log("=" .repeat(80));
    console.log();
    console.log("Next Steps:");
    console.log("1. Verify database state: npx tsx scripts/check-all-tables.ts");
    console.log("2. Check application logs for errors");
    console.log("3. If issues persist, restore from Neon backup");
    console.log("4. Investigate root cause of deployment failure");
    console.log("5. Test migrations in staging environment before retrying");
    console.log();

  } catch (error) {
    console.error("❌ Rollback failed:", error);
    console.error();
    console.error("🚨 CRITICAL: Rollback encountered errors!");
    console.error("📝 Action: Restore from Neon backup immediately");
    console.error("📝 Action: Contact database administrator");
    process.exit(1);
  }
}

// Run rollback
emergencyRollback()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
