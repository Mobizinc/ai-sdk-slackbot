# Migration Validation Summary - Staging to Production Deployment

**Date**: October 21, 2025
**Branches**: `staging` → `main` (production)
**Status**: ⚠️  VALIDATION REQUIRED BEFORE DEPLOYMENT

---

## Quick Start

### 1. Run Validation (First Step - REQUIRED)

```bash
# Set production DATABASE_URL
export DATABASE_URL="your-production-database-url"

# Run validation script (READ-ONLY)
npm run db:validate-prod
```

### 2. Follow Recommendations

The validation script will tell you exactly what to do:
- ✅ **SAFE** → Deploy immediately
- ⚠️  **NEEDS_MIGRATION** → Run migrations first, then deploy
- 🚨 **PARTIAL_MIGRATION** → Manual investigation required
- ❌ **ERROR** → Fix connection, retry

---

## What's Being Deployed

### 3 Critical Database Migrations

| Migration | Type | Risk | Description |
|-----------|------|------|-------------|
| **0009** | New Tables | 🟡 Medium | Catalog redirect tables (4 tables) |
| **0010** | New Table | 🟢 Low | CMDB reconciliation results |
| **0011** | Alter Tables | 🔴 High | Service portfolio columns (REQUIRED) |

### Migration 0011 is Critical

**Why**: New code in `staging` branch writes to these columns:
- `service_offering` (text, nullable)
- `application_service` (text, nullable)

**Impact if NOT applied**:
- Database INSERT errors when case classification runs
- ServiceNow integration failures
- Production outage risk: 🔴 HIGH

**Code Files Affected**:
- `/lib/services/case-classifier.ts` (lines 309-310)
- `/lib/services/case-triage.ts` (lines 477-487, 579-589)

---

## Deployment Decision Tree

```
START: Do you have production DATABASE_URL?
  ├─ NO  → Get it from Vercel/Neon dashboard → START
  └─ YES → Run: npm run db:validate-prod
            ├─ Result: SAFE
            │   └─ Deploy now (merge staging to main)
            ├─ Result: NEEDS_MIGRATION
            │   └─ Run: npm run db:migrate → Validate again → Deploy
            ├─ Result: PARTIAL_MIGRATION
            │   └─ Manual investigation → Contact DBA
            └─ Result: ERROR
                └─ Fix DATABASE_URL → START
```

---

## Safe Deployment Path (Recommended)

### Step-by-Step

```bash
# 1. VALIDATE
export DATABASE_URL="production-url-here"
npm run db:validate-prod

# 2. If validation shows NEEDS_MIGRATION:
npm run db:migrate

# 3. VERIFY migration success
npm run db:validate-prod
# Should show: ✅ SAFE

# 4. DEPLOY code
git checkout main
git merge staging
git push origin main

# 5. MONITOR
# - Check Vercel deployment logs
# - Watch for database errors
# - Verify case classification works
```

---

## Backwards Compatibility Analysis

### Can old code run on new database schema? ✅ YES
- Migration 0009: Old code ignores new tables → SAFE
- Migration 0010: Old code ignores new table → SAFE
- Migration 0011: Old code doesn't write to new columns → SAFE

### Can new code run on old database schema? ❌ NO
- Migration 0009: New code tries to write to missing tables → ERROR (if feature enabled)
- Migration 0010: New code tries to write to missing table → ERROR (if CMDB used)
- Migration 0011: New code tries to write to missing columns → **DATABASE ERROR** 🔴

**Conclusion**: **MUST** run migrations BEFORE deploying new code.

---

## Risk Assessment

### Deployment Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Migration 0011 not applied → Code writes to missing columns | 🔴 CRITICAL | Run validation script first |
| Migration fails during execution | 🟡 MEDIUM | Neon auto-backups enabled |
| Data loss during migration | 🟢 LOW | All migrations are additive only |
| ServiceNow integration breaks | 🟡 MEDIUM | Monitor post-deployment |

### Data Loss Risk: 🟢 MINIMAL

**Why**:
- No DROP statements
- No ALTER to NOT NULL
- No data transformations
- All columns are nullable
- Neon has automatic backups

---

## Rollback Procedures

### If Migrations Fail

```bash
# Option A: Restore from Neon backup (RECOMMENDED)
# 1. Go to Neon dashboard
# 2. Navigate to Backups
# 3. Restore to point-in-time before migration

# Option B: Emergency rollback script (USE WITH CAUTION)
npm run db:emergency-rollback
```

### If Code Deployment Fails

```bash
# Vercel auto-rollback on build failure
# Manual rollback if needed:
git revert HEAD
git push origin main
```

---

## Files Created for This Deployment

### 1. Validation Script (READ-ONLY)
**File**: `/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/scripts/validate-production-migrations.ts`

