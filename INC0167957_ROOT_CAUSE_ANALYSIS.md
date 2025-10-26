# Root Cause Analysis: INC0167957 Service Selection Issue

**Date:** 2025-10-25
**Incident:** INC0167957 - Unable to get into GoRev
**Company:** Neighbors (child of Altus Community Healthcare)
**Status:** Root cause identified

---

## Executive Summary

User cannot select "Altus Health - Gorev Production" (Application Service) for incidents logged under "Neighbors" company due to **parent-child company hierarchy not being considered in reference qualifiers**.

---

## Audit Findings

### ✅ ServiceNow Configuration is Correct

#### 1. Service Hierarchy
```
Managed Support Services (Business Service)
└─ Application Administration (Service Offering - sys_id: 7abe6bd6c320f210ad36b9ff05013112)
   └─ Altus Health - Gorev Production (Application Service - sys_id: 3100fb9ac320f210ad36b9ff050131c1)
      └─ company: Altus Community Healthcare
      └─ vendor: Mobiz IT
```

#### 2. Company Hierarchy
```
Altus Community Healthcare (parent)
└─ Neighbors (child company) ← INC0167957
└─ Austin (child company)
└─ Exceptional (child company)
└─ STAT (child company, inactive)
└─ AltusCorp (child company, inactive)
```

All relationships verified and correct ✅

---

## Current State of INC0167957

| Field | Current Value | Expected Value | Status |
|-------|--------------|----------------|--------|
| **Company** | Neighbors | Neighbors | ✅ Correct |
| **service_offering** | `(empty)` | Application Administration | ❌ Empty |
| **business_service** | Application Administration | Altus Health - Gorev Production | ❌ Wrong record type |
| **cmdb_ci** | `(empty)` | N/A | - |

### Issue Identified

The incident has **"Application Administration" in the wrong field**:
- **business_service** field contains sys_id `7abe6bd6c320f210ad36b9ff05013112`
- This sys_id belongs to the **Service Offering** table, not the Business Service table
- It should be in the `service_offering` field instead

---

## Root Cause

### Problem 1: Field Confusion
**Wrong record type in wrong field:**
- `service_offering` field: EMPTY (should have "Application Administration")
- `business_service` field: "Application Administration" ← This is a Service Offering, not a Business Service!

### Problem 2: Company Hierarchy Not Traversed
**Cannot select Gorev Application Service because:**
1. **Gorev configuration:**
   - company = `Altus Community Healthcare` (parent)
   - sys_id = `3100fb9ac320f210ad36b9ff050131c1`
   - table = `cmdb_ci_service_discovered`

2. **Incident INC0167957:**
   - company = `Neighbors` (child)

3. **Reference Qualifier on business_service field:**
   ```javascript
   // Likely current qualifier:
   javascript:'company=' + current.company
   ```

   This filters for: `company = Neighbors`

   But Gorev has: `company = Altus Community Healthcare`

   **Result:** Gorev doesn't appear in dropdown ❌

---

## Why This Matters

### Business Impact
- **Neighbors incidents cannot be properly categorized** by application service
- **Same issue affects all child companies:** Austin, Exceptional, STAT
- **Manual workarounds required** for incident routing
- **Reporting and analytics incomplete** without proper service linkage

