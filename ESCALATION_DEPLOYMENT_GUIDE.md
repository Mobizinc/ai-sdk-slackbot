# Case Escalation System - Deployment Guide

## Overview

The automatic escalation system for non-BAU cases has been successfully implemented and tested. This guide covers deployment steps and configuration.

## ✅ What Was Implemented

### Core Components

1. **Escalation Decision Engine** (`lib/services/escalation-service.ts`)
   - Rule-based escalation triggers (project scope, executive visibility, compliance, financial impact)
   - Business intelligence score threshold (default: 20/100)
   - 24-hour duplicate prevention

2. **Channel Routing** (`lib/config/escalation-channels.ts`)
   - Priority-based rule matching
   - Client-specific channels
   - Category-based routing
   - Assignment group routing
   - Default fallback channel

3. **Message Builder** (`lib/services/escalation-message-builder.ts`)
   - LLM-generated contextual summaries and questions
   - Fallback template if LLM unavailable
   - Slack Block Kit formatting
   - Interactive action buttons

4. **Database Tracking** (`lib/db/repositories/escalation-repository.ts`)
   - Escalation history
   - Acknowledgment tracking
   - Statistics and reporting

5. **Interactive Buttons** (`api/interactivity.ts`)
   - Create Project
   - Acknowledge as BAU
   - Reassign
   - View in ServiceNow

### Integration Points

- ✅ Triggers automatically from `lib/services/case-triage.ts` after classification
- ✅ Database migration applied (0015_closed_toad)
- ✅ Environment variables configured in `.env.local`

## 🧪 Test Results

All core functionality tested and passing:

```
✅ Channel routing validated
✅ Business intelligence scoring working
✅ Escalation decision logic functional
✅ Database duplicate detection operational
```

Test scenarios verified:
- ✅ Project scope detection → Escalates
- ✅ Executive visibility → Escalates
- ✅ Compliance impact → Escalates
- ✅ Financial impact → Escalates
- ✅ Normal BAU case → Does NOT escalate
- ✅ Duplicate prevention working (24-hour window)

## 🚀 Deployment Steps

### 1. Create Slack Channels

Create the following channels in your Slack workspace:

**Required:**
- `#case-escalations` (default fallback)

**Recommended (based on routing rules):**
- `#your-org-escalations` (for "Your Organization" client)
- `#infrastructure-escalations`
- `#network-escalations`
- `#application-escalations`
- `#service-desk-escalations`

> 💡 **Tip**: Update channel names in `lib/config/escalation-channels.ts` to match your naming conventions

### 2. Configure Slack App Interactivity

1. Go to your Slack app configuration at https://api.slack.com/apps
2. Navigate to **Interactivity & Shortcuts**
3. Enable **Interactivity**
4. Set **Request URL** to: `https://your-domain.vercel.app/api/interactivity`
5. Click **Save Changes**

### 3. Set Environment Variables

The following variables are already configured in `.env.local`:

```bash
ESCALATION_ENABLED="true"
ESCALATION_BI_SCORE_THRESHOLD="20"
ESCALATION_DEFAULT_CHANNEL="case-escalations"
ESCALATION_NOTIFY_ASSIGNED_ENGINEER="true"
ESCALATION_USE_LLM_MESSAGES="true"
```

For Vercel deployment, add these to your environment:

```bash
# Development environment
vercel env add ESCALATION_ENABLED development
# Enter: true

vercel env add ESCALATION_BI_SCORE_THRESHOLD development
# Enter: 20

vercel env add ESCALATION_DEFAULT_CHANNEL development
# Enter: case-escalations

vercel env add ESCALATION_NOTIFY_ASSIGNED_ENGINEER development
# Enter: true

vercel env add ESCALATION_USE_LLM_MESSAGES development
# Enter: true
```

Repeat for `preview` and `production` environments.

### 4. Deploy to Vercel

```bash
# Commit the changes
git add .
git commit -m "Add automatic case escalation system"

# Push to trigger deployment
git push origin dev  # or your target branch
```

The database migration will run automatically on Vercel deploy (see `vercel.json` configuration).

