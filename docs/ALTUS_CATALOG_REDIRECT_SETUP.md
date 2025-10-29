# Altus Catalog Redirect Configuration Guide

**Company:** Altus Community Healthcare
**Company ID:** `c3eec28c931c9a1049d9764efaba10f3`
**Account Number:** ACCT0010145
**Status:** Active ✅

---

## 🎯 Overview

This guide shows you how to enable HR catalog redirect **ONLY for Altus**, without affecting other companies in your ServiceNow instance.

---

## 📊 Current Status

### ✅ What's Working
- **Email keywords added** to `new_account` type (completed)
- **Detection logic** now correctly identifies email account requests
- **Altus company ID** identified: `c3eec28c931c9a1049d9764efaba10f3`

### ⚠️ What's Missing
- **No HR catalog items exist** in ServiceNow (need to be created first)
- **Catalog redirect disabled** (not configured for Altus yet)

### 🔍 Test Case
- **Case:** SCS0049613
- **Description:** "Company Email Setup for Express Employees"
- **Detected As:** `new_account` with 100% confidence ✅
- **Company:** Altus Community Healthcare

---

## 🚨 CRITICAL: HR Catalog Items Don't Exist

When I searched ServiceNow for HR catalog items, none were found. Instead, the system returned generic IT catalog items:

```
❌ No HR catalog items found
⚠️  Found instead:
   • Virtual Desktop Upgrade Request
   • Retire a Standard Change Template
   • Grant role delegation rights within a group
```

### You Need To:

**Option 1: Create HR Catalog Items in ServiceNow (RECOMMENDED)**

Create the following catalog items in ServiceNow Service Catalog:

1. **HR - New Account Request** (for email/account creation)
   - Description: "Request new user account, email setup, system access"
   - Category: HR Services
   - Active: Yes

2. **HR - Employee Onboarding Request** (for new hires)
   - Description: "Onboard new employee with full account provisioning"
   - Category: HR Services
   - Active: Yes

3. **HR - Employee Termination Request** (for offboarding)
   - Description: "Terminate employee access and convert mailbox"
   - Category: HR Services
   - Active: Yes

**How to create in ServiceNow:**
```
1. Navigate to: Service Catalog > Catalog Items
2. Click "New"
3. Fill in details (name, description, category)
4. Set Active = true
5. Copy the resulting URL (sp?id=sc_cat_item&sys_id=...)
```

**Option 2: Use Existing Catalog Items**

If you have existing catalog items you want to redirect HR requests to, you can configure those instead. Just update the `catalogItemNames` in the configuration below with the exact names from ServiceNow.

---

## ⚙️ Configuration for Altus Only

### Database Configuration (Recommended)

This enables catalog redirect **only for Altus**, leaving other companies unaffected.

```typescript
// Configuration object
{
  clientId: "c3eec28c931c9a1049d9764efaba10f3",  // Altus company sys_id
  clientName: "Altus Community Healthcare",
  catalogRedirectEnabled: true,                   // Enable for Altus
  catalogRedirectConfidenceThreshold: 0.5,       // 50% confidence threshold
  catalogRedirectAutoClose: true,                // Auto-close redirected cases
  supportContactInfo: "Altus IT Support",        // Contact info in work notes
  customCatalogMappings: [
    {
      requestType: "new_account",
      keywords: [
        "new account",
        "create account",
        "email setup",
        "email account",
        "company email",
        "email addresses",
        "mailbox",
        "outlook account"
      ],
      catalogItemNames: [
        "HR - New Account Request",           // ⚠️ Must match exact name in ServiceNow
        "New User Account",                   // Alternative names
        "Email Account Setup"
      ],
      priority: 10
    },
    {
      requestType: "onboarding",
      keywords: [
        "onboarding",
        "new hire",
        "new employee",
        "starting employee"
      ],
      catalogItemNames: [
        "HR - Employee Onboarding Request"    // ⚠️ Must exist in ServiceNow
      ],
      priority: 10
    },
    {
      requestType: "termination",
      keywords: [
        "termination",
        "terminate",
        "employee leaving",
        "last day"
      ],
      catalogItemNames: [
        "HR - Employee Termination Request"   // ⚠️ Must exist in ServiceNow
      ],
      priority: 10
    }
  ],
  features: {},
  notes: "Configured for HR catalog redirect with email keywords"
}
```

### How to Apply

**Method 1: Using the Setup Script**

```bash
# 1. Edit the script to use real Altus company ID
# File: scripts/setup-altus-catalog-redirect.ts
# Replace: ALTUS_COMPANY_SYS_ID
# With: c3eec28c931c9a1049d9764efaba10f3

# 2. Update catalogItemNames to match your ServiceNow catalog items

# 3. Run the script with --apply flag
npx tsx --env-file=.env.local scripts/setup-altus-catalog-redirect.ts --apply
```

