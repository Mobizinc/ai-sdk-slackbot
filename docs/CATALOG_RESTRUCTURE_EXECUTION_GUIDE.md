# ServiceNow Catalog Restructure - Execution Guide

**Last Updated:** 2025-11-06
**Status:** Ready for Deployment
**Timeline:** 2-3 weeks to production

---

## ✅ Completed Work

### Phase 1: Bug Fixes & Missing Subcategories

**3 Critical Bugs Fixed:**
1. ✅ `mapChoice()` function - Handles display_value format correctly
2. ✅ Deduplication logic - Maps choices before creating keys
3. ✅ `upsertChoice()` UPDATE - Now includes `dependentValue` in updates

**11 New Subcategories Added:**
- EHR (23): NextGen EPM
- User Account Management (17): New Access Request, Permission Change, Role Change, Password Reset, Unlock Account
- Hardware issue (12): Desktop Request, Laptop Request, Monitor Request, Mobile Device Request, Peripheral Request

**Current Category Status:**
- Cases: 20 categories, **88 subcategories** (was 77)
- All dependent_values correctly populated
- Category sync fully functional

---

## 📦 Scripts Created

### 1. Add Missing Subcategories
**File:** `scripts/servicenow-catalog/add-missing-subcategories.ts`
**Status:** ✅ Already executed successfully
**What it does:**
- Adds 11 new subcategories to EHR, User Account Management, and Hardware issue
- Creates proper dependent_value linkages

### 2. Create "Report a Problem"
**File:** `scripts/servicenow-catalog/create-report-problem-catalog-item.ts`
**Status:** ⏳ Ready to run
**What it does:**
- Copies "Request Support" catalog item
- Renames to "Report a Problem"
- Filters categories to problem-oriented only (Hardware, Application, Networking, Printer, Phone, Active Directory, Security, Exchange, Citrix, Azure)
- **Adds missing subcategory variable with cascading**
- Updates descriptions for clarity

**Problem Categories (10):**
- 12 - Hardware issue
- 13 - Application
- 14 - Printer
- 15 - Networking
- 16 - Phone
- 18 - Active Directory
- 19 - Security
- 11 - Exchange
- 10 - Citrix
- 22 - Azure

### 3. Create "Request Something"
**File:** `scripts/servicenow-catalog/create-request-something-catalog-item.ts`
**Status:** ⏳ Ready to run
**What it does:**
- Copies "Request Support" catalog item
- Renames to "Request Something"
- Filters categories to request-oriented only (User Account Management, Azure, Exchange, Application, Hardware issue)
- **Adds missing subcategory variable with cascading**
- Updates descriptions to clarify NOT for problems

**Request Categories (5):**
- 17 - User Account Management (access, onboarding, offboarding, permissions)
- 22 - Azure (provisioning VMs, resources)
- 11 - Exchange (mailboxes, distribution lists)
- 13 - Application (software installs)
- 12 - Hardware issue (new hardware requests)

### 4. Deprecate "Request Support"
**File:** `scripts/servicenow-catalog/deprecate-request-support.ts`
**Status:** ⏳ Ready to run (after testing new items)
**What it does:**
- Sets "Request Support" to `active=false`
- Updates name to "Request Support (DEPRECATED)"
- Adds redirect message to guide users to new items

---

## 🚀 Deployment Steps

### Week 1: Development & Testing

#### Day 1: Create Catalog Items

**Step 1: Create "Report a Problem"**
```bash
npx tsx scripts/servicenow-catalog/create-report-problem-catalog-item.ts
```

Expected output:
- ✅ New catalog item created with sys_id
- ✅ 12 variables copied from original
- ✅ Category variable modified to filter problem categories only
- ✅ NEW subcategory variable added with cascading

**Step 2: Create "Request Something"**
```bash
npx tsx scripts/servicenow-catalog/create-request-something-catalog-item.ts
```

