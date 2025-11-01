# FortiManager Customer Onboarding - Repeatable Process

**Purpose:** Step-by-step checklist for onboarding new customers with Fortinet FortiManager
**Reference Implementation:** Allcare Medical Management (completed successfully)
**Pattern:** Follows Altus infrastructure linking pattern

---

## Pre-Requisites Checklist

### ☐ 1. FortiManager Access
- [ ] FortiManager URL (IP or hostname)
- [ ] API credentials obtained (username/password OR API token)
- [ ] API token authentication preferred (FortiManager 7.2.2+)
- [ ] Test connectivity: `curl -k https://{fortimanager-ip}/jsonrpc`

### ☐ 2. API Permissions Verified
- [ ] JSON API Access: **Read-Write** enabled
- [ ] Admin Profile: **Super_User** OR custom with Device Manager permissions
- [ ] Administrative Domains: **All ADOMs** OR specific ADOMs granted
- [ ] Trusted Hosts: API access IP whitelisted OR 0.0.0.0/0 for testing
- [ ] **Proxy permissions** enabled (for device config access)

### ☐ 3. ServiceNow Company Structure Research
- [ ] Identify parent company sys_id
- [ ] Identify all sibling companies (subsidiaries, divisions)
- [ ] Document company hierarchy
- [ ] Verify locations exist in ServiceNow for each company

Example:
```
Parent: Allcare Medical Management, Inc. (5231c90a...)
Children:
  - FPA Women's Health (ebf393e6...)
  - Hospitality Dental Group (9aa1454a...)
  - Cal Select Dental (9c14d3e6...)
```

### ☐ 4. Environment Configuration
- [ ] Add FortiManager credentials to `.env.local`
- [ ] Test credentials with discovery script (dry-run)

```bash
# .env.local
FORTIMANAGER_{CUSTOMER}_URL=https://fortimanager-ip
FORTIMANAGER_{CUSTOMER}_API_KEY=api-token
```

---

## Phase 1: Discovery (Day 1)

### ☐ Step 1.1: Discover Firewalls

**Script:**
```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx scripts/discover-fortimanager-firewalls.ts --customer {customer}
```

**Verify:**
- [ ] All expected firewalls discovered (count matches reality)
- [ ] Models identified correctly
- [ ] Serial numbers captured
- [ ] Management IPs present
- [ ] Online/offline status accurate
- [ ] GPS coordinates available

**Output:**
- `backup/fortimanager-discovery/{customer}-firewalls.json`
- `backup/fortimanager-discovery/{customer}-firewalls.csv`

**Review CSV in Excel/Numbers to validate**

---

### ☐ Step 1.2: Discover Network Interfaces

**Script:**
```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx scripts/discover-allcare-network-interfaces.ts
```

**Update script:**
- Change `allcare` references to `{customer}`
- Update paths to use customer name

**Verify:**
- [ ] 300-400 interfaces discovered (for ~30 firewalls)
- [ ] IP addresses and netmasks extracted
- [ ] Network CIDRs calculated correctly
- [ ] Interface types classified (WAN/LAN/DMZ)
- [ ] ~150-200 unique network CIDRs identified

**Output:**
- `backup/network-import/{customer}-network-interfaces.json`
- `backup/network-import/{customer}-network-cidrs.csv`

---

## Phase 2: ServiceNow Preparation (Day 1-2)

### ☐ Step 2.1: Research Existing Data

**Check for duplicates/existing firewalls:**
```bash
npx tsx scripts/find-duplicate-{customer}-firewalls.ts
```

**If duplicates exist:**
- [ ] Create name mapping table: `config/fortimanager/{customer}-name-mapping.csv`
- [ ] Identify which entries to keep (usually: has company + location)
- [ ] Identify which entries to delete (usually: parent company, no location)

### ☐ Step 2.2: Verify Company/Location Linkages

**Query ServiceNow:**
```sql
Companies: {Parent} + all siblings
Locations: Per sibling company
```

**Create mapping:**
```
Firewall Prefix → Company
  ACM-FPA-* → FPA Women's Health
  ACM-HDG-* → Hospitality Dental Group
  ACM-CSD-* → Cal Select Dental
  ACM-HQ-* → Parent company
```

---

## Phase 3: Firewall CI Management (Day 2)

### ☐ Step 3.1: Handle Duplicates (if any)

**If duplicates found:**
```bash
# Review merge plan
npx tsx scripts/merge-duplicate-{customer}-firewalls.ts --dry-run

# Execute merge
npx tsx scripts/merge-duplicate-{customer}-firewalls.ts
```

**Result:**
- [ ] Kept entries have: correct company + location
- [ ] Deleted entries: parent company, no location
- [ ] All kept entries enriched with FortiManager data

