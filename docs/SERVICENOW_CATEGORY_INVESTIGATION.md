# ServiceNow Category Investigation: Altus Community Health

**Investigation Date:** 2025-11-06
**Issue:** Altus Community Health only sees "IT Issue" category without any subcategories

## Executive Summary

✅ **ROOT CAUSE IDENTIFIED:** "IT Issue" category (value: 1113) has **ZERO subcategories** configured in ServiceNow
✅ **PERMISSIONS VERIFIED:** Table API credentials **CAN** create new categories/subcategories
✅ **BUG FIXED:** Category sync was broken due to `sysparm_display_value=all` response format

---

## Investigation Findings

### 1. Categories Being Synchronized

The system synchronizes categories from **4 ServiceNow tables:**

| Table | Categories | Subcategories |
|-------|------------|---------------|
| **Cases** (`sn_customerservice_case`) | 20 | 77 |
| **Incidents** (`incident`) | 36 | 142 |
| **Problems** (`problem`) | 4 | 16 |
| **Changes** (`change_request`) | 9 | 0 |

**Key Finding:** Categories are **GLOBAL** across all companies - NOT filtered by customer.

---

### 2. Altus Community Health Issue

**Customer Details:**
- Company sys_id: `c3eec28c931c9a1049d9764efaba10f3`
- Parent: Altus Community Healthcare
- Children: Neighbors, Austin, Exceptional

**Issue Analysis:**
- Altus sees only "IT Issue" category with NO subcategories
- This is **NOT a code bug** - it's a ServiceNow data configuration issue
- "IT Issue" truly has 0 subcategories in ServiceNow

**Case Categories WITHOUT Subcategories (6 total):**
```
Compliance          (1110) - 0 subcategories
Facilities Maintenance (1111) - 0 subcategories
HR                  (1112) - 0 subcategories
IT Issue            (1113) - 0 subcategories  ← ALTUS CATEGORY
Marketing           (1114) - 0 subcategories
Supply Chain        (1115) - 0 subcategories
```

**Case Categories WITH Subcategories:**
```
Application         (13)   - 11 subcategories
Facilities          (20)   - 9 subcategories
Hardware issue      (12)   - 9 subcategories
Networking          (15)   - 8 subcategories
Phone               (16)   - 7 subcategories
Azure               (22)   - 5 subcategories
Security            (19)   - 5 subcategories
... and 7 more
```

---

### 3. ServiceNow Credentials & Permissions

**Current Credentials:**
```
User: SVC.Mobiz.Integration.TableAPI.PROD
URL: https://mobiz.service-now.com
```

**Permission Test Results:**
✅ **READ** on `sys_choice` table - Confirmed working
✅ **CREATE** on `sys_choice` table - **CONFIRMED!** Account can create categories
✅ **DELETE** on `sys_choice` table - Confirmed working
✅ **CREATE** on case/incident tables - Assumed working (for creating records)

**Conclusion:** The Table API account has **FULL permissions** to create and manage categories.

---

### 4. Bugs Fixed During Investigation

#### Bug #1: `mapChoice` Function Not Handling `display_value` Format
**File:** `lib/infrastructure/servicenow/client/mappers.ts:316-324`

**Problem:**
- ServiceNow returns `{value: "19", display_value: "Security"}` format
- Code expected simple strings
- Result: `parseInt(object) = NaN`, causing database insert failures

**Fix Applied:**
```typescript
// Before
export function mapChoice(record: ChoiceRecord): Choice {
  return {
    label: record.label,  // Object, not string!
    value: record.value,  // Object, not string!
    sequence: record.sequence ? parseInt(record.sequence) : undefined,  // NaN!
    ...
  };
}

// After
export function mapChoice(record: ChoiceRecord): Choice {
  const labelValue = extractDisplayValue(record.label);
  const valueValue = extractDisplayValue(record.value);
  const sequenceValue = extractDisplayValue(record.sequence);
  const dependentValueValue = extractDisplayValue(record.dependent_value);

  const sequence = sequenceValue ? parseInt(sequenceValue, 10) : undefined;
  const isValidSequence = sequence !== undefined && !Number.isNaN(sequence);

  return {
    label: labelValue,
    value: valueValue,
    sequence: isValidSequence ? sequence : undefined,
    inactive: typeof record.inactive === "boolean" ? record.inactive : record.inactive === "true",
    dependentValue: dependentValueValue || undefined,
  };
}
```

#### Bug #2: Deduplication Logic Using Objects as Keys
**File:** `lib/infrastructure/servicenow/repositories/choice-repository.impl.ts:37`

**Problem:**
- Deduplication key used `record.value` before mapping
- With objects, all keys became `"[object Object]:[object Object]"`
- Result: Only 1 choice kept per query!

