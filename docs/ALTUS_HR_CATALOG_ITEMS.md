# Altus Community Healthcare - HR Catalog Items

**Found:** 97 total active catalog items
**HR-Related:** 12 items identified
**Company:** Altus Community Healthcare (`c3eec28c931c9a1049d9764efaba10f3`)

---

## ✅ HR Catalog Items for Altus

### **Onboarding / New Hire**

1. **AllCare New Hire** ⭐ RECOMMENDED
   - **Sys ID:** `2caa2d16c32fce501302560fb00131d5`
   - **Category:** (not shown - likely HR/AllCare)
   - **Description:** Submit an onboarding request for new employee
   - **URL:** https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=2caa2d16c32fce501302560fb00131d5
   - **Use For:** New employee onboarding, new hire setup

2. **New Hire**
   - **Sys ID:** `3f1b22a187aff1900f79caec0ebb3594`
   - **Category:** Account Services
   - **Description:** Submit an onboarding request for new employee
   - **URL:** https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=3f1b22a187aff1900f79caec0ebb3594
   - **Use For:** General new hire onboarding

3. **MHS - New Hire**
   - **Sys ID:** `4ff1dc639739dd10102c79200153af1f`
   - **Category:** Services
   - **Description:** Click here to create New Hire request
   - **URL:** https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=4ff1dc639739dd10102c79200153af1f
   - **Use For:** MHS-specific new hire

---

### **Offboarding / Termination**

4. **AllCare Termination** ⭐ RECOMMENDED
   - **Sys ID:** `6c34691c83c6925068537cdfeeaad3b2`
   - **Category:** HR
   - **Description:** Employee Offboarding Order Guide
   - **URL:** https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=6c34691c83c6925068537cdfeeaad3b2
   - **Use For:** Employee termination, offboarding

---

### **Account Services / Access Management**

5. **New Position Request**
   - **Sys ID:** `0288387597709150102c79200153af18`
   - **Category:** HR
   - **Description:** You need new employees to join you department? Fill out this form!
   - **URL:** https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=0288387597709150102c79200153af18
   - **Use For:** Department expansion, new position requests

6. **Access: ServiceNow**
   - **Sys ID:** `1f2da960c39a2a101302560fb00131dd`
   - **Category:** HR
   - **Description:** Request a ServiceNow license for platform access based on your role
   - **URL:** https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=1f2da960c39a2a101302560fb00131dd
   - **Use For:** ServiceNow access requests

7. **System Permission Change**
   - **Sys ID:** `1f610e348386861068537cdfeeaad30c`
   - **Category:** Account Services
   - **Description:** System Permission Change
   - **URL:** https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=1f610e348386861068537cdfeeaad30c
   - **Use For:** Account modifications, permission changes

8. **Update Group Membership**
   - **Sys ID:** `44ea06c7879339500f79caec0ebb35e7`
   - **Category:** Account Services
   - **Description:** Update Group Membership
   - **URL:** https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=44ea06c7879339500f79caec0ebb35e7
   - **Use For:** Group membership changes

9. **Application Permissions Request**
   - **Sys ID:** `6c9752c9877e31900f79caec0ebb35cb`
   - **Category:** Account Services
   - **Description:** (not shown)
   - **URL:** https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=6c9752c9877e31900f79caec0ebb35cb
   - **Use For:** Application-specific permissions

10. **Access: Distribution Groups/Lists**
    - **Sys ID:** `6617e68c8375121068537cdfeeaad313`
    - **Category:** HR
    - **Description:** Request to Add/Remove a User from Distribution List
    - **URL:** https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=6617e68c8375121068537cdfeeaad313
    - **Use For:** Email distribution list management

11. **Access: Entra Licensing**
    - **Sys ID:** `6a57396a834aee1068537cdfeeaad36e`
    - **Category:** HR
    - **Description:** Request an Entra license for Allcare based on a role
    - **URL:** https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=6a57396a834aee1068537cdfeeaad36e
    - **Use For:** Entra (Azure AD) licensing requests

---

### **Leave Management**

12. **Leave of Absence**
    - **Sys ID:** `555d4b7cc3021e101302560fb00131b3`
    - **Category:** HR
    - **Description:** Employee Leave of Absence Request
    - **URL:** https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=555d4b7cc3021e101302560fb00131b3
    - **Use For:** LOA requests

