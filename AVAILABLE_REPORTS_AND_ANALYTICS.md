# Available Reports & Analytics

This document lists all reporting and analytics capabilities in the system.

---

## 📊 Quick Reference

| Report | Type | Command |
|--------|------|---------|
| **Missing Categories** | Analytics | `npx tsx --env-file=.env.local scripts/report-missing-categories.ts` |
| **Catalog Redirects** | Analytics | `npx tsx --env-file=.env.local scripts/report-catalog-redirects.ts` |
| **Case Queue Report** | Slack Report | `npx tsx --env-file=.env.local scripts/post-case-queue-report.ts` |
| **Case Leaderboard** | Slack Report | `npx tsx --env-file=.env.local scripts/post-case-leaderboard.ts` |
| **Repeat Submitters** | Analytics | `npx tsx --env-file=.env.local scripts/analyze-repeat-submitter-patterns.ts` |

---

## 1️⃣ Category Mismatch Analytics ⭐ NEW

**Purpose:** Shows AI-suggested categories that don't exist in ServiceNow

**Includes:**
- Parent-child category relationships
- Frequency analysis (how many times suggested)
- Confidence scores
- Recent case examples
- Recommended categories to add

**Metrics:**
- Total mismatches (last 30 days)
- Unique missing categories
- Suggested subcategories per category
- Average confidence per category

**Current Data (as of last run):**
```
Total Mismatches:      8 cases
Unique Categories:     4 categories
Average Confidence:    92.1%

Top Missing:
1. "Telephony" - 4 cases, 95% confidence
   Subcategories: Phone Number Assignment, License/Number Reassignment, Teams Phone Number Assignment

2. "Hardware" - 2 cases, 89% confidence
   Subcategories: Docking Station Configuration, Monitor Provisioning

3. "Access" - 1 case, 82% confidence
4. "Admin Time" - 1 case, 98% confidence
```

**Run:**
```bash
npx tsx --env-file=.env.local scripts/report-missing-categories.ts
```

**Repository:**
- `lib/db/repositories/category-mismatch-repository.ts`
  - `getStatistics(days)`
  - `getTopSuggestedCategories(days)`
  - `getRecentMismatches(limit)`

**Database Table:** `category_mismatch_log`

---

## 2️⃣ Catalog Redirect Analytics ⭐ NEW

**Purpose:** Tracks HR request redirects to catalog items

**Includes:**
- Redirects by request type (onboarding, termination, new_account)
- Redirects by company
- Top matched keywords
- Top submitters
- Daily trend analysis
- Auto-close rates

**Metrics:**
- Total redirects per client
- Average confidence scores
- Auto-close rate
- Redirect distribution by type
- Top 10 matched keywords
- Top 10 frequent submitters
- Daily redirect volume

**Current Data (as of last run):**
```
Enabled Clients:       1 (Altus Community Healthcare)
Total Redirects:       0 (feature just configured)
Average Confidence:    N/A
```

**Run:**
```bash
npx tsx --env-file=.env.local scripts/report-catalog-redirects.ts

# Or for specific client
npx tsx --env-file=.env.local -e "
import { getClientSettingsRepository } from './lib/db/repositories/client-settings-repository.js';
const repo = getClientSettingsRepository();
const metrics = await repo.getRedirectMetrics('c3eec28c931c9a1049d9764efaba10f3', 30);
console.log(JSON.stringify(metrics, null, 2));
"
```

**Repository:**
- `lib/db/repositories/client-settings-repository.ts`
  - `getRedirectMetrics(clientId, days)`
  - `getClientsWithRedirectEnabled()`

**Database Table:** `catalog_redirect_log`

