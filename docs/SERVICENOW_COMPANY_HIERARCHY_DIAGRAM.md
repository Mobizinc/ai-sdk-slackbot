# ServiceNow Company Hierarchy & Service Visibility - Visual Reference

## Current State (Before Fix)

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMPANY HIERARCHY                             │
└─────────────────────────────────────────────────────────────────┘

                 Altus Community Healthcare
                    (Parent Company)
                    sys_id: c3eec28c...
                           │
            ┌──────────────┼──────────────┬──────────────┐
            │              │              │              │
        Neighbors       Austin     Exceptional        STAT
        (Active)      (Active)      (Active)      (Inactive)


┌─────────────────────────────────────────────────────────────────┐
│                    SERVICE OWNERSHIP                             │
└─────────────────────────────────────────────────────────────────┘

    Managed Support Services (cmdb_ci_service_business)
            │
            └─── Application Administration (service_offering)
                    sys_id: 7abe6bd6...
                    company: Altus Community Healthcare
                    │
                    └─── Altus Health - Gorev Production
                         (cmdb_ci_service_discovered)
                         sys_id: 3100fb9a...
                         company: Altus Community Healthcare ← OWNED BY PARENT
                         vendor: Mobiz IT


┌─────────────────────────────────────────────────────────────────┐
│           INCIDENT CREATION - CURRENT BEHAVIOR (BROKEN)          │
└─────────────────────────────────────────────────────────────────┘

User creates incident:
  ├─ Number: INC0167957
  ├─ Company: Neighbors ← CHILD COMPANY
  └─ Business Service: [dropdown]

Reference Qualifier Applied:
  sys_class_name!=service_offering

Implicit Company Filter (OOTB ServiceNow):
  company = Neighbors (exact match only)

Services Evaluated:
  ┌─────────────────────────────────────────────────────────┐
  │ Service: Gorev                                          │
  │ Class Check: cmdb_ci_service_discovered != service_offering │
  │ Result: ✅ PASS                                         │
  ├─────────────────────────────────────────────────────────┤
  │ Company Check: Altus != Neighbors                       │
  │ Result: ❌ FAIL                                         │
  └─────────────────────────────────────────────────────────┘

Final Result: Gorev NOT visible in dropdown ❌

Problem: ServiceNow does NOT traverse company hierarchy!
```

---

## Future State (After Fix)

```
┌─────────────────────────────────────────────────────────────────┐
│           INCIDENT CREATION - NEW BEHAVIOR (FIXED)               │
└─────────────────────────────────────────────────────────────────┘

User creates incident:
  ├─ Number: INC0167957
  ├─ Company: Neighbors ← CHILD COMPANY
  └─ Business Service: [dropdown]

Reference Qualifier Applied:
  javascript:new ApplicationServiceFilter().getQualifier(current);

Script Include Execution:
  ┌─────────────────────────────────────────────────────────┐
  │ 1. Get incident company: Neighbors                      │
  │    sys_id: [neighbors_id]                               │
  ├─────────────────────────────────────────────────────────┤
  │ 2. Traverse company hierarchy:                          │
  │    • Start: Neighbors                                   │
  │    • Check parent: Altus Community Healthcare           │
  │    • Check parent's parent: (none)                      │
  │    • Result: [neighbors_id, altus_id]                   │
  ├─────────────────────────────────────────────────────────┤
  │ 3. Build query:                                         │
  │    sys_class_name!=service_offering                     │
  │    ^company=[neighbors_id]                              │
  │    ^ORcompany=[altus_id]                                │
  └─────────────────────────────────────────────────────────┘

Services Evaluated:
  ┌─────────────────────────────────────────────────────────┐
  │ Service: Gorev                                          │
  │ Class Check: cmdb_ci_service_discovered != service_offering │
  │ Result: ✅ PASS                                         │
  ├─────────────────────────────────────────────────────────┤
  │ Company Check:                                          │
  │   Altus == [neighbors_id]? NO                           │
  │   Altus == [altus_id]? YES ← PARENT MATCH!              │
  │ Result: ✅ PASS                                         │
  └─────────────────────────────────────────────────────────┘

