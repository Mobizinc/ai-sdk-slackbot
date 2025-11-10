# Project Feature Rollout Documentation

## Overview

This document tracks the rollout of the mentorship project management system, including interview flows, capacity management, waitlist functionality, and abandonment detection.

## Feature Components

### 1. Core Infrastructure

#### Database Schema
- **projects** table: Stores project definitions, mentor info, and configuration
- **projectInterests** table: Tracks candidate interest and application status
- **projectInterviews** table: Archives completed interview transcripts and match scores
- **projectStandups** table: Manages standup scheduling and collection
- **projectStandupResponses** table: Stores individual standup submissions
- **projectInitiationRequests** table: Tracks AI-assisted project creation requests

#### Status Flow
```
User clicks "I'm Interested" →
  ├─ Capacity available: pending → interviewing → (accepted | rejected)
  └─ Capacity full: waitlist → pending → interviewing → (accepted | rejected)
```

#### Abandonment Flow
```
Interview started (interviewing status) →
  24 hours pass without completion →
  Cron job marks as abandoned →
  Waitlist promotion triggered
```

### 2. Interview System

#### Files
- `lib/projects/interview-session.ts`: Core interview orchestration
- `lib/projects/matching-service.ts`: AI-powered candidate scoring
- `lib/projects/question-generator.ts`: Dynamic question generation
- `lib/projects/interview-events.ts`: Event emission for completed interviews

#### Scoring Migration
**Legacy Function**: `scoreInterviewAgainstProject()`
- Returns: `{ score, summary, recommendedTasks, concerns }`
- Used as fallback when enhanced scoring fails
- Token limit: 300

**Enhanced Function**: `scoreInterviewEnhanced()` _(Recommended)_
- Returns: All legacy fields PLUS `{ skillGaps, onboardingRecommendations, strengths, timeToProductivity }`
- Token limit: 500
- Provides richer onboarding insights

**Migration Status**:
- ✅ Enhanced function implemented and tested
- ✅ Backward compatibility maintained via fallback in interview-session.ts:424-439
- ✅ All new code uses enhanced function by default
- ⚠️ Legacy function retained for backward compatibility
- ℹ️ No breaking changes - old callers continue to work

**Action Required**: None - migration is transparent to callers.

### 3. Capacity Management

#### Files
- `lib/projects/capacity.ts`: Capacity checking and calculation
- `lib/projects/waitlist-service.ts`: Waitlist promotion logic
- `lib/projects/interactivity-helpers.ts`: Button click handling

#### Capacity Rules
```typescript
// Active interests = pending + interviewing (excludes waitlist, abandoned, rejected)
const activeCount = await getActiveInterestCount(projectId);
const hasCapacity = !maxCandidates || activeCount < maxCandidates;

// Slot availability calculation
const availableSlots = maxCandidates - activeCount;
```

#### Test Coverage Status
File: `tests/projects/capacity.test.ts`

**Covered Scenarios**:
- ✅ `checkCapacity()`: Available slots, at capacity, over capacity, unlimited projects
- ✅ `getProjectCapacityStatus()`: Full status, available capacity, waitlist size, unlimited
- ✅ `formatCapacityMessage()`: Display messages for all states
- ✅ `isProjectAcceptingApplications()`: Capacity, status, and expiration checks
- ✅ `shouldPromoteFromWaitlist()`: Slot availability and waitlist presence
- ✅ `calculateNewAvailableSlots()`: Accept, reject, abandon actions

**Test Suite Alignment**: ✅ All capacity rules are covered and passing.

### 4. Waitlist System

#### Files
- `lib/projects/waitlist-service.ts`: Promotion triggers and notifications

#### Promotion Triggers
1. **Interview Accepted** (score ≥ 70)
   - Called from: `lib/projects/interview-session.ts:552`
   - Function: `onInterviewAccepted()`

2. **Interview Rejected** (score < 70)
   - Called from: `lib/projects/interview-session.ts:554`
   - Function: `onInterviewRejected()`