Expected output:
- ✅ New catalog item created with sys_id
- ✅ 12 variables copied from original
- ✅ Category variable modified to filter request categories only
- ✅ NEW subcategory variable added with cascading

#### Day 2-3: Testing

**Test "Report a Problem"**
1. Navigate to Employee Service Center (/csm)
2. Find "Report a Problem" in catalog
3. Test each category:
   - Hardware issue → Select "Laptop Request" subcategory
   - Application → Select "NextGen EPM" subcategory
   - Networking → Select "Firewall Issues" subcategory
   - Etc.
4. Verify subcategory cascades correctly
5. Submit test case and verify it creates with both category AND subcategory

**Test "Request Something"**
1. Navigate to Employee Service Center (/csm)
2. Find "Request Something" in catalog
3. Test each category:
   - User Account Management → Select "New Access Request" subcategory
   - Hardware issue → Select "Desktop Request" subcategory
   - Azure → Select "Azure VM" subcategory
   - Etc.
4. Verify subcategory cascades correctly
5. Submit test case and verify it creates with both category AND subcategory

**Validation Checklist:**
- [ ] Both catalog items appear in Employee Service Center
- [ ] Category dropdown shows correct filtered categories
- [ ] Subcategory dropdown only appears after category is selected
- [ ] Subcategory options match the selected category
- [ ] Cases are created with both category AND subcategory populated
- [ ] No "(1113)" or other value display bugs
- [ ] Description text is clear and helpful

#### Day 4-5: UAT with Altus Users

**Identify Test Users:**
- 3-5 Altus Community Health power users
- Mix of roles (IT staff, end users, managers)

**UAT Session (1 hour):**
1. Explain the change: Two new catalog items replacing "Request Support"
2. Have each user submit 2-3 test cases:
   - At least 1 "Report a Problem"
   - At least 1 "Request Something"
3. Gather feedback on:
   - Is it clear which item to use?
   - Are categories/subcategories easy to find?
   - Any confusion or issues?

**Adjust Based on Feedback:**
- Tweak descriptions if needed
- Add/remove categories if necessary
- Adjust subcategory labels for clarity

### Week 2: Production Deployment

#### Day 1: Final Preparation

**Step 1: Verify All Changes**
```bash
# Run category sync to ensure all subcategories are current
npx tsx scripts/sync-servicenow-categories.ts

# Query database to verify
source .env.local
psql "$DATABASE_URL" -c "
SELECT c.label, COUNT(s.choice_id) as subcats
FROM servicenow_choice_cache c
LEFT JOIN servicenow_choice_cache s
  ON c.value = s.dependent_value
  AND s.table_name = 'sn_customerservice_case'
  AND s.element = 'subcategory'
WHERE c.table_name = 'sn_customerservice_case'
  AND c.element = 'category'
  AND c.value IN ('12','13','14','15','16','17','18','19','11','10','22','23')
GROUP BY c.label
ORDER BY c.label;
"
```

Expected result: All categories should have subcategories.

**Step 2: Document Rollback Plan**
- Save sys_ids of new catalog items
- Have SQL ready to reactivate "Request Support" if needed
- Test rollback procedure in DEV

#### Day 2: Production Deployment (Off-Hours)

**Schedule:** After business hours (e.g., 8 PM PST)

**Deployment Script:**
```bash
# 1. Create "Report a Problem" (5 minutes)
npx tsx scripts/servicenow-catalog/create-report-problem-catalog-item.ts

# 2. Create "Request Something" (5 minutes)
npx tsx scripts/servicenow-catalog/create-request-something-catalog-item.ts

# 3. Smoke test both items (10 minutes)
# - Submit 1 test case from each
# - Verify case creation with category + subcategory

# 4. Deprecate "Request Support" (2 minutes)
npx tsx scripts/servicenow-catalog/deprecate-request-support.ts

# 5. Final verification (5 minutes)
# - Verify new items appear in catalog
# - Verify old item is inactive
```

**Total Deployment Time:** ~30 minutes

#### Day 3: Communication