### ☐ Step 3.2: Create New Firewalls (if needed)

**If no existing firewalls in ServiceNow:**
```bash
npx tsx scripts/create-fortimanager-firewall-cis.ts \
  backup/fortimanager-discovery/{customer}-firewalls.json \
  --company "{Customer Legal Name}"
```

**Verify:**
- [ ] All firewalls created in ServiceNow
- [ ] Serial numbers populated
- [ ] Management IPs populated
- [ ] Linked to correct sibling companies (NOT parent)
- [ ] Linked to physical locations

---

### ☐ Step 3.3: Link Firewalls to Services

**Script:**
```bash
npx tsx scripts/link-fortimanager-firewalls-to-services.ts "{Customer Legal Name}"
```

**Verify:**
- [ ] All firewalls linked to "Network Management" service offering
- [ ] Relationship type: "Contains::Contained by"
- [ ] Can view in ServiceNow CI Relationship Viewer

---

## Phase 4: IP Network Topology (Day 2-3)

### ☐ Step 4.1: Create IP Network CIs

**CRITICAL - Follow Altus Pattern:**

**Key Requirements:**
1. ✅ Network CI MUST have `location` field populated
2. ✅ Duplicate check by: **network_address + netmask + location** (not just CIDR)
3. ✅ Same CIDR at different locations = separate network CIs
4. ✅ Company sys_id extraction: Use raw value (NOT display_value)

**Script:**
```bash
npx tsx scripts/create-{customer}-ip-networks-from-interfaces.ts --dry-run
# Review output
npx tsx scripts/create-{customer}-ip-networks-from-interfaces.ts
```

**Verify:**
- [ ] ~30-50 LAN /24 networks created (one per location)
- [ ] ~40-60 WAN /29-30 networks created (primary + backup per location)
- [ ] Each network has valid `company` sys_id (32-char hex)
- [ ] Each network has valid `location` sys_id (32-char hex)
- [ ] Network names include location name
- [ ] No shared infrastructure VLANs included (filter out NAC, FortiLink, guest)

### ☐ Step 4.2: Link Firewalls to Networks

**CRITICAL - Location Matching:**

**Key Requirements:**
1. ✅ Match by: **network_address + netmask + location** (not just CIDR)
2. ✅ Firewall location MUST = Network location
3. ✅ No cross-location linking (prevents contamination)

**Script:**
```bash
npx tsx scripts/link-{customer}-firewalls-to-ip-networks.ts --dry-run
# Review - verify firewall location = network location
npx tsx scripts/link-{customer}-firewalls-to-ip-networks.ts
```

**Verify:**
- [ ] ~80-100 firewall→network relationships created
- [ ] Each firewall linked to its location's networks only
- [ ] Relationship type: "Connects to::Connected by"
- [ ] No firewalls linked to other customers' networks

---

## Phase 5: Validation (Day 3)

### ☐ Step 5.1: Data Quality Validation

**Script:**
```bash
npx tsx scripts/validate-{customer}-firewall-linkages-final.ts
```

**Quality Gates:**
- [ ] ✅ Serial Numbers: 100% (all firewalls)
- [ ] ✅ IP Addresses: 100% (all firewalls)
- [ ] ✅ Location Linkages: ≥90% (some HQ/Azure/temp may not have locations)
- [ ] ✅ Correct Company: 100% (linked to sibling, not always parent)

### ☐ Step 5.2: Cross-Customer Contamination Check

**Script:**
```bash
npx tsx scripts/validate-{customer}-{other_customer}-network-integrity.ts
```

**Verify:**
- [ ] ✅ No {customer} firewalls linked to {other_customer} networks
- [ ] ✅ {Other_customer} data untouched (network count unchanged)
- [ ] ✅ {Other_customer} relationships intact

### ☐ Step 5.3: Manual ServiceNow Verification

**Check in ServiceNow GUI:**

1. **Firewall CI:**
   - Navigate to: CMDB → Firewalls
   - Filter by: Company = {Customer sibling}
   - Verify: Serial number, IP, Location populated
   - Check CI Relationships tab → See linked networks

2. **Network CI:**
   - Navigate to: CMDB → IP Networks
   - Filter by: Company = {Customer sibling}
   - Verify: Network address, netmask, Location populated
   - Check location matches expected

3. **Service Linkage:**
   - Navigate to: Service Offerings → Network Management
   - View: CI Relationships tab
   - Verify: Customer firewalls appear in list

---

## Phase 6: Monitoring Tool Integration (Day 3)

### ☐ Step 6.1: Test Monitoring Tool

**Script:**
```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx scripts/test-fortimanager-monitoring-tool.ts {DEVICE-NAME}
```

