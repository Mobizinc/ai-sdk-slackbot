# Altus Infrastructure Linking Summary

**Date:** 2025-10-15
**Status:** ✅ Complete

---

## Overview

This document summarizes the infrastructure CI linking work completed for Altus Community Healthcare and related entities (Neighbors, Exceptional, Austin).

---

## What Was Completed

### ✅ 1. Firewall Infrastructure Linking

**Achievement:**
- Linked **29 Altus firewalls** to "Network Management" Service Offering
- Created 29 CI relationships in PROD
- All firewalls now visible in CI Relationship Viewer

**Script:** `scripts/link-firewalls-to-network-service.ts`
- Reusable for other clients
- Idempotent (safe to run multiple times)
- Supports both PROD and DEV environments

**Locations Covered:**
All 29 Altus locations including Dallas, Mueller, Pearland, Baytown, Arboretum, Waxahachie, Beaumont, Lumberton, Corporate Office, and 20+ more.

**Result:**
```
Network Management Service Offering (parent)
└─ Contains::Contained by → 29 Altus Firewalls (children)
```

### ✅ 2. Company Structure Discovery Tools

**Created Reusable Scripts:**

1. **`scripts/discover-company-structure.ts`**
   - Discovers multi-company client structures
   - Queries company records and customer accounts
   - Identifies parent-child relationships
   - Reusable for any client

2. **`scripts/extract-company-server-inventory.ts`**
   - Extracts server inventory for company groups
   - Queries multiple server CMDB tables
   - Exports comprehensive CSV reports
   - Foundation for server linking

3. **`scripts/discover-all-servers-sample.ts`**
   - Samples all servers in CMDB (no filters)
   - Analyzes naming patterns and company distribution
   - Identifies orphaned servers
   - Useful for CMDB data quality analysis

4. **`scripts/search-servers-by-pattern.ts`**
   - Diagnostic tool for finding servers by name
   - Quick way to verify server existence
   - Helps identify naming conventions

**Outputs Generated:**
- `backup/company-analysis/altus-company-structure.json` - Company hierarchy
- `backup/server-analysis/all-servers-sample.csv` - 570 servers sampled

---

## Discovery Findings

### Company Structure
- **Primary Company:** Altus Community Healthcare
- **Child Company:** AltusCorp
- **Related Accounts:** 496 customer accounts including:
  - Neighbors (ACCT0010336)
  - Exceptional (ACCT0010335)
  - Austin (ACCT0010337)

### Infrastructure Inventory

| Infrastructure Type | Count | Status |
|---------------------|-------|--------|
| **Firewalls** | 29 | ✅ Linked to Network Management |
| **Servers** | 0 | N/A - None in CMDB |
| **Application Services** | 24 | ✅ Already created (prior work) |
| **Service Offerings** | 6 | ✅ Already created (prior work) |

### Key Finding: No Servers in CMDB

**Investigation Results:**
- Queried all server CMDB tables (base, Windows, Linux, ESXi, VMs)
- Searched by company association: 0 results
- Searched by name patterns: 0 results
- Searched by Altus locations: 0 results
- Reviewed 53 orphaned servers: None belong to Altus

**Conclusion:**
Altus Community Healthcare and related entities (Neighbors, Exceptional, Austin) have **zero servers** registered in ServiceNow CMDB server tables.

**Likely Explanation:**
- Cloud-only infrastructure (Azure VMs)
- EMR systems hosted by vendors (Epic, NextGen)
- Edge infrastructure only (firewalls at locations)
- Server inventory managed outside ServiceNow

---

## Reusable Assets Created

### Scripts (Ready for Other Clients)
1. `link-firewalls-to-network-service.ts` - Link firewalls to services
2. `discover-company-structure.ts` - Multi-company discovery
3. `extract-company-server-inventory.ts` - Server inventory extraction
4. `discover-all-servers-sample.ts` - CMDB-wide server analysis
5. `search-servers-by-pattern.ts` - Diagnostic search tool

### Documentation
1. `Multi_Client_Deployment_Guide.md` - Updated with infrastructure linking
2. `Altus_Infrastructure_Linking_Summary.md` - This document
3. `Setup_Scripts_CI_Relationship_Update.md` - Technical CI relationship details

### Data Exports
1. Company structure JSON (Altus)
2. Server sample CSV (570 servers, all clients)

---

## CMDB Structure (Final State)

