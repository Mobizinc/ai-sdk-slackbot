# Altus Catalog Redirect - Configuration Complete ✅

**Date:** 2025-10-24
**Case:** SCS0049613 - Email Account Creation
**Status:** CONFIGURED AND TESTED

---

## ✅ What Was Configured

### **Altus-Only Catalog Redirect**

**Company:** Altus Community Healthcare
**Company ID:** `c3eec28c931c9a1049d9764efaba10f3`
**Status:** Active and Configured ✅

**Catalog Items Used:**
1. **Altus New Hire** - For onboarding and email account setup
   - URL: https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=e8059df7c3b6ead01302560fb00131f3
   - Category: Account Services
   - Active: Yes ✅

2. **Altus Termination Request** - For offboarding
   - URL: https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=e03f7ec0c30f6ed01302560fb001319d
   - Category: Account Services
   - Active: Yes ✅

---

## 🎯 Configuration Details

### Database Settings (client_settings table)

```json
{
  "clientId": "c3eec28c931c9a1049d9764efaba10f3",
  "clientName": "Altus Community Healthcare",
  "catalogRedirectEnabled": true,
  "catalogRedirectConfidenceThreshold": 0.5,
  "catalogRedirectAutoClose": true,
  "supportContactInfo": "Altus IT Support",
  "customCatalogMappings": [
    {
      "requestType": "new_account",
      "keywords": [
        "new account", "create account", "email setup",
        "email account", "company email", "email addresses",
        "mailbox", "outlook account", "exchange account",
        "new email", "create email"
      ],
      "catalogItemNames": ["Altus New Hire"],
      "priority": 10
    },
    {
      "requestType": "onboarding",
      "keywords": [
        "onboarding", "new hire", "new employee",
        "starting employee", "first day"
      ],
      "catalogItemNames": ["Altus New Hire"],
      "priority": 10
    },
    {
      "requestType": "termination",
      "keywords": [
        "termination", "terminate", "employee leaving",
        "last day", "offboarding", "offboard"
      ],
      "catalogItemNames": ["Altus Termination Request"],
      "priority": 10
    }
  ]
}
```

### Global Settings (Environment Variables)

```bash
CATALOG_REDIRECT_ENABLED=(not set)  # ❌ Disabled globally
```

**Result:** Only Altus cases trigger catalog redirect. All other companies unaffected.

---

## 🧪 Test Results

### ✅ Test 1: SCS0049613 (Altus Case)

```
Case:              SCS0049613
Company:           Altus Community Healthcare ✅
Short Description: "URGENT MATTER: Company Email Setup for Express Employees"

Detection:
  ✅ Detected as:    new_account
  ✅ Confidence:     100%
  ✅ Matched:        4 email keywords (email setup, email account, company email, email addresses)

Catalog Redirect:
  ✅ Would trigger:  YES
  ✅ Catalog item:   Altus New Hire
  ✅ Work note:      Generated with proper Altus IT Support contact
  ✅ Auto-close:     YES (state: Resolved, close code: Incorrectly Submitted - Please Use Catalog)
```

**PASS** ✅

---

### ✅ Test 2: Non-Altus Company

```
Case:              Mock case (Different Company)
Company ID:        different-company-sys-id-12345
Short Description: "Need to setup email account for new employee John Doe"

Detection:
  ✅ Detected as:    new_account
  ✅ Confidence:     86.3%
  ✅ Matched:        2 email keywords

Catalog Redirect:
  ✅ Would trigger:  NO ❌ (CORRECT - feature disabled for this company)
  ✅ Reason:         No client settings + global disabled
```

**PASS** ✅ - Other companies are NOT affected

---

## 📋 What Users Will See

### Altus User Submits Email Account Request

**Work Note Added to Case:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 CATALOG ITEM REDIRECT RECOMMENDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Hi there,

Thank you for submitting this request. We noticed this appears to be a
new account request, and we have a dedicated catalog item designed
specifically for this type of request.

Using the proper catalog item ensures your request is:
  ✅ Routed to the correct team immediately
  ✅ Processed with the appropriate workflow
  ✅ Completed faster with fewer follow-up questions

📋 RECOMMENDED CATALOG ITEM:
  • Altus New Hire
    https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=e8059df7c3b6ead01302560fb00131f3

Please resubmit your request using the catalog item above.

If you have questions or need assistance, please contact Altus IT Support.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Case Status:**
- State: Resolved (auto-closed)
- Close Code: "Incorrectly Submitted - Please Use Catalog"
- Close Notes: "Automatically closed - HR request must be submitted via catalog"

---

## 🔐 Security Verification

### Altus Configuration
```
Database:  client_settings WHERE clientId = 'c3eec28c931c9a1049d9764efaba10f3'
  catalogRedirectEnabled: true  ✅
```

### All Other Companies
```
Database:  No records (fall back to global)
Global:    CATALOG_REDIRECT_ENABLED = (not set) → false  ❌
Result:    Disabled ❌
```

**Confirmation:** ✅ Feature is **ONLY enabled for Altus**

---

## 📊 Coverage

### Request Types Covered

