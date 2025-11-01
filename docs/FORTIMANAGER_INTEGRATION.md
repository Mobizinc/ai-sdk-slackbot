# FortiManager Integration Guide

## Overview

This integration provides automated discovery and import of FortiGate firewall devices from Fortinet FortiManager into ServiceNow CMDB. The solution is modular, reusable, and follows the same patterns as the Azure discovery integration.

**Completed Customer:** Allcare Medical Management
**Status:** ✅ Ready for testing

---

## Architecture

### Components

```
lib/infrastructure/fortimanager/          # Reusable library
├── client/
│   ├── http-client.ts                     # JSON-RPC HTTP client
│   └── session-manager.ts                 # Authentication & session management
├── types/
│   ├── api-responses.ts                   # FortiManager API response types
│   ├── domain-models.ts                   # Business domain models
│   ├── firewall-models.ts                 # Mapping logic
│   └── index.ts                           # Type exports
├── repositories/
│   ├── firewall-repository.ts             # Firewall data operations
│   └── index.ts                           # Repository exports
└── index.ts                               # Main module export

scripts/                                    # Execution scripts
├── discover-fortimanager-firewalls.ts     # Discovery script
├── create-fortimanager-firewall-cis.ts    # CI creation script
└── link-fortimanager-firewalls-to-services.ts  # Service linking script

config/fortimanager/                       # Customer configs
└── allcare-config.json                    # Allcare configuration

backup/fortimanager-discovery/             # Discovery outputs
├── allcare-firewalls.json                 # JSON export
└── allcare-firewalls.csv                  # CSV export
```

---

## Prerequisites

### 1. FortiManager Access

**Required Information:**
- FortiManager URL (IP address or hostname with `https://`)
- API username with read permissions
- API password

**Permissions Needed:**
- Read access to `/dvmdb/device` endpoint
- Ability to query managed devices
- Optional: Proxy access to query device interfaces

### 2. ServiceNow Access

**Required:**
- ServiceNow admin credentials (configured in `.env.local`)
- Write permissions to `cmdb_ci_ip_firewall` table
- Write permissions to `cmdb_rel_ci` table (for relationships)

### 3. Environment Configuration

Add FortiManager credentials to `.env.local`:

```bash
# FortiManager Configuration (Allcare Medical Management)
FORTIMANAGER_URL=https://52.143.126.83
FORTIMANAGER_USERNAME=api-svc
FORTIMANAGER_PASSWORD=co3z3hqyxa4aufjw5hdyf36tz6tbh4ia
```

---

## Complete Workflow

### Step 1: Discover Firewalls from FortiManager

```bash
npx tsx scripts/discover-fortimanager-firewalls.ts --customer allcare
```

**What It Does:**
1. Connects to FortiManager API
2. Authenticates and establishes session
3. Queries all managed devices (`/dvmdb/device`)
4. Filters to FortiGate firewalls only (os_type === 'fos')
5. For each firewall:
   - Fetches device details
   - Proxies to device to get network interfaces
   - Extracts public and internal IP scopes
   - Determines firewall status (online/offline)
6. Exports data to JSON and CSV

**Output:**
```
backup/fortimanager-discovery/
├── allcare-firewalls.json     # Complete structured data
└── allcare-firewalls.csv      # Spreadsheet for review
```

