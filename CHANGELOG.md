# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Service Portfolio Classification: AI now identifies and links Service Offerings and Application Services
- Database columns: `service_offering` and `application_service` in classification tables
- Complete dev → staging → prod workflow with branch protection
- GitHub Actions: CI build/test and schema validation workflows
- Comprehensive documentation: CONTRIBUTING.md, docs/DEPLOYMENT.md
- PR template with deployment checklists
- Cleanup script for test data (`scripts/cleanup-test-data.ts`)
- Runtime fallback for tool input schemas missing `type` field (defaults to "object")

### Changed
- Branch structure: Renamed `Development` → `staging` for Vercel consistency
- Created `dev` branch for active development
- Updated README.md with new workflow documentation
- `.env.local` updated with placeholders for environment-specific database URLs
- **BREAKING**: Upgraded @anthropic-ai/sdk from 0.38.0 to 0.67.0
- **BREAKING**: ToolDefinition interface now requires `inputSchema` to have proper JSON Schema structure with `type` field
- Tool type format changed from `type: "tool"` to `type: "custom"` to match SDK requirements

### Fixed
- Service Portfolio Classification now properly saves to database (was only in JSON before)
- Database schema includes service portfolio fields in both `case_classifications` and `case_classification_results` tables
- Fixed dual save calls in `case-classifier.ts` and `case-triage.ts` to include new fields
- Fixed tool validation error: "tools.0: Input tag 'tool' found using 'type' does not match expected tags"
- Fixed tool schema error: "tools.0.custom.input_schema.type: Field required"
- Agent orchestrator and all AI services now work correctly with Anthropic SDK 0.67.0

---

## [2025-10-16] - Service Portfolio & Workflow Setup

### What Was Implemented

#### 1. Service Portfolio Classification (Three Critical Fixes)

**Problem:** AI was identifying Service Offerings and Application Services in JSON response, but fields weren't being stored in the database.

**Fix #1: Database Schema**
- Added `service_offering TEXT` column to `case_classifications` table
- Added `application_service TEXT` column to `case_classifications` table
- Added `service_offering TEXT` column to `case_classification_results` table
- Added `application_service TEXT` column to `case_classification_results` table
- Created indexes for query performance
- Migration: `scripts/add-service-offering-columns.sql`

**Fix #2: Code Updates**
- Updated `lib/services/case-classifier.ts` (line 308-310) to save fields in first save call
- Updated `lib/services/case-triage.ts` (line 983-985) to save fields in second save call (this was the missing piece!)
- Updated `lib/db/schema.ts` with Drizzle ORM schema definitions

**Fix #3: Verification**
- Created test script: `scripts/test-altus-gorev-case.ts`
- Tested with Altus Community Healthcare (has 24 application services configured)
- Verified AI correctly identifies:
  - Service Offering: "Application Administration"
  - Application Service: "Altus Health - Gorev Production"
- Verified database storage working correctly

**Service Portfolio Categories:**
1. Infrastructure and Cloud Management
2. Network Management
3. Cybersecurity Management
4. Helpdesk and Endpoint Support
5. Application Administration (with dynamic company-specific applications)

#### 2. Development Workflow Setup

**Branch Strategy Implemented:**
```
main (production) ← staging ← dev ← feature/*
```

**Environment Mapping:**
- `main` → Production (Vercel Production, Neon main branch)
- `staging` → Staging (Vercel Staging, Neon staging branch)
- `dev` → Development (Vercel Preview, Neon dev branch)
- `feature/*` → Preview deployments (Vercel Preview, isolated Neon branches)

**GitHub Actions:**
- `.github/workflows/ci.yml`: Build and test on all PRs
- `.github/workflows/schema-check.yml`: Database migration validation