13. **Return from Absence**
    - **Sys ID:** `48b2c2a4c3069a101302560fb00131ba`
    - **Category:** HR
    - **Description:** Employee Return from Absence Request
    - **URL:** https://mobiz.service-now.com/sp?id=sc_cat_item&sys_id=48b2c2a4c3069a101302560fb00131ba
    - **Use For:** Returning from leave

---

## 🎯 Recommended Mapping for SCS0049613 (Email Account Creation)

### **Issue:** No specific "Email Account Setup" catalog item exists

### **Best Match:** "AllCare New Hire"
**Why:**
- Email account creation is typically part of new hire onboarding
- AllCare is an Altus-related company
- This handles account provisioning including email

### **Alternative:** Create a generic support request
- Use item #9 "Request Support" for email-specific requests that don't fit onboarding

---

## 📋 Configuration for Altus Catalog Redirect

### **For case SCS0049613 (Email Account Creation)**

Since there's no dedicated "Email Account Setup" catalog item, we have two options:

#### Option 1: Use "AllCare New Hire" for bulk email setup
```json
{
  "requestType": "new_account",
  "keywords": [
    "new account",
    "email setup",
    "email account",
    "company email",
    "email addresses",
    "mailbox"
  ],
  "catalogItemNames": [
    "AllCare New Hire",
    "New Hire"
  ],
  "priority": 10
}
```

#### Option 2: Don't redirect email-only requests
Configure catalog redirect to **only** handle full onboarding and termination:

```json
{
  "requestType": "onboarding",
  "keywords": ["onboarding", "new hire", "new employee"],
  "catalogItemNames": ["AllCare New Hire", "New Hire"],
  "priority": 10
},
{
  "requestType": "termination",
  "keywords": ["termination", "terminate", "employee leaving", "last day"],
  "catalogItemNames": ["AllCare Termination"],
  "priority": 10
}
```

---

## ⚠️ Important Notes

1. **Email Account Setup:**
   - SCS0049613 requested bulk email account creation
   - This doesn't cleanly fit any existing catalog item
   - Consider creating a new catalog item: "Bulk Email Account Setup"

2. **AllCare vs. Altus:**
   - Several items are "AllCare" branded (AllCare New Hire, AllCare Termination)
   - These may be company-specific within the Altus organization
   - Verify if AllCare items should be used for all Altus requests

3. **No Email-Specific Item:**
   - Missing: "New Email Account Request"
   - Missing: "Email Account Setup"
   - May need to create these in ServiceNow

---

## ✅ Recommended Configuration

**Final configuration for Altus:**

```javascript
{
  clientId: "c3eec28c931c9a1049d9764efaba10f3",
  clientName: "Altus Community Healthcare",
  catalogRedirectEnabled: true,
  catalogRedirectConfidenceThreshold: 0.6,  // Slightly higher to avoid false positives
  catalogRedirectAutoClose: false,           // Don't auto-close - add worknote only
  supportContactInfo: "Altus IT Support",
  customCatalogMappings: [
    {
      requestType: "onboarding",
      keywords: [
        "onboarding",
        "onboard",
        "new hire",
        "new employee",
        "starting employee",
        "first day"
      ],
      catalogItemNames: [
        "AllCare New Hire",
        "New Hire"
      ],
      priority: 10
    },
    {
      requestType: "termination",
      keywords: [
        "termination",
        "terminate",
        "terminated",
        "employee leaving",
        "last day",
        "final day",
        "offboarding",
        "offboard"
      ],
      catalogItemNames: [
        "AllCare Termination"
      ],
      priority: 10
    },
    {
      requestType: "account_modification",
      keywords: [
        "permission change",
        "access change",
        "group membership",
        "update permissions"
      ],
      catalogItemNames: [
        "System Permission Change",
        "Update Group Membership"
      ],
      priority: 7
    }
  ]
}
```

**NOTE:** Email account setup requests (like SCS0049613) will **NOT** trigger redirect with this configuration. Consider this intentional since no appropriate catalog item exists.

---

## 🚀 Next Steps

1. **Review with Altus stakeholders:**
   - Confirm AllCare items apply to all Altus employees
   - Determine if email-only requests should redirect

2. **Option A: Configure as-is**
   - Only redirect onboarding and termination
   - Handle email requests manually (current state)

3. **Option B: Create new catalog item**
   - Create "Email Account Setup" in ServiceNow
   - Add to configuration for email-specific requests

4. **Option C: Use Request Support**
   - Map email requests to generic "Request Support" item
   - Less ideal but better than no redirect

---

**Recommendation:** Use Option A (configure for onboarding/termination only) until a dedicated email account catalog item is created.
