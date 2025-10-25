# Root Cause Analysis: SCS0049613 - Multiple System Failures

**Case Number:** SCS0049613
**Client:** Altus Health System
**Issues:**
1. Email account creation request did not trigger HR catalog referral rule
2. Project-related work did not trigger Slack escalation notification

**Analysis Date:** 2025-10-24
**Analyst:** AI Diagnostic System

---

## Executive Summary

Case SCS0049613 ("URGENT MATTER: Company Email Setup for Express Employees") experienced **THREE CRITICAL FAILURES**:

### Issue #1: HR Catalog Referral Not Triggered
1. **PRIMARY**: Catalog redirect feature is **DISABLED** (environment variable not set)
2. **SECONDARY**: If enabled, would have been **MISDETECTED as "offboarding"** instead of "new_account"

### Issue #2: Slack Escalation Notification Not Sent
3. **CRITICAL**: Escalation service is **FULLY BUILT BUT NOT INTEGRATED** into case triage workflow

All three issues must be addressed to ensure proper automation for Altus.

---

## Case Details

### ServiceNow Information
- **Number:** SCS0049613
- **Sys ID:** `3d0e40a9833c3a10185f7000feaad345`
- **Short Description:** "URGENT MATTER: Company Email Setup for Express Employees"
- **Category:** 1112
- **State:** On Hold
- **Priority:** 4 - Low
- **Submitted By:** Roshard Marshall

### Request Content
```
Good Morning IT,

I am submitting this request for company email addresses for all Express ER employees.

As of Monday, October 27, 2025, all Express ER email accounts will be deactivated,
and employees will require @altushealthsystem.com addresses to ensure uninterrupted
communication and system access.

The attached list includes each employee's name, title, and location. Please prioritize
this request and confirm once the setup has been completed.
```

**Actual Intent:** Request for NEW email account creation for multiple employees
**Business Context:** Migration from Express ER email system to Altus Health System domain

---

## Root Cause #1: Feature Disabled (PRIMARY)

### Finding
The catalog redirect feature is **completely disabled** in the production environment.

### Evidence
```bash
Environment Variables:
  CATALOG_REDIRECT_ENABLED:              (not set) → ❌ Disabled
  CATALOG_REDIRECT_CONFIDENCE_THRESHOLD: (not set) → 0.5 (default)
  CATALOG_REDIRECT_AUTO_CLOSE:           (not set) → No (default)

Database Settings:
  ⚠️ No company ID found in case data
  ⚠️ Cannot load Altus-specific settings
```

### Impact
- **0% of cases** are being evaluated for catalog redirect
- All HR requests submitted as regular cases are processed manually
- No automated routing to proper catalog items
- Increased workload on support team

### Resolution Required
Enable the feature either globally or specifically for Altus.

---

## Root Cause #2: Detection Failure (SECONDARY)

### Finding
If the feature were enabled, this case would be **incorrectly detected as "offboarding"** (56% confidence) instead of "new_account".

### Detection Result
```
Detected Type:    offboarding (❌ WRONG)
Confidence:       56.00%
Matched Keywords: deactivate
```

### Why It Detected Incorrectly
The HR Request Detector matched on the word **"deactivate"** which appears in this context:

> "all Express ER email accounts **will be deactivated**"

**Problem:** This refers to OLD email accounts being deactivated as part of the migration, NOT the actual request (which is for NEW accounts).

### Why It Should Detect as "new_account"
The case contains multiple indicators of new account creation:
- **Subject:** "Company Email Setup"
- **Content:** "request for company email addresses"
- **Content:** "employees will require @altushealthsystem.com addresses"
- **Intent:** Setting up NEW email accounts for employees

### Keyword Gap Analysis

**Current new_account keywords:**
- new account
- create account
- account creation
- setup account
- add user
- provision user
- user provisioning
- grant access