**Example Output:**
```
🔥 FortiManager Firewall Discovery
=======================================================================

Customer: allcare
FortiManager: https://52.143.126.83

Connecting to FortiManager...
✅ FortiManager login successful

──────────────────────────────────────────────────────────────────────
Discovering Firewalls
──────────────────────────────────────────────────────────────────────

Fetching all managed firewalls...
Found 12 device(s)
Filtered to 12 FortiGate firewall(s)

──────────────────────────────────────────────────────────────────────
📊 Discovery Summary
──────────────────────────────────────────────────────────────────────

Total Firewalls: 12
  Online: 10
  Offline: 2

Models:
  FortiGate-60F: 8
  FortiGate-100F: 3
  FortiGate-VM64: 1

──────────────────────────────────────────────────────────────────────
Firewall Details
──────────────────────────────────────────────────────────────────────

FW-ALLCARE-HQ-01
  Model: FortiGate-100F
  Serial Number: FG100FTK12345678
  Status: online (connected)
  Management IP: 10.100.1.1
  Public IPs: 203.0.113.45
  Internal IPs: 10.100.1.1, 192.168.1.1
  Firmware: v7.2.4
  Location: Headquarters

💾 JSON: backup/fortimanager-discovery/allcare-firewalls.json
💾 CSV:  backup/fortimanager-discovery/allcare-firewalls.csv
```

---

### Step 2: Review Discovered Data

Open the CSV file to verify:
```bash
open backup/fortimanager-discovery/allcare-firewalls.csv
```

**Verify:**
- ✅ All expected firewalls are present
- ✅ Models are correct
- ✅ IP addresses (public & internal) are accurate
- ✅ Status reflects actual firewall state
- ✅ Locations are populated

---

### Step 3: Create ServiceNow CIs

```bash
npx tsx scripts/create-fortimanager-firewall-cis.ts \
  backup/fortimanager-discovery/allcare-firewalls.json \
  --company "Allcare Medical Management, Inc."
```

**What It Does:**
1. Reads discovery JSON file
2. Looks up company in ServiceNow by name
3. For each firewall:
   - Checks if already exists (by serial number)
   - Skips if exists
   - Creates new CI in `cmdb_ci_ip_firewall` table
   - Populates all fields:
     - Name, serial number, model
     - Management IP
     - Company linkage
     - Operational status (mapped from online/offline)
     - Description with IP scopes
     - Manufacturer (Fortinet)
4. Reports creation summary

**Example Output:**
```
🔥 Creating FortiManager Firewall CIs
=======================================================================

Customer: Allcare Medical Management, Inc.
Firewalls: 12

Environment: PRODUCTION
URL: https://mobiz.service-now.com

Looking up company: Allcare Medical Management, Inc....
✅ Found company: Allcare Medical Management, Inc. (abc123def456)

FW-ALLCARE-HQ-01
  ✅ Created (FortiGate-100F)
     Management IP: 10.100.1.1
     Public IPs: 203.0.113.45
     Internal IPs: 10.100.1.1, 192.168.1.1

FW-ALLCARE-BRANCH-01
  ✅ Created (FortiGate-60F)
     Management IP: 10.200.1.1
     Public IPs: 203.0.113.46
     Internal IPs: 10.200.1.1

[... continues for all firewalls ...]

=======================================================================
📊 Creation Summary
=======================================================================

Total Firewalls: 12
  Created: 12
  Already Existing: 0
  Errors: 0
```

---

### Step 4: Link Firewalls to Services

```bash
npx tsx scripts/link-fortimanager-firewalls-to-services.ts \
  "Allcare Medical Management, Inc." \
  --service "Network Management"
```

**What It Does:**
1. Looks up company in ServiceNow
2. Looks up service offering (default: "Network Management")
3. Queries all firewalls for this company
4. For each firewall:
   - Checks if already linked
   - Skips if linked
   - Creates CI relationship: Service Contains Firewall
5. Reports linking summary

**Example Output:**
```
🔗 Linking FortiManager Firewalls to Services
=======================================================================

Environment: PRODUCTION
Company: Allcare Medical Management, Inc.
Service: Network Management

Looking up company: Allcare Medical Management, Inc....
✅ Found company: Allcare Medical Management, Inc.

Looking up service offering: Network Management...
✅ Found service: Network Management

Finding firewalls for company...
Found 12 firewall(s)

FW-ALLCARE-HQ-01
  ✅ Linked to Network Management

FW-ALLCARE-BRANCH-01
  ✅ Linked to Network Management

[... continues for all firewalls ...]

=======================================================================
📊 Linking Summary
=======================================================================

Total Firewalls: 12
  Linked: 12
  Already Linked: 0
  Errors: 0
```