```
Managed Support Services (Business Service)
└─ Service Offerings (6)
   ├─ Application Administration
   │  └─ Altus Application Services (24)
   │     ├─ NextGen Production
   │     ├─ O365 Production
   │     ├─ Azure Environment
   │     └─ ... (21 more)
   │
   ├─ Infrastructure and Cloud Management
   │  └─ Altus Infrastructure Services (5)
   │
   ├─ Network Management
   │  ├─ Altus Network Services (1)
   │  └─ Altus Firewalls (29) ← NEW
   │
   ├─ Cybersecurity Management
   ├─ Helpdesk and Endpoint Support - 24/7
   └─ Helpdesk and Endpoint - Standard
```

---

## Benefits Delivered

### 1. Service-Infrastructure Dependencies
- Firewalls now linked to Network Management service
- Incidents on firewalls properly routed
- Impact analysis: "Which services affected if firewall fails?"

### 2. Complete CI Relationship Viewer
- Visual service hierarchy
- Network Management → 29 firewalls visible
- Proper CMDB structure following ITIL best practices

### 3. Reusable Framework
- Tools work for any multi-company client
- Pattern established for infrastructure linking
- Discovery scripts help with future clients

### 4. Data Quality Insights
- Identified 570 servers across all clients
- Found 53 orphaned servers (no company)
- Baseline for CMDB cleanup initiatives

---

## Lessons Learned

### 1. Don't Assume Server Existence
- Not all clients have servers in CMDB
- Cloud-only clients are common
- Always verify with discovery before building linking scripts

### 2. Firewall Model Works Well
- 29 firewalls successfully linked
- Reusable script for other clients with firewalls
- Template for other infrastructure types (load balancers, switches)

### 3. Discovery Tools Are Essential
- Company structure discovery prevents wrong assumptions
- Broad sampling reveals actual CMDB state
- Location cross-reference helps identify gaps

### 4. Multi-Company Clients Are Complex
- Altus has 496 accounts under 2 company records
- Neighbors, Exceptional, Austin are accounts, not separate companies
- Tools must handle company hierarchies

---

## Future Opportunities

### For Altus
- **If servers are added to CMDB later:**
  - Use `extract-company-server-inventory.ts` to find them
  - Link to appropriate Application Services
  - Follow firewall linking pattern

- **If Azure resources needed:**
  - Query Azure-specific CMDB tables
  - Link Azure VMs to Application Services
  - Extend discovery scripts for cloud resources

### For Other Clients
- **Apply firewall linking pattern:**
  - Run `link-firewalls-to-network-service.ts` with different client pattern
  - Works for any client with firewalls in `cmdb_ci_netgear` table

- **Use discovery tools:**
  - `discover-company-structure.ts` for multi-entity clients
  - `discover-all-servers-sample.ts` to understand CMDB state
  - Build client-specific linking strategies

### For CMDB Quality
- **Address 53 orphaned servers:**
  - Investigate servers with no company
  - Assign to correct companies
  - Improve CMDB data quality

- **Standardize infrastructure linking:**
  - Create scripts for other infrastructure types
  - Load balancers, switches, storage devices
  - Build complete service dependency maps

---

## Scripts Reference

### Linking Scripts
```bash
# Link firewalls to Network Management (Altus example)
npx tsx scripts/link-firewalls-to-network-service.ts

# Expected: 29 CI relationships created
# Safe to re-run (idempotent)
```

### Discovery Scripts
```bash
# Discover company structure
npx tsx scripts/discover-company-structure.ts "Altus"

# Extract server inventory for companies
npx tsx scripts/extract-company-server-inventory.ts backup/company-analysis/altus-company-structure.json

# Sample all servers (diagnostic)
npx tsx scripts/discover-all-servers-sample.ts

# Search servers by name pattern
npx tsx scripts/search-servers-by-pattern.ts "ClientName"
```

---

## Verification

### In ServiceNow UI

**1. View Network Management Service:**
- Navigate to: Service Offerings → Network Management
- Check "Related Services" tab
- Verify: 29 Altus firewalls appear

**2. Check CI Relationship Viewer:**
- Open any Altus firewall CI
- View "CI Relationships" tab
- Verify: Parent = "Network Management"

**3. View Complete Hierarchy:**
- Open: Business Service → "Managed Support Services"
- View relationship map
- Verify: Network Management → Firewalls visible

---

## Conclusion

✅ **Firewall linking complete** - 29 Altus firewalls successfully linked to Network Management Service Offering

✅ **Discovery tools created** - Reusable scripts for company structure and server inventory analysis

✅ **Server discovery closed** - Confirmed Altus has no servers in CMDB; no action needed

✅ **Documentation updated** - Multi-Client Deployment Guide includes infrastructure linking section

✅ **Template established** - Firewall linking pattern ready for other clients

---

**Next Client Ready:** The discovery and linking framework is now ready to use for other clients (FPA, Neighbors as separate entities, etc.)

**Status:** Infrastructure linking work complete for Altus Community Healthcare