| Request Type | Keywords | Catalog Item | Status |
|--------------|----------|--------------|--------|
| **new_account** | email setup, email account, company email, mailbox, etc. | Altus New Hire | ✅ Configured |
| **onboarding** | onboarding, new hire, new employee | Altus New Hire | ✅ Configured |
| **termination** | termination, terminate, offboarding, last day | Altus Termination Request | ✅ Configured |
| account_modification | permission change, access change | - | ❌ Not configured |
| transfer | transfer, department change | - | ❌ Not configured |

**Note:** Only configured the three most common Altus HR request types based on volume analysis.

---

## 🎯 Email Configuration Details

From the Altus New Hire workflow configuration:
- **Email Domain:** altushealthsystem.com
- **Format:** FirstLetterAndLastName (e.g., jsmith@altushealthsystem.com)
- **Organizational Unit:** OU=Azure,DC=altus,DC=local
- **Automated:** Account and email created automatically when catalog item is submitted

---

## 🚀 Production Ready

### ✅ Completed
- [x] Email keywords added to hr-request-detector.ts
- [x] Altus company ID identified (c3eec28c931c9a1049d9764efaba10f3)
- [x] Correct catalog items verified ("Altus New Hire", "Altus Termination Request")
- [x] Database configuration applied
- [x] Test with SCS0049613: PASS (100% confidence, correct detection)
- [x] Test with non-Altus company: PASS (no redirect)
- [x] Global settings confirmed disabled
- [x] Altus-only configuration verified

### 📝 Still Needed (Separate Issue)
- [ ] Integrate Escalation Service (Step 16 in case-triage.ts)
  - This is a SEPARATE critical issue affecting ALL companies
  - Blocks Slack notifications for project-scope work
  - See CASE_SCS0049613_ROOT_CAUSE_ANALYSIS.md for details

---

## 🔍 Monitoring

### Database Queries

**Check Altus redirects:**
```sql
SELECT * FROM catalog_redirect_log
WHERE client_name = 'Altus Community Healthcare'
ORDER BY created_at DESC
LIMIT 10;
```

**Check redirect statistics:**
```sql
SELECT
  request_type,
  COUNT(*) as count,
  AVG(confidence) as avg_confidence,
  SUM(CASE WHEN case_closed THEN 1 ELSE 0 END) as cases_closed
FROM catalog_redirect_log
WHERE client_id = 'c3eec28c931c9a1049d9764efaba10f3'
GROUP BY request_type;
```

---

## 📚 Files Created/Modified

### Code Changes
1. **lib/services/hr-request-detector.ts** - Added 11 email-related keywords to new_account type
2. **lib/tools/servicenow.ts** - Fixed getCase() to include account/contact fields
3. **scripts/test-catalog-redirect.ts** - Fixed to use account field

### Configuration Scripts
4. **scripts/setup-altus-catalog-redirect.ts** - Updated with correct Altus catalog items
5. **scripts/find-altus-company-id.ts** - Company ID finder
6. **scripts/test-non-altus-case.ts** - Verification test for other companies

### Diagnostic Scripts (for SCS0049613)
7. **scripts/diagnose-scs0049613.ts** - Full diagnostic
8. **scripts/analyze-scs0049613-keywords.ts** - Keyword analysis
9. **scripts/test-scs0049613-escalation.ts** - Escalation analysis

### Documentation
10. **CASE_SCS0049613_ROOT_CAUSE_ANALYSIS.md** - Complete root cause analysis (3 issues)
11. **ALTUS_HR_CATALOG_ITEMS.md** - List of all 13 HR catalog items
12. **ALTUS_CATALOG_REDIRECT_SETUP.md** - Setup guide
13. **ALTUS_CONFIGURATION_COMPLETE.md** - This file

---

## 🎯 Summary

### Root Causes Identified (SCS0049613)

1. ✅ **FIXED:** Email keywords missing from new_account type
   - Added 11 email-related keywords
   - Now detects at 100% confidence

2. ✅ **FIXED:** Catalog redirect disabled for Altus
   - Configured in database (Altus-only)
   - Global setting remains disabled
   - Other companies unaffected

3. ⏳ **PENDING:** Escalation service not integrated
   - Separate critical issue
   - Affects ALL companies
   - Blocks Slack notifications for project work

### What Works Now (for Altus)

**Email Account Requests (like SCS0049613):**
- ✅ Detected as new_account (100% confidence)
- ✅ Work note added with "Altus New Hire" catalog link
- ✅ Case auto-closed with proper close code
- ✅ User directed to https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=e8059df7c3b6ead01302560fb00131f3

**Onboarding Requests:**
- ✅ Redirected to "Altus New Hire"

**Termination Requests:**
- ✅ Redirected to "Altus Termination Request"

**Other Companies:**
- ✅ NOT affected (catalog redirect disabled)

---

## ⚠️ Still Outstanding

### Escalation Service Integration (CRITICAL)

**Issue:** Project-scope work (like SCS0049613 bulk email setup) should trigger Slack escalation but doesn't.

**Status:** Escalation service is fully built but NOT integrated into case-triage.ts

**Impact:** Affects ALL companies (not just Altus)

**See:** CASE_SCS0049613_ROOT_CAUSE_ANALYSIS.md for full details and integration code

---

**Configuration Status:** ✅ COMPLETE FOR ALTUS
**Production Ready:** ✅ YES (for catalog redirect only)
**Next Action:** Integrate escalation service (separate task)