**SQL Queries:**
```sql
-- Redirects by type and company
SELECT request_type, client_name, COUNT(*), AVG(confidence)
FROM catalog_redirect_log
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY request_type, client_name
ORDER BY COUNT(*) DESC;

-- Top keywords
SELECT
  keyword,
  COUNT(*) as case_count
FROM catalog_redirect_log,
  LATERAL unnest(matched_keywords) as keyword
GROUP BY keyword
ORDER BY case_count DESC
LIMIT 20;

-- Auto-close rate
SELECT
  client_name,
  COUNT(*) as total,
  SUM(CASE WHEN case_closed THEN 1 ELSE 0 END) as closed,
  ROUND(AVG(CASE WHEN case_closed THEN 1 ELSE 0 END) * 100, 1) as close_rate
FROM catalog_redirect_log
GROUP BY client_name;
```

---

## 3️⃣ Case Queue Reports

**Purpose:** Daily snapshots of open cases with trend analysis

**Includes:**
- Open cases by priority (1-5)
- Cases by assignment group
- Aging analysis (> 24h, > 3 days, > 7 days)
- High priority alerts
- Unassigned case details
- Trend charts

**Metrics:**
- Total open cases
- Priority distribution
- Assignment group distribution
- Aging statistics
- Unassigned count

**Run:**
```bash
# Post to Slack
npx tsx --env-file=.env.local scripts/post-case-queue-report.ts

# Pull snapshot data only
npx tsx --env-file=.env.local scripts/pull-case-queue-snapshot.ts

# API endpoint (cron job)
curl https://your-domain.vercel.app/api/cron/case-queue-report?channel=CHANNEL_ID
```

**Service:**
- `lib/services/case-queue-report.ts`
- `lib/services/case-queue-snapshots.ts`

**Cron Job:**
- `api/cron/case-queue-report.ts`
- `api/cron/case-queue-snapshot.ts`

---

## 4️⃣ Case Leaderboard

**Purpose:** Engineer performance metrics and gamification

**Includes:**
- Cases resolved per engineer
- Resolution time averages
- Leaderboard rankings
- Time period customizable (7/14/30 days)

**Metrics:**
- Total cases resolved
- Average resolution time
- Top performers
- Resolution velocity

**Run:**
```bash
# Post to Slack (7 days)
npx tsx --env-file=.env.local scripts/post-case-leaderboard.ts

# API endpoint (custom days)
curl https://your-domain.vercel.app/api/cron/case-leaderboard?channel=CHANNEL_ID&days=30
```

**Service:**
- `lib/services/case-leaderboard.ts`

**Cron Job:**
- `api/cron/case-leaderboard.ts`

---

## 5️⃣ Escalation Analytics

**Purpose:** Tracks non-BAU case escalations to Slack

**Includes:**
- Escalation reasons (project scope, executive, compliance, financial)
- Response time tracking
- Acknowledgment rates
- Business intelligence scores

**Metrics:**
- Total escalations
- Escalations by reason
- Average response time
- Acknowledgment rate
- BI score distribution

**Database Table:** `case_escalations`

**Repository:**
- `lib/db/repositories/escalation-repository.ts`

**SQL Queries:**
```sql
-- Escalations by reason
SELECT escalation_reason, COUNT(*), AVG(business_intelligence_score)
FROM case_escalations
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY escalation_reason
ORDER BY COUNT(*) DESC;

-- Response time analysis
SELECT
  AVG(EXTRACT(EPOCH FROM (acknowledged_at - created_at))/60) as avg_response_minutes,
  COUNT(*) FILTER (WHERE acknowledged_at IS NOT NULL) as acknowledged_count,
  COUNT(*) as total_count
FROM case_escalations
WHERE created_at > NOW() - INTERVAL '7 days';

-- Active vs acknowledged
SELECT
  status,
  COUNT(*)
FROM case_escalations
GROUP BY status;
```

**Note:** Escalation service exists but is **NOT YET INTEGRATED** into case-triage.ts (pending)

---

## 6️⃣ CMDB Reconciliation Reports

**Purpose:** Tracks configuration item (CI) discovery and reconciliation

