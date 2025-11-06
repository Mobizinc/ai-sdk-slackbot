# Client Category Standardization Analysis

**Analysis Date:** 2025-11-06
**Purpose:** Compare category configurations between AllCare and Altus to establish consistency standards

---

## Executive Summary

### Key Findings

1. **⚠️ CRITICAL ISSUE:** Altus cases show **raw category values** (1113, 1111, 1112) instead of labels
   - 389 cases with "(1113)" = "IT Issue"
   - 11 cases with "(1111)" = "Facilities Maintenance"
   - 9 cases with "(1112)" = "HR"

2. **Inconsistent Category Usage:**
   - AllCare uses "Issue" (103 cases) - an older/deprecated category
   - Altus uses specific modern categories but with value display bug
   - Subcategory usage: AllCare 19%, Altus 4%

3. **Missing Subcategories:**
   - "IT Issue" (1113): 0 subcategories but 389 Altus cases
   - AllCare's most used categories have better subcategory coverage

---

## Client Comparison

### AllCare Medical Management
**Company sys_id:** `5231c90a97971550102c79200153af04`
**Total Cases Analyzed:** 281

#### Category Usage (Top 10)
| Category | Cases | % with Subcategories | Status |
|----------|-------|---------------------|--------|
| Issue (deprecated) | 103 | 0% | ⚠️ Legacy category |
| Networking | 54 | 46% | ✅ Good subcategory usage |
| Azure | 37 | 57% | ✅ Good subcategory usage |
| Citrix | 24 | 0% | ⚠️ No subcategories |
| Request | 17 | 0% | ⚠️ Generic category |
| Active Directory | 16 | 31% | ⚠️ Low subcategory usage |
| User Account Management | 8 | 0% | ❌ Should use subcategories |
| Application | 7 | 0% | ⚠️ No subcategories |
| Printer | 4 | 0% | ⚠️ No subcategories |
| Security | 3 | 33% | ⚠️ Low subcategory usage |

#### Top Subcategories
1. Azure → Azure VM (19 cases)
2. Networking → Firewall Issues (16 cases)
3. Active Directory → Password Reset (5 cases)
4. Networking → Network Device Config (4 cases)
5. Networking → Internet (4 cases)

**Overall Subcategory Usage:** 56 out of 281 cases (19.9%)

---

### Altus Community Health
**Company sys_id:** `c3eec28c931c9a1049d9764efaba10f3`
**Total Cases Analyzed:** 1000

#### Category Usage (Top 10)
| Category | Cases | % with Subcategories | Status |
|----------|-------|---------------------|--------|
| **(1113)** "IT Issue" | 389 | 0% | 🔴 CRITICAL: Value shown, no subs |
| Request | 337 | 0% | ⚠️ Generic category |
| User Account Management | 116 | 30% | ✅ Good subcategory usage |
| Hardware issue | 34 | 6% | ❌ Low subcategory usage |
| Printer | 27 | 4% | ❌ Low subcategory usage |
| Azure | 20 | 0% | ❌ No subcategories |
| Security | 17 | 6% | ❌ Low subcategory usage |
| Application | 16 | 0% | ❌ No subcategories |
| **(1111)** "Facilities Maintenance" | 11 | 0% | 🔴 Value shown, no subs |
| **(1112)** "HR" | 9 | 0% | 🔴 Value shown, no subs |

#### Top Subcategories
1. User Account Management → New User Onboarding (22 cases)
2. User Account Management → Offboarding User (13 cases)
3. Exchange → Shared Mailbox (2 cases)
4. Security → Virus / Malware Issue (1 case)
5. Vendor → Vendor Meetings (1 case)

**Overall Subcategory Usage:** 43 out of 1000 cases (4.3%)

---

## Issues Identified

### 1. 🔴 CRITICAL: Altus Display Value Bug

**Problem:** Altus cases showing category **values** (1113, 1111, 1112) instead of **labels**

