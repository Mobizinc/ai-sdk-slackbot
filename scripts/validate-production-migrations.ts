/**
 * Production Migration Validation Script
 * Validates whether migrations 0009, 0010, and 0011 have been applied to production
 *
 * This script performs READ-ONLY checks to assess migration state before deployment
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as crypto from "crypto";

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

interface MigrationCheck {
  migration: string;
  description: string;
  applied: boolean;
  details: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
}

interface ValidationReport {
  databaseConnected: boolean;
  migrationTrackingExists: boolean;
  checks: MigrationCheck[];
  overallStatus: 'SAFE' | 'NEEDS_MIGRATION' | 'PARTIAL_MIGRATION' | 'ERROR';
  recommendations: string[];
}

async function validateProductionMigrations(): Promise<ValidationReport> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is not set");
    console.error("💡 Set DATABASE_URL to your production Neon Postgres database");
    process.exit(1);
  }

  console.log("🔍 PRODUCTION MIGRATION VALIDATION");
  console.log("=" .repeat(80));
  console.log(`📅 Validation Time: ${new Date().toISOString()}`);
  console.log(`🌐 Database: ${databaseUrl.split('@')[1]?.split('/')[0] || 'unknown'}\n`);

  const report: ValidationReport = {
    databaseConnected: false,
    migrationTrackingExists: false,
    checks: [],
    overallStatus: 'ERROR',
    recommendations: []
  };

  try {
    const neonClient = neon(databaseUrl);
    const db = drizzle(neonClient);
    report.databaseConnected = true;
    console.log("✅ Database connection successful\n");

    // ============================================================
    // STEP 1: Check if migration tracking table exists
    // ============================================================
    console.log("📋 STEP 1: Checking Migration Tracking System");
    console.log("-".repeat(80));

    let trackedMigrations: any[] = [];
    try {
      trackedMigrations = await neonClient`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`;
      report.migrationTrackingExists = true;
      console.log(`✅ Migration tracking table exists`);
      console.log(`📊 Total tracked migrations: ${trackedMigrations.length}\n`);
    } catch (error) {
      console.log("❌ Migration tracking table (drizzle.__drizzle_migrations) not found");
      console.log("⚠️  This indicates migrations have NEVER been run on this database\n");
      report.recommendations.push("Initialize database by running: npm run db:migrate");
      report.overallStatus = 'NEEDS_MIGRATION';
    }

    // ============================================================
    // STEP 2: Check Migration 0009 - Catalog Redirect Tables
    // ============================================================
    console.log("📋 STEP 2: Validating Migration 0009 (Catalog Redirect)");
    console.log("-".repeat(80));

    const migration0009Check: MigrationCheck = {
      migration: '0009_fat_kulan_gath',
      description: 'Catalog Redirect Tables (app_settings, case_queue_snapshots, catalog_redirect_log, client_settings)',
      applied: false,
      details: '',
      risk: 'HIGH'
    };

    try {
      // Check for key tables from migration 0009
      const tables0009 = await db.execute(sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('app_settings', 'case_queue_snapshots', 'catalog_redirect_log', 'client_settings')
        ORDER BY table_name
      `);

      const foundTables = tables0009.rows.map((r: any) => r.table_name);
      const expectedTables = ['app_settings', 'case_queue_snapshots', 'catalog_redirect_log', 'client_settings'];
      const missingTables = expectedTables.filter(t => !foundTables.includes(t));

      if (missingTables.length === 0) {
        migration0009Check.applied = true;
        migration0009Check.details = `All 4 tables exist: ${foundTables.join(', ')}`;
        migration0009Check.risk = 'LOW';
        console.log(`✅ Migration 0009 APPLIED`);
        console.log(`   Tables found: ${foundTables.join(', ')}\n`);
      } else {
        migration0009Check.applied = false;
        migration0009Check.details = `Missing tables: ${missingTables.join(', ')}. Found: ${foundTables.join(', ')}`;
        migration0009Check.risk = 'HIGH';
        console.log(`❌ Migration 0009 NOT APPLIED`);
        console.log(`   Missing tables: ${missingTables.join(', ')}`);
        console.log(`   Found tables: ${foundTables.join(', ')}\n`);
      }
    } catch (error) {
      migration0009Check.details = `Error checking tables: ${error}`;
      console.log(`❌ Error checking migration 0009: ${error}\n`);
    }

    report.checks.push(migration0009Check);

    // ============================================================
    // STEP 3: Check Migration 0010 - CMDB Reconciliation
    // ============================================================
    console.log("📋 STEP 3: Validating Migration 0010 (CMDB Reconciliation)");
    console.log("-".repeat(80));

    const migration0010Check: MigrationCheck = {
      migration: '0010_new_colleen_wing',
      description: 'CMDB Reconciliation Results Table',
      applied: false,
      details: '',
      risk: 'MEDIUM'
    };

    try {
      const cmdbTable = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'cmdb_reconciliation_results'
        ) as exists
      `);

      if (cmdbTable.rows[0]?.exists) {
        // Check for required columns
        const columns = await db.execute(sql`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = 'cmdb_reconciliation_results'
          ORDER BY ordinal_position
        `);

        const columnNames = columns.rows.map((r: any) => r.column_name);
        const requiredColumns = ['case_number', 'case_sys_id', 'entity_value', 'entity_type',
                                  'reconciliation_status', 'cmdb_sys_id', 'confidence'];
        const missingColumns = requiredColumns.filter(c => !columnNames.includes(c));

        if (missingColumns.length === 0) {
          migration0010Check.applied = true;
          migration0010Check.details = `Table exists with ${columnNames.length} columns`;
          migration0010Check.risk = 'LOW';
          console.log(`✅ Migration 0010 APPLIED`);
          console.log(`   Table: cmdb_reconciliation_results (${columnNames.length} columns)\n`);
        } else {
          migration0010Check.applied = false;
          migration0010Check.details = `Table exists but missing columns: ${missingColumns.join(', ')}`;
          migration0010Check.risk = 'HIGH';
          console.log(`⚠️  Migration 0010 PARTIALLY APPLIED`);
          console.log(`   Missing columns: ${missingColumns.join(', ')}\n`);
        }
      } else {
        migration0010Check.applied = false;
        migration0010Check.details = 'Table cmdb_reconciliation_results does not exist';
        migration0010Check.risk = 'MEDIUM';
        console.log(`❌ Migration 0010 NOT APPLIED`);
        console.log(`   Table cmdb_reconciliation_results does not exist\n`);
      }
    } catch (error) {
      migration0010Check.details = `Error checking table: ${error}`;
      console.log(`❌ Error checking migration 0010: ${error}\n`);
    }

    report.checks.push(migration0010Check);

    // ============================================================
    // STEP 4: Check Migration 0011 - Service Portfolio Classification
    // ============================================================
    console.log("📋 STEP 4: Validating Migration 0011 (Service Portfolio Classification)");
    console.log("-".repeat(80));

    const migration0011Check: MigrationCheck = {
      migration: '0011_cute_skin',
      description: 'Service Portfolio columns (service_offering, application_service) added to classification tables',
      applied: false,
      details: '',
      risk: 'HIGH'
    };

    try {
      // Check if case_classification_results table exists
      const resultsTableExists = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'case_classification_results'
        ) as exists
      `);

      if (!resultsTableExists.rows[0]?.exists) {
        migration0011Check.applied = false;
        migration0011Check.details = 'Parent table case_classification_results does not exist - cannot check for columns';
        migration0011Check.risk = 'HIGH';
        console.log(`❌ Migration 0011 NOT APPLICABLE`);
        console.log(`   Parent table case_classification_results does not exist\n`);
      } else {
        // Check for the new columns in both tables
        const resultsColumns = await db.execute(sql`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = 'case_classification_results'
          AND column_name IN ('service_offering', 'application_service')
        `);

        const classificationsColumns = await db.execute(sql`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = 'case_classifications'
          AND column_name IN ('service_offering', 'application_service')
        `);

        const resultsHasCols = resultsColumns.rows.length === 2;
        const classificationsHasCols = classificationsColumns.rows.length === 2;

        if (resultsHasCols && classificationsHasCols) {
          migration0011Check.applied = true;
          migration0011Check.details = 'Both tables have service_offering and application_service columns';
          migration0011Check.risk = 'LOW';
          console.log(`✅ Migration 0011 APPLIED`);
          console.log(`   ✓ case_classification_results has service_offering, application_service`);
          console.log(`   ✓ case_classifications has service_offering, application_service\n`);
        } else {
          migration0011Check.applied = false;
          const missing: string[] = [];
          if (!resultsHasCols) missing.push('case_classification_results');
          if (!classificationsHasCols) missing.push('case_classifications');
          migration0011Check.details = `Missing columns in: ${missing.join(', ')}`;
          migration0011Check.risk = 'HIGH';
          console.log(`❌ Migration 0011 NOT APPLIED or INCOMPLETE`);
          console.log(`   Missing columns in: ${missing.join(', ')}\n`);
        }
      }
    } catch (error) {
      migration0011Check.details = `Error checking columns: ${error}`;
      console.log(`❌ Error checking migration 0011: ${error}\n`);
    }

    report.checks.push(migration0011Check);

    // ============================================================
    // STEP 5: Verify migration hashes in tracking table
    // ============================================================
    if (report.migrationTrackingExists) {
      console.log("📋 STEP 5: Verifying Migration Hashes");
      console.log("-".repeat(80));

      const journal = JSON.parse(fs.readFileSync('migrations/meta/_journal.json', 'utf-8'));
      const expectedHashes = new Map<string, string>();

      for (const entry of journal.entries) {
        const sqlFile = `migrations/${entry.tag}.sql`;
        if (fs.existsSync(sqlFile)) {
          const sqlContent = fs.readFileSync(sqlFile, 'utf-8');
          const hash = crypto.createHash('sha256').update(sqlContent).digest('hex');
          expectedHashes.set(entry.tag, hash);
        }
      }

      const trackedHashes = new Set(trackedMigrations.map((m: any) => m.hash));

      const migrations = ['0009_fat_kulan_gath', '0010_new_colleen_wing', '0011_cute_skin'];
      for (const mig of migrations) {
        const expectedHash = expectedHashes.get(mig);
        if (expectedHash) {
          const isTracked = trackedHashes.has(expectedHash);
          const status = isTracked ? '✅' : '❌';
          console.log(`   ${status} ${mig}: ${isTracked ? 'tracked' : 'NOT tracked'} (hash: ${expectedHash.substring(0, 16)}...)`);
        }
      }
      console.log();
    }

    // ============================================================
    // STEP 6: Determine overall status
    // ============================================================
    const allApplied = report.checks.every(c => c.applied);
    const noneApplied = report.checks.every(c => !c.applied);
    const someApplied = report.checks.some(c => c.applied) && !allApplied;

    if (allApplied) {
      report.overallStatus = 'SAFE';
      report.recommendations.push("✅ All migrations are applied. Safe to deploy staging to production.");
    } else if (noneApplied) {
      report.overallStatus = 'NEEDS_MIGRATION';
      report.recommendations.push("⚠️  None of the critical migrations (0009, 0010, 0011) are applied.");
      report.recommendations.push("📝 Action: Run migrations BEFORE deploying code: npm run db:migrate");
      report.recommendations.push("🔒 Action: Test migrations in staging environment first");
    } else {
      report.overallStatus = 'PARTIAL_MIGRATION';
      report.recommendations.push("🚨 CRITICAL: Database is in PARTIAL migration state!");
      report.recommendations.push("📝 Action: Investigate which migrations are missing and why");
      report.recommendations.push("📝 Action: Manual intervention required - DO NOT auto-deploy");
    }

  } catch (error) {
    console.error(`❌ Validation failed: ${error}`);
    report.overallStatus = 'ERROR';
    report.recommendations.push(`Error during validation: ${error}`);
  }

  return report;
}

async function printReport(report: ValidationReport) {
  console.log("\n");
  console.log("=" .repeat(80));
  console.log("📊 VALIDATION REPORT SUMMARY");
  console.log("=" .repeat(80));
  console.log(`Database Connected: ${report.databaseConnected ? '✅ Yes' : '❌ No'}`);
  console.log(`Migration Tracking: ${report.migrationTrackingExists ? '✅ Exists' : '❌ Missing'}`);
  console.log(`Overall Status: ${getStatusEmoji(report.overallStatus)} ${report.overallStatus}`);
  console.log();

  console.log("Migration Status:");
  console.log("-".repeat(80));
  for (const check of report.checks) {
    const statusIcon = check.applied ? '✅' : '❌';
    const riskColor = check.risk === 'HIGH' ? '🔴' : check.risk === 'MEDIUM' ? '🟡' : '🟢';
    console.log(`${statusIcon} ${check.migration}`);
    console.log(`   ${check.description}`);
    console.log(`   ${riskColor} Risk: ${check.risk} | ${check.details}`);
    console.log();
  }

  console.log("Recommendations:");
  console.log("-".repeat(80));
  for (const rec of report.recommendations) {
    console.log(`   ${rec}`);
  }
  console.log();

  console.log("=" .repeat(80));
  console.log("Backwards Compatibility Analysis:");
  console.log("=" .repeat(80));
  console.log("Migration 0009 (Catalog Redirect):");
  console.log("  - NEW TABLES: Not referenced by existing code until feature is enabled");
  console.log("  - Backwards Compatible: ✅ YES - old code can run without these tables");
  console.log();
  console.log("Migration 0010 (CMDB Reconciliation):");
  console.log("  - NEW TABLE: cmdb_reconciliation_results");
  console.log("  - Only used by CMDB reconciliation features (likely not production yet)");
  console.log("  - Backwards Compatible: ✅ YES - optional feature");
  console.log();
  console.log("Migration 0011 (Service Portfolio):");
  console.log("  - ALTERS EXISTING TABLES: Adds nullable columns to case_classification_results, case_classifications");
  console.log("  - Referenced by: lib/services/case-classifier.ts, lib/services/case-triage.ts");
  console.log("  - Backwards Compatible: ⚠️  PARTIAL - old code works but new code expects these columns");
  console.log("  - ⚠️  If migration 0011 NOT applied, staging code WILL INSERT NULL values (safe)");
  console.log("  - ⚠️  If migration 0011 NOT applied and code tries to read, will get NULL (safe)");
  console.log();
  console.log("=" .repeat(80));
  console.log("Deployment Strategy:");
  console.log("=" .repeat(80));
  if (report.overallStatus === 'SAFE') {
    console.log("✅ SAFE TO DEPLOY");
    console.log("   1. Merge staging to main");
    console.log("   2. Deploy to production");
    console.log("   3. Monitor for errors");
  } else if (report.overallStatus === 'NEEDS_MIGRATION') {
    console.log("⚠️  MIGRATIONS REQUIRED BEFORE DEPLOYMENT");
    console.log("   1. Backup production database");
    console.log("   2. Run migrations: npm run db:migrate");
    console.log("   3. Verify migration success");
    console.log("   4. Then merge and deploy code");
  } else if (report.overallStatus === 'PARTIAL_MIGRATION') {
    console.log("🚨 CRITICAL: PARTIAL MIGRATION STATE");
    console.log("   1. DO NOT DEPLOY automatically");
    console.log("   2. Investigate partial state manually");
    console.log("   3. Determine which migrations need to be applied");
    console.log("   4. Consider using fix-drizzle-schema-migrations.ts if needed");
    console.log("   5. Manually verify database state");
  } else {
    console.log("❌ ERROR: Cannot determine safe deployment path");
    console.log("   1. Fix database connection issues");
    console.log("   2. Re-run this validation script");
  }
  console.log("=" .repeat(80));
  console.log();
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'SAFE': return '✅';
    case 'NEEDS_MIGRATION': return '⚠️ ';
    case 'PARTIAL_MIGRATION': return '🚨';
    case 'ERROR': return '❌';
    default: return '❓';
  }
}

// Run validation
validateProductionMigrations()
  .then(printReport)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