Final Result: Gorev IS visible in dropdown ✅

Solution: Custom script include traverses company hierarchy!
```

---

## Service Visibility Matrix

```
┌────────────────────────────────────────────────────────────────────┐
│                 WHO CAN SEE WHAT SERVICES?                         │
└────────────────────────────────────────────────────────────────────┘

Legend:
  ✅ = Visible in dropdown
  ❌ = Hidden from dropdown
  [P] = Owned by Parent
  [C] = Owned by Child
  [S] = Owned by Sibling

╔════════════════════╦═══════════╦════════════╦═══════════╦══════════╗
║                    ║  Altus    ║  Neighbors ║  Austin   ║   STAT   ║
║ Service / Company  ║  (Parent) ║  (Child 1) ║ (Child 2) ║ (Inactive)║
╠════════════════════╬═══════════╬════════════╬═══════════╬══════════╣
║ Gorev              ║           ║            ║           ║          ║
║ company=Altus [P]  ║     ✅    ║     ✅     ║     ✅    ║    ✅    ║
║ class=discovered   ║           ║            ║           ║          ║
╠════════════════════╬═══════════╬════════════╬═══════════╬══════════╣
║ App Admin          ║           ║            ║           ║          ║
║ company=Altus      ║     ❌    ║     ❌     ║     ❌    ║    ❌    ║
║ class=service_     ║           ║ (Filtered  ║ (Filtered ║(Filtered)║
║      offering      ║(Filtered) ║  by class) ║  by class)║          ║
╠════════════════════╬═══════════╬════════════╬═══════════╬══════════╣
║ Neighbors Service  ║           ║            ║           ║          ║
║ company=Neighbors  ║     ❌    ║     ✅     ║     ❌    ║    ❌    ║
║ class=business [C] ║ (No child ║            ║ (Sibling) ║(Sibling) ║
║                    ║ traversal)║            ║           ║          ║
╠════════════════════╬═══════════╬════════════╬═══════════╬══════════╣
║ Austin Service     ║           ║            ║           ║          ║
║ company=Austin     ║     ❌    ║     ❌     ║     ✅    ║    ❌    ║
║ class=business [S] ║           ║ (Sibling)  ║           ║(Sibling) ║
╠════════════════════╬═══════════╬════════════╬═══════════╬══════════╣
║ Shared Service     ║           ║            ║           ║          ║
║ company=NULL       ║     ✅    ║     ✅*    ║     ✅*   ║    ✅*   ║
║ class=business     ║           ║ (*if using ║ (*if using║(*if using║
║                    ║           ║ WithShared)║ WithShared)║WithShared)║
╚════════════════════╩═══════════╩════════════╩═══════════╩══════════╝

Notes:
1. service_offering class is ALWAYS filtered (regardless of company)
2. Company hierarchy traverses UPWARD only (child → parent)
3. NO sibling visibility (Neighbors cannot see Austin services)
4. NULL company services require getQualifierWithSharedServices() method
5. Inactive companies (STAT) still see parent services if hierarchy is valid
```

---

## Reference Qualifier Logic Flow

```
┌─────────────────────────────────────────────────────────────────┐
│               REFERENCE QUALIFIER EXECUTION FLOW                 │
└─────────────────────────────────────────────────────────────────┘