**Verify:**
- [ ] Tool returns firewall status (online/offline)
- [ ] Connection status from FortiManager
- [ ] Config sync status
- [ ] Firmware version displayed

### ☐ Step 6.2: Agent Integration Test

**In Slack/Agent:**
```
User: "Check status of {location} firewall"
Agent: *Calls getFirewallStatus({deviceName: "{DEVICE-NAME}"})*
Result: Returns connection status, config sync, metrics
```

---

## Common Pitfalls & Solutions

### ❌ Pitfall 1: Cross-Customer Network Contamination

**Problem:** Customer A firewalls linked to Customer B networks (same CIDR)

**Prevention:**
- ✅ Always filter network lookup by `location` (not just CIDR)
- ✅ Verify company sys_id is valid (not corrupted)
- ✅ Run cross-contamination check after linking

**Detection:**
```bash
# Check for contamination
curl ".../cmdb_rel_ci?sysparm_query=parent.nameLIKE{Customer}^child.company.nameLIKE{OtherCustomer}"
```

### ❌ Pitfall 2: Corrupted Company Sys_IDs

**Problem:** Company field contains `{display_value=FPA Women's Healt` instead of sys_id

**Prevention:**
- ✅ Query without `sysparm_display_value=true` for sys_id extraction
- ✅ Extract: `fw.company?.value || fw.company`
- ✅ Validate: sys_id is 32-char hex string
- ✅ Test with one record before batch creation

### ❌ Pitfall 3: Shared CIDR Across Locations

**Problem:** Same 192.168.x.0/24 used by firewalls at 4 different locations

**Solution:**
- ✅ Create separate network CIs (one per location)
- ✅ Each network CI has unique `location` field
- ✅ Firewall links to network with matching location
- ✅ This is correct - same CIDR doesn't mean same physical network

### ❌ Pitfall 4: Missing Location Field

**Problem:** Network CIs created without location field populated

**Prevention:**
- ✅ Always populate `location` field in network CI payload
- ✅ Duplicate check by: network + netmask + **location**
- ✅ Follow Altus pattern exactly

### ❌ Pitfall 5: Duplicate Firewall Entries

**Problem:** Same firewall exists multiple times (different names)

**Detection:**
```bash
npx tsx scripts/find-duplicate-{customer}-firewalls.ts
```

**Solution:**
- ✅ Keep entry with company + location
- ✅ Enrich with FortiManager data
- ✅ Delete entry with parent company, no location

---

## Automation Opportunities

### Quick-Start Script (Future)
```bash
npx tsx scripts/onboard-fortimanager-customer.ts \
  --customer {customer} \
  --fortimanager-url https://fmg-ip \
  --api-key {token} \
  --parent-company "{Legal Name}"
```

**Would automate:**
1. Discovery (firewalls + interfaces)
2. Duplicate detection
3. CI creation/enrichment
4. Service linking
5. Network CI creation
6. Firewall→network relationships
7. Validation report

### Validation Script (Exists)
```bash
npx tsx scripts/validate-{customer}-altus-network-integrity.ts
```

**Ensures:**
- No cross-customer contamination
- Proper location scoping
- Data quality gates passed

---

## Documentation Artifacts

### Required Files

1. **Configuration:**
   - `config/fortimanager/{customer}-config.json`
   - `config/fortimanager/{customer}-name-mapping.csv` (if duplicates)

2. **Discovery Outputs:**
   - `backup/fortimanager-discovery/{customer}-firewalls.json`
   - `backup/fortimanager-discovery/{customer}-firewalls.csv`
   - `backup/network-import/{customer}-network-interfaces.json`
   - `backup/network-import/{customer}-network-cidrs.csv`

3. **Completion Report:**
   - `operations/cmdb/{CUSTOMER}_FORTIMANAGER_INTEGRATION_COMPLETE.md`

---

## Time Estimates

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Pre-requisites | Credentials, permissions, research | 2-4 hours |
| Discovery | Firewalls + interfaces | 30 minutes |
| Preparation | Duplicate analysis, mapping | 1-2 hours |
| Firewall CIs | Create/merge, enrich, link to services | 1 hour |
| Network CIs | Create, validate, link | 2-3 hours |
| Validation | Quality checks, contamination check | 1 hour |
| **Total** | | **8-12 hours** |

**With automation (future):** ~2-3 hours

---

## Quality Gates Checklist

### ☐ Firewall CIs
- [ ] Count matches FortiManager discovery
- [ ] 100% have serial numbers
- [ ] 100% have IP addresses
- [ ] 100% linked to correct sibling companies (not all to parent)
- [ ] ≥90% linked to physical locations
- [ ] 100% linked to Network Management service