**Method 2: Direct Database Insert**

```sql
-- Insert or update Altus settings
INSERT INTO client_settings (
  client_id,
  client_name,
  catalog_redirect_enabled,
  catalog_redirect_confidence_threshold,
  catalog_redirect_auto_close,
  support_contact_info,
  custom_catalog_mappings,
  notes
) VALUES (
  'c3eec28c931c9a1049d9764efaba10f3',
  'Altus Community Healthcare',
  true,
  0.5,
  true,
  'Altus IT Support',
  '[
    {
      "requestType": "new_account",
      "keywords": ["new account", "email setup", "email account", "company email"],
      "catalogItemNames": ["HR - New Account Request"],
      "priority": 10
    }
  ]'::jsonb,
  'HR catalog redirect configuration'
)
ON CONFLICT (client_id) DO UPDATE SET
  catalog_redirect_enabled = EXCLUDED.catalog_redirect_enabled,
  custom_catalog_mappings = EXCLUDED.custom_catalog_mappings,
  updated_at = NOW();
```

---

## 👁️ What Users Will See

When an Altus user submits a case like SCS0049613, they'll receive a work note:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 CATALOG ITEM REDIRECT RECOMMENDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Hello,

Thank you for contacting IT Support regarding a new user account request.

To ensure your request is processed efficiently, please submit this
through our dedicated catalog which triggers automated provisioning:

📋 **New User Account Request**
   • HR - New Account Request
     https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=XXXXXXX

**Why use the catalog?**
✅ Automated Account Creation
✅ License Provisioning
✅ Email Setup
✅ Access Provisioning
✅ Manager Approval Workflow
✅ Complete Audit Trail

This case (SCS0049613) has been closed. Please resubmit using the
catalog link above to trigger our automated provisioning workflow.

If you need assistance, please contact Altus IT Support.

---
*This is an automated redirect. Confidence: 100%*
```

**AND if `catalogRedirectAutoClose: true`:**
- Case will be auto-closed with state "Resolved"
- Close code: "Incorrectly Submitted - Please Use Catalog"

---

## 🔐 Security: Altus Only Configuration

### Global Settings Remain Disabled

```bash
# These environment variables remain UNSET (disabled globally)
CATALOG_REDIRECT_ENABLED=false    # ❌ NOT SET (or explicitly false)
```

### Database Overrides for Altus

```
client_settings table:
  clientId: c3eec28c931c9a1049d9764efaba10f3
  catalogRedirectEnabled: true  ✅ ENABLED FOR ALTUS ONLY