START: User clicks Business Service field
  │
  ├─ ServiceNow calls reference qualifier
  │
  ├─ javascript:new ApplicationServiceFilter().getQualifier(current);
  │
  └─▶ ApplicationServiceFilter.getQualifier(current)
      │
      ├─ Step 1: Validate Current Record
      │   ├─ Is current defined? ────────────── NO ──▶ Return base qualifier
      │   │                                              sys_class_name!=service_offering
      │   └─ Has company field? ─────────────── NO ──▶ Return base qualifier
      │
      ├─ Step 2: Get Company Hierarchy
      │   ├─ current.company = Neighbors (sys_id: xxx)
      │   │
      │   └─▶ _getCompanyHierarchy(xxx)
      │       ├─ companies = [xxx] (Neighbors)
      │       ├─ Query: Get company record for xxx
      │       ├─ Check: Does Neighbors have parent?
      │       │   └─ YES: parent = Altus (sys_id: c3eec28c...)
      │       ├─ companies.push(c3eec28c...) → [xxx, c3eec28c...]
      │       ├─ Query: Get company record for c3eec28c...
      │       ├─ Check: Does Altus have parent?
      │       │   └─ NO: Stop traversal
      │       └─ Return: [xxx, c3eec28c...]
      │
      ├─ Step 3: Build Company Query
      │   └─▶ _buildCompanyQuery([xxx, c3eec28c...])
      │       └─ Return: "company=xxx^ORcompany=c3eec28c..."
      │
      └─ Step 4: Combine Qualifiers
          ├─ Base: sys_class_name!=service_offering
          ├─ Company: company=xxx^ORcompany=c3eec28c...
          └─ Final: sys_class_name!=service_offering^company=xxx^ORcompany=c3eec28c...

RESULT: ServiceNow queries cmdb_ci_service with final qualifier
  │
  └─▶ Returns: All services matching criteria
      ├─ Excludes: service_offering class
      ├─ Includes: Services owned by Neighbors
      ├─ Includes: Services owned by Altus (parent)
      └─ Populates: Business Service dropdown
```

---

## Edge Cases & Error Handling

```
┌─────────────────────────────────────────────────────────────────┐
│                    EDGE CASE HANDLING                            │
└─────────────────────────────────────────────────────────────────┘

1. CIRCULAR REFERENCE
   ────────────────────────────────────────────────────────────
   Company A → parent = Company B
   Company B → parent = Company C
   Company C → parent = Company A ← CIRCULAR!

   Detection:
   ┌─────────────────────────────────────────────────────┐
   │ companies = [A, B, C]                               │
   │ Next parent = A (already in array)                  │
   │ Action: BREAK loop                                  │
   │ Log: gs.warn('Circular reference detected')         │
   └─────────────────────────────────────────────────────┘


2. DEEP HIERARCHY
   ────────────────────────────────────────────────────────────
   Company 1 → Company 2 → ... → Company 11 (11 levels)

   Protection:
   ┌─────────────────────────────────────────────────────┐
   │ MAX_HIERARCHY_DEPTH = 10                            │
   │ Current depth = 10                                  │
   │ Action: STOP traversal                              │
   │ Log: gs.warn('Max hierarchy depth reached')         │
   └─────────────────────────────────────────────────────┘


3. INACTIVE PARENT
   ────────────────────────────────────────────────────────────
   Neighbors (active) → Altus (inactive)

   Behavior:
   ┌─────────────────────────────────────────────────────┐
   │ Default: INCLUDE inactive parents                   │
   │ Reason: Service ownership still valid               │
   │ Optional: Add active check in script include        │
   │ Log: gs.debug('Inactive company encountered')       │
   └─────────────────────────────────────────────────────┘


4. NULL COMPANY ON INCIDENT
   ────────────────────────────────────────────────────────────
   Incident has no company set

   Behavior:
   ┌─────────────────────────────────────────────────────┐
   │ Check: if (!current.company) return base qualifier  │
   │ Result: Show all services (except service_offering) │
   │ Reason: No company filter to apply                  │
   └─────────────────────────────────────────────────────┘


