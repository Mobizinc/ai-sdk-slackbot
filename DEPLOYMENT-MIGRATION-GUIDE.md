# Production Deployment & Migration Validation Guide

**Date**: October 21, 2025
**Branch**: `staging` → `main`
**Critical Migrations**: 0009, 0010, 0011

---

## Executive Summary

This guide provides a comprehensive assessment and deployment strategy for merging the `staging` branch into `main` (production). The staging branch contains **3 critical database migrations** that must be validated before deployment.

**Status**: ⚠️  VALIDATION REQUIRED - Run validation script to determine migration state

---

## Critical Migrations Overview

### Migration 0009: `0009_fat_kulan_gath.sql`
**Type**: New Tables (Catalog Redirect Feature)
**Date Created**: October 21, 2025 (timestamp: 1760476235390)

**Tables Created**:
- `app_settings` - Global key/value configuration
- `case_queue_snapshots` - Service desk queue metrics
- `catalog_redirect_log` - Tracks catalog redirects for metrics
- `client_settings` - Per-client configuration

**Risk Level**: 🟡 MEDIUM
**Backwards Compatible**: ✅ YES - New tables for optional feature, not used by existing code

---

### Migration 0010: `0010_new_colleen_wing.sql`
**Type**: New Table (CMDB Reconciliation)
**Date Created**: October 21, 2025 (timestamp: 1760414433401)

**Tables Created**:
- `cmdb_reconciliation_results` - Tracks CMDB reconciliation process

**Columns**: 20 columns including:
- `case_number`, `case_sys_id`, `entity_value`, `entity_type`
- `reconciliation_status`, `cmdb_sys_id`, `confidence`
- `business_context_match`, `child_task_number`, `metadata`

**Risk Level**: 🟢 LOW
**Backwards Compatible**: ✅ YES - Optional feature, not used by existing production code

---

### Migration 0011: `0011_cute_skin.sql`
**Type**: Alter Tables (Service Portfolio Classification)
**Date Created**: October 21, 2025 (timestamp: 1760978222168)

**Tables Modified**:
- `case_classification_results` - Added columns: `service_offering`, `application_service`
- `case_classifications` - Added columns: `service_offering`, `application_service`

**SQL**:
```sql
ALTER TABLE "case_classification_results" ADD COLUMN IF NOT EXISTS "service_offering" text;
ALTER TABLE "case_classification_results" ADD COLUMN IF NOT EXISTS "application_service" text;
ALTER TABLE "case_classifications" ADD COLUMN IF NOT EXISTS "service_offering" text;
ALTER TABLE "case_classifications" ADD COLUMN IF NOT EXISTS "application_service" text;
```

**Risk Level**: 🔴 HIGH
**Backwards Compatible**: ⚠️  PARTIAL
- Uses `ADD COLUMN IF NOT EXISTS` - Safe to run multiple times
- Columns are NULLABLE - Old code can insert/select without errors
- New code references these columns in:
  - `/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/lib/services/case-classifier.ts` (line 309-310)
  - `/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/lib/services/case-triage.ts` (line 477-487, 579-589)

**Deployment Impact**:
- ✅ If migration NOT applied: New code will insert NULL values (safe)
- ✅ If migration NOT applied: Reads will return NULL (code handles gracefully)
- ⚠️  ServiceNow lookups will fail silently if service_offering is NULL

---

## Migration Tracking System

**System**: Drizzle ORM
**Tracking Table**: `drizzle.__drizzle_migrations` (in `drizzle` schema, NOT `public`)
**Migration Method**: SHA-256 hash tracking

**How It Works**:
1. Each migration SQL file is hashed (SHA-256)
2. Hash is stored in `drizzle.__drizzle_migrations`
3. Before running migrations, Drizzle checks which hashes are missing
4. Only un-tracked migrations are executed

**Troubleshooting Script**: `/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/fix-drizzle-schema-migrations.ts`

---

## Validation Process

### Step 1: Run Validation Script

We've created a comprehensive validation script to check production database state:

```bash
# Set DATABASE_URL to production database
export DATABASE_URL="postgresql://user:password@prod-host.neon.tech/dbname?sslmode=require"

# Run validation (READ-ONLY)
npx tsx scripts/validate-production-migrations.ts
```

**What It Checks**:
1. ✅ Database connectivity
2. ✅ Migration tracking table exists (`drizzle.__drizzle_migrations`)
3. ✅ Migration 0009 tables exist
4. ✅ Migration 0010 table exists
5. ✅ Migration 0011 columns exist
6. ✅ Migration hashes are tracked
7. ✅ Backwards compatibility analysis
8. ✅ Deployment recommendations

### Step 2: Interpret Results

The validation script will report one of these statuses:

#### Status: ✅ SAFE
**Meaning**: All migrations are applied
**Action**: Safe to deploy immediately
```bash
# 1. Merge staging to main
git checkout main
git merge staging
git push origin main

# 2. Deploy (Vercel will auto-deploy)
# 3. Monitor logs
```