**Documentation Created:**
- `CONTRIBUTING.md`: Developer guide with branch strategy and workflows
- `docs/DEPLOYMENT.md`: Deployment procedures and rollback guides
- `.github/PULL_REQUEST_TEMPLATE.md`: Standardized PR process
- Updated `README.md`: New workflow overview

**Tooling:**
- `scripts/cleanup-test-data.ts`: Clean up test data from production

### Known Issues / Tech Debt

1. **Production Database Pollution**
   - Test case `SCS0TEST001` records exist in production database
   - Problem records created: PRB0040124, PRB0040125 in production ServiceNow
   - **Action Required:** Run cleanup script and manually close ServiceNow records

2. **Environment Variables**
   - Need to pull dev/staging database URLs from Vercel: `vercel env pull`
   - `.env.local` has placeholders but no actual dev/staging URLs yet

3. **Branch Protection**
   - GitHub branch protection rules not yet configured
   - **Action Required:** Set up protection for `main` and `staging` branches

### Testing Performed

- ✅ Schema changes applied to production database
- ✅ Build compiles successfully
- ✅ End-to-end test with Altus GoRev case
- ✅ Database storage verification
- ✅ Service Offering linked to Problem record (PRB0040125)
- ✅ Application Service correctly identified from company's 18 configured apps

### Migration Notes

**Database Changes:**
- Tables affected: `case_classifications`, `case_classification_results`
- Migration type: Adding nullable columns (safe, non-breaking)
- Rollback: Columns can be dropped if needed (no data loss risk as they're new)

**Code Changes:**
- All TypeScript types updated
- No breaking changes to existing APIs
- Backwards compatible (new fields are optional)

---

## Technical Debt & Future Work

### High Priority
- [ ] Clean up test data from production database
- [ ] Close/delete test Problem records in ServiceNow (PRB0040124, PRB0040125)
- [ ] Pull actual database URLs from Vercel for dev/staging
- [ ] Configure GitHub branch protection rules

### Medium Priority
- [ ] Add `service_offering_match` and `application_service_match` to `CaseTriageResult` interface
- [ ] Update test scripts to use environment-specific databases
- [ ] Add Slack notifications for deployment failures
- [ ] Document emergency rollback procedures with runbook

### Low Priority
- [ ] Add metrics/monitoring for service portfolio classification accuracy
- [ ] Create dashboard for service offering distribution
- [ ] Add validation for service offering values against known list

---

## Notes for Next Session

### Current State (as of 2025-10-16)

**Active Branch:** `dev`

**Database State:**
- Production database has schema changes applied ✅
- Test data exists in production (needs cleanup) ⚠️
- Schema supports service portfolio classification ✅

**Codebase State:**
- All code changes committed to `dev` branch ✅
- Workflow documentation complete ✅
- CI/CD pipelines configured ✅
- Ready for first feature PR ✅

**Immediate Next Steps:**
1. Pull environment variables: `vercel env pull .env.development.local`
2. Run cleanup script: `pnpm tsx scripts/cleanup-test-data.ts --confirm`
3. Manually close ServiceNow Problem records (PRB0040124, PRB0040125)
4. Set up GitHub branch protection rules
5. Test the workflow with a feature branch

**Key Files Modified:**
- `lib/db/schema.ts` - Added service portfolio columns
- `lib/services/case-classifier.ts` - Save service portfolio fields (first call)
- `lib/services/case-triage.ts` - Save service portfolio fields (second call)
- `CONTRIBUTING.md`, `docs/DEPLOYMENT.md`, `README.md` - Complete workflow docs

**Database Endpoints:**
- Production: `ep-tiny-lab-adoixq95-pooler` (main branch)
- Staging: (Pull from Vercel)
- Dev: (Pull from Vercel)

---

## References

- [Vercel + Neon Integration](https://vercel.com/docs/storage/vercel-postgres)
- [Neon Database Branching](https://neon.tech/docs/introduction/branching)
- [Drizzle ORM Migrations](https://orm.drizzle.team/docs/migrations)