**Affected Categories:**
```
(1113) = IT Issue           - 389 cases
(1111) = Facilities Maint.  - 11 cases
(1112) = HR                 - 9 cases
(1110) = Compliance         - 2 cases
(1114) = Marketing          - 1 case
```

**Root Cause:** These categories (1110-1115) were created with **numeric values** instead of semantic slugs
- Standard categories use: `"software"`, `"hardware"`, `"network"`
- These categories use: `"1113"`, `"1111"`, `"1112"`

**Impact:**
- Poor user experience (users see numbers instead of names)
- Reporting confusion
- Data quality issues

**Recommended Fix:**
```sql
-- Option 1: Change the values to semantic slugs
UPDATE sys_choice
SET value = 'it_issue'
WHERE name = 'sn_customerservice_case'
  AND element = 'category'
  AND value = '1113';

-- Option 2: Ensure sysparm_display_value=true is always used in queries
```

---

### 2. ⚠️ Deprecated "Issue" Category

**Problem:** AllCare has 103 cases using deprecated "Issue" category

**Impact:**
- Not specific enough for categorization
- No standardized subcategories
- Harder to report on root causes

**Recommended Action:**
1. Stop using "Issue" category for new cases
2. Migrate existing "Issue" cases to specific categories:
   - Hardware Issue
   - Software/Application
   - Networking
   - User Account Management

**Migration Script Available:** Can create if needed

---

### 3. ❌ Low Subcategory Adoption

**Problem:** Both clients underutilize subcategories

| Client | Total Cases | With Subcategories | % |
|--------|-------------|-------------------|---|
| AllCare | 281 | 56 | 19.9% |
| Altus | 1000 | 43 | 4.3% |

**Impact:**
- Lost granularity in reporting
- Harder to identify trends
- Inefficient routing and assignment

**Target:** 70%+ of cases should have subcategories

---

### 4. 🔴 "IT Issue" Has No Subcategories

**Problem:** Most used category (389 Altus cases) has 0 subcategories configured

**Categories with NO subcategories but high usage:**
```
IT Issue (1113)                - 389 Altus cases, 0 subcategories
Compliance (1110)              - 2 Altus cases, 0 subcategories
Facilities Maintenance (1111)  - 11 Altus cases, 0 subcategories
HR (1112)                      - 9 Altus cases, 0 subcategories
Marketing (1114)               - 1 Altus case, 0 subcategories
Supply Chain (1115)            - 0 cases, 0 subcategories
```

---

## Standardization Recommendations

### Phase 1: Fix Critical Issues (Week 1)

#### 1.1 Fix "IT Issue" Category Display

**Option A (Preferred): Change Value to Semantic Slug**
```javascript
// Via ServiceNow UI or API
{
  "sys_id": "<choice_sys_id>",
  "value": "it_issue",  // Change from "1113"
  "label": "IT Issue"    // Keep same
}
```

**Option B: Add Subcategories** (regardless of Option A)
```javascript
[
  {value: "it_issue_software", label: "Software Issue", dependent_value: "1113", sequence: "100"},
  {value: "it_issue_hardware", label: "Hardware Issue", dependent_value: "1113", sequence: "110"},
  {value: "it_issue_network", label: "Network Connectivity", dependent_value: "1113", sequence: "120"},
  {value: "it_issue_access", label: "Access/Login Issue", dependent_value: "1113", sequence: "130"},
  {value: "it_issue_email", label: "Email/Communication", dependent_value: "1113", sequence: "140"},
  {value: "it_issue_performance", label: "Performance/Slow", dependent_value: "1113", sequence: "150"},
  {value: "it_issue_other", label: "Other IT Issue", dependent_value: "1113", sequence: "999"}
]
```

#### 1.2 Fix Other Numeric-Value Categories