5. ORPHAN COMPANY
   ────────────────────────────────────────────────────────────
   Company exists but parent sys_id is invalid

   Behavior:
   ┌─────────────────────────────────────────────────────┐
   │ Query: companyGr.get(parentSysId)                   │
   │ Result: Returns false (not found)                   │
   │ Action: BREAK loop, use companies found so far      │
   │ Log: gs.debug('Company not found')                  │
   └─────────────────────────────────────────────────────┘


6. PERFORMANCE - LARGE SERVICE LIST
   ────────────────────────────────────────────────────────────
   1000+ services in CMDB

   Optimization:
   ┌─────────────────────────────────────────────────────┐
   │ 1. Hierarchy caching in _hierarchyCache             │
   │ 2. Database index on company field                  │
   │ 3. Consider additional filters:                     │
   │    - operational_status=1 (operational only)        │
   │    - u_active=true (if custom field exists)         │
   └─────────────────────────────────────────────────────┘
```

---

## Data Model Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                   TABLE RELATIONSHIPS                            │
└─────────────────────────────────────────────────────────────────┘

core_company
├─ sys_id (PK)
├─ name
├─ parent (FK → core_company.sys_id) ← HIERARCHY KEY
└─ active

        │
        │ Referenced by
        ▼

cmdb_ci_service (and child tables)
├─ sys_id (PK)
├─ name
├─ sys_class_name (identifies child table)
├─ company (FK → core_company.sys_id) ← OWNERSHIP KEY
├─ parent (FK → cmdb_ci_service.sys_id)
└─ operational_status

        │
        │ Referenced by
        ▼

incident (extends task)
├─ sys_id (PK)
├─ number
├─ company (FK → core_company.sys_id) ← REQUESTER COMPANY
├─ business_service (FK → cmdb_ci_service.sys_id) ← FILTERED FIELD
└─ short_description


┌─────────────────────────────────────────────────────────────────┐
│                 CLASS HIERARCHY (CMDB)                           │
└─────────────────────────────────────────────────────────────────┘

cmdb (base table)
│
└─ cmdb_ci (Configuration Item)
   │
   └─ cmdb_ci_service (Service Base)
      │
      ├─ cmdb_ci_service_business (Business Service)
      │  └─ Example: "Managed Support Services"
      │
      ├─ service_offering (Service Offering) ← FILTERED OUT
      │  └─ Example: "Application Administration"
      │
      ├─ cmdb_ci_service_discovered (Discovered Service)
      │  └─ Example: "Altus Health - Gorev Production" ← TARGET
      │
      └─ cmdb_ci_service_technical (Technical Service)

Note: service_offering is intentionally excluded to keep catalogs
      separate from operational services.
```

---

## Before/After Comparison

```
┌─────────────────────────────────────────────────────────────────┐
│                      BEFORE FIX                                  │
└─────────────────────────────────────────────────────────────────┘

Incident Form (company=Neighbors):

┌──────────────────────────────────────────────────────┐
│ Business Service: [Click to select...]              │
│                                                      │
│ Dropdown shows:                                     │
│   ❌ Altus Health - Gorev Production (not visible)  │
│   ✅ Neighbors Internal Service (if exists)         │
│   ❌ Parent company services (not visible)          │
│                                                      │
│ User cannot complete incident correctly             │
└──────────────────────────────────────────────────────┘

Result: INC0167957 opened - "Cannot select Gorev"


┌─────────────────────────────────────────────────────────────────┐
│                       AFTER FIX                                  │
└─────────────────────────────────────────────────────────────────┘

Incident Form (company=Neighbors):

┌──────────────────────────────────────────────────────┐
│ Business Service: [Click to select...]              │
│                                                      │
│ Dropdown shows:                                     │
│   ✅ Altus Health - Gorev Production (visible!)     │
│   ✅ Other Altus services (visible!)                │
│   ✅ Neighbors services (visible!)                  │
│   ❌ Service Offerings (correctly filtered)         │
│   ❌ Austin services (sibling - correctly hidden)   │
│                                                      │
│ User can select Gorev successfully                  │
└──────────────────────────────────────────────────────┘

Result: Incident created correctly, INC0167957 resolved
```