**Missing email-related keywords:**
- ❌ "email setup" (appears in subject)
- ❌ "email account" (appears in description)
- ❌ "company email" (appears in description)
- ❌ "email addresses" (appears in description)
- ❌ "mailbox"
- ❌ "outlook account"
- ❌ "exchange account"

**Simulation Result:**
If email-related keywords were added, the case would match **4 keywords**:
1. "email setup"
2. "email account"
3. "company email"
4. "email addresses"

**Expected confidence:** 65-75% (well above 50% threshold)
**Expected detection:** new_account ✅

---

## Root Cause #3: Escalation Service Not Integrated (CRITICAL)

### Finding
The escalation service is **fully built and functional** but is **NOT INTEGRATED** into the case triage workflow.

### Evidence
```bash
# Escalation service steps in case-triage.ts
Step 0-15:  All implemented ✅
Step 16:    MISSING ❌ (Escalation)

# File analysis
lib/services/escalation-service.ts:     EXISTS ✅ (336 lines, fully implemented)
lib/services/case-triage.ts:            NO IMPORT ❌ (escalation not called)
api/workers/process-case.ts:            NO INTEGRATION ❌
```

### What Exists (All Functional)
- ✅ **Escalation Service** (`lib/services/escalation-service.ts`)
- ✅ **Message Builder** (`lib/services/escalation-message-builder.ts`)
- ✅ **Channel Routing** (`lib/config/escalation-channels.ts`)
- ✅ **Database Table** (`case_escalations`)
- ✅ **Configuration** (ESCALATION_ENABLED defaults to true)
- ✅ **Interactive Buttons** (`api/interactivity.ts`)
- ✅ **Documentation** (`ESCALATION_SUMMARY.md`)
- ✅ **Test Scripts** (`scripts/test-escalation.ts`)

### What's Missing
- ❌ **Integration into case-triage.ts** (Step 16 never added)
- ❌ **Import statement** for `getEscalationService`
- ❌ **Function call** to `escalationService.checkAndEscalate()`

### Impact
**For SCS0049613:**
- Case involves bulk email account creation (project scope work)
- Business intelligence would detect `project_scope_detected = true`
- Escalation decision: **SHOULD ESCALATE** (BI score: 20/100, threshold: 20)
- Expected Slack notification: ❌ **NEVER SENT**

**General Impact:**
- ALL project scope cases go unnotified
- NO executive visibility cases trigger alerts
- NO compliance impact cases escalated
- NO financial impact cases flagged
- Engineers unaware of non-BAU work requiring escalation

### Test Results
```bash
$ npx tsx scripts/test-scs0049613-escalation.ts

Escalation Decision:
  Should Escalate:   ✅ YES
  Reason:            project_scope_detected
  BI Score:          20/100

Expected Slack Notification:
  • Channel: Determined by escalation-channels.ts rules
  • Message: AI-generated with project scoping questions
  • Buttons: [Create Project] [Acknowledge as BAU] [Reassign] [View in ServiceNow]

Actual Result:
  ❌ ESCALATION SERVICE NOT INTEGRATED
  ❌ NO SLACK NOTIFICATION SENT
```

### Documentation Discrepancy
`ESCALATION_SUMMARY.md` claims:
> **Automatic trigger:**
> - ✅ Integrated into existing `case-triage.ts` workflow
> - ✅ Runs after classification completes

**Reality:**
- ❌ NOT integrated into `case-triage.ts`
- ❌ Does NOT run after classification
- ❌ Documentation is incorrect/aspirational

---

## Additional Issues Identified

### Issue: Missing Company ID
```
⚠️ No company ID in case data
```

**Impact:**
- Cannot load Altus-specific client settings from database
- Cannot use custom catalog mappings for Altus
- Cannot apply client-specific confidence thresholds
- Database field extraction may have issues (showing `[object Object]` for some fields)

**Investigation Needed:**
- Review ServiceNow webhook payload structure
- Verify company field mapping in case data
- Check if `company` field exists and is populated in ServiceNow

---

## Recommendations

