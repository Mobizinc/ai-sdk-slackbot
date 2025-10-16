# ServiceNow Catalog Items Analysis for Altus Community Healthcare

**Date:** October 14, 2025
**Client ID:** c3eec28c931c9a1049d9764efaba10f3
**Client Name:** Altus Community Healthcare

## Executive Summary

**Critical Finding:** None of the expected HR-specific catalog items exist in ServiceNow.

The catalog redirect system is currently configured with **ZERO working catalog items** for Altus Community Healthcare. The system will detect HR requests but will **not be able to suggest appropriate catalog items**.

## What We Found

### Total Catalog Items Searched
- Searched keywords: HR, employee, onboarding, termination, hire, account
- **Result:** 19 unique catalog items found
- **HR-Specific:** 0 items matching expected HR catalog naming patterns

### Expected vs. Actual

| Request Type | Expected Catalog Items | Found in ServiceNow |
|--------------|------------------------|---------------------|
| **Onboarding** | HR - Employee Onboarding Request<br>Employee Onboarding<br>New Employee Setup<br>New Hire Request | ❌ None |
| **Termination** | HR - Employee Termination Request<br>Employee Termination<br>Employee Offboarding<br>User Termination | ❌ None |
| **Offboarding** | HR - Employee Offboarding Request<br>Employee Offboarding<br>User Deactivation<br>Access Removal | ❌ None |
| **New Account** | HR - New Account Request<br>New User Account<br>Account Creation Request<br>User Provisioning | ❌ None |
| **Account Modification** | HR - Account Modification Request<br>User Account Modification<br>Access Modification<br>Permission Change Request | ❌ None |
| **Transfer** | HR - Employee Transfer Request<br>Employee Transfer<br>Department Transfer<br>Role Change Request | ❌ None |

## Potentially Relevant Catalog Items Found

### 1. New Position Request ⭐ **Most Relevant**
- **Sys ID:** `0288387597709150102c79200153af18`
- **Description:** "You need new employees to join you department? Fill out this form!"
- **Use Case:** This appears to be the onboarding/new hire catalog item
- **URL:** https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=0288387597709150102c79200153af18

### 2. LOA / Suspension Request
- **Sys ID:** `11901a1e83994a1068537cdfeeaad31b`
- **Description:** Leave of Absence or Suspension
- **Use Case:** Could be related to termination/offboarding workflows

### 3. Add User(s) to Shared Mailbox Request
- **Sys ID:** `0c3076f647a37110d9ad2efd046d4324`
- **Description:** Account access modification
- **Use Case:** Could be used for account modification requests

### 4. Create/Modify Distribution List Request
- **Sys ID:** `0f0ac96983a16a1068537cdfeeaad34d`
- **Description:** Create or modify distribution lists
- **Use Case:** Could be part of onboarding/offboarding

## Impact Assessment

### Current System Status
**🔴 CRITICAL:** Catalog redirect system is **NON-FUNCTIONAL** for Altus

**What Works:**
- ✅ Database configuration for Altus is correct
- ✅ HR keyword detection will work
- ✅ Confidence scoring will work
- ✅ System will detect HR-related cases

**What Doesn't Work:**
- ❌ No catalog items to suggest
- ❌ Redirect messages will be incomplete
- ❌ Users won't know where to resubmit requests
- ❌ System may fail or show error messages

### Example Case: SCS0048833
**Subject:** "New Hire Email Request - Lauren Goss"
**Current Behavior:**
1. ✅ System detects this as "onboarding" request (high confidence)
2. ✅ Attempts to fetch catalog items for onboarding
3. ❌ **FAILS:** No catalog items found for onboarding
4. ❌ **RESULT:** No work note added (or error message)

## Recommended Actions

### Option 1: Map Existing Catalog Items (FASTEST) ⭐

Update Altus configuration to map existing catalog items:

```bash
npx tsx --env-file=.env.local scripts/configure-client-catalog-redirect.ts \
  "c3eec28c931c9a1049d9764efaba10f3" \
  "Altus Community Healthcare" \
  --enabled=true \
  --confidence=0.5 \
  --auto-close=false
```