3. **Candidate Withdrawal**
   - Endpoint: `/api/projects/withdraw` _(future)_
   - Function: `onCandidateWithdrew()`

4. **Admin Capacity Increase**
   - Endpoint: `/api/admin/projects/:id/update-capacity` _(future)_
   - Function: `onMaxCandidatesIncreased()`

**Current Status**:
- ✅ Triggers 1-2 are wired and active
- ⏳ Triggers 3-4 require API endpoints (future work)

### 5. Abandonment Detection

#### Files
- `lib/projects/interview-abandonment-service.ts`: Sweep logic
- `api/internal/sweep-abandonments.ts`: Cron endpoint

#### Configuration
```env
# Required environment variable
INTERNAL_CRON_SECRET=<your-secret-here>

# Abandonment threshold
ABANDONMENT_THRESHOLD_HOURS=24  # Hardcoded in service
```

#### Cron Setup
**Endpoint**: `POST /api/internal/sweep-abandonments`
**Schedule**: Every 6 hours (recommended)
**Authentication**: Bearer token via `INTERNAL_CRON_SECRET`

**Example cURL**:
```bash
curl -X POST https://your-app.com/api/internal/sweep-abandonments \
  -H "Authorization: Bearer $INTERNAL_CRON_SECRET"
```

**Test Coverage**: ✅ `tests/api/internal/sweep-abandonments.test.ts`

### 6. Interactivity Layer

#### Files
- `api/interactivity.ts`: Slack button handler
- `lib/projects/interactivity-helpers.ts`: Business logic extraction

#### Button Actions
- **I'm Interested**: Creates interest record, checks capacity, starts interview
- **Join Waitlist**: Adds user to waitlist with position tracking
- **Learn More**: Sends project background via DM

**Legacy Cleanup Status**: ✅ Complete
- All inline interest creation logic extracted to `interactivity-helpers.ts`
- Clean separation: API layer → helper functions → repositories
- No legacy inline code remaining in `api/interactivity.ts`

## Database Operations

### Drizzle ORM `.returning()` Support

**Files using `.returning()`**:
- `lib/db/repositories/interest-repository.ts:32` - `createInterest()`
- `lib/db/repositories/interest-repository.ts:173` - `updateInterestStatus()`
- `lib/projects/interview-session.ts:544` - `persistInterviewResult()`

**Production Verification**:
- ✅ `.returning()` is supported in PostgreSQL (Drizzle ORM)
- ✅ Used in production-like test scenarios
- ⚠️ **Action Required**: Monitor production logs on first deploy for any Drizzle errors
- ℹ️ Fallback: If errors occur, add `|| null` checks after `.returning()[0]`

**Example Safe Pattern**:
```typescript
const [created] = await db.insert(table).values({...}).returning();
return created ?? null; // Safe fallback
```

**Verification Steps**:
1. Deploy to staging environment
2. Trigger interest creation via button click
3. Check logs for Drizzle errors
4. If successful, proceed to production

## Deployment Checklist

### Pre-Deployment
- [x] Database schema includes project tables
- [x] Migrations 0000-0018 applied (project tables introduced around 0012-0018)
- [x] Environment variables configured
  - [ ] `INTERNAL_CRON_SECRET` for cron authentication
- [x] Test suite passing
  - [x] Capacity tests
  - [x] Matching service tests
  - [x] Sweep abandonments tests

### Deployment Steps
1. **Database Migration** (if needed)
   ```bash
   pnpm db:push  # Push schema changes
   # OR
   pnpm db:generate && pnpm db:migrate  # Generate and apply migrations
   ```

2. **Environment Configuration**
   ```bash
   # Set cron secret
   export INTERNAL_CRON_SECRET=$(openssl rand -hex 32)
   ```

3. **Deploy Application**
   - Build and deploy API with project features
   - Verify Slack interactivity endpoint responds