### 5. Verify Deployment

1. **Check migration applied:**
   ```bash
   vercel logs --follow
   # Look for: "✅ Migrations completed successfully"
   ```

2. **Check environment variables loaded:**
   ```bash
   vercel env ls
   # Verify all ESCALATION_* variables present
   ```

3. **Test with sample case:**
   - Create a test case in ServiceNow with business intelligence triggers
   - Verify escalation posts to Slack
   - Test interactive buttons

## 📊 Configuration Options

### Escalation Threshold

Adjust the BI score threshold to control sensitivity:

```bash
ESCALATION_BI_SCORE_THRESHOLD="20"  # Default (recommended)
# Lower = more sensitive (more escalations)
# Higher = less sensitive (fewer escalations)
```

**Scoring breakdown:**
- Project scope: +20 points
- Executive visibility: +30 points
- Compliance impact: +25 points
- Financial impact: +25 points
- Outside service hours: +10 points
- Client technology: +5 points
- Related entities: +5 per entity (max +15)

### Channel Routing Rules

Edit `lib/config/escalation-channels.ts` to customize routing:

```typescript
{
  client: "Your Organization",
  channel: "your-org-escalations",
  priority: 100,  // Higher priority = checked first
}
```

**Rule matching order:**
1. Client match (highest priority)
2. Category match
3. Assignment group match
4. Default fallback (`client: "*"`)

### LLM Message Generation

Toggle LLM-generated messages:

```bash
ESCALATION_USE_LLM_MESSAGES="true"   # AI-generated contextual questions
ESCALATION_USE_LLM_MESSAGES="false"  # Use template fallback
```

**LLM benefits:**
- Contextual summaries specific to each case
- Intelligent clarifying questions
- Better scoping information

**Template fallback:**
- No LLM cost
- Generic questions
- Uses `next_steps` from classification

### Engineer Notifications

Control whether to tag assigned engineers:

```bash
ESCALATION_NOTIFY_ASSIGNED_ENGINEER="true"   # @mention engineer
ESCALATION_NOTIFY_ASSIGNED_ENGINEER="false"  # Don't mention
```

## 🔍 Monitoring & Metrics

### View Escalation Statistics

Use the repository method:

```typescript
const stats = await escalationRepository.getEscalationStats(7);
// Returns:
// - totalEscalations
// - activeEscalations
// - acknowledgedEscalations
// - averageResponseTime (minutes)
// - topReasons
```

### Database Queries

Check active escalations:

```sql
SELECT case_number, escalation_reason, business_intelligence_score,
       slack_channel, status, created_at
FROM case_escalations
WHERE status = 'active'
ORDER BY created_at DESC;
```

Check acknowledgment rates:

```sql
SELECT
  COUNT(*) as total,
  COUNT(acknowledged_by) as acknowledged,
  ROUND(COUNT(acknowledged_by)::numeric / COUNT(*) * 100, 2) as ack_rate
FROM case_escalations
WHERE created_at > NOW() - INTERVAL '7 days';
```

## 🐛 Troubleshooting

### No escalation posted to Slack

**Check logs:**
```bash
vercel logs --follow
# Look for: "[Escalation Service] Escalation triggered for..."
```

**Common issues:**
1. BI score below threshold → Lower `ESCALATION_BI_SCORE_THRESHOLD`
2. Duplicate prevention → Check database for recent escalation
3. Channel doesn't exist → Create channel in Slack
4. LLM failure → Set `ESCALATION_USE_LLM_MESSAGES="false"` for fallback

### Buttons not working

**Check:**
1. Interactivity configured in Slack app
2. Request URL matches `/api/interactivity`
3. Slack signing secret is correct
4. Check Vercel logs for interactivity endpoint errors

### Database errors

**Check:**
1. Migration applied: `npm run db:migrate`
2. DATABASE_URL set correctly
3. Neon Postgres accessible

## 📝 Example Escalation Flow

1. **Case Created in ServiceNow**
   - OnePacs multi-location installation
   - Requires professional services

2. **AI Triage Classifies**
   - Detects `project_scope_detected: true`
   - Calculates BI score: 40/100