---

## Summary Diagram

```
╔═══════════════════════════════════════════════════════════════╗
║                    SOLUTION ARCHITECTURE                       ║
╚═══════════════════════════════════════════════════════════════╝

┌─────────────────┐
│  User Action    │ Creates incident with company=Neighbors
└────────┬────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────┐
│  ServiceNow Field: incident.business_service               │
│  Reference: cmdb_ci_service                                │
│  Reference Qualifier:                                      │
│  javascript:new ApplicationServiceFilter().getQualifier(); │
└────────┬───────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│  Script Include: ApplicationServiceFilter                    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ getQualifier(current):                                 │  │
│  │   1. Get company: Neighbors                            │  │
│  │   2. Traverse hierarchy: [Neighbors, Altus]            │  │
│  │   3. Build query:                                      │  │
│  │      sys_class_name!=service_offering                  │  │
│  │      ^company=Neighbors                                │  │
│  │      ^ORcompany=Altus                                  │  │
│  └────────────────────────────────────────────────────────┘  │
└────────┬─────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│  Database Query: cmdb_ci_service                             │
│  WHERE:                                                      │
│    (sys_class_name != 'service_offering')                    │
│    AND                                                       │
│    (company = 'Neighbors' OR company = 'Altus')              │
└────────┬─────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│  Results:                                                    │
│  ✅ Altus Health - Gorev Production (company=Altus)         │
│  ✅ Other Altus services (company=Altus)                    │
│  ✅ Neighbors services (company=Neighbors)                  │
│  ❌ Application Administration (service_offering - filtered) │
│  ❌ Austin services (company=Austin - not in hierarchy)     │
└────────┬─────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│  UI Dropdown:                                                │
│  Shows filtered list of available services                  │
│  User selects "Altus Health - Gorev Production"             │
└──────────────────────────────────────────────────────────────┘

Result: Problem solved! ✅
```

---

## Quick Decision Tree

```
                        START
                          │
                          ▼
            ┌─────────────────────────┐
            │ Need to filter services?│
            └──────────┬──────────────┘
                       │
                ┌──────┴──────┐
                │             │
              YES            NO
                │             │
                ▼             └─── Use standard reference
    ┌───────────────────┐         (no custom qualifier)
    │ Multi-company MSP?│
    └──────┬────────────┘
           │
      ┌────┴────┐
      │         │
     YES       NO
      │         │
      ▼         └─── Simple company filter:
┌──────────────┐     company=${current.company}
│ Parent-child?│
└──────┬───────┘
       │
  ┌────┴────┐
  │         │
 YES       NO
  │         │
  ▼         └─── Separate companies (no sharing):
┌──────────────────┐    company=${current.company}
│ Use this solution│
│ ApplicationService│
│ Filter with      │
│ hierarchy        │
│ traversal        │
└──────────────────┘
       │
       ▼
  ┌─────────────────────────────┐
  │ Additional requirements:    │
  ├─────────────────────────────┤
  │ • Exclude service_offering? │ ✅ Built-in
  │ • Include NULL company?     │ ✅ Use WithSharedServices()
  │ • Filter by status?         │ ✅ Add to qualifier
  │ • Filter by vendor?         │ ✅ Add to qualifier
  │ • Cache hierarchy?          │ ✅ Built-in
  │ • Handle circular refs?     │ ✅ Built-in
  │ • Limit depth?              │ ✅ Built-in (max 10)
  │ • Debug logging?            │ ✅ System property
  └─────────────────────────────┘
```

---

For complete implementation details, see:
- **Full Guide:** SERVICENOW_REFERENCE_QUALIFIER_SOLUTION.md
- **Quick Reference:** SERVICENOW_REFQUAL_QUICK_REFERENCE.md
- **Script Include:** scripts/servicenow-script-includes/ApplicationServiceFilter.js
