# Database Migration System Fix Summary

## Problem
The `npm run db:migrate` command was failing with "relation already exists" errors, trying to re-run old migrations even though the tables already existed in the database.

## Root Causes

### 1. Orphaned Migration Files
- Found duplicate migration files that weren't tracked in the journal:
  - `0004_add_business_context_metadata.sql` (not in journal)
  - `0005_add_context_stewards.sql` (not in journal)
- These migrations were manually applied but never properly tracked

### 2. Wrong Migration Tracking Schema
The critical issue was **TWO** `__drizzle_migrations` tables existing in different schemas:
- **`public.__drizzle_migrations`**: Created by our manual script with migration names
- **`drizzle.__drizzle_migrations`**: Used by Drizzle ORM with SHA256 hashes

**Drizzle ORM uses the `drizzle` schema**, not `public`!

## Solution

### Step 1: Renamed Orphaned Migrations
- Renamed `0004_add_business_context_metadata.sql` → `0007_add_business_context_metadata.sql`
- Renamed `0005_add_context_stewards.sql` → `0008_add_context_stewards.sql`

### Step 2: Updated Journal
Added entries for migrations 0007 and 0008 to `migrations/meta/_journal.json`

### Step 3: Created Snapshot Files
- Created `migrations/meta/0007_snapshot.json`
- Created `migrations/meta/0008_snapshot.json`
- Updated snapshot IDs to maintain proper chain:
  - 0007 prevId → 0006
  - 0008 prevId → 0007

### Step 4: Fixed Migration Tracking Table
- Computed SHA256 hashes for all migration SQL files
- Added all 9 migrations to `drizzle.__drizzle_migrations` with correct hashes
- Dropped the incorrect `public.__drizzle_migrations` table

### Step 5: Updated Migration Script
Updated `scripts/migrate.ts` to:
- Remove manual creation of `__drizzle_migrations` table
- Let Drizzle ORM manage its own tracking table
- Query from `drizzle.__drizzle_migrations` instead of `public`

## Final State

All migrations are now properly tracked:

| Migration | Status | Hash (first 16 chars) |
|-----------|--------|----------------------|
| 0000_flowery_kingpin | ✅ Tracked | 8d6abf6321d6dbd8 |
| 0001_minor_sway | ✅ Tracked | e376e7edee82570f |
| 0002_daily_expediter | ✅ Tracked | 87467ee3052966e4 |
| 0003_rainy_sleeper | ✅ Tracked | 45f7ff810d223eb1 |
| 0004_equal_reptil | ✅ Tracked | e8a13ca57e5db1e6 |
| 0005_material_carnage | ✅ Tracked | 1859f2f3f0ed4515 |
| 0006_eminent_lady_ursula | ✅ Tracked | b2090d7a50ed37c7 |
| 0007_add_business_context_metadata | ✅ Tracked | 9542a3f9dd97a3ab |
| 0008_add_context_stewards | ✅ Tracked | 5d951c42f653ed82 |

## Verification

Running `npm run db:migrate` now:
- ✅ Completes successfully
- ✅ Shows "Migrations completed successfully"
- ✅ Reports 9 total migrations tracked
- ✅ Does NOT try to re-run old migrations

## Key Learnings

1. **Drizzle ORM uses the `drizzle` schema** for its migration tracking, not `public`
2. **Migration tracking uses SHA256 hashes** of the SQL file contents, not the migration names
3. **Never manually create the `__drizzle_migrations` table** - let Drizzle ORM manage it
4. **Orphaned migrations** (applied but not tracked) need to be properly added to the journal and tracking table

## Helper Scripts Created

- `fix-drizzle-schema-migrations.ts` - Fixes migration tracking by computing hashes and populating `drizzle.__drizzle_migrations`
- `check-snapshot-chain.ts` - Verifies snapshot chain integrity
- `debug-migrations.ts` - Shows journal vs database state
- `test-migrate-verbose.ts` - Shows which migrations would be run
- `check-both-tables.ts` - Compares `public` vs `drizzle` schema tables

## Future Migration Workflow

1. Generate new migration: `npx drizzle-kit generate`
2. Review generated SQL in `migrations/NNNN_name.sql`
3. Run migration: `npm run db:migrate`
4. Drizzle automatically:
   - Creates SHA256 hash of the SQL file
   - Adds entry to `drizzle.__drizzle_migrations`
   - Executes the migration