**Email to Altus Users:**
```
Subject: New IT Support Request Forms in Employee Service Center

Hello Altus Team,

We've improved how you submit IT support requests in the Employee Service Center.

WHAT'S NEW:
We've replaced the single "Request Support" form with two new, more specific forms:

1. 📋 Report a Problem
   Use this when something is broken or not working:
   - Hardware failures (laptop, monitor, keyboard, etc.)
   - Software errors or crashes
   - Network connectivity issues
   - Printer problems
   - Password/login issues
   - Security incidents

2. 🔧 Request Something
   Use this when you need access or new items:
   - Access to applications or file shares
   - New user onboarding or offboarding
   - New hardware (laptop, monitor, etc.)
   - Software installation
   - Email mailbox or distribution list
   - Permission changes

WHY THIS HELPS:
- Faster ticket routing to the right team
- More accurate categorization for better reporting
- Clearer guidance on what information to provide

WHERE TO FIND IT:
Visit the Employee Service Center at [URL]/csm and look for:
- "Report a Problem" for issues
- "Request Something" for requests

Questions? Contact IT Support.

Thank you!
IT Team
```

#### Day 4-5: Monitoring

**Monitor These Metrics:**
1. **Catalog Item Usage:**
   ```sql
   SELECT
     sc_cat_item.name,
     COUNT(sc_req_item.sys_id) as requests
   FROM sc_req_item
   JOIN sc_cat_item ON sc_req_item.cat_item = sc_cat_item.sys_id
   WHERE sc_cat_item.name IN ('Report a Problem', 'Request Something', 'Request Support')
     AND sc_req_item.sys_created_on >= '2025-11-06'
   GROUP BY sc_cat_item.name
   ORDER BY requests DESC;
   ```

2. **Subcategory Adoption Rate:**
   ```sql
   SELECT
     COUNT(*) as total_cases,
     SUM(CASE WHEN subcategory IS NOT NULL AND subcategory != '' THEN 1 ELSE 0 END) as with_subcategory,
     ROUND(100.0 * SUM(CASE WHEN subcategory IS NOT NULL AND subcategory != '' THEN 1 ELSE 0 END) / COUNT(*), 1) as adoption_pct
   FROM sn_customerservice_case
   WHERE company_sys_id = 'c3eec28c931c9a1049d9764efaba10f3'
     AND sys_created_on >= '2025-11-06';
   ```

3. **Category Distribution:**
   ```sql
   SELECT category, subcategory, COUNT(*) as count
   FROM sn_customerservice_case
   WHERE company_sys_id = 'c3eec28c931c9a1049d9764efaba10f3'
     AND sys_created_on >= '2025-11-06'
   GROUP BY category, subcategory
   ORDER BY count DESC
   LIMIT 20;
   ```

**Target Metrics (7 days):**
- ✅ New catalog items: >90% of submissions
- ✅ Subcategory adoption: >70% (vs. current 4.3%)
- ✅ User feedback: >4.0/5.0 satisfaction
- ✅ Support tickets about catalog: <5

### Week 3: Optimization

#### Adjustments Based on Feedback
- Add/remove subcategories as needed
- Adjust category labels for clarity
- Update help text based on common questions

#### Permanent Removal of "Request Support"
After 30 days of successful new catalog usage:
```bash
# Fully delete the deprecated catalog item
curl -X DELETE \
  -u "$SERVICENOW_USERNAME:$SERVICENOW_PASSWORD" \
  "https://mobiz.service-now.com/api/now/table/sc_cat_item_producer/0ad4666883a9261068537cdfeeaad303"
```

---

## 🔄 Rollback Plan

If critical issues occur, follow these steps:

### Immediate Rollback (< 15 minutes)

**Step 1: Reactivate "Request Support"**
```bash
curl -X PATCH \
  -u "$SERVICENOW_USERNAME:$SERVICENOW_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"active": true, "name": "Request Support"}' \
  "https://mobiz.service-now.com/api/now/table/sc_cat_item_producer/0ad4666883a9261068537cdfeeaad303"
```