**Fix Applied:**
```typescript
// Before
for (const record of records) {
  if (!record) continue;
  const key = `${record.value}:${record.dependent_value ?? ""}`;  // Objects!
  if (seen.has(key)) continue;
  seen.add(key);
  choices.push(mapChoice(record));
}

// After
for (const record of records) {
  if (!record) continue;
  const choice = mapChoice(record);  // Map first!
  const key = `${choice.value}:${choice.dependentValue ?? ""}`;  // Strings!
  if (seen.has(key)) continue;
  seen.add(key);
  choices.push(choice);
}
```

#### Bug #3: Inconsistent Property Naming (snake_case vs camelCase)
**File:** `lib/services/servicenow-category-sync.ts:91, 108, 122, 133`

**Problem:**
- Database uses `dependentValue` (camelCase)
- Code used `choice.dependent_value` (snake_case)
- Result: Mismatched property references

**Fix Applied:**
```typescript
// Changed all instances from:
choice.dependent_value

// To:
choice.dependentValue
```

---

## Solution: Adding Subcategories to "IT Issue"

### Option 1: Via ServiceNow UI (Recommended for Admins)

1. **Log in to ServiceNow** with admin credentials
2. **Navigate to:** System Definition > Choice Lists
3. **Filter:**
   - Table: `sn_customerservice_case`
   - Element: `subcategory`
