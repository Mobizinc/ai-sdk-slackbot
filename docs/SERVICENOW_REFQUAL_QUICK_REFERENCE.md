# ServiceNow Reference Qualifier - Quick Reference Guide

## Problem Summary

**Issue:** Child company (Neighbors) cannot select parent company services (Gorev) in incident business_service field.

**Root Cause:** ServiceNow does NOT automatically traverse company hierarchies in reference qualifiers.

---

## Answer to Your Questions

### 1. Does `sys_class_name!=service_offering` filter by company?

**NO.** This qualifier ONLY filters by class name. ServiceNow applies implicit company filtering separately, but it does NOT traverse parent-child relationships.

### 2. Why can't the user select Gorev?

**Company Mismatch:**
- Incident company: Neighbors (child)
- Gorev company: Altus Community Healthcare (parent)
- ServiceNow: Direct match only → Gorev excluded

### 3. Is there OOTB company hierarchy filtering?

**NO.** Custom implementation required via script include.

### 4. Best practice for MSP environments?

**RECOMMENDED:**
- Keep services under parent company (Altus)
- Use company hierarchy in reference qualifier
- Single source of truth, no duplication

**NOT RECOMMENDED:**
- Duplicating services for each child
- NULL company on shared services
- Relying on SPM alone

### 5. Correct reference qualifier syntax?

**ANSWER:**
```javascript
javascript:new ApplicationServiceFilter().getQualifier(current);
```

This generates:
```
sys_class_name!=service_offering^company=NEIGHBORS_ID^ORcompany=ALTUS_ID
```

### 6. What's preventing Gorev selection?

**Filtering Chain:**
1. Class filter: `sys_class_name!=service_offering` → ✅ PASS (Gorev is cmdb_ci_service_discovered)
2. Company filter (implicit): `company=Neighbors` → ❌ FAIL (Gorev company=Altus)
3. Result: Gorev excluded

---

## Solution Implementation (3 Steps)

### Step 1: Create Script Include

**Navigation:** System Definition > Script Includes > New

**Configuration:**
- Name: `ApplicationServiceFilter`
- Client callable: No
- Active: Yes
- Script: Copy from `/scripts/servicenow-script-includes/ApplicationServiceFilter.js`

### Step 2: Update Dictionary Entry

**Navigation:** System Definition > Dictionary

**Search for:**
- Table: `incident` (or `task` if not found on incident)
- Column: `business_service`

**Update:**
- Reference qualifier: `javascript:new ApplicationServiceFilter().getQualifier(current);`

### Step 3: Test

**Create incident:**
- Company: Neighbors
- Business Service: Should now show "Altus Health - Gorev Production"

---

## Testing Script

Run in **Scripts - Background**:

```javascript
// Test company hierarchy
var filter = new ApplicationServiceFilter();

// Get Neighbors company sys_id (replace with actual)
var neighborsId = 'YOUR_NEIGHBORS_SYS_ID';

// Test hierarchy
var hierarchy = filter.testHierarchy(neighborsId);
gs.info('=== Company Hierarchy ===');
for (var i = 0; i < hierarchy.length; i++) {
    gs.info(hierarchy[i].name + ' (' + hierarchy[i].sys_id + ')');
}

// Test qualifier
var incGr = new GlideRecord('incident');
incGr.initialize();
incGr.company = neighborsId;

var qualifier = filter.getQualifier(incGr);
gs.info('=== Generated Qualifier ===');
gs.info(qualifier);

// Check if Gorev is included
var serviceGr = new GlideRecord('cmdb_ci_service');
serviceGr.addEncodedQuery(qualifier);
serviceGr.addQuery('sys_id', '3100fb9ac320f210ad36b9ff050131c1'); // Gorev
serviceGr.query();

gs.info('=== Result ===');
gs.info('Gorev included: ' + (serviceGr.hasNext() ? 'YES ✅' : 'NO ❌'));
```

**Expected Output:**
```
*** Script: === Company Hierarchy ===
*** Script: Neighbors (xxx)
*** Script: Altus Community Healthcare (c3eec28c931c9a1049d9764efaba10f3)
*** Script: === Generated Qualifier ===
*** Script: sys_class_name!=service_offering^company=xxx^ORcompany=c3eec28c931c9a1049d9764efaba10f3
*** Script: === Result ===
*** Script: Gorev included: YES ✅
```

---

## Troubleshooting

### Gorev still doesn't appear?

**Check 1: Script Include Active**
```javascript
var filter = new ApplicationServiceFilter();
gs.info(filter.type); // Should output: ApplicationServiceFilter
```

**Check 2: Dictionary Updated**
- Navigate to Dictionary
- Search: table=incident, element=business_service
- Verify reference qualifier is: `javascript:new ApplicationServiceFilter().getQualifier(current);`

**Check 3: Cache Cleared**
- System Diagnostics > Cache > Flush Cache

**Check 4: Gorev Company**
```javascript
var gorevGr = new GlideRecord('cmdb_ci_service_discovered');
gorevGr.get('3100fb9ac320f210ad36b9ff050131c1');
gs.info('Gorev company: ' + gorevGr.company.name);
// Should output: Altus Community Healthcare
```