**Includes:**
- CIs detected in cases
- Reconciliation success/failure
- Missing CIs (detected but not in CMDB)
- Task creation for missing CIs

**Metrics:**
- Total CIs detected
- Reconciliation success rate
- Missing CI count
- Tasks created

**Database Table:** `cmdb_reconciliation_log`

**Repository:**
- `lib/db/repositories/cmdb-reconciliation-repository.ts`

**SQL Queries:**
```sql
-- Reconciliation success rate
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percentage
FROM cmdb_reconciliation_log
GROUP BY status;

-- Top detected CI types
SELECT
  ci_type,
  COUNT(*) as count
FROM cmdb_reconciliation_log
WHERE detected_at > NOW() - INTERVAL '30 days'
GROUP BY ci_type
ORDER BY count DESC;
```

---

## 7️⃣ Case Classification Analytics

**Purpose:** Comprehensive case classification metrics

**Includes:**
- Classifications by category/subcategory
- Confidence score distribution
- Token usage and LLM costs
- Processing time analysis
- Cache hit rates
- Business intelligence detection rates
- Incident/Problem creation tracking

**Metrics:**
- Total classifications
- Most common categories
- Average confidence scores
- Token usage (input/output/total)
- Estimated costs
- Processing time averages
- Cache effectiveness
- BI detection rate (project scope, executive, compliance, financial)

**Database Table:** `case_classification_results`

**Repository:**
- `lib/db/repositories/case-classification-repository.ts`

**SQL Queries:**
```sql
-- Top categories
SELECT
  category,
  subcategory,
  COUNT(*) as count,
  AVG(confidence_score) as avg_confidence
FROM case_classification_results
WHERE classified_at > NOW() - INTERVAL '7 days'
GROUP BY category, subcategory
ORDER BY count DESC
LIMIT 20;

-- Token usage and costs
SELECT
  DATE(classified_at) as date,
  SUM(token_usage_input) as total_input_tokens,
  SUM(token_usage_output) as total_output_tokens,
  SUM(cost) as total_cost
FROM case_classification_results
WHERE classified_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(classified_at)
ORDER BY date DESC;

-- Business intelligence detection
SELECT
  COUNT(*) as total_cases,
  COUNT(*) FILTER (WHERE business_intelligence_detected = true) as bi_detected,
  ROUND(COUNT(*) FILTER (WHERE business_intelligence_detected = true) * 100.0 / COUNT(*), 1) as bi_rate
FROM case_classification_results
WHERE classified_at > NOW() - INTERVAL '30 days';

-- Cache effectiveness
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN processing_time_ms < 1000 THEN 1 ELSE 0 END) as fast_responses,
  ROUND(AVG(processing_time_ms)) as avg_time_ms
FROM case_classification_results
WHERE classified_at > NOW() - INTERVAL '7 days';
```

---

## 8️⃣ Repeat Submitter Pattern Analysis

**Purpose:** Identifies users who frequently submit cases

**Includes:**
- Cases per submitter
- Common request patterns
- Category distribution
- Potential catalog redirect candidates
- Training opportunities

**Run:**
```bash
npx tsx --env-file=.env.local scripts/analyze-repeat-submitter-patterns.ts
```

---

## 🔜 Coming Soon

### Potential New Reports:

**1. Catalog Redirect Dashboard**
- Visual charts for redirect trends
- False positive identification
- Keyword effectiveness analysis
- Submitter satisfaction (did they resubmit via catalog?)

**2. Classification Accuracy Report**
- Category prediction accuracy over time
- Confidence calibration
- Misclassification pattern detection

**3. Token Usage & Cost Optimization**
- Cost breakdown by service (classification, KB, escalation)
- Token consumption trends
- Optimization opportunities
- ROI analysis

**4. Business Intelligence Insights**
- Project scope detection trends
- Executive visibility tracking
- Compliance impact monitoring
- Financial impact cases