---

### Step 5: Verify in ServiceNow

**Navigate to CMDB:**
1. Go to ServiceNow → CMDB → Firewalls (`cmdb_ci_ip_firewall`)
2. Filter by company: "Allcare Medical Management, Inc."
3. Verify all firewalls appear with correct data

**Check Service Relationships:**
1. Go to Service Offerings → Network Management
2. Open "Related Services" or "CI Relationships" tab
3. Verify all firewalls appear as contained CIs

**Inspect Individual Firewall:**
1. Open any firewall CI
2. Verify fields:
   - Name, Serial Number, Model
   - Management IP
   - Company
   - Description (contains IP scopes)
   - Operational Status
3. Check "CI Relationships" tab
4. Verify parent = "Network Management"

---

## Data Model

### FortiManager API → ServiceNow Mapping

| FortiManager Field | ServiceNow Field | Notes |
|--------------------|------------------|-------|
| `name` | `name` | Device name |
| `sn` | `serial_number` | Serial number (unique ID) |
| `platform_str` | `model_id` | Platform/model |
| `ip` | `ip_address` | Management IP |
| `conn_status` | `operational_status` | Online→1, Offline→2 |
| - | `short_description` | Auto-generated with IP scopes |
| - | `company` | Looked up by name |
| `os_ver` | - | Stored in description |
| Public IPs | - | Stored in description |
| Internal IPs | - | Stored in description |

### IP Scope Extraction

**Public IPs (Internet-facing):**
- Interfaces named: wan, wan1, port1, external
- OR interfaces with non-private IP addresses

**Internal IPs (Private):**
- Interfaces named: lan, internal, dmz, private
- OR interfaces with private IP ranges (10.x, 172.16-31.x, 192.168.x)

**Private IP Ranges Detected:**
- `10.0.0.0/8`
- `172.16.0.0/12`
- `192.168.0.0/16`

---

## FortiManager API Details

### Authentication

**Method:** Session-based (JSON-RPC)

**Login Endpoint:** `/jsonrpc` with method `exec` and url `/sys/login/user`

**Session Token:** Returned in `Set-Cookie` header as `ccsrftoken`

**Request Format:**
```json
{
  "id": 1,
  "method": "exec",
  "params": [{
    "url": "/sys/login/user",
    "data": {
      "user": "api-svc",
      "passwd": "password"
    }
  }]
}
```

### Core Endpoints

**List All Devices:**
```
GET /dvmdb/device
```

**Get Device Details:**
```
GET /dvmdb/device/<device_name>
```

**Get Device Interfaces (via Proxy):**
```
EXEC /sys/proxy/json
{
  "url": "/api/v2/cmdb/system/interface",
  "target": ["device_name"]
}
```

---

## Troubleshooting

### Discovery Issues

**Problem:** "No session token received from FortiManager"

**Solutions:**
- Verify FortiManager URL is correct (include `https://`)
- Check username/password are correct
- Ensure API user has proper permissions
- Verify FortiManager is accessible from your network

**Problem:** "No firewalls found"

**Solutions:**
- Check if FortiManager has any managed devices
- Verify devices are authorized/promoted (not in "unreg" status)
- Ensure os_type is "fos" (FortiOS)
- Check API user has read permissions to `/dvmdb/device`

**Problem:** "Could not fetch interfaces for <device>"

**Solutions:**
- This is non-fatal - discovery continues without interface data
- Verify proxy permissions enabled on FortiManager
- Check if device is online and accessible
- Firewalls will be created without IP scope data

### CI Creation Issues

**Problem:** "Company not found"