#### Status: ⚠️  NEEDS_MIGRATION
**Meaning**: None of the migrations are applied
**Action**: Run migrations BEFORE deploying code

```bash
# 1. Backup production database (Neon has automatic backups, but verify)
# 2. Set DATABASE_URL to production
export DATABASE_URL="postgresql://user:password@prod-host.neon.tech/dbname?sslmode=require"

# 3. Run migrations
npm run db:migrate

# 4. Verify success
npx tsx scripts/validate-production-migrations.ts

# 5. If successful, deploy code
git checkout main
git merge staging
git push origin main
```

#### Status: 🚨 PARTIAL_MIGRATION
**Meaning**: Some migrations applied, some not - INCONSISTENT STATE
**Action**: Manual investigation required

```bash
# 1. DO NOT auto-deploy
# 2. Investigate which migrations are missing
npx tsx scripts/check-all-tables.ts

# 3. Check migration tracking
npx tsx fix-drizzle-schema-migrations.ts

# 4. Manually verify database state matches expected schema
# 5. Contact database administrator if uncertain
```

#### Status: ❌ ERROR
**Meaning**: Cannot connect to database or validation failed
**Action**: Fix connection issues, re-run validation

---

## Deployment Strategies

### Strategy A: Migrations First (RECOMMENDED)

**When to Use**: When migrations are NOT applied or partially applied

**Steps**:
1. ✅ Backup production database (Neon automatic backups enabled)
2. ✅ Run validation script to confirm migration state
3. ✅ Run migrations: `npm run db:migrate`
4. ✅ Verify migration success: `npx tsx scripts/validate-production-migrations.ts`
5. ✅ Deploy code: Merge staging → main
6. ✅ Monitor production logs for errors

**Rollback Plan**:
- If migrations succeed but code fails: Code deployment is atomic (Vercel)
- If migrations fail: Restore from Neon backup
- Migrations are additive (no data loss risk)

---

### Strategy B: Code First (USE WITH CAUTION)

**When to Use**: Only if ALL migrations use `IF NOT EXISTS` clauses (Migration 0011 does)

**Risk**: 🔴 HIGH - Not recommended unless you understand the implications

**Steps**:
1. Deploy code (migrations will run automatically via Vercel build)
2. Drizzle migrations run during deployment
3. Monitor for errors

**Why NOT Recommended**:
- If migration fails during deployment, deployment fails
- Less control over migration timing
- Harder to rollback

---

## Backwards Compatibility Matrix

| Migration | Type | Tables/Columns | Old Code on New DB | New Code on Old DB | Safe? |
|-----------|------|----------------|--------------------|--------------------|-------|
| 0009 | CREATE | 4 new tables | ✅ Ignores | ❌ Missing tables if feature enabled | ⚠️  Conditional |
| 0010 | CREATE | 1 new table | ✅ Ignores | ❌ Missing table if CMDB used | ⚠️  Conditional |
| 0011 | ALTER | 2 columns/table | ✅ Works (NULLs) | ⚠️  Columns missing, INSERTs fail | ❌ NO |

**Conclusion**: Migration 0011 requires **migrations-first** deployment strategy.

---

## Risk Assessment

### Deployment Risks

1. **Missing Migration 0011**: 🔴 HIGH
   - New code writes to `service_offering`, `application_service` columns
   - If columns don't exist: Database error on INSERT
   - Impact: Case classification failures

2. **Missing Migration 0010**: 🟡 MEDIUM
   - CMDB reconciliation feature won't work
   - Impact: Feature-specific, limited blast radius

3. **Missing Migration 0009**: 🟢 LOW
   - Catalog redirect feature won't work
   - Impact: Feature-specific, likely not production-critical yet

### Data Loss Risks

All migrations are **additive only**:
- ✅ No DROP statements
- ✅ No ALTER ... NOT NULL (columns are nullable)
- ✅ No data transformations
- ✅ No foreign key constraints that could block inserts

**Data Loss Risk**: 🟢 MINIMAL

---

## Rollback Procedures

### If Migrations Fail

```bash
# 1. Check Neon backup status
# Navigate to Neon dashboard -> Backups

# 2. Restore from backup (if needed)
# Use Neon UI to restore to point-in-time before migration

# 3. Investigate failure
npx tsx scripts/check-all-tables.ts

# 4. Fix issue and retry
npm run db:migrate
```

### If Code Deployment Fails

```bash
# Vercel deployments are atomic - previous version stays live
# No manual rollback needed

# If you need to force rollback:
git revert HEAD
git push origin main
```

### If Production Has Errors After Deployment

```bash
# 1. Check if it's a migration issue
npx tsx scripts/validate-production-migrations.ts

# 2. Check application logs
vercel logs --app=your-app-name

# 3. Quick rollback if critical
git revert HEAD
git push origin main

# 4. Investigate and fix
# - Check if service_offering lookups are failing
# - Check if CMDB reconciliation is causing issues
```

---

## Pre-Deployment Checklist

### Before Running Validation

- [ ] Production DATABASE_URL is set
- [ ] You have read access to production database
- [ ] Neon database backups are enabled
- [ ] You understand the migration content