4. **Configure Cron Job**
   - Platform: Vercel Cron, GitHub Actions, or external service
   - Schedule: `0 */6 * * *` (every 6 hours)
   - Command: `curl -X POST <url>/api/internal/sweep-abandonments -H "Authorization: Bearer $SECRET"`

5. **Verify `.returning()` Support**
   - Test interest creation in staging
   - Monitor logs for Drizzle errors
   - Validate interest records are created correctly

### Post-Deployment
- [ ] Monitor abandonment sweep results via logs
- [ ] Track waitlist promotion metrics
- [ ] Review interview completion rates
- [ ] Validate enhanced scoring output quality

## Known Issues & Limitations

### Current Limitations
1. **No Candidate Withdrawal API**: Users cannot manually withdraw from waitlist
2. **No Admin Capacity Management**: Mentors cannot adjust `maxCandidates` dynamically
3. **No Interview Resume**: Abandoned interviews cannot be resumed (by design)
4. **No Waitlist Position Notifications**: Users not notified when position changes

### Future Enhancements
1. **Withdrawal Endpoint**: `POST /api/projects/:id/withdraw`
2. **Admin Dashboard**: Capacity management UI
3. **Waitlist Notifications**: Alert users when they move up in queue
4. **Analytics Dashboard**: Track conversion rates, abandonment metrics
5. **Interview Retries**: Allow candidates to retry abandoned interviews after cooldown

## Rollback Plan

If critical issues arise:

1. **Disable Cron Job**: Stop abandonment sweeps
2. **Pause Project Postings**: Set all projects to `status: 'draft'`
3. **Rollback Code**: Revert to previous deployment
4. **Database Rollback** (if needed):
   ```bash
   # Only if migrations were applied
   pnpm db:drop && pnpm db:push:previous
   ```

## Metrics & Monitoring

### Key Metrics
- **Interview Completion Rate**: `completed / started`
- **Abandonment Rate**: `abandoned / started`
- **Waitlist Promotion Rate**: `promoted / waitlisted`
- **Capacity Utilization**: `active_interests / maxCandidates`
- **Average Time to Complete Interview**: Track via `startedAt` and `completedAt`

### Log Monitoring
```bash
# Abandonment sweeps
grep "Abandonment Sweep" logs

# Waitlist promotions
grep "Waitlist.*Promoting candidate" logs

# Capacity checks
grep "Capacity.*Project Full" logs
```

## Support & Troubleshooting

### Common Issues

**Issue**: Interviews not being marked as abandoned
- **Cause**: Cron job not running or auth failing
- **Fix**: Check `INTERNAL_CRON_SECRET`, verify cron schedule

**Issue**: Waitlist not promoting candidates
- **Cause**: Capacity calculation incorrect or promotion disabled
- **Fix**: Check `getActiveInterestCount()` excludes waitlist/rejected

**Issue**: `.returning()` errors in production
- **Cause**: Drizzle version or PostgreSQL compatibility
- **Fix**: Add `|| null` fallback, update Drizzle ORM

**Issue**: Enhanced scoring failures
- **Cause**: Model timeout or rate limits
- **Fix**: Falls back to legacy scoring automatically (interview-session.ts:424)

### Debug Commands
```bash
# Check active interests for project
psql $DATABASE_URL -c "SELECT * FROM project_interests WHERE project_id = 'proj-123' AND status NOT IN ('abandoned', 'rejected', 'waitlist');"

# Check abandoned interviews
psql $DATABASE_URL -c "SELECT * FROM project_interviews WHERE completed_at IS NULL AND started_at < NOW() - INTERVAL '24 hours';"

# Check waitlist
psql $DATABASE_URL -c "SELECT * FROM project_interests WHERE status = 'waitlist' ORDER BY created_at;"
```

## Contact

For questions or issues with this rollout:
- **Primary**: Review this document and linked code files
- **Escalation**: Check logs and database state
- **Critical Issues**: Roll back using plan above

---

**Last Updated**: 2025-01-09
**Document Version**: 1.0
**Status**: Production Ready ✅