### 1. **CRITICAL: Integrate Escalation Service** (HIGHEST PRIORITY)

The escalation service is fully built but never integrated. This is blocking ALL Slack notifications for project/non-BAU work.

**Steps:**

1. Add import to `lib/services/case-triage.ts`:
```typescript
import { getEscalationService } from "./escalation-service";
```

2. Add Step 16 after Step 15 (around line 768):
```typescript
// Step 16: Check for escalation (non-BAU cases)
if (config.escalationEnabled) {
  try {
    const escalationService = getEscalationService();
    const escalated = await escalationService.checkAndEscalate({
      caseNumber: webhook.case_number,
      caseSysId: webhook.sys_id,
      classification: classificationResult,
      caseData: {
        short_description: webhook.short_description,
        description: webhook.description,
        priority: webhook.priority,
        urgency: webhook.urgency,
        state: webhook.state,
      },
      assignedTo: webhook.assigned_to,
      assignmentGroup: webhook.assignment_group,
      companyName: webhook.account_id,
    });

    if (escalated) {
      console.log(`[Case Triage] Case ${webhook.case_number} escalated to Slack`);
    }
  } catch (error) {
    console.error("[Case Triage] Escalation failed:", error);
    // Non-blocking - continue processing
  }
}
```

3. Set environment variables:
```bash
ESCALATION_ENABLED=true
ESCALATION_BI_SCORE_THRESHOLD=20
ESCALATION_DEFAULT_CHANNEL=case-escalations
ESCALATION_NOTIFY_ASSIGNED_ENGINEER=true
ESCALATION_USE_LLM_MESSAGES=true
```

4. Create Slack channels:
   - `#case-escalations` (required - default)
   - `#altus-escalations` (recommended - client-specific)

5. Configure Slack app interactivity:
   - Request URL: `https://your-domain.vercel.app/api/interactivity`
   - Enable Interactive Components in Slack app settings

6. Test with a known project case

**Impact:** Enables Slack notifications for ALL non-BAU work (project scope, executive visibility, compliance, financial impact)

---

### 2. Enable Catalog Redirect Feature (HIGH PRIORITY)

**Option A: Global Enable (Recommended for Production)**
Add to `.env.local` or production environment variables:
```bash
CATALOG_REDIRECT_ENABLED=true
CATALOG_REDIRECT_CONFIDENCE_THRESHOLD=0.5
CATALOG_REDIRECT_AUTO_CLOSE=true
SUPPORT_CONTACT_INFO="Altus IT Support at support@altushealthsystem.com"
```

**Option B: Altus-Specific Enable (Database)**
If other clients shouldn't have this feature, update `client_settings` table:
```sql
UPDATE client_settings
SET
  catalogRedirectEnabled = true,
  catalogRedirectConfidenceThreshold = 0.5,
  catalogRedirectAutoClose = true,
  supportContactInfo = 'Altus IT Support'
WHERE clientId = '<altus_company_sys_id>';
```

### 3. Add Email Keywords to new_account Type (HIGH PRIORITY)

Create Altus-specific custom catalog mapping with email-related keywords:

```json
{
  "requestType": "new_account",
  "keywords": [
    "new account",
    "create account",
    "account creation",
    "setup account",
    "add user",
    "provision user",
    "email setup",
    "email account",
    "company email",
    "email addresses",
    "mailbox",
    "outlook account",
    "exchange account",
    "mail setup",
    "email migration"
  ],
  "catalogItemNames": [
    "HR - New Account Request",
    "New User Account",
    "Email Account Setup"
  ],
  "priority": 10
}
```

Store in database:
```sql
UPDATE client_settings
SET customCatalogMappings = '[{"requestType": "new_account", ...}]'::jsonb
WHERE clientId = '<altus_company_sys_id>';
```

### 4. Improve Context Awareness (MEDIUM PRIORITY)

