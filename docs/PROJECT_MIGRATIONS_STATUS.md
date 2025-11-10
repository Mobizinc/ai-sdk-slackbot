# Project Feature Migrations Status

## Summary

✅ **All required database migrations for the project feature are already applied.**

No additional migrations (0026, 0027) are needed. The schema is complete and production-ready.

## Migration History

### Migration 0020: Projects Table
**File**: `migrations/0020_projects_table.sql`

Created the core `projects` table with:
- Project metadata (name, summary, background)
- Tech stack and skills (required/nice-to-have)
- Mentor information
- Interview and standup configuration
- Capacity management (`maxCandidates`)
- Status tracking and expiration dates

### Migration 0025: Project Interests & Enhanced Matching
**File**: `migrations/0025_add_project_interests.sql`

**Part 1: Enhanced Matching Fields**
Added columns to `project_interviews` table:
- `skill_gaps` (jsonb): Missing or weak skills identified during interview
- `onboarding_recommendations` (jsonb): Resources/tutorials for candidate preparation
- `strengths` (jsonb): Candidate strengths matching project needs
- `time_to_productivity` (text): Estimated ramp-up time
- `interest_id` (uuid): Foreign key to link interview with interest record

**Part 2: Project Interests Table**
Created `project_interests` table for:
- Duplicate application prevention
- Capacity management
- Waitlist tracking
- Abandonment detection

**Columns**:
```sql
id                   uuid PRIMARY KEY
project_id           text NOT NULL
candidate_slack_id   text NOT NULL
status               text DEFAULT 'pending' NOT NULL
                     -- Values: pending, interviewing, accepted, rejected, abandoned, waitlist
interview_id         uuid  -- Link to projectInterviews
created_at           timestamp with time zone
updated_at           timestamp with time zone
abandoned_at         timestamp with time zone  -- When interview was abandoned
```

**Indexes Created**:
- `idx_project_interests_project` on `project_id`
- `idx_project_interests_candidate` on `candidate_slack_id`
- `idx_project_interests_status` on `status`
- `idx_project_interests_project_candidate` on `(project_id, candidate_slack_id)`
- `idx_project_interests_created_at` on `created_at`
- `idx_project_interviews_interest` on `interest_id`

## Schema Verification

To verify the schema is correctly applied in your environment:

```bash
# Check if project_interests table exists
psql $DATABASE_URL -c "\d project_interests"

# Verify enhanced columns in project_interviews
psql $DATABASE_URL -c "\d project_interviews" | grep -E "skill_gaps|interest_id|abandoned_at"

# Check indexes
psql $DATABASE_URL -c "\di project_interests*"
```

Expected output should show:
- ✅ `project_interests` table with 8 columns
- ✅ 5 indexes on project_interests
- ✅ Enhanced matching columns in project_interviews

## Migration Status

| Migration | Status | Description |
|-----------|--------|-------------|
| 0020 | ✅ Applied | Created projects table |
| 0025 | ✅ Applied | Added project_interests + enhanced matching |
| 0026 | ❌ Not Needed | Schema complete - no additional changes required |
| 0027 | ❌ Not Needed | Schema complete - no additional changes required |

## Next Steps

**No migration action required**. The schema is production-ready.

### If Starting Fresh (New Environment)

If deploying to a new database instance:

```bash
# Option 1: Push entire schema (recommended for new instances)
pnpm db:push

# Option 2: Apply migrations sequentially
pnpm db:migrate
```

### If Updating Existing Environment

If your environment is missing migration 0025:

```bash
# Generate and apply pending migrations
pnpm db:generate  # Generates migration files
pnpm db:migrate   # Applies pending migrations
```

### Verification After Deployment

```bash
# 1. Verify schema matches expected structure
pnpm db:check

# 2. Run database-dependent tests
pnpm test tests/db/repositories/interest-repository.test.ts
pnpm test tests/projects/capacity.test.ts

# 3. Check production readiness
pnpm db:studio  # Open Drizzle Studio to inspect tables
```

## Schema Design Notes

### Why No Foreign Keys?

The schema intentionally uses text references (`project_id`, `candidate_slack_id`) without foreign key constraints because:

1. **Slack IDs** are external identifiers not stored in our database
2. **Project IDs** come from JSON config files, not database records (for now)
3. **Flexibility** to handle orphaned records during development

In future iterations, consider:
- Adding foreign key from `project_interests.interview_id` to `project_interviews.id`
- Storing projects in database with proper relationships

### Status Flow Integrity

The `status` column in `project_interests` is not constrained to specific values (no enum type or check constraint). This allows flexibility but requires application-level validation.

**Valid Status Values**:
- `pending`: Interest created, awaiting interview
- `interviewing`: Interview in progress
- `accepted`: Interview score ≥ 70
- `rejected`: Interview score < 70
- `abandoned`: Interview started but not completed within 24h
- `waitlist`: Project at capacity, user waiting for slot

**Enforcement**: Handled by application logic in:
- `lib/db/repositories/interest-repository.ts`
- `lib/projects/interactivity-helpers.ts`
- `lib/projects/interview-abandonment-service.ts`

## Rollback Procedure

If you need to rollback project features:

### Soft Rollback (Keep Data)
```bash
# 1. Disable project features in code
# 2. Set all projects to status='draft'
psql $DATABASE_URL -c "UPDATE projects SET status = 'draft';"

# 3. Stop cron jobs
# 4. Monitor for lingering processes
```

### Hard Rollback (Remove Tables)
```bash
# WARNING: This deletes all project data
psql $DATABASE_URL -c "DROP TABLE IF EXISTS project_interests CASCADE;"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS project_interviews CASCADE;"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS projects CASCADE;"

# Alternatively, rollback migration
pnpm db:drop  # Nuclear option - drops entire database
```

### Incremental Rollback (Remove Enhancement Fields Only)
```bash
# Keep project_interests but remove enhanced matching fields
psql $DATABASE_URL -c "
  ALTER TABLE project_interviews
    DROP COLUMN IF EXISTS skill_gaps,
    DROP COLUMN IF EXISTS onboarding_recommendations,
    DROP COLUMN IF EXISTS strengths,
    DROP COLUMN IF EXISTS time_to_productivity,
    DROP COLUMN IF EXISTS interest_id;
"

# Remove interest-related index
psql $DATABASE_URL -c "DROP INDEX IF EXISTS idx_project_interviews_interest;"
```

## Documentation References

- **Rollout Guide**: `docs/PROJECT_FEATURE_ROLLOUT.md`
- **Schema Definition**: `lib/db/schema.ts` (lines 803-905)
- **Repository Layer**: `lib/db/repositories/interest-repository.ts`
- **Drizzle Config**: `drizzle.config.ts`

---

**Last Updated**: 2025-01-09
**Schema Version**: 0025 (Current & Complete)
**Status**: ✅ Production Ready - No Additional Migrations Required