Apply same fix to:
- (1110) Compliance → `"compliance"`
- (1111) Facilities Maintenance → `"facilities_maintenance"`
- (1112) HR → `"hr"`
- (1114) Marketing → `"marketing"`
- (1115) Supply Chain → `"supply_chain"`

**Script:** `/scripts/fix-numeric-category-values.ts` (to be created)

---

### Phase 2: Standardize Subcategories (Week 2)

#### 2.1 Mandatory Subcategories

**All clients MUST use subcategories for these categories:**

##### User Account Management
```
- New User Onboarding
- Offboarding User
- Password Reset
- Unlock Account
- User Permission Update
- User Detail Update
```

##### Networking
```
- Firewall Issues
- Network Device Config
- Internet
- Switching
- Access Point
- DHCP
- DNS
- VPN
- Website
```

##### Azure
```
- Azure VM
- Azure Networking
- Azure SQL
- Azure SQL MI
- Azure Backups
```

##### Hardware issue
```
- Hardware Failure
- Peripheral Device
- Hardware Recovery
- Hardware Shipment - Inbound
- Hardware Shipment - Outbound
- Hardware Damage
- Consumable Replacement
- Component Replacement
- Maintenance
```

##### Application
```
- Citrix Workspace
- MS Office Suite
- Outlook
- Teams
- OneDrive Access
- Power BI Licence
- CRM
- File Recovery
- MSSQL Server
```

##### Printer
```
- Unable to Print
- Replacement Part
- Replacement Toner
```

##### Security
```
- MFA
- Virus / Malware Issue
- Virus / Malware Updates
- Spam/Phishing
- Litigation Hold
```

##### Exchange
```
- Email
- Shared Mailbox
- Distribution List
- Mimecast
```

#### 2.2 Subcategory Enforcement

**ServiceNow Configuration:**
1. Add UI Policy: Make subcategory **required** when category is selected
2. Add Business Rule: Validate subcategory is set before case resolution
3. Update Assignment Rules: Route based on category + subcategory

---

### Phase 3: Deprecate Legacy Categories (Week 3-4)

#### 3.1 Stop Using "Issue" and "Request"

**Migration Plan:**

**"Issue" → Specific Categories**
```
Issue + [contains "network", "internet", "wifi"]     → Networking
Issue + [contains "printer", "print"]                → Printer
Issue + [contains "email", "outlook", "exchange"]    → Exchange
Issue + [contains "password", "login", "access"]     → User Account Management
Issue + [contains "slow", "hang", "crash"]           → Application
Issue + [contains "laptop", "desktop", "computer"]   → Hardware issue
Issue + [remaining]                                  → Manual review
```

**"Request" → Specific Categories**
```
Request + [user account related]     → User Account Management
Request + [software install]          → Application
Request + [hardware request]          → Hardware issue
Request + [access request]            → User Account Management
Request + [vendor related]            → Vendor
Request + [remaining]                 → Manual review
```

#### 3.2 Make Categories Inactive

After migration:
```sql
UPDATE sys_choice
SET inactive = 'true'
WHERE name = 'sn_customerservice_case'
  AND element = 'category'
  AND value IN ('issue', 'request');
```

---

### Phase 4: Training & Enforcement (Ongoing)

#### 4.1 User Training
- Document: "Category Selection Best Practices"
- Video: "How to Choose the Right Category"
- Quick Reference Card: Category decision tree

#### 4.2 Quality Metrics Dashboard
Track:
- % cases with subcategories (target: 70%)
- % cases using deprecated categories (target: 0%)
- Category distribution by client
- Avg time to categorize correctly

#### 4.3 Periodic Audits
- Monthly: Review uncategorized or poorly categorized cases
- Quarterly: Analyze category effectiveness
- Bi-annually: Review and update category list

---

## Standard Category Hierarchy

### Recommended for ALL Clients