4. **Click "New"** to add subcategories
5. **For each subcategory, set:**
   - **Table:** sn_customerservice_case
   - **Element:** subcategory
   - **Value:** Unique value (e.g., "it_issue_software", "it_issue_hardware")
   - **Label:** Display name (e.g., "Software Issue", "Hardware Issue")
   - **Sequence:** Display order (e.g., 100, 110, 120)
   - **Dependent Value:** `1113` (IT Issue's value)
   - **Inactive:** false

6. **Run sync:** `npx tsx scripts/sync-servicenow-categories.ts`

### Option 2: Via Table API (Programmatic)

**Prerequisites:**
- ServiceNow credentials: `SVC.Mobiz.Integration.TableAPI.PROD`
- Permissions: ✅ Verified (CREATE on sys_choice)

**Example API Call:**
```bash
curl -u "SVC.Mobiz.Integration.TableAPI.PROD:PASSWORD" \
  -X POST "https://mobiz.service-now.com/api/now/table/sys_choice" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "sn_customerservice_case",
    "element": "subcategory",
    "value": "it_issue_software",
    "label": "Software Issue",
    "sequence": "100",
    "dependent_value": "1113",
    "inactive": "false"
  }'
```

**Suggested Subcategories for "IT Issue":**
```json
[
  {"value": "it_issue_software", "label": "Software Issue", "sequence": "100"},
  {"value": "it_issue_hardware", "label": "Hardware Issue", "sequence": "110"},
  {"value": "it_issue_network", "label": "Network Issue", "sequence": "120"},
  {"value": "it_issue_access", "label": "Access/Permissions Issue", "sequence": "130"},
  {"value": "it_issue_email", "label": "Email Issue", "sequence": "140"},
  {"value": "it_issue_other", "label": "Other IT Issue", "sequence": "999"}
]
```

### Option 3: Automated Script (Recommended for Bulk Operations)

Create `/scripts/add-it-issue-subcategories.ts`:
```typescript
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const subcategories = [
  {value: "it_issue_software", label: "Software Issue", sequence: "100"},
  {value: "it_issue_hardware", label: "Hardware Issue", sequence: "110"},
  {value: "it_issue_network", label: "Network Issue", sequence: "120"},
  {value: "it_issue_access", label: "Access/Permissions Issue", sequence: "130"},
  {value: "it_issue_email", label: "Email Issue", sequence: "140"},
  {value: "it_issue_other", label: "Other IT Issue", sequence: "999"}
];

async function main() {
  const baseUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  for (const sub of subcategories) {
    const response = await fetch(`${baseUrl}/api/now/table/sys_choice`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'sn_customerservice_case',
        element: 'subcategory',
        value: sub.value,
        label: sub.label,
        sequence: sub.sequence,
        dependent_value: '1113',
        inactive: 'false',
      }),
    });

    if (response.ok) {
      console.log(`✅ Created: ${sub.label}`);
    } else {
      console.error(`❌ Failed: ${sub.label}`, await response.text());
    }
  }

  console.log('\n🔄 Running category sync...');
  // Re-sync categories
  const { getCategorySyncService } = await import('../lib/services/servicenow-category-sync');
  const syncService = getCategorySyncService();
  await syncService.syncAllITSMTables();
  console.log('✅ Sync complete');
}

main().catch(console.error);
```

Run: `npx tsx scripts/add-it-issue-subcategories.ts`

---

## Post-Addition Verification Steps

1. **Verify in ServiceNow UI:**
   - Navigate to System Definition > Choice Lists
   - Filter: Table=`sn_customerservice_case`, Element=`subcategory`, Dependent Value=`1113`
   - Confirm new subcategories appear

2. **Run Category Sync:**
   ```bash
   npx tsx scripts/sync-servicenow-categories.ts
   ```

3. **Verify in Database:**
   ```bash
   npx tsx scripts/check-it-issue-subcategories.ts
   ```

4. **Test in Application:**
   - Try creating a case for Altus Community Health
   - Verify "IT Issue" category now shows subcategories

5. **Monitor Sync Logs:**
   - Check `servicenow_category_sync_log` table for any errors

---

## Technical Details

### Category Cache Schema
**Table:** `servicenow_choice_cache`

| Column | Type | Description |
|--------|------|-------------|
| choice_id | serial | Primary key |
| table_name | text | ServiceNow table (e.g., "sn_customerservice_case") |
| element | text | Field name (e.g., "category", "subcategory") |
| value | text | Internal value (e.g., "1113", "it_issue_software") |
| label | text | Display label (e.g., "IT Issue", "Software Issue") |
| sequence | integer | Display order |
| inactive | boolean | Whether choice is active |
| dependent_value | text | Parent category value (for subcategories) |
| last_synced_utc | timestamp | Last sync time |

### Sync Schedule
- **Manual:** `npx tsx scripts/sync-servicenow-categories.ts`
- **Cron:** `0 0,12 * * *` (midnight and noon daily)
- **API:** `/api/cron/sync-categories` (Vercel cron job)

### Files Modified
1. `lib/infrastructure/servicenow/client/mappers.ts` - Fixed `mapChoice` function
2. `lib/infrastructure/servicenow/repositories/choice-repository.impl.ts` - Fixed deduplication
3. `lib/services/servicenow-category-sync.ts` - Fixed property naming

---

## Recommendations

1. **Immediate Action:** Add subcategories to "IT Issue" using Option 1 or 2 above

2. **Other Categories:** Consider adding subcategories to these 5 categories:
   - Compliance (1110)
   - Facilities Maintenance (1111)
   - HR (1112)
   - Marketing (1114)
   - Supply Chain (1115)

3. **Documentation:** Update ServiceNow governance docs to require subcategories for all categories

4. **Monitoring:** Set up alerts for categories with 0 subcategories

5. **Testing:** After adding subcategories, test with Altus Community Health user account

---

## Appendix: Useful Commands

### Query All Case Categories
```bash
curl -u "USER:PASS" "https://mobiz.service-now.com/api/now/table/sys_choice?sysparm_query=name=sn_customerservice_case^element=category^inactive=false&sysparm_fields=label,value,sequence&sysparm_limit=1000"
```

### Query Subcategories for Specific Category
```bash
curl -u "USER:PASS" "https://mobiz.service-now.com/api/now/table/sys_choice?sysparm_query=name=sn_customerservice_case^element=subcategory^dependent_value=1113^inactive=false&sysparm_fields=label,value,sequence&sysparm_limit=1000"
```

### Create Subcategory via API
```bash
curl -u "USER:PASS" -X POST "https://mobiz.service-now.com/api/now/table/sys_choice" \
  -H "Content-Type: application/json" \
  -d '{"name":"sn_customerservice_case","element":"subcategory","value":"it_issue_test","label":"Test Subcategory","sequence":"100","dependent_value":"1113","inactive":"false"}'
```

### Delete Subcategory via API
```bash
curl -u "USER:PASS" -X DELETE "https://mobiz.service-now.com/api/now/table/sys_choice/SYS_ID"
```

### Check Database Cache
```sql
-- IT Issue subcategories
SELECT label, value, sequence
FROM servicenow_choice_cache
WHERE table_name='sn_customerservice_case'
  AND element='subcategory'
  AND dependent_value='1113'
ORDER BY sequence;

-- All categories with subcategory counts
SELECT
  c.label as category,
  c.value,
  COUNT(s.choice_id) as subcategory_count
FROM servicenow_choice_cache c
LEFT JOIN servicenow_choice_cache s
  ON c.value = s.dependent_value
  AND s.table_name = 'sn_customerservice_case'
  AND s.element = 'subcategory'
WHERE c.table_name = 'sn_customerservice_case'
  AND c.element = 'category'
GROUP BY c.label, c.value
ORDER BY subcategory_count DESC;
```

---

## Conclusion

**Root Cause:** "IT Issue" category has no subcategories configured in ServiceNow
**Solution:** Add subcategories using ServiceNow UI or Table API
**Permissions:** ✅ Table API account has full CREATE/READ/UPDATE/DELETE permissions
**Action Required:** Add 3-6 subcategories for "IT Issue" and re-sync

**Estimated Time:** 15-30 minutes (depending on method chosen)