### ☐ Network CIs
- [ ] Count = ~30-50 LAN + ~40-60 WAN
- [ ] 100% have valid `company` sys_id (32-char hex)
- [ ] 100% have valid `location` sys_id (32-char hex)
- [ ] Network location field is populated (not null)
- [ ] No shared infrastructure VLANs (NAC, FortiLink filtered out)

### ☐ Relationships
- [ ] ~80-100 firewall→network relationships
- [ ] Each: firewall location = network location
- [ ] No cross-customer contamination
- [ ] All firewalls linked to Network Management service

### ☐ Data Integrity
- [ ] Other customers' data untouched (verify counts)
- [ ] No cross-location network linking
- [ ] Altus pattern followed exactly

---

## Rollback Procedures

### If Corruption Detected

**Delete incorrect relationships:**
```bash
npx tsx scripts/rollback-{customer}-incorrect-network-links.ts
```

**Delete corrupted network CIs:**
```bash
npx tsx scripts/delete-corrupted-{customer}-networks.ts
```

**Delete all {customer} networks and start over:**
```bash
npx tsx scripts/delete-{customer}-networks-and-relationships.ts
```

**Verify other customers intact:**
```bash
# Check Altus
curl ".../cmdb_ci_ip_network?sysparm_query=company.nameLIKEAltus&sysparm_limit=1"
# Should return 30 networks
```

---

## Success Criteria

### ✅ Complete Onboarding

**Firewalls:**
- All discovered firewalls in ServiceNow
- Correct company/location/service linkages
- Complete data (serial, IP, GPS, firmware)

**Networks:**
- Location-specific networks created
- Proper company/location scoping
- Firewall→network relationships match location

**Monitoring:**
- Agent can query firewall status
- `getFirewallStatus` tool working

**Validation:**
- All quality gates passed
- No cross-customer contamination
- Documentation complete

---

## Handoff Checklist

### ☐ Deliverables

- [ ] All firewalls documented in CMDB
- [ ] All networks documented with proper location scoping
- [ ] Monitoring tool tested and working
- [ ] Completion report created
- [ ] Knowledge transfer to operations team

### ☐ Ongoing Maintenance

**Monthly refresh (recommended):**
```bash
# Re-discover firewalls
NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx scripts/discover-fortimanager-firewalls.ts --customer {customer}

# Update changed firewalls
npx tsx scripts/update-{customer}-firewalls-from-fortimanager.ts

# Validate
npx tsx scripts/validate-{customer}-firewall-linkages-final.ts
```

---

## Reference Customers

### Completed
- ✅ **Allcare Medical Management** - Full integration with IP networks
- ✅ **Altus Community Healthcare** - Manual import, service linking

### Next Customers (Ready)
- Any customer with Fortinet FortiManager
- Follow this checklist exactly
- Estimated: 8-12 hours per customer

---

## Scripts Reference

### Discovery
- `discover-fortimanager-firewalls.ts`
- `discover-allcare-network-interfaces.ts` (adapt for new customer)

### CI Management
- `find-duplicate-{customer}-firewalls.ts`
- `merge-duplicate-{customer}-firewalls.ts`
- `create-fortimanager-firewall-cis.ts`
- `update-{customer}-firewalls-from-fortimanager.ts`

### Service Linking
- `link-fortimanager-firewalls-to-services.ts`

### Network Topology
- `create-{customer}-ip-networks-from-interfaces.ts`
- `link-{customer}-firewalls-to-ip-networks.ts`

### Validation
- `validate-{customer}-firewall-linkages-final.ts`
- `validate-{customer}-{other}-network-integrity.ts`

### Rollback/Cleanup
- `rollback-{customer}-incorrect-network-links.ts`
- `delete-corrupted-{customer}-networks.ts`
- `delete-{customer}-networks-and-relationships.ts`

---

## Lessons Learned (Allcare)

### What Worked
1. ✅ API token authentication more reliable than username/password
2. ✅ CLI interface endpoint works when proxy APIs restricted
3. ✅ Location field is CRITICAL for proper network scoping
4. ✅ Always validate against reference customer (Altus) before proceeding

### What to Avoid
1. ❌ Don't use `sysparm_display_value=true` when extracting sys_ids
2. ❌ Don't filter networks by CIDR alone (must include location)
3. ❌ Don't assume same CIDR = same network (different locations!)
4. ❌ Don't skip duplicate analysis (causes merge issues later)

### Critical Success Factors
1. ✅ Proper company/location sys_id extraction
2. ✅ Location-scoped network CIs (Altus pattern)
3. ✅ Cross-customer contamination checks at every step
4. ✅ Validation before and after each phase