**What it does**:
- ✅ Connects to production database (read-only)
- ✅ Checks if migrations 0009, 0010, 0011 are applied
- ✅ Verifies table/column existence
- ✅ Checks migration tracking table
- ✅ Provides deployment recommendations
- ✅ Analyzes backwards compatibility

**Run**: `npm run db:validate-prod`

### 2. Emergency Rollback Script (DESTRUCTIVE)
**File**: `/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/scripts/emergency-rollback-migrations.ts`

**What it does**:
- ⚠️  Removes schema changes from migrations 0009, 0010, 0011
- ⚠️  Requires manual confirmation (type YES twice)
- ⚠️  Only use after deployment failure

**Run**: `npm run db:emergency-rollback`

### 3. Comprehensive Deployment Guide
**File**: `/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/DEPLOYMENT-MIGRATION-GUIDE.md`

**Contents**:
- Complete migration details
- Deployment strategies
- Risk assessment
- Troubleshooting guide
- Post-deployment monitoring
- Contact/escalation procedures

---

## Pre-Deployment Checklist

### Before Validation
- [ ] I have production DATABASE_URL
- [ ] I can connect to production database
- [ ] Neon backups are enabled and verified

### Before Running Migrations
- [ ] Validation script shows migrations are needed
- [ ] I have backup plan ready
- [ ] I understand rollback procedures
- [ ] Team is notified

### Before Deploying Code
- [ ] Validation script shows "✅ SAFE" status
- [ ] All migrations are applied to production
- [ ] Staging has same migrations applied
- [ ] Monitoring is ready

### After Deployment
- [ ] Vercel deployment succeeded
- [ ] No database errors in logs
- [ ] Case classification is working
- [ ] ServiceNow integration is working
- [ ] Monitored for 15+ minutes

---

## Common Scenarios

### Scenario 1: First-time Production Deployment
**Situation**: Production database has never had migrations run

**Steps**:
1. Run validation → Will show `NEEDS_MIGRATION`
2. Run `npm run db:migrate`
3. Run validation again → Should show `✅ SAFE`
4. Deploy code

### Scenario 2: Migrations Already Applied
**Situation**: Someone already ran migrations on production

**Steps**:
1. Run validation → Will show `✅ SAFE`
2. Deploy code immediately
3. Monitor post-deployment

### Scenario 3: Partial Migration State
**Situation**: Some migrations applied, some not

**Steps**:
1. Run validation → Will show `🚨 PARTIAL_MIGRATION`
2. **DO NOT auto-deploy**
3. Investigate manually: `npm run db:studio`
4. Determine which migrations need to run
5. Contact DBA if uncertain

---

## Monitoring Post-Deployment

### First 5 Minutes

```bash
# Watch deployment
vercel ls

# Follow logs
vercel logs --follow

# Check for errors
grep -i error vercel-logs.txt
```

### First Hour

```sql
-- Check if service_offering is being populated
SELECT
  COUNT(*) as total_classifications,
  COUNT(service_offering) as with_service_offering,
  COUNT(application_service) as with_application_service
FROM case_classification_results
WHERE created_at > NOW() - INTERVAL '1 hour';
```

### Success Criteria
- ✅ No errors in Vercel logs
- ✅ Database queries succeeding
- ✅ `service_offering` populated when applicable
- ✅ ServiceNow webhooks processing
- ✅ Case classifications writing to database

---

## Emergency Contacts

### When to Escalate

- 🚨 PARTIAL_MIGRATION state detected
- 🚨 Production errors after deployment
- 🚨 Database connection failures
- 🚨 Data corruption suspected

### Escalation Steps

1. Run validation script for diagnostics
2. Check Neon dashboard for database health
3. Review Vercel logs for application errors
4. Restore from backup if critical
5. Contact database administrator

---

## Quick Reference

### Validation
```bash
npm run db:validate-prod
```

### Run Migrations
```bash
npm run db:migrate
```

### Emergency Rollback (Dangerous!)
```bash
npm run db:emergency-rollback
```

### Check Database Tables
```bash
npx tsx scripts/check-all-tables.ts
```

### View Database
```bash
npm run db:studio
```

---

## Next Steps

### RIGHT NOW (Before anything else)

1. **Get production DATABASE_URL**
   - From Vercel dashboard → Project Settings → Environment Variables
   - Or from Neon dashboard → Connection Details

2. **Run validation**
   ```bash
   export DATABASE_URL="your-url-here"
   npm run db:validate-prod
   ```

3. **Follow the script's recommendations**
   - Script will tell you exactly what to do
   - Don't skip validation step

---

**Last Updated**: October 21, 2025
**Created By**: Claude Code (AI Assistant)
**For Questions**: See DEPLOYMENT-MIGRATION-GUIDE.md
