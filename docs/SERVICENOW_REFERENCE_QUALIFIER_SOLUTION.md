# ServiceNow Reference Qualifier Solution: INC0167957

## Executive Summary

**Problem:** Users cannot select "Altus Health - Gorev Production" application service when creating incidents for child companies (e.g., Neighbors).

**Root Cause:** ServiceNow's implicit reference filtering does NOT automatically traverse company parent-child hierarchies. The current reference qualifier `sys_class_name!=service_offering` only filters by class name and does not account for company relationships.

**Solution:** Implement `ApplicationServiceFilter` script include with company hierarchy traversal to allow child companies to access services owned by their parent company.

---

## Detailed Analysis

### Questions Answered

#### 1. Does `sys_class_name!=service_offering` filter by company automatically?

**NO.** This reference qualifier ONLY filters based on the `sys_class_name` field value.

**Important:** ServiceNow DOES apply implicit company filtering when:
- The reference field points to a CMDB CI table
- The form record has a `company` field
- Domain separation is enabled OR company matching is enforced

However, this implicit filtering performs a **direct match** on the company field and does **NOT traverse parent-child company relationships**.

#### 2. Why can't users select Gorev from Neighbors incidents?

**Root Cause Chain:**

1. **Incident Configuration:**
   - Company: Neighbors (sys_id: child company)

2. **Gorev Service Configuration:**
   - Company: Altus Community Healthcare (sys_id: parent company)
   - Class: `cmdb_ci_service_discovered` (NOT service_offering)

3. **Filtering Behavior:**
   - Reference qualifier: `sys_class_name!=service_offering` ✅ Passes (Gorev is not service_offering)
   - Implicit company filter: `company=Neighbors` ❌ Fails (Gorev company=Altus)
   - **Company hierarchy NOT traversed** ❌ Parent company services excluded

4. **Result:** Gorev is filtered out despite passing the class name check.

#### 3. Is there OOTB company hierarchy filtering?

**NO.** ServiceNow does NOT provide out-of-the-box company hierarchy traversal in reference qualifiers.

**Available OOTB mechanisms:**
- Direct company match filtering (single company only)
- Domain separation (domain-level, not company hierarchy)
- Service commitment entitlements (SPM module - different use case)

**Custom implementation required** for parent-child company hierarchy filtering.

#### 4. Why does "Application Administration" appear in the dropdown?

**Two possible explanations:**

1. **Data Inconsistency:**
   - Application Administration is classified as `service_offering`
   - It SHOULD be filtered by `sys_class_name!=service_offering`
   - If it appears, the reference qualifier may not be active or there's a data issue

2. **Selection Before Reference Qualifier:**
   - The value was set before the reference qualifier was implemented
   - ServiceNow allows existing values to remain even if they don't pass current qualifiers
   - This is by design to prevent data loss

**Action Required:** Verify dictionary entry and Application Administration's actual class.

---

## Best Practice Recommendations

### MSP Multi-Tenant Company Architecture

For Managed Service Provider (MSP) environments with parent-child company structures:

#### ✅ **RECOMMENDED: Centralized Service Ownership with Hierarchy Filtering**

**Architecture:**
```
Altus Community Healthcare (Parent Company)
├─ Owns/contracts for all application services
├─ Manages vendor relationships
└─ Central CMDB authority

Child Companies (Neighbors, Austin, Exceptional)
├─ Use services owned by parent
├─ Access filtered via company hierarchy
└─ Independent incident/request management
```

**Implementation:**
1. Keep all shared services under parent company (Altus)
2. Set `company=Altus Community Healthcare` on services
3. Use `ApplicationServiceFilter` for reference qualifier
4. Child companies automatically access parent services

**Benefits:**
- ✅ Single source of truth (no duplication)
- ✅ Simplified service catalog management
- ✅ Clear ownership and contract management
- ✅ Centralized CMDB governance
- ✅ Upgrade-safe custom script include
- ✅ Supports SLA/contract hierarchy

#### ❌ **NOT RECOMMENDED: Alternative Approaches**