```
📁 User Account Management (user_account_management)
  ├─ New User Onboarding
  ├─ Offboarding User
  ├─ Password Reset
  ├─ Unlock Account
  ├─ User Permission Update
  └─ User Detail Update

📁 Networking (networking)
  ├─ Firewall Issues
  ├─ Network Device Config
  ├─ Internet
  ├─ Switching
  ├─ Access Point
  ├─ DHCP
  ├─ DNS
  ├─ VPN
  ├─ VM Performance
  └─ Website

📁 Azure (azure)
  ├─ Azure VM
  ├─ Azure Networking
  ├─ Azure SQL
  ├─ Azure SQL MI
  └─ Azure Backups

📁 Hardware issue (hardware_issue)
  ├─ Hardware Failure
  ├─ Peripheral Device
  ├─ Hardware Recovery
  ├─ Hardware Shipment - Inbound
  ├─ Hardware Shipment - Outbound
  ├─ Hardware Damage
  ├─ Consumable Replacement
  ├─ Component Replacement
  └─ Maintenance

📁 Application (application)
  ├─ Citrix Workspace
  ├─ MS Office Suite
  ├─ Outlook
  ├─ Teams
  ├─ OneDrive Access
  ├─ Power BI Licence
  ├─ CRM
  ├─ File Recovery
  ├─ MSSQL Server
  ├─ NextGen Mobile
  └─ AVD

📁 Printer (printer)
  ├─ Unable to Print
  ├─ Replacement Part
  └─ Replacement Toner

📁 Security (security)
  ├─ MFA
  ├─ Virus / Malware Issue
  ├─ Virus / Malware Updates
  ├─ Spam/Phishing
  └─ Litigation Hold

📁 Exchange (exchange)
  ├─ Email
  ├─ Shared Mailbox
  ├─ Distribution List
  └─ Mimecast

📁 Active Directory (active_directory)
  ├─ User Permission Update
  ├─ User Detail Update
  ├─ Password Reset
  └─ Unlock Account

📁 Phone (phone)
  ├─ Phone Quality Issues
  ├─ Genesys (Viking)
  ├─ Voicemail Issues
  ├─ Number Changes
  ├─ Hunt Group Changes
  ├─ Auto Attendant
  └─ New Numbers

📁 Citrix (citrix)
  ├─ VDI Issue
  ├─ Evolution
  └─ Access Request

📁 Facilities (facilities)
  ├─ Theft / Damage / Graffiti
  ├─ Signage / Building
  ├─ Painting
  ├─ Office Furniture
  ├─ Heating / Cooling
  ├─ Electrical / Light Bulbs
  ├─ Doors / Cabinets / Windows
  ├─ Deliveries
  └─ Cleaning

📁 Vendor (vendor)
  ├─ Contract Issues
  ├─ Vendor Outage
  ├─ Vendor Meetings
  └─ Vendor Audit

📁 EHR (ehr)
  ├─ Avatar
  ├─ Cerner
  └─ Welligent

📁 IT Issue (it_issue) - NEW SUBCATEGORIES
  ├─ Software Issue
  ├─ Hardware Issue
  ├─ Network Connectivity
  ├─ Access/Login Issue
  ├─ Email/Communication
  ├─ Performance/Slow
  └─ Other IT Issue

📁 Compliance (compliance) - ADD SUBCATEGORIES
  ├─ HIPAA Compliance
  ├─ Security Audit
  ├─ Policy Violation
  └─ Compliance Training

📁 HR (hr) - ADD SUBCATEGORIES
  ├─ New Hire
  ├─ Termination
  ├─ Role Change
  └─ HR Documentation

📁 Facilities Maintenance (facilities_maintenance) - ADD SUBCATEGORIES
  ├─ Scheduled Maintenance
  ├─ Emergency Repair
  ├─ Equipment Installation
  └─ Facility Inspection

📁 Marketing (marketing) - ADD SUBCATEGORIES
  ├─ Marketing Materials
  ├─ Website Update
  ├─ Social Media
  └─ Branding

📁 Supply Chain (supply_chain) - ADD SUBCATEGORIES
  ├─ Procurement
  ├─ Inventory Management
  ├─ Vendor Management
  └─ Logistics
```