3. **Escalation Service Triggers**
   - Score (40) > threshold (20) ✅
   - Checks for duplicates ✅
   - Routes to `#your-org-escalations` based on client

4. **Message Posted to Slack**
   - LLM generates contextual summary
   - Asks 2-4 scoping questions
   - Adds interactive buttons
   - @mentions assigned engineer

5. **Engineer Responds**
   - Clicks "Create Project" button
   - Escalation marked as acknowledged
   - Thread updated with next steps

## 🔧 Customization Examples

### Add New Channel Rule

```typescript
// lib/config/escalation-channels.ts
{
  client: "Acme Corp",
  category: "Security",
  channel: "acme-security-escalations",
  priority: 150,  // Higher than default client rule
}
```

### Adjust Escalation Criteria

```typescript
// lib/services/escalation-service.ts
// Current logic: OR of all conditions
const shouldEscalate =
  bi.project_scope_detected ||
  bi.executive_visibility ||
  bi.compliance_impact ||
  bi.financial_impact ||
  biScore >= config.escalationBiScoreThreshold;

// Example: Require BOTH high score AND flag
const shouldEscalate =
  biScore >= 30 &&
  (bi.project_scope_detected || bi.executive_visibility);
```

### Custom Message Templates

```typescript
// lib/services/escalation-message-builder.ts
// Modify getFallbackQuestions() to add domain-specific questions
function getFallbackQuestions(context: EscalationContext): string[] {
  const questions: string[] = [
    "How many users will be impacted?",
    "What is your preferred timeline?",
    "Do you have budget approval?",
    // Add your custom questions here
  ];
  return questions;
}
```

## 📚 Reference

### Key Files

| File | Purpose |
|------|---------|
| `lib/services/escalation-service.ts` | Core escalation logic and orchestration |
| `lib/services/escalation-message-builder.ts` | Slack message generation |
| `lib/config/escalation-channels.ts` | Channel routing rules |
| `lib/db/repositories/escalation-repository.ts` | Database operations |
| `api/interactivity.ts` | Interactive button handlers |
| `lib/services/case-triage.ts:776-796` | Integration trigger point |

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `ESCALATION_ENABLED` | `true` | Master on/off switch |
| `ESCALATION_BI_SCORE_THRESHOLD` | `20` | Minimum score to trigger |
| `ESCALATION_DEFAULT_CHANNEL` | `case-escalations` | Fallback channel |
| `ESCALATION_NOTIFY_ASSIGNED_ENGINEER` | `true` | @mention engineer |
| `ESCALATION_USE_LLM_MESSAGES` | `true` | Use LLM vs templates |

### Test Scripts

```bash
# Unit tests (no Slack/LLM required)
npx tsx scripts/test-escalation-logic.ts

# Full integration test (requires Slack channels)
npx tsx scripts/test-escalation.ts
```

## 🎯 Success Metrics

Track these KPIs post-deployment:

1. **Escalation Volume**: Cases escalated per day
2. **Acknowledgment Rate**: % of escalations acknowledged within 1 hour
3. **False Positive Rate**: % of escalations marked as "Acknowledge BAU"
4. **Time to Response**: Average time from escalation to first engineer response
5. **Project Conversion**: % of escalations that become projects

## 🔄 Future Enhancements

Potential improvements:

1. **Automated Project Creation**
   - Create ServiceNow project record
   - Assign project manager
   - Generate project charter

2. **Automated Reassignment**
   - Update ServiceNow assignment via API
   - Notify new assignee

3. **SLA Tracking**
   - Set response time SLAs by priority
   - Alert if SLA breach imminent

4. **Escalation Routing ML**
   - Train model to predict best channel
   - Learn from acknowledgment patterns

5. **Customer Notifications**
   - Auto-reply to customer via ServiceNow
   - Set expectations for project scoping

---

## ✅ Ready for Production

The escalation system is fully functional and tested. Complete the deployment steps above to go live.

For questions or issues, check the troubleshooting section or review the test results in `scripts/test-escalation-logic.ts`.