**Option B: Duplicate Services for Each Child**
```
❌ Problems:
- CMDB clutter and duplication
- Maintenance nightmare (4x updates for every change)
- Relationship mapping becomes complex
- No single source of truth
- Reporting becomes difficult
```

**Option C: NULL Company on Shared Services**
```
❌ Problems:
- Breaks company-based security
- Loses ownership tracking
- Reporting gaps (which company uses what?)
- Cannot track company-specific configurations
- Violates CMDB best practices
```

**Option D: Use Service Commitments Only**
```
⚠️ Partial Solution:
- Service Portfolio Management (SPM) is excellent for entitlements
- BUT does not solve reference qualifier filtering
- Good complementary feature, not a replacement
- Requires additional licensing
```

---

## Implementation Guide

### Phase 1: Create Script Include

**Step 1.1:** Navigate to **System Definition > Script Includes**

**Step 1.2:** Click **New** and configure:

| Field | Value |
|-------|-------|
| Name | ApplicationServiceFilter |
| API Name | ApplicationServiceFilter |
| Client callable | No (unchecked) |
| Active | Yes (checked) |
| Description | Provides reference qualifier for business_service field with company hierarchy support |
| Script | [See ApplicationServiceFilter.js file] |

**Step 1.3:** Copy the script from `/scripts/servicenow-script-includes/ApplicationServiceFilter.js`

**Step 1.4:** Click **Submit**

### Phase 2: Test Script Include

**Step 2.1:** Open **System Definition > Scripts - Background**

**Step 2.2:** Run test script:

```javascript
// Test 1: Verify company hierarchy traversal
var filter = new ApplicationServiceFilter();

// Test with Neighbors company
var neighborsSysId = 'YOUR_NEIGHBORS_SYS_ID'; // Replace with actual sys_id
var hierarchy = filter.testHierarchy(neighborsSysId);

gs.info('=== Company Hierarchy Test ===');
for (var i = 0; i < hierarchy.length; i++) {
    gs.info('Company ' + i + ': ' + hierarchy[i].name + ' (' + hierarchy[i].sys_id + ') - Active: ' + hierarchy[i].active);
}

// Test 2: Generate qualifier for test incident
var incGr = new GlideRecord('incident');
incGr.initialize();
incGr.company = neighborsSysId;

var qualifier = filter.getQualifier(incGr);
gs.info('=== Generated Qualifier ===');
gs.info(qualifier);

// Test 3: Count services visible with this qualifier
var serviceGr = new GlideRecord('cmdb_ci_service');
serviceGr.addEncodedQuery(qualifier);
serviceGr.query();
var count = serviceGr.getRowCount();

gs.info('=== Services Count ===');
gs.info('Total services matching qualifier: ' + count);

// Test 4: Check if Gorev is included
var gorevGr = new GlideRecord('cmdb_ci_service');
gorevGr.addEncodedQuery(qualifier);
gorevGr.addQuery('sys_id', '3100fb9ac320f210ad36b9ff050131c1'); // Gorev sys_id
gorevGr.query();

if (gorevGr.hasNext()) {
    gs.info('✅ SUCCESS: Gorev is included in results');
} else {
    gs.info('❌ FAILURE: Gorev is NOT included in results');
}
```

**Expected Output:**
```
*** Script: === Company Hierarchy Test ===
*** Script: Company 0: Neighbors (xxx) - Active: true
*** Script: Company 1: Altus Community Healthcare (c3eec28c931c9a1049d9764efaba10f3) - Active: true
*** Script: === Generated Qualifier ===
*** Script: sys_class_name!=service_offering^company=xxx^ORcompany=c3eec28c931c9a1049d9764efaba10f3
*** Script: === Services Count ===
*** Script: Total services matching qualifier: 15
*** Script: ✅ SUCCESS: Gorev is included in results
```

### Phase 3: Update Dictionary Entry

**Step 3.1:** Navigate to **System Definition > Dictionary**

**Step 3.2:** Search for:
- Table: `incident`
- Column name: `business_service`

**Step 3.3:** If NOT found, check parent table `task`:
- Table: `task`
- Column name: `business_service`

**Step 3.4:** Open the dictionary entry and update:

| Field | Current Value | New Value |
|-------|--------------|-----------|
| Reference qualifier | `sys_class_name!=service_offering` | `javascript:new ApplicationServiceFilter().getQualifier(current);` |

**Step 3.5:** Click **Update**

**Step 3.6:** Clear cache:
- Navigate to **System Diagnostics > Cache**
- Click **Flush Cache** (or wait for automatic cache refresh)

### Phase 4: Validation Testing

**Test Case 1: Create New Incident as Neighbors User**

1. Navigate to **Incident > Create New**
2. Set **Company** = Neighbors
3. Click into **Business Service** field
4. Verify that "Altus Health - Gorev Production" appears in dropdown
5. Select Gorev and save incident

**Expected Result:** ✅ Gorev is selectable and saves successfully

**Test Case 2: Verify Service Offering Exclusion**

1. Create new incident with Company = Neighbors
2. Click into Business Service field
3. Search for "Application Administration"
4. Verify it does NOT appear (it's a service_offering)

**Expected Result:** ✅ Service offerings are excluded from dropdown

**Test Case 3: Other Child Companies**

1. Repeat Test Case 1 with:
   - Company = Austin
   - Company = Exceptional
2. Verify Gorev appears for all child companies

**Expected Result:** ✅ All child companies can access parent services

**Test Case 4: Parent Company Direct Access**

1. Create incident with Company = Altus Community Healthcare
2. Verify Gorev appears in dropdown

**Expected Result:** ✅ Parent company can access its own services

### Phase 5: Update Set Management

**Step 5.1:** Create update set for deployment:

1. Navigate to **System Update Sets > Local Update Sets**
2. Create new update set: "Business Service Reference Qualifier Enhancement"
3. Make update set current

**Step 5.2:** Re-perform Phase 1 and Phase 3 in the update set

**Step 5.3:** Complete update set and move to test environment

**Step 5.4:** Test in sub-production before deploying to production

---

## Advanced Configuration Options

### Option A: Include Shared Services (NULL Company)

If you want to include services with NO company assignment (shared services):

**Update dictionary reference qualifier to:**
```javascript
javascript:new ApplicationServiceFilter().getQualifierWithSharedServices(current);
```

This will include services where `company IS EMPTY` in addition to company hierarchy matches.

### Option B: Enable Debug Logging

To troubleshoot reference qualifier behavior:

**Step 1:** Create system property:
- Name: `com.snc.application_service_filter.debug`
- Type: `true | false`
- Value: `true`

**Step 2:** Test incident creation

**Step 3:** Check logs in **System Logs > System Log > All**

**Step 4:** Look for entries like:
```
ApplicationServiceFilter: Qualifier = sys_class_name!=service_offering^company=xxx^ORcompany=yyy
ApplicationServiceFilter: Companies = xxx, yyy
```

**Step 5:** Disable debug after testing (set property to `false`)

### Option C: Performance Optimization

For large company hierarchies or high-volume instances:

**1. Add Database Index:**
- Table: `cmdb_ci_service`
- Field: `company`
- Type: Non-unique index

**2. Cache Hierarchy Results:**
The script include already implements caching via `_hierarchyCache` object. This cache persists for the duration of the script execution.

**3. Monitor Performance:**
```javascript
// Add to getQualifier method for performance monitoring
var startTime = new GlideDateTime();
var qualifier = this.getQualifier(current);
var endTime = new GlideDateTime();
var duration = GlideDateTime.subtract(startTime, endTime);
if (duration.getNumericValue() > 1000) {
    gs.warn('ApplicationServiceFilter took ' + duration.getNumericValue() + 'ms');
}
```

---

## Troubleshooting Guide

### Issue 1: Gorev Still Doesn't Appear After Implementation

**Diagnostic Steps:**

1. **Verify Script Include is Active:**
   ```javascript
   var filter = new ApplicationServiceFilter();
   gs.info(filter.type); // Should output: ApplicationServiceFilter
   ```

2. **Check Dictionary Entry:**
   - Navigate to System Definition > Dictionary
   - Verify reference qualifier is set correctly
   - Check for dictionary overrides on incident table

3. **Test Qualifier Directly:**
   ```javascript
   var incGr = new GlideRecord('incident');
   incGr.get('INC0167957'); // Your incident number

   var filter = new ApplicationServiceFilter();
   var qualifier = filter.getQualifier(incGr);
   gs.info('Qualifier: ' + qualifier);

   var serviceGr = new GlideRecord('cmdb_ci_service');
   serviceGr.addEncodedQuery(qualifier);
   serviceGr.addQuery('sys_id', '3100fb9ac320f210ad36b9ff050131c1');
   serviceGr.query();

   gs.info('Gorev found: ' + serviceGr.hasNext());
   ```

4. **Verify Company Hierarchy:**
   ```javascript
   var companyGr = new GlideRecord('core_company');
   companyGr.get('NEIGHBORS_SYS_ID');
   gs.info('Company: ' + companyGr.name);
   gs.info('Parent: ' + companyGr.parent.name);
   gs.info('Parent SysID: ' + companyGr.parent);
   ```

5. **Check Gorev Configuration:**
   ```javascript
   var gorevGr = new GlideRecord('cmdb_ci_service_discovered');
   gorevGr.get('3100fb9ac320f210ad36b9ff050131c1');
   gs.info('Name: ' + gorevGr.name);
   gs.info('Class: ' + gorevGr.sys_class_name);
   gs.info('Company: ' + gorevGr.company.name);
   gs.info('Company SysID: ' + gorevGr.company);
   ```

### Issue 2: Service Offerings Still Appear

**Cause:** The class name check is failing

**Solutions:**

1. **Verify Service Class:**
   ```javascript
   var serviceGr = new GlideRecord('cmdb_ci_service');
   serviceGr.get('SERVICE_SYS_ID');
   gs.info('Class: ' + serviceGr.sys_class_name);
   gs.info('Is Service Offering: ' + (serviceGr.sys_class_name == 'service_offering'));
   ```

2. **Check for Service Class Hierarchy:**
   If using custom service classes that extend service_offering:
   ```javascript
   // Update qualifier to exclude parent class and children
   var qualifier = 'sys_class_nameNOT LIKEservice_offering';
   ```

### Issue 3: Performance Degradation

**Symptoms:**
- Slow dropdown loading
- Timeout errors
- High database CPU

**Solutions:**

1. **Add Database Index on company field:**
   - Table: cmdb_ci_service
   - Column: company

2. **Limit Hierarchy Depth:**
   ```javascript
   // In script include, reduce MAX_HIERARCHY_DEPTH
   this.MAX_HIERARCHY_DEPTH = 5; // Instead of 10
   ```

3. **Add Additional Filters:**
   ```javascript
   // Exclude inactive services
   qualifier += '^operational_status=1'; // Operational
   ```

### Issue 4: Circular Reference in Company Hierarchy

**Symptoms:**
- Warning in logs: "Circular reference detected"
- Incomplete company list

**Solution:**
The script include already handles this with circular reference detection:
```javascript
if (companies.indexOf(parentSysId) !== -1) {
    gs.warn('Circular reference detected');
    break;
}
```

**Action:** Fix the circular reference in core_company table data.

---

## Security Considerations

### Access Control Lists (ACLs)

The reference qualifier does NOT bypass ACL security. Even if a service appears in the dropdown, users still need:

1. **Read access** to `cmdb_ci_service` table
2. **Write access** to `incident.business_service` field
3. **Appropriate roles** for service visibility

### Data Visibility

**Company-based security:**
- The script include respects company field values
- Does NOT expose services from unrelated companies
- Traverses ONLY parent hierarchy (not siblings)

**Example:**
```
Altus (Parent)
├─ Neighbors (child 1)
├─ Austin (child 2)

Neighbors can access:
✅ Altus services (parent)
✅ Neighbors services (self)
❌ Austin services (sibling)
```

---

## Maintenance & Monitoring

### Recommended Monitoring

**1. Create Performance Metric:**
```javascript
// Business Rule: After Insert/Update on incident
if (current.business_service.changes()) {
    var metric = new GlideMetric('incident.business_service.selection');
    metric.setValue(1);
    metric.update();
}
```

**2. Monitor Reference Qualifier Errors:**
- Check System Logs for ApplicationServiceFilter warnings
- Set up email alerts for errors

**3. Validate Company Hierarchy:**
```javascript
// Scheduled job: Daily validation
var companyGr = new GlideRecord('core_company');
companyGr.addNotNullQuery('parent');
companyGr.query();

while (companyGr.next()) {
    var filter = new ApplicationServiceFilter();
    var hierarchy = filter._getCompanyHierarchy(companyGr.sys_id.toString());

    if (hierarchy.length > 5) {
        gs.warn('Company ' + companyGr.name + ' has deep hierarchy: ' + hierarchy.length + ' levels');
    }
}
```

### Version Control

**Update Set Naming:**
- Format: `BUSSERV_REF_QUAL_v1.0_YYYYMMDD`
- Example: `BUSSERV_REF_QUAL_v1.0_20251025`

**Change Log:**
- Track all modifications to ApplicationServiceFilter
- Document reason for changes
- Test in sub-production before deploying

---

## Migration Checklist

### Pre-Implementation

- [ ] Review company hierarchy in core_company table
- [ ] Validate parent-child relationships
- [ ] Identify all services owned by parent company
- [ ] Check for circular references in company structure
- [ ] Review existing incidents with business_service populated
- [ ] Document current reference qualifier configuration

### Implementation

- [ ] Create ApplicationServiceFilter script include in DEV
- [ ] Run test script in background
- [ ] Verify company hierarchy traversal
- [ ] Update dictionary entry for incident.business_service
- [ ] Clear cache
- [ ] Test with multiple child companies
- [ ] Verify service offering exclusion still works
- [ ] Check performance with large service list

### Post-Implementation

- [ ] Monitor system logs for errors
- [ ] Validate user feedback on service visibility
- [ ] Review incident creation patterns
- [ ] Check for performance impacts
- [ ] Document solution in knowledge base
- [ ] Train support team on new behavior

### Rollback Plan

If issues occur:

1. **Immediate Rollback:**
   ```javascript
   // Revert dictionary reference qualifier to:
   sys_class_name!=service_offering
   ```

2. **Clear Cache:**
   - System Diagnostics > Cache > Flush Cache

3. **Communicate to Users:**
   - Notify that company hierarchy filtering is temporarily disabled
   - Provide workaround (manual selection of parent company services)

---

## Related Documentation

### ServiceNow Documentation

- [Reference Qualifiers](https://docs.servicenow.com/bundle/vancouver-platform-administration/page/script/server-scripting/concept/c_ReferenceQualifiers.html)
- [Script Includes](https://docs.servicenow.com/bundle/vancouver-application-development/page/script/server-scripting/concept/c_ScriptIncludes.html)
- [CMDB CI Relationships](https://docs.servicenow.com/bundle/vancouver-servicenow-platform/page/product/configuration-management/concept/c_RelationshipTypes.html)
- [Company Hierarchy](https://docs.servicenow.com/bundle/vancouver-customer-service-management/page/product/customer-service-management/concept/companies-and-contacts.html)

### Internal Documentation

- Incident: INC0167957
- Company Structure: Altus Community Healthcare parent-child architecture
- Service Catalog: Application Administration service hierarchy
- CMDB Strategy: Centralized service ownership model

---

## Conclusion

The `ApplicationServiceFilter` script include provides a robust, upgrade-safe solution for allowing child companies to access services owned by their parent company while maintaining proper class-based filtering.

**Key Benefits:**
- ✅ Enables proper company hierarchy support
- ✅ Maintains service offering exclusion
- ✅ Centralized service management
- ✅ Performance optimized with caching
- ✅ Handles edge cases (circular refs, deep hierarchies)
- ✅ Production-ready error handling

**Next Steps:**
1. Implement in DEV/TEST environment
2. Validate with Neighbors/Austin/Exceptional companies
3. Deploy to production via update set
4. Monitor for 2 weeks
5. Document lessons learned

For questions or issues, contact ServiceNow Architecture Team.