**5. End-to-End Workflow Analytics**
- Case → Classification → Incident/Problem creation → Resolution
- Average time in each stage
- Bottleneck identification
- SLA compliance tracking

---

## 📁 All Reporting Files

### Scripts
```
scripts/
  ├── report-missing-categories.ts       ⭐ NEW
  ├── report-catalog-redirects.ts        ⭐ NEW
  ├── list-all-reports.ts                ⭐ NEW
  ├── post-case-queue-report.ts
  ├── post-case-leaderboard.ts
  ├── pull-case-queue-snapshot.ts
  └── analyze-repeat-submitter-patterns.ts
```

### API Endpoints
```
api/cron/
  ├── case-queue-report.ts
  ├── case-queue-snapshot.ts
  ├── case-leaderboard.ts
  └── sync-categories.ts
```

### Services
```
lib/services/
  ├── case-queue-report.ts
  ├── case-leaderboard.ts
  └── case-queue-snapshots.ts
```

### Repositories
```
lib/db/repositories/
  ├── category-mismatch-repository.ts      (getStatistics, getTopSuggestedCategories)
  ├── client-settings-repository.ts        (getRedirectMetrics, getClientsWithRedirectEnabled)
  ├── case-classification-repository.ts    (comprehensive classification metrics)
  ├── escalation-repository.ts             (escalation tracking and stats)
  ├── cmdb-reconciliation-repository.ts    (CMDB reconciliation tracking)
  └── case-context-repository.ts           (case context and history)
```

---

## 💡 How to Use

### For One-Time Analysis
Run the appropriate script from the Quick Reference table above.

### For Automated Reporting
Use the API cron endpoints configured in Vercel/QStash:
- Case Queue Report: Scheduled daily
- Case Leaderboard: Scheduled weekly
- Category Sync: Scheduled every 12 hours

### For Custom Queries
Use the SQL queries provided in each section above to query the database directly.

---

## 📊 Database Tables for Analytics

| Table | Purpose | Key Metrics |
|-------|---------|-------------|
| `category_mismatch_log` | AI-suggested categories not in ServiceNow | Mismatches, confidence, subcategories |
| `catalog_redirect_log` | HR catalog redirects | Request type, keywords, auto-close rate |
| `case_escalations` | Non-BAU escalations | Reason, BI score, response time |
| `case_classification_results` | Classification outcomes | Category, confidence, tokens, cost |
| `cmdb_reconciliation_log` | CMDB CI discovery | Status, CI type, reconciliation success |
| `case_queue_snapshots` | Daily case queue state | Open cases, priority, assignment |

---

## 🎯 Current Status Summary

### Active Reports (Production Ready):
- ✅ Missing Categories Report (8 mismatches found)
- ✅ Catalog Redirect Analytics (Altus enabled, 0 redirects yet)
- ✅ Case Queue Reports (automated via cron)
- ✅ Case Leaderboard (automated via cron)

### Pending Integration:
- ⏳ Escalation Analytics (service built, not integrated)

### Data Available:
- ✅ 8 category mismatches identified
- ✅ 4 missing categories with subcategories
- ✅ Altus catalog redirect configured and ready
- ✅ Slack notifications implemented

---

## 📈 Insights from Current Data

### Missing Categories (Action Required)
1. **"Telephony"** - Add ASAP (4 cases, 95% confidence)
   - Phone number assignments for new hires
   - Teams phone licensing

2. **"Hardware"** - Add soon (2 cases, 89% confidence)
   - Docking stations, monitors
   - Laptop accessories

### Catalog Redirect (Monitoring)
- Altus: Just configured, monitoring for first redirects
- Expected: Email account requests should start triggering

### Classification Performance
- High confidence on missing categories (92% avg)
- System knows what it wants but limited by ServiceNow choices

---

**Last Updated:** 2025-10-24
**System:** ai-sdk-slackbot
**Database:** Neon Postgres (Production)