**Step 2: Deactivate New Catalog Items**
```bash
# Get sys_ids from deployment logs, then:
curl -X PATCH \
  -u "$SERVICENOW_USERNAME:$SERVICENOW_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"active": false}' \
  "https://mobiz.service-now.com/api/now/table/sc_cat_item_producer/{REPORT_PROBLEM_SYS_ID}"

curl -X PATCH \
  -u "$SERVICENOW_USERNAME:$SERVICENOW_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"active": false}' \
  "https://mobiz.service-now.com/api/now/table/sc_cat_item_producer/{REQUEST_SOMETHING_SYS_ID}"
```

**Step 3: Communicate Rollback**
Send email to users explaining the rollback and that the old form is restored.

---

## 📊 Success Criteria

### Immediate (7 days post-deployment)
- ✅ Both new catalog items functional
- ✅ Subcategory adoption >50%
- ✅ No critical bugs reported
- ✅ User satisfaction >3.5/5.0

### Short-term (30 days post-deployment)
- ✅ Subcategory adoption >70%
- ✅ "Request Support" usage <10%
- ✅ User satisfaction >4.0/5.0
- ✅ Support tickets about catalog <5

### Long-term (90 days post-deployment)
- ✅ Subcategory adoption >85%
- ✅ "Request Support" fully deprecated
- ✅ Improved first-call resolution rate
- ✅ Better category-based reporting

---

## 🎯 Key Improvements

### Before
- ❌ Single "Request Support" item for everything
- ❌ Mixing problems and requests
- ❌ NO subcategory variable (0% adoption for "IT Issue")
- ❌ Overall subcategory adoption: 4.3%
- ❌ Category display bugs ("1113" instead of "IT Issue")

### After
- ✅ Two intent-based catalog items
- ✅ Clear separation: problems vs. requests
- ✅ Subcategory variable with cascading
- ✅ Target subcategory adoption: >70%
- ✅ All category display bugs fixed
- ✅ 11 new subcategories added for better granularity

---

## 📞 Support Contacts

**Questions or Issues:**
- IT Operations Team
- ServiceNow Admin Team

**Escalation:**
- If rollback needed: Follow Rollback Plan above
- If bugs found: Document and report with steps to reproduce
- If user confusion: Update descriptions or add help text

---

## 📝 Appendix: Useful Commands

### Check Catalog Item Status
```bash
curl -s -u "$SERVICENOW_USERNAME:$SERVICENOW_PASSWORD" \
  "https://mobiz.service-now.com/api/now/table/sc_cat_item_producer?sysparm_query=nameSTARTSWITHReport^ORnameSTARTSWITHRequest&sysparm_fields=sys_id,name,active,order" \
  | python3 -m json.tool
```

### Check Variable Configuration
```bash
# Replace {CATALOG_ITEM_SYS_ID} with actual sys_id
curl -s -u "$SERVICENOW_USERNAME:$SERVICENOW_PASSWORD" \
  "https://mobiz.service-now.com/api/now/table/item_option_new?sysparm_query=cat_item={CATALOG_ITEM_SYS_ID}&sysparm_fields=name,question_text,order,mandatory,type" \
  | python3 -m json.tool
```

### Test Case Creation
```bash
# Submit a test case via API
curl -X POST \
  -u "$SERVICENOW_USERNAME:$SERVICENOW_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{
    "account": "ACCOUNT_SYS_ID",
    "contact": "CONTACT_SYS_ID",
    "category": "12",
    "subcategory": "laptop_request",
    "short_description": "Test case from deployment",
    "description": "Testing new catalog item",
    "impact": "3",
    "urgency": "3"
  }' \
  "https://mobiz.service-now.com/api/now/table/sn_customerservice_case"
```

---

**Document Version:** 1.0
**Last Updated:** 2025-11-06
**Next Review:** After Week 1 deployment