---

## Implementation Scripts

### Script 1: Add IT Issue Subcategories
**File:** `/scripts/add-it-issue-subcategories.ts`
**Status:** Ready to run
**Impact:** Altus (389 cases affected)

### Script 2: Fix Numeric Category Values
**File:** `/scripts/fix-numeric-category-values.ts`
**Status:** Needs creation
**Impact:** Altus (411 cases affected)

### Script 3: Migrate "Issue" to Specific Categories
**File:** `/scripts/migrate-issue-category.ts`
**Status:** Needs creation
**Impact:** AllCare (103 cases affected)

### Script 4: Enforce Subcategory Usage
**File:** `/scripts/add-subcategory-enforcement-rules.ts`
**Status:** Needs creation
**Impact:** All new cases (UI Policy + Business Rule)

---

## Success Metrics

### Immediate (Week 1-2)
- ✅ IT Issue has 7 subcategories
- ✅ All numeric-value categories fixed (1110-1115)
- ✅ Category sync working correctly (bugs fixed)

### Short-term (Month 1)
- 📈 Subcategory usage: >40% (from 4-20%)
- 📉 "Issue" category usage: <10% (from 37%)
- 📉 "Request" category usage: <10% (from 34%)

### Medium-term (Month 3)
- 📈 Subcategory usage: >70%
- 📉 "Issue" category usage: 0%
- 📉 "Request" category usage: 0%
- ✅ All clients using standard category hierarchy

### Long-term (Month 6)
- 📊 Actionable category-based reports
- ⚡ Faster case routing (15% improvement)
- 📈 First-call resolution rate up (measured by category)
- ✅ Quarterly category optimization reviews

---

## Next Steps

### Immediate Actions (This Week)
1. ✅ **DONE:** Fix category sync bugs
2. **TODO:** Add IT Issue subcategories (run script)
3. **TODO:** Fix numeric category values (create + run script)
4. **TODO:** Update AllCare cases using "Issue" category

### This Month
1. Create subcategory enforcement rules
2. Train support staff on new categories
3. Create category decision tree documentation
4. Set up category usage dashboard

### This Quarter
1. Migrate all "Issue" and "Request" cases
2. Achieve 70% subcategory usage
3. Implement automated category suggestions
4. Conduct first quarterly category review

---

## Appendix: SQL Queries

### Check Category Distribution
```sql
SELECT
  category,
  COUNT(*) as case_count,
  SUM(CASE WHEN subcategory IS NOT NULL AND subcategory != '' THEN 1 ELSE 0 END) as with_subcategory,
  ROUND(100.0 * SUM(CASE WHEN subcategory IS NOT NULL AND subcategory != '' THEN 1 ELSE 0 END) / COUNT(*), 1) as pct_with_sub
FROM sn_customerservice_case
WHERE company_sys_id IN ('5231c90a97571550102c79200153af04', 'c3eec28c931c9a1049d9764efaba10f3')
  AND state != 'Closed'
GROUP BY category
ORDER BY case_count DESC;
```

### Find Cases with Numeric Categories
```sql
SELECT number, category, subcategory, short_description, company
FROM sn_customerservice_case
WHERE category IN ('1110', '1111', '1112', '1113', '1114', '1115')
ORDER BY category, sys_created_on DESC;
```

### Cases Needing Subcategories
```sql
SELECT number, category, short_description, assigned_to
FROM sn_customerservice_case
WHERE state NOT IN ('Closed', 'Resolved')
  AND category NOT IN ('Request')
  AND (subcategory IS NULL OR subcategory = '')
ORDER BY sys_created_on DESC;
```

---

**Document Owner:** IT Operations
**Last Updated:** 2025-11-06
**Next Review:** 2025-12-06