```

### How It Works

1. **Case arrives** for any company
2. **System checks** company ID from case
3. **If company = Altus:**
   - Load Altus-specific settings from database
   - `catalogRedirectEnabled = true` ✅
   - Process catalog redirect
4. **If company ≠ Altus:**
   - Check global `CATALOG_REDIRECT_ENABLED` → false ❌
   - Skip catalog redirect
   - Process normally

### Code Reference

See `lib/services/catalog-redirect-handler.ts` line 244-282:

```typescript
private async loadClientConfig(clientId?: string): Promise<{
  config: RedirectConfig;
  customMappings?: any[];
}> {
  // If no client ID, use global config
  if (!clientId) {
    return { config: this.config };  // Global disabled
  }

  // Try to get client-specific settings from database
  const clientSettings = await this.settingsRepository.getClientSettings(clientId);

  if (!clientSettings) {
    return { config: this.config };  // Fall back to global
  }

  // Merge client settings with global defaults
  const config: RedirectConfig = {
    enabled: clientSettings.catalogRedirectEnabled,  // ✅ Altus override
    confidenceThreshold: clientSettings.catalogRedirectConfidenceThreshold,
    // ... other settings
  };

  return {
    config,
    customMappings: clientSettings.customCatalogMappings,
  };
}
```

---

## 🔍 Associated Companies

If Altus has multiple related companies, you'll need to configure each one separately:

**Companies found matching "Altus":**

| Company Name | Sys ID | Active | Account # |
|--------------|--------|--------|-----------|
| **Altus Community Healthcare** | `c3eec28c931c9a1049d9764efaba10f3` | ✅ Yes | ACCT0010145 |
| AltusCorp | `72aeae57c3e6ae501302560fb0013121` | ❌ No | ACCT0010339 |

**Recommendation:**
- Configure the **active** company: `c3eec28c931c9a1049d9764efaba10f3`
- If AltusCorp cases should also redirect, reactivate and configure separately

---

## ✅ Testing Checklist

Before enabling in production:

### 1. Create Catalog Items ✅
- [ ] Created "HR - New Account Request" catalog item in ServiceNow
- [ ] Created "HR - Employee Onboarding Request" catalog item
- [ ] Created "HR - Employee Termination Request" catalog item
- [ ] Verified catalog items are Active
- [ ] Tested catalog item URLs are accessible

### 2. Configure Altus Settings ✅
- [ ] Updated `clientId` to `c3eec28c931c9a1049d9764efaba10f3`
- [ ] Set `catalogRedirectEnabled: true`
- [ ] Updated `catalogItemNames` to match exact names in ServiceNow
- [ ] Set `supportContactInfo` to Altus support contact
- [ ] Saved configuration to database

### 3. Test Detection ✅
- [ ] Run `npx tsx --env-file=.env.local scripts/diagnose-scs0049613.ts`
- [ ] Verify detection shows `new_account` with high confidence
- [ ] Verify 5 email keywords matched
- [ ] Verify Altus settings loaded from database

### 4. Test Redirect (requires config) ⏳
- [ ] Run `npx tsx --env-file=.env.local scripts/test-catalog-redirect.ts SCS0049613`
- [ ] Verify catalog items found and URLs correct
- [ ] Verify work note message generated
- [ ] Verify "Would auto-close" shows correctly

### 5. Verify Other Companies Unaffected ✅
- [ ] Test a non-Altus case
- [ ] Verify catalog redirect does NOT trigger
- [ ] Verify global `CATALOG_REDIRECT_ENABLED` remains false

---

## 📝 Step-by-Step Implementation

### Phase 1: Create Catalog Items (ServiceNow)

1. Log into ServiceNow as admin
2. Navigate to **Service Catalog > Catalog Items**
3. Create "HR - New Account Request"
4. Create other HR catalog items as needed
5. Copy the exact names and URLs

### Phase 2: Configure Database

1. Run company ID finder:
   ```bash
   npx tsx --env-file=.env.local scripts/find-altus-company-id.ts
   ```

2. Update setup script with real catalog item names

3. Apply configuration:
   ```bash
   npx tsx --env-file=.env.local scripts/setup-altus-catalog-redirect.ts --apply
   ```

### Phase 3: Test

1. Test detection:
   ```bash
   npx tsx --env-file=.env.local scripts/diagnose-scs0049613.ts
   ```

2. Verify output shows:
   - ✅ Company: Altus Community Healthcare
   - ✅ Settings loaded from database
   - ✅ Catalog redirect enabled: Yes
   - ✅ Detection: new_account (100%)

3. Test redirect logic:
   ```bash
   npx tsx --env-file=.env.local scripts/test-catalog-redirect.ts SCS0049613
   ```

### Phase 4: Monitor

1. Watch for redirected cases in database:
   ```sql
   SELECT * FROM catalog_redirect_log
   WHERE client_name = 'Altus Community Healthcare'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

2. Monitor for false positives (wrong redirects)

3. Adjust confidence threshold if needed (lower = more aggressive)

---

## 🛠️ Troubleshooting

### "No catalog items found"
- **Cause:** Catalog items don't exist in ServiceNow or names don't match
- **Fix:** Create catalog items OR update `catalogItemNames` to match existing items

### "Company ID not found in case data"
- **Cause:** Case doesn't have company/account field populated
- **Fix:** Ensure ServiceNow webhook includes company field, or configure fallback

### "Catalog redirect not triggering"
- **Cause:** Settings not saved, confidence too low, or global disabled without database override
- **Fix:** Verify database settings with `getClientSettings('c3eec28c931c9a1049d9764efaba10f3')`

### "Other companies being redirected"
- **Cause:** Global `CATALOG_REDIRECT_ENABLED=true` set
- **Fix:** Remove global setting, use database configuration only

---

## 📚 Related Documentation

- **Full Analysis:** `CASE_SCS0049613_ROOT_CAUSE_ANALYSIS.md`
- **Catalog Redirect Guide:** `docs/CATALOG_REDIRECT_GUIDE.md`
- **HR Request Detector:** `lib/services/hr-request-detector.ts`
- **Catalog Handler:** `lib/services/catalog-redirect-handler.ts`
- **Database Schema:** `lib/db/schema.ts` (client_settings table)

---

## 🎯 Next Steps

1. **Create HR catalog items in ServiceNow** (most important!)
2. **Update configuration** with actual catalog item names
3. **Run setup script** with `--apply` flag
4. **Test with SCS0049613**
5. **Monitor for 1 week** and adjust thresholds as needed

---

**Configuration Status:** ⏳ Pending HR catalog item creation
**Estimated Time:** 30 minutes (create items) + 10 minutes (configure)
**Risk Level:** LOW (only affects Altus, can be disabled anytime)