Then manually update the database record with custom catalog mappings:

```typescript
{
  customCatalogMappings: [
    {
      requestType: "onboarding",
      keywords: ["onboarding", "onboard", "new hire", "new employee"],
      catalogItemNames: ["New Position Request"],
      priority: 10
    },
    {
      requestType: "termination",
      keywords: ["termination", "terminate", "leaving", "last day"],
      catalogItemNames: ["LOA / Suspension Request"],
      priority: 10
    },
    {
      requestType: "account_modification",
      keywords: ["modify account", "change permissions", "update access"],
      catalogItemNames: ["Add User(s) to Shared Mailbox Request"],
      priority: 10
    }
  ]
}
```

**Pros:**
- ✅ Works immediately with existing ServiceNow catalog
- ✅ No ServiceNow admin required
- ✅ Can be tested and adjusted quickly

**Cons:**
- ❌ Catalog items may not be perfect match for HR workflows
- ❌ Limited options (only covers onboarding, possibly termination)

### Option 2: Create HR Catalog Items in ServiceNow (RECOMMENDED) ⭐⭐⭐

Work with ServiceNow admin to create proper HR catalog items:

**Required Catalog Items:**
1. **HR - Employee Onboarding Request**
   - Fields: Employee name, start date, department, manager, job title, equipment needs, software access
2. **HR - Employee Termination Request**
   - Fields: Employee name, last day, reason, equipment return, access revocation
3. **HR - New Account Request**
   - Fields: User details, account type, permissions, approval

**Pros:**
- ✅ Purpose-built for HR workflows
- ✅ Proper required fields and approvals
- ✅ Better user experience
- ✅ System works as designed

**Cons:**
- ❌ Requires ServiceNow admin access
- ❌ Takes time to create and test
- ❌ May require approval from IT governance

### Option 3: Disable Catalog Redirect for Altus (TEMPORARY)

If catalog items cannot be created quickly:

```bash
npx tsx --env-file=.env.local scripts/configure-client-catalog-redirect.ts \
  "c3eec28c931c9a1049d9764efaba10f3" \
  "Altus Community Healthcare" \
  --enabled=false
```

Wait until proper catalog items exist, then re-enable.

## Next Steps

### Immediate (TODAY)
1. ⚠️  **DISABLE** catalog redirect for Altus until catalog items exist
2. Decide on Option 1 vs Option 2 approach
3. Get client sys_id values for proper company identification

### Short-term (THIS WEEK)
1. If Option 1: Create custom catalog mappings script
2. If Option 2: Submit ServiceNow catalog item creation request
3. Test with one request type (onboarding) first

### Long-term (THIS MONTH)
1. Create all necessary HR catalog items
2. Enable catalog redirect with full functionality
3. Monitor and adjust based on metrics
4. Train Altus HR team on using catalog

## Test Plan (Once Fixed)

### Test Case 1: Onboarding Request
**Input:** Case like SCS0048833 "New Hire Email Request"
**Expected:**
- ✅ Detect as onboarding (confidence ≥ 50%)
- ✅ Find "New Position Request" catalog item (or HR - Employee Onboarding)
- ✅ Add work note with catalog link
- ✅ Log to database

### Test Case 2: Termination Request
**Input:** "Employee termination - John Doe last day Friday"
**Expected:**
- ✅ Detect as termination
- ✅ Find termination catalog item
- ✅ Add work note with catalog link

### Test Case 3: False Positive (Non-HR)
**Input:** "Password reset needed"
**Expected:**
- ✅ Low confidence (< 50%)
- ✅ No redirect
- ✅ Case processed normally

## Conclusion

**The catalog redirect system for Altus Community Healthcare cannot function without catalog items.**

We must either:
1. Map existing ServiceNow catalog items to HR request types, OR
2. Create proper HR catalog items in ServiceNow

**Recommendation:** Start with Option 1 (mapping "New Position Request" for onboarding) as a quick win, then work on Option 2 (creating proper HR catalog items) for long-term success.

---

**Status:** ⚠️  BLOCKED - Awaiting decision on catalog item approach
**Priority:** HIGH - System is configured but non-functional