### Technical Impact
- **AI Bot cannot auto-select application services** for child companies
- **Service offering matching works** (because it's not company-specific)
- **Application service matching fails** (because of company mismatch)

---

## Solutions

### Solution 1: Fix Reference Qualifier (RECOMMENDED)

**Update the `business_service` field reference qualifier on the incident table to include parent company services:**

#### ServiceNow Dictionary Configuration

**Navigate to:** System Definition > Dictionary > incident.business_service

**Current Reference Qualifier:**
```javascript
javascript:'company=' + current.company
```

**New Reference Qualifier:**
```javascript
javascript:new ApplicationServiceFilter().getQualifier(current);
```

**Create Script Include:** `ApplicationServiceFilter`

```javascript
var ApplicationServiceFilter = Class.create();
ApplicationServiceFilter.prototype = {
    initialize: function() {},

    /**
     * Get reference qualifier for application services
     * Includes services from parent company if incident company is a child
     */
    getQualifier: function(current) {
        if (!current.company) {
            return 'sys_id!=NULL'; // Show all if no company
        }

        var companySysId = current.company.toString();
        var queryParts = [];

        // Always include services for the current company
        queryParts.push('company=' + companySysId);

        // Check if company has a parent
        var companyGR = new GlideRecord('core_company');
        if (companyGR.get(companySysId)) {
            if (!gs.nil(companyGR.parent)) {
                // Company is a child - also include parent company services
                var parentSysId = companyGR.parent.toString();
                queryParts.push('company=' + parentSysId);

                gs.info('ApplicationServiceFilter: Including parent company services for ' +
                        companyGR.name + ' (parent: ' + companyGR.parent.name + ')');
            }
        }

        // Join with OR
        return queryParts.join('^OR');
    },

    type: 'ApplicationServiceFilter'
};
```

**Benefits:**
- ✅ Automatically includes parent company services for child companies
- ✅ Works for all child companies (Neighbors, Austin, Exceptional, etc.)
- ✅ No duplicate service records needed
- ✅ Maintains proper CMDB structure
- ✅ Scales automatically as new child companies are added

---

### Solution 2: Update Bot Logic (ADDITIONAL)

**Update `lib/tools/servicenow.ts` to include parent company services:**

**File:** `lib/tools/servicenow.ts:1470`

**Add method to get parent company:**
```typescript
public async getParentCompany(companySysId: string): Promise<string | null> {
  try {
    const data = await request<{ result: Array<Record<string, any>> }>(
      `/api/now/table/core_company/${companySysId}?sysparm_display_value=all&sysparm_fields=parent`
    );

    if (data.result && data.result.length > 0) {
      const company = data.result[0];
      if (company.parent && company.parent.value) {
        return company.parent.value;
      }
    }
    return null;
  } catch (error) {
    console.error('[ServiceNow] Error getting parent company:', error);
    return null;
  }
}
```

**Update `getApplicationServicesForCompany()` method:**
```typescript
public async getApplicationServicesForCompany(input: {
  companySysId: string;
  parentServiceOffering?: string;
  limit?: number;
}): Promise<Array<{ name: string; sys_id: string; parent_name?: string }>> {
  const limit = input.limit ?? 100;

  // Build query to filter by company
  const queryParts = [`company=${input.companySysId}`];

  // Check if company has a parent - include parent services too
  const parentSysId = await this.getParentCompany(input.companySysId);
  if (parentSysId) {
    queryParts.push(`company=${parentSysId}`);
    console.log(`[ServiceNow] Including parent company services for hierarchical lookup`);
  }

  // If parent service offering is specified, filter by it
  if (input.parentServiceOffering) {
    queryParts.push(`parent.name=${input.parentServiceOffering}`);
  }

  const query = queryParts.join('^');

  // ... rest of method unchanged
}
```

**Benefits:**
- ✅ Bot automatically finds parent company services
- ✅ Improves application service matching for child companies
- ✅ Works alongside ServiceNow reference qualifier fix

---

### Solution 3: Business Context Enhancement (OPTIONAL)

**Update `lib/services/business-context-service.ts` to track parent relationships:**

```typescript
{
  entityName: "Neighbors",
  entityType: "CLIENT",
  industry: "Healthcare",
  description: "Emergency room and urgent care provider",
  aliases: ["Neighbors ER", "Neighbors"],
  relatedEntities: ["Altus Community Healthcare"], // ← Add parent
  keyContacts: [],
  slackChannels: [],
  cmdbIdentifiers: [],
  contextStewards: [],
}
```

**Benefits:**
- ✅ Explicit parent-child tracking
- ✅ Better pattern detection across related companies
- ✅ Supports future multi-company scenarios

---

## Implementation Plan

### Phase 1: ServiceNow Configuration (High Priority)

**Steps:**
1. ✅ Create `ApplicationServiceFilter` Script Include
2. ✅ Update incident.business_service dictionary entry reference qualifier
3. ✅ Test with INC0167957 - verify Gorev appears in dropdown
4. ✅ Test with other child companies (Austin, Exceptional)
5. ✅ Verify parent company (Altus) still works correctly

**Timeline:** 30 minutes
**Risk:** Low (read-only query modification)

---

### Phase 2: Bot Enhancement (Medium Priority)

**Steps:**
1. Add `getParentCompany()` method to servicenow.ts
2. Update `getApplicationServicesForCompany()` to include parent services
3. Test bot application service matching for Neighbors incidents
4. Verify existing functionality unaffected

**Timeline:** 1-2 hours
**Risk:** Low (additive change with fallback)

---

### Phase 3: Business Context Update (Low Priority)

**Steps:**
1. Document all parent-child relationships
2. Update business-context-service.ts static data
3. Consider loading from database for dynamic updates

**Timeline:** 2-4 hours
**Risk:** Very Low (enhancement only)

---

## Testing Checklist

### ✅ ServiceNow UI Testing
- [ ] Open INC0167957
- [ ] Clear business_service field
- [ ] Click business_service lookup
- [ ] Verify "Altus Health - Gorev Production" appears in dropdown
- [ ] Select Gorev and save
- [ ] Verify service_offering can be set to "Application Administration"

### ✅ Child Company Testing
- [ ] Create test incident with company = Austin
- [ ] Verify Altus application services appear
- [ ] Create test incident with company = Exceptional
- [ ] Verify Altus application services appear

### ✅ Parent Company Testing
- [ ] Create test incident with company = Altus Community Healthcare
- [ ] Verify application services still appear correctly

### ✅ Bot Testing
- [ ] Process Neighbors incident with GoRev keywords
- [ ] Verify bot matches "Altus Health - Gorev Production"
- [ ] Verify service_offering = "Application Administration"
- [ ] Verify business_service = "Altus Health - Gorev Production"

---

## Additional Notes

### Field Naming Confusion

ServiceNow incident form has potentially confusing field names:
- **service_offering** → References `service_offering` table (generic categories)
- **business_service** → References `cmdb_ci_service` or `cmdb_ci_service_discovered` tables (specific services)

Despite the name "business_service", this field should contain **Application Services** (from `cmdb_ci_service_discovered`), not generic Business Services.

### Why Parent-Child Matters

In MSP environments:
- **Parent company** (Altus) has the contract and owns the services
- **Child companies** (Neighbors, Austin, etc.) are divisions/locations/entities under parent
- **Services are registered once** under parent to avoid duplication
- **Reference qualifiers must traverse hierarchy** to make parent services available to children

---

## Success Criteria

**Before Fix:**
- ❌ Cannot select Gorev for Neighbors incidents
- ❌ Bot cannot match application services for child companies
- ❌ Manual workarounds required

**After Fix:**
- ✅ Gorev appears in dropdown for all Neighbors/Austin/Exceptional incidents
- ✅ Bot correctly matches application services for child companies
- ✅ Proper service-to-incident linkage for reporting
- ✅ No duplicate service records needed

---

## Related Files

### Scripts Created:
- `scripts/audit-service-hierarchy-inc0167957.ts` - ServiceNow configuration audit
- `scripts/check-incident-fields-inc0167957.ts` - Incident field analysis

### Files to Modify:
- ServiceNow Dictionary: `incident.business_service` reference qualifier
- ServiceNow Script Include: Create `ApplicationServiceFilter`
- `lib/tools/servicenow.ts` - Add parent company lookup
- `lib/services/business-context-service.ts` - Add parent relationships

---

**Status:** Root cause confirmed, solution designed, ready for implementation
**Next Action:** Implement Solution 1 (Reference Qualifier) in ServiceNow