**Check 5: Neighbors Parent**
```javascript
var neighborGr = new GlideRecord('core_company');
neighborGr.addQuery('name', 'Neighbors');
neighborGr.query();
if (neighborGr.next()) {
    gs.info('Neighbors parent: ' + neighborGr.parent.name);
    // Should output: Altus Community Healthcare
}
```

### Service Offerings still appear?

**Check Service Class:**
```javascript
var serviceGr = new GlideRecord('cmdb_ci_service');
serviceGr.get('SERVICE_SYS_ID'); // Replace with service sys_id
gs.info('Class: ' + serviceGr.sys_class_name);
```

If class = `service_offering`, it should be filtered. If it still appears, check:
1. Dictionary reference qualifier is active
2. Cache is cleared
3. No dictionary overrides exist

---

## Key Architecture Decisions

### Why This Approach?

**✅ Centralized Service Ownership**
- Services owned by Altus (parent)
- Child companies access via hierarchy
- Single source of truth

**✅ Upgrade Safe**
- Custom script include (not modifying OOTB)
- No data duplication
- Follows ServiceNow best practices

**✅ Performance Optimized**
- Hierarchy caching
- Prevents circular references
- Max depth protection

**✅ Maintainable**
- Clear code with comments
- Test methods included
- Debug logging available

### Why NOT Other Approaches?

**❌ Duplicate Services**
- 4x maintenance burden
- CMDB clutter
- Relationship complexity
- No single source of truth

**❌ NULL Company**
- Breaks company security
- Loses ownership tracking
- Reporting gaps
- CMDB governance issues

**❌ SPM Service Commitments Only**
- Doesn't solve reference qualifier
- Requires additional licensing
- Good complement, not replacement

---

## Company Hierarchy Behavior

### What Gets Included?

```
Altus Community Healthcare (parent)
├─ Service 1 → ✅ Visible to all children
└─ Service 2 → ✅ Visible to all children

Neighbors (child)
└─ Service 3 → ✅ Visible to Neighbors only

Austin (child)
└─ Service 4 → ❌ NOT visible to Neighbors (sibling isolation)
```

### Traversal Direction

**Upward Only (Parent Chain):**
- Neighbors → Altus → (Altus's parent if exists)

**NOT Sideways (Siblings):**
- Neighbors ❌ Austin
- Neighbors ❌ Exceptional

**NOT Downward (Children):**
- Altus ❌ Neighbors' services (unless Altus is explicitly set)

---

## Production Deployment Checklist

### Pre-Deployment
- [ ] Create update set
- [ ] Test in DEV with Neighbors incidents
- [ ] Test in DEV with Austin incidents
- [ ] Test in DEV with Altus incidents
- [ ] Verify service offering exclusion
- [ ] Performance test with 100+ services
- [ ] Document changes

### Deployment
- [ ] Move update set to TEST
- [ ] UAT with business users
- [ ] Verify INC0167957 scenario works
- [ ] Move update set to PROD
- [ ] Deploy during maintenance window
- [ ] Clear cache post-deployment
- [ ] Smoke test with real users

### Post-Deployment
- [ ] Monitor system logs for errors
- [ ] Verify no performance degradation
- [ ] Collect user feedback
- [ ] Update documentation
- [ ] Close INC0167957

---

## Quick Reference Commands

### Test Company Hierarchy
```javascript
var filter = new ApplicationServiceFilter();
var hierarchy = filter.testHierarchy('COMPANY_SYS_ID');
gs.info(JSON.stringify(hierarchy));
```

### Test Reference Qualifier
```javascript
var incGr = new GlideRecord('incident');
incGr.initialize();
incGr.company = 'COMPANY_SYS_ID';

var filter = new ApplicationServiceFilter();
gs.info(filter.getQualifier(incGr));
```

### Count Visible Services
```javascript
var qualifier = 'sys_class_name!=service_offering^company=ID1^ORcompany=ID2';
var serviceGr = new GlideRecord('cmdb_ci_service');
serviceGr.addEncodedQuery(qualifier);
serviceGr.query();
gs.info('Total services: ' + serviceGr.getRowCount());
```

### Enable Debug Logging
```javascript
// Create system property
// Name: com.snc.application_service_filter.debug
// Value: true
```

---

## Support Contacts

**For Implementation Questions:**
- ServiceNow Architecture Team

**For Testing Support:**
- QA Team - UAT Environment

**For Production Issues:**
- ServiceNow Platform Team
- Incident: INC0167957

**For Business Questions:**
- Altus Service Management
- Neighbors/Austin/Exceptional Representatives

---

## Related Incidents

- **INC0167957** - Original issue: Cannot select Gorev for Neighbors
- Reference: Application Service filtering for child companies
- Resolution: ApplicationServiceFilter script include implementation

---

## Summary

**Before:**
```
Incident (company=Neighbors)
→ business_service dropdown
→ Shows only Neighbors services
→ Gorev (company=Altus) excluded ❌
```

**After:**
```
Incident (company=Neighbors)
→ business_service dropdown
→ Shows Neighbors + Altus services
→ Gorev (company=Altus) included ✅
```

**Implementation:** One script include + one dictionary update = Complete solution

---

For detailed implementation guide, see: `SERVICENOW_REFERENCE_QUALIFIER_SOLUTION.md`