### Before Running Migrations

- [ ] Validation script shows migrations are needed
- [ ] Production backup is confirmed
- [ ] You have write access to production database
- [ ] Staging database has same migrations applied successfully
- [ ] You have rollback plan ready

### Before Deploying Code

- [ ] Migrations are applied to production
- [ ] Validation script shows "SAFE" status
- [ ] Production smoke tests pass (if available)
- [ ] Team is notified of deployment
- [ ] Monitoring is ready (logs, alerts)

### After Deployment

- [ ] Monitor Vercel deployment logs
- [ ] Check for database errors in logs
- [ ] Verify case classification still works
- [ ] Test ServiceNow integration
- [ ] Monitor for 15 minutes post-deployment

---

## Environment Configuration

### Production Database

**Provider**: Neon Postgres
**Connection**: Set via `DATABASE_URL` environment variable
**Format**: `postgresql://user:password@host.neon.tech/dbname?sslmode=require`

**Where to Find**:
1. Vercel Dashboard → Project → Settings → Environment Variables
2. Neon Dashboard → Project → Connection Details

### Migration Scripts

```bash
# Generate new migrations from schema changes
npm run db:generate

# Run migrations
npm run db:migrate

# Push schema directly (use with caution)
npm run db:push

# Open Drizzle Studio (visual DB browser)
npm run db:studio
```

---

## Monitoring & Validation Post-Deployment

### Immediate Checks (First 5 minutes)

```bash
# 1. Check deployment status
vercel ls

# 2. Check for errors in logs
vercel logs --app=your-app-name --follow

# 3. Test case classification endpoint
curl https://your-app.vercel.app/api/health

# 4. Verify database connectivity
npx tsx scripts/verify-db.ts
```

### Health Checks (First Hour)

1. Monitor Slack bot responses
2. Check ServiceNow webhook processing
3. Verify case classification is writing to DB
4. Check for any NULL `service_offering` values:

```sql
SELECT COUNT(*) as null_service_offerings
FROM case_classification_results
WHERE service_offering IS NULL
AND created_at > NOW() - INTERVAL '1 hour';
```

### Success Criteria

- ✅ No deployment errors in Vercel logs
- ✅ Database queries succeeding
- ✅ Case classifications have `service_offering` populated (if applicable)
- ✅ No increase in error rates
- ✅ ServiceNow integrations working

---

## Troubleshooting Guide

### Issue: "relation already exists" error

**Cause**: Table/column already exists but migration not tracked

**Solution**:
```bash
npx tsx fix-drizzle-schema-migrations.ts
```

### Issue: "column does not exist" error

**Cause**: Migration 0011 not applied

**Solution**:
```bash
npm run db:migrate
```

### Issue: Cannot connect to database

**Cause**: DATABASE_URL incorrect or network issue

**Solution**:
```bash
# Verify DATABASE_URL
echo $DATABASE_URL

# Test connection
npx tsx scripts/verify-db.ts
```

### Issue: Migration hangs or times out

**Cause**: Neon serverless connection timeout

**Solution**:
```bash
# Increase timeout in scripts/migrate.ts
# Or run migration manually via Neon SQL editor
```

---

## Contact & Escalation

### When to Escalate

- 🚨 Partial migration state detected
- 🚨 Production errors after deployment
- 🚨 Data loss or corruption suspected
- 🚨 Cannot connect to production database

### Escalation Path

1. Check this guide for troubleshooting
2. Run validation script for diagnostic info
3. Check Neon dashboard for database health
4. Review Vercel logs for application errors
5. Contact database administrator if uncertain

---

## Appendix: Migration File Contents

### Migration 0009 (Catalog Redirect)

**File**: `/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/migrations/0009_fat_kulan_gath.sql`

**Summary**: Creates 4 new tables for catalog redirect feature
- Size: 3,549 bytes
- Tables: `app_settings`, `case_queue_snapshots`, `catalog_redirect_log`, `client_settings`

### Migration 0010 (CMDB Reconciliation)

**File**: `/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/migrations/0010_new_colleen_wing.sql`

**Summary**: Creates CMDB reconciliation results tracking table
- Size: 1,601 bytes
- Tables: `cmdb_reconciliation_results`

### Migration 0011 (Service Portfolio)

**File**: `/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/migrations/0011_cute_skin.sql`

**Summary**: Adds service portfolio classification columns
- Size: 586 bytes
- Tables Modified: `case_classification_results`, `case_classifications`
- Columns Added: `service_offering` (text), `application_service` (text)

---

## Quick Reference Commands

```bash
# Validation
npx tsx scripts/validate-production-migrations.ts

# Run migrations
npm run db:migrate

# Check all tables
npx tsx scripts/check-all-tables.ts

# Fix migration tracking
npx tsx fix-drizzle-schema-migrations.ts

# View database
npm run db:studio

# Deploy to production
git checkout main && git merge staging && git push origin main
```

---

**Document Version**: 1.0
**Last Updated**: October 21, 2025
**Author**: Claude Code (AI Assistant)