**Solutions:**
- Verify company name matches exactly in ServiceNow
- Use `--company` flag with exact name
- Check ServiceNow credentials have read access to `core_company`

**Problem:** "Failed to create: Permission denied"

**Solutions:**
- Ensure ServiceNow user has write access to `cmdb_ci_ip_firewall`
- Check if user has CMDB admin role
- Verify network connectivity to ServiceNow

### Linking Issues

**Problem:** "Service offering not found: Network Management"

**Solutions:**
- Create Network Management service offering first
- Or specify correct service name with `--service` flag
- Verify service offering table has correct name

---

## Reusability for Other Customers

This integration is fully reusable for any customer with FortiManager.

### Quick Setup for New Customer

1. **Add credentials to `.env.local`:**
   ```bash
   FORTIMANAGER_URL=https://customer-fmg-ip
   FORTIMANAGER_USERNAME=api-user
   FORTIMANAGER_PASSWORD=api-password
   ```

2. **Create customer config (optional):**
   ```bash
   cp config/fortimanager/allcare-config.json \
      config/fortimanager/newcustomer-config.json
   # Edit with customer details
   ```

3. **Run discovery:**
   ```bash
   npx tsx scripts/discover-fortimanager-firewalls.ts --customer newcustomer
   ```

4. **Create CIs:**
   ```bash
   npx tsx scripts/create-fortimanager-firewall-cis.ts \
     backup/fortimanager-discovery/newcustomer-firewalls.json \
     --company "New Customer Inc."
   ```

5. **Link to services:**
   ```bash
   npx tsx scripts/link-fortimanager-firewalls-to-services.ts \
     "New Customer Inc."
   ```

---

## Advanced Usage

### Custom Service Offering

Link firewalls to different service:
```bash
npx tsx scripts/link-fortimanager-firewalls-to-services.ts \
  "Allcare Medical Management, Inc." \
  --service "Cybersecurity Management"
```

### Custom Output Name

Override default output filename:
```bash
npx tsx scripts/discover-fortimanager-firewalls.ts \
  --customer allcare \
  --output allcare-fw-2025-01
```

### Re-discovery

Safe to run discovery multiple times:
- Discovery always queries fresh data from FortiManager
- CI creation skips existing firewalls (by serial number)
- Service linking skips existing relationships

---

## Security Considerations

1. **Credentials:** Stored in `.env.local` (gitignored)
2. **HTTPS:** All FortiManager communication uses HTTPS
3. **Session Management:** Sessions auto-expire and logout on completion
4. **Read-Only Operations:** Discovery only reads data, never modifies FortiManager
5. **ServiceNow Permissions:** Uses existing ServiceNow auth configured in `.env.local`

---

## Success Metrics

✅ **Allcare Medical Management:**
- FortiManager integration module complete
- Discovery script functional
- CI creation script functional
- Service linking script functional
- Documentation complete

**Ready for:**
- Testing with Allcare credentials
- Verification in ServiceNow
- Deployment to other customers with FortiManager

---

## Next Steps

1. **Test with Allcare:**
   ```bash
   npx tsx scripts/discover-fortimanager-firewalls.ts --customer allcare
   ```

2. **Verify discovery output:**
   - Open `backup/fortimanager-discovery/allcare-firewalls.csv`
   - Confirm firewall count and details

3. **Create CIs in ServiceNow:**
   ```bash
   npx tsx scripts/create-fortimanager-firewall-cis.ts \
     backup/fortimanager-discovery/allcare-firewalls.json \
     --company "Allcare Medical Management, Inc."
   ```

4. **Link to services:**
   ```bash
   npx tsx scripts/link-fortimanager-firewalls-to-services.ts \
     "Allcare Medical Management, Inc."
   ```

5. **Verify in ServiceNow CMDB**

---

## Support

For issues or questions:
- Check troubleshooting section above
- Review FortiManager API logs
- Check ServiceNow API responses
- Verify credentials and permissions