**Current Issue:** Single word "deactivate" causes false positive
**Solution:** Consider keyword combinations and context:
- "will be deactivated" (past context, not the request) → exclude
- "please deactivate" (active request) → include
- Increase weight for multi-word keyword matches
- Give higher priority to keywords in subject line vs. body

### 5. Fix Company ID Extraction (MEDIUM PRIORITY)

Investigate why company ID is not being extracted from case data:
1. Review ServiceNow webhook payload
2. Check field mappings in `lib/tools/servicenow.ts`
3. Verify `company` field exists in case table
4. Update extraction logic if needed

### 6. Testing Plan (BEFORE PRODUCTION ENABLE)

**Step 1:** Test with existing case
```bash
npx tsx --env-file=.env.local scripts/test-catalog-redirect.ts SCS0049613
```

**Step 2:** Simulate with improved keywords
- Add email keywords to test configuration
- Verify detection type changes to "new_account"
- Confirm confidence score increases

**Step 3:** Dry run on recent Altus cases
- Find similar email setup requests
- Test detection accuracy
- Validate catalog item suggestions

**Step 4:** Enable for Altus only (pilot)
- Monitor for 1 week
- Review redirect log in database
- Gather feedback from submitters
- Adjust confidence threshold if needed

**Step 5:** Enable globally (if successful)

---

## Impact Analysis

### Current State (Feature Disabled)
- ✅ No automated interference with current workflow
- ❌ All HR requests processed manually
- ❌ Submitters don't know proper catalog items exist
- ❌ Increased case volume and processing time

### After Fix (Feature Enabled + Keywords Added)
- ✅ Email account creation requests auto-detected
- ✅ Users directed to proper catalog items
- ✅ Faster processing with correct workflow
- ✅ Better tracking and reporting
- ✅ Audit trail for compliance
- ⚠️  Small risk of false positives (mitigated by 50% confidence threshold)

---

## Technical Details

### Catalog Redirect System Architecture
- **Entry Point:** `api/servicenow-webhook.ts` → `api/workers/process-case.ts`
- **Triage Service:** `lib/services/case-triage.ts` (Step 14)
- **Detection:** `lib/services/hr-request-detector.ts`
- **Handler:** `lib/services/catalog-redirect-handler.ts`
- **Configuration:** Environment variables + `client_settings` table
- **Logging:** `catalog_redirect_log` table

### Detection Algorithm
1. Normalize text: `shortDescription + description + category + subcategory`
2. Match against keyword lists for all 6 request types
3. Calculate confidence score:
   - Base: 0.28
   - Keyword contribution: 0.05-0.2 per keyword (longer = higher)
   - Diversity bonus: +0.1 if 3+ keywords
   - Priority bonus: +0.15 for priority 10 types
   - Cap at 1.0
4. Select highest scoring type
5. If confidence >= threshold (default 0.5), trigger redirect

### Supported Request Types
1. **onboarding** (priority 10)
2. **termination** (priority 10)
3. **offboarding** (priority 9)
4. **new_account** (priority 8) ← Should match this case
5. **account_modification** (priority 7)
6. **transfer** (priority 6)

---

## Test Scripts Created

### Catalog Redirect Analysis

1. **`scripts/diagnose-scs0049613.ts`**
   - Fetches case details from ServiceNow
   - Checks catalog redirect configuration (env + database)
   - Runs HR request detection simulation
   - Provides root cause analysis for catalog redirect failure

2. **`scripts/analyze-scs0049613-keywords.ts`**
   - Detailed keyword matching analysis by request type
   - Shows why case was misdetected as "offboarding"
   - Simulates improved detection with email keywords
   - Recommends keyword additions

### Escalation System Analysis

3. **`scripts/test-scs0049613-escalation.ts`** (NEW)
   - Simulates business intelligence classification
   - Tests escalation decision logic
   - Shows what SHOULD have happened (Slack notification)
   - Provides integration code for Step 16

### Run Diagnostics
```bash
# Issue #1: Catalog redirect analysis
npx tsx --env-file=.env.local scripts/diagnose-scs0049613.ts
npx tsx --env-file=.env.local scripts/analyze-scs0049613-keywords.ts

# Issue #2: Escalation analysis
npx tsx --env-file=.env.local scripts/test-scs0049613-escalation.ts

# Test with existing test script (requires catalog redirect enabled)
npx tsx --env-file=.env.local scripts/test-catalog-redirect.ts SCS0049613
```

---

## Conclusion

**Three Critical Root Causes Identified:**

1. **ESCALATION SERVICE NOT INTEGRATED** (Highest Impact)
   - Fully built but never connected to case triage workflow
   - Blocks ALL Slack notifications for project/non-BAU work
   - Affects ALL clients, not just Altus
   - Ready to integrate (just needs Step 16 added to case-triage.ts)

2. **CATALOG REDIRECT FEATURE DISABLED**
   - `CATALOG_REDIRECT_ENABLED` not set to `true`
   - Prevents automated HR request routing for ALL clients
   - Easy fix: set environment variable

3. **EMAIL KEYWORDS MISSING FROM new_account TYPE**
   - If catalog redirect enabled, would misdetect as "offboarding"
   - Missing: "email setup", "email account", "company email", etc.
   - Medium impact: affects email account creation requests

**Immediate Action Required (Priority Order):**

1. **CRITICAL**: Integrate escalation service into case-triage.ts (Step 16)
   - Enables Slack notifications for project scope work
   - Highest business impact (affects all non-BAU detection)

2. **HIGH**: Enable catalog redirect feature
   - Set `CATALOG_REDIRECT_ENABLED=true`
   - Add email-related keywords to `new_account` type

3. **MEDIUM**: Test and validate both systems
   - Test escalation with project scope cases
   - Test catalog redirect with email account requests
   - Monitor and adjust thresholds as needed

**Expected Outcomes:**

**After Escalation Integration:**
- Project scope cases trigger Slack notifications immediately
- Engineers aware of non-BAU work requiring escalation
- Interactive buttons for quick action (Create Project, Acknowledge, etc.)
- Database tracking of all escalations

**After Catalog Redirect Enable:**
- Email account creation requests detected as `new_account`
- Users directed to proper HR catalog items
- Reduced manual case processing
- Better workflow compliance

**Combined Impact:**
Case SCS0049613 would have:
1. ✅ Triggered Slack escalation (project scope detected)
2. ✅ Directed user to HR catalog item (new_account detected)
3. ✅ Been processed through proper automated workflows
4. ✅ Reduced support team manual effort

---

## Appendix: Configuration Reference

### Environment Variables
```bash
# Enable/disable feature
CATALOG_REDIRECT_ENABLED=true

# Confidence threshold (0-1, default 0.5)
# Lower = more aggressive, Higher = more conservative
CATALOG_REDIRECT_CONFIDENCE_THRESHOLD=0.5

# Auto-close cases after redirect
CATALOG_REDIRECT_AUTO_CLOSE=true

# Support contact info for work notes
SUPPORT_CONTACT_INFO="your IT Support team"

# Custom HR mappings (optional, overrides defaults)
HR_REQUEST_DETECTOR_CONFIG='{"mappings": [...]}'
```

### Database Schema
```sql
-- client_settings table
{
  clientId: string,
  clientName: string,
  catalogRedirectEnabled: boolean,
  catalogRedirectConfidenceThreshold: number,
  catalogRedirectAutoClose: boolean,
  supportContactInfo: string,
  customCatalogMappings: jsonb
}

-- catalog_redirect_log table
{
  caseNumber: string,
  caseSysId: string,
  clientId: string,
  requestType: string,
  confidence: number,
  catalogItemsProvided: number,
  caseClosed: boolean,
  matchedKeywords: string[],
  createdAt: timestamp
}
```

---

**Document Status:** FINAL
**Action Required:** YES - Feature enablement + keyword enhancement
**Risk Level:** LOW - Both changes are non-breaking and can be tested safely
