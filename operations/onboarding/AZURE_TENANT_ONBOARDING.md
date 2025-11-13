# Azure Tenant Onboarding to ServiceNow CMDB

## Overview

This guide documents the process for onboarding Azure tenants into ServiceNow CMDB, creating the complete infrastructure hierarchy with proper CI relationships.

**Completed Tenants:**
- ✅ Exceptional Emergency Center (4 subscriptions, 20 resource groups, 13 VMs)

**Pending Tenants:**
- ⏳ Altus Community Healthcare (discovery needed)
- ⏳ Neighbors Health (discovery needed)
- ⏳ Austin Emergency Center (discovery needed)

---

## Azure Hierarchy in ServiceNow

ServiceNow has a limited Azure model compared to the actual Azure structure:

| Real Azure Hierarchy | ServiceNow CMDB |
|---------------------|-----------------|
| Tenant | ❌ No table - stored in subscription metadata |
| Management Group | ❌ No table |
| Subscription | ✅ `cmdb_ci_azure_subscription` |
| Resource Group | ✅ `cmdb_ci_resource_group` |
| VM | ✅ `cmdb_ci_cloud_host` |

**Workaround for Tenant Tracking:**
- Tenant ID stored in subscription's `object_id` field
- Subscription ID stored in subscription's `correlation_id` field
- Tenant name/domain in `short_description` field

---

## Prerequisites

### 1. Azure CLI Setup

```bash
# Install Azure CLI (macOS)
brew install azure-cli

# Login to Azure
az login

# Verify access to all tenants
az account list --all --output table
```

### 2. ServiceNow Credentials

Configured in `.env.local`:

```bash
# Production
SERVICENOW_URL=https://mobiz.service-now.com
SERVICENOW_USERNAME=admin
SERVICENOW_PASSWORD=your_password

# Dev (optional)
DEV_SERVICENOW_URL=https://dev123456.service-now.com
DEV_SERVICENOW_USERNAME=admin
DEV_SERVICENOW_PASSWORD=your_password
```

### 3. Altus Service Portfolio

Must exist before onboarding:
- **Business Service**: "Altus Health IT Services" (sys_id: `d3ffd28c931c9a1049d9764efaba1011`)
- **Service Offering**: "Infrastructure and Cloud Management" (sys_id: `f3ff1ecc931c9a1049d9764efaba104e`)
- **Application Service**: "Altus Health - Azure Environment" (sys_id: `573f1ecc931c9a1049d9764efaba1078`)

---

## Complete Onboarding Process

### Step 1: Update Tenant Configuration

Edit `config/azure/altus-azure-structure.json` with actual tenant details:

```json
{
  "tenants": [
    {
      "tenant_name": "Exceptional Emergency Center",
      "tenant_id": "0b166095-cbbb-4a47-b5d2-45df5415ee8a",
      "tenant_domain": "altuscommunityhealthcare.onmicrosoft.com",
      "company_name": "Altus Community Healthcare",
      "company_sys_id": "c3eec28c931c9a1049d9764efaba10f3",
      "subscriptions": [
        // Will be auto-populated by discovery
      ]
    }
  ]
}
```

### Step 2: Discover Subscriptions

```bash
# Discover all subscriptions for a tenant
npx tsx scripts/discover-azure-subscriptions-cli.ts --tenant exceptional

# This will:
# - Query Azure CLI for all subscriptions in tenant
# - Filter by tenant ID
# - Auto-update config/azure/altus-azure-structure.json
# - Save backup to backup/azure-discovery/exceptional-emergency-center-subscriptions.json
```

**Output:**
```
☁️  Discovering Azure Subscriptions
Tenant: Exceptional Emergency Center (0b166095-cbbb-4a47-b5d2-45df5415ee8a)
Found: 4 subscription(s)

Subscriptions:
  • EER AVD Subscription (25b1ca49-56f4-47ca-91d8-8502721988e2)
  • EER Hub Subscription (4bc35b20-9e96-4c19-a480-d47ec54d186d)
  • EER Workloads Subscription (901696f3-6cf0-4415-9c4e-d482ac8795cb)
  • Azure subscription 1 (6c43d09f-e8d4-4d83-85cb-0fd545f4d356)

✅ Updated: config/azure/altus-azure-structure.json
💾 Backup: backup/azure-discovery/exceptional-emergency-center-subscriptions.json
```

### Step 3: Discover VMs and Resource Groups

```bash
# Discover all VMs, resource groups, and IP addresses
npx tsx scripts/discover-azure-vms-cli.ts --tenant exceptional

# This will:
# - Query all subscriptions discovered in Step 2
# - Get all resource groups across subscriptions
# - Get all VMs with power state and IPs
# - Export JSON and CSV reports
```

**Output:**
```
☁️  Discover Azure VMs, Resource Groups, and IPs
Tenant: Exceptional Emergency Center
Subscriptions: 4

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Subscription: EER Hub Subscription

  Discovering resource groups...
    ✅ Found 6 resource group(s)

  Discovering VMs...
    ✅ Found 5 VM(s)

  Discovering IP addresses...
    ✅ IP addresses discovered for 5 VM(s)

    VM: vm-eer-paloalto-firewall-001
      Resource Group: RG-EER-SCUS-PALOALTO-001
      Location: southcentralus
      Size: Standard_F8s_v2
      OS: Linux
      Power State: VM running
      Private IPs: 10.53.0.4, 10.53.0.36, 10.53.0.20, 10.53.0.52
      Public IPs: 4.151.90.158
[... continues for all VMs ...]

📊 Discovery Summary
Total Subscriptions: 4
Total Resource Groups: 20
Total VMs: 13

💾 VM Data (JSON): backup/azure-discovery/exceptional-emergency-center-vms.json
💾 VM Data (CSV): backup/azure-discovery/exceptional-emergency-center-vms.csv
💾 Resource Group Data (JSON): backup/azure-discovery/exceptional-emergency-center-resource-groups.json
💾 VNet Data (JSON): backup/azure-discovery/exceptional-emergency-center-vnets.json
💾 VNet Gateway Data (JSON): backup/azure-discovery/exceptional-emergency-center-vnet-gateways.json
```

**Review Discovery Results:**

Open the CSV file to verify:
```bash
open backup/azure-discovery/exceptional-emergency-center-vms.csv
```

### Step 4: Create ServiceNow CIs

#### 4a. Create Subscription CIs

```bash
npx tsx scripts/create-azure-subscription-cis.ts config/azure/altus-azure-structure.json

# This will:
# - Create subscription CIs in PROD ServiceNow
# - Store tenant ID in object_id field
# - Store subscription ID in correlation_id field
# - Skip subscriptions that already exist
```

**Output:**
```
🔧 Creating Azure Subscription CIs
Tenant: Exceptional Emergency Center

Environment: PRODUCTION
URL: https://mobiz.service-now.com

EER AVD Subscription
  ✅ Created

EER Hub Subscription
  ✅ Created

EER Workloads Subscription
  ✅ Created

Azure subscription 1
  ✅ Created

✅ Created: 4, ⏭️  Existing: 0, ❌ Errors: 0
```

#### 4b. Create Resource Group CIs with Relationships

```bash
npx tsx scripts/create-azure-resource-group-cis.ts backup/azure-discovery/exceptional-emergency-center-resource-groups.json

# This will:
# - Create resource group CIs
# - Find parent subscription by correlation_id
# - Create "Contains" relationship: Subscription → Resource Group
```

**Output:**
```
🔧 Creating Azure Resource Group CIs
Tenant: Exceptional Emergency Center
Resource Groups: 20

rg-eer-scus-sharedservices-001
  📎 Parent subscription: EER AVD Subscription
  ✅ Created
  🔗 Linked to subscription

[... continues for all resource groups ...]

✅ Created: 15, ⏭️  Existing: 5, 🔗 Linked: 20, ❌ Errors: 0
```

#### 4c. Create VM CIs with Relationships

```bash
npx tsx scripts/create-azure-vm-cis.ts backup/azure-discovery/exceptional-emergency-center-vms.json

# This will:
# - Create VM CIs with IP addresses
# - Find parent resource group by name
# - Create "Contains" relationship: Resource Group → VM
```

**Output:**
```
💻 Creating Azure VM CIs
Tenant: Exceptional Emergency Center
VMs: 13

vm-eer-paloalto-firewall-001
  📎 Parent resource group: rg-eer-scus-paloalto-001
  ✅ Created (IP: 10.53.0.4)
  🔗 Linked to resource group

[... continues for all VMs ...]

✅ Created: 13, ⏭️  Existing: 0, 🔗 Linked: 13, ❌ Errors: 0
```

#### 4d. Create Virtual Network CIs

```bash
npx tsx scripts/create-azure-vnet-cis.ts backup/azure-discovery/exceptional-emergency-center-vnets.json

# This will:
# - Create cmdb_ci_network records for every discovered VNet
# - Store address prefixes + metadata
# - Link each VNet to its parent resource group
```

#### 4e. Create VNet Gateway CIs

```bash
npx tsx scripts/create-azure-vnet-gateway-cis.ts backup/azure-discovery/exceptional-emergency-center-vnet-gateways.json

# This will:
# - Create cmdb_ci_ip_router records for each virtual network gateway/VPN gateway
# - Populate public IPs, SKU, and type
# - Link gateways to their VNets (or resource groups when VNets are missing)
```

#### 4f. Create Firewall / NVA CIs

```bash
npx tsx scripts/create-azure-firewall-cis.ts backup/azure-discovery/exceptional-emergency-center-vms.json --match paloalto,firewall

# This will:
# - Identify Palo Alto (or other keyword-matching) NVAs from the VM export
# - Create cmdb_ci_ip_firewall records
# - Link each firewall back to its resource group for service mapping
```

### Step 5: Link Subscriptions to Services

```bash
npx tsx scripts/link-azure-subscriptions-to-services.ts

# This will:
# - Link all subscriptions to Service Offering
# - Link all subscriptions to Application Services
```

**Output:**
```
🔗 Linking Azure Subscriptions to Services
Found: 7 subscription CI(s)

EER AVD Subscription
  Phase 1: Service Offering Link
    ✅ Linked to: Infrastructure and Cloud Management
  Phase 2: Application Service Link
    ✅ Linked to: Altus Health - Azure Environment

[... continues for all subscriptions ...]

📊 Summary
  - Subscriptions processed: 7
  - Service Offering links: 7
  - Application Service links: 7
```

### Step 6: Verify Complete Structure

```bash
npx tsx scripts/verify-azure-ci-structure.ts config/azure/altus-azure-structure.json

# This will:
# - Check all subscriptions exist
# - Verify tenant/subscription IDs stored correctly
# - Verify Service Offering relationships
# - Verify Application Service relationships
```

**Output:**
```
✅ Verifying Azure CI Structure

Tenant: Exceptional Emergency Center

Checking: EER AVD Subscription
  ✅ CI found (sys_id: af3b8fe6c3ac3210ad36b9ff05013198)
     ✅ Tenant ID stored correctly: 0b166095-cbbb-4a47-b5d2-45df5415ee8a
     ✅ Subscription ID stored: 25b1ca49-56f4-47ca-91d8-8502721988e2
     ✅ Linked to Service Offering
     ✅ Linked to Application Service: Altus Health - Azure Environment

[... continues for all subscriptions ...]

📊 Verification Summary
  ✅ Found: 7/7 subscriptions
  ✅ Metadata correct: 7/7
  ✅ Service Offering links: 7/7
  ✅ Application Service links: 7/7

✅ ALL VERIFIED - Azure CI structure is complete!
```

---

## Fixing Existing Infrastructure

If CIs were created before relationship linking was implemented, use the fix script:

```bash
npx tsx scripts/fix-azure-ci-relationships.ts \
  backup/azure-discovery/exceptional-emergency-center-resource-groups.json \
  backup/azure-discovery/exceptional-emergency-center-vms.json

# This will:
# - Link all existing resource groups to their parent subscriptions
# - Link all existing VMs to their parent resource groups
# - Skip relationships that already exist
```

**Output:**
```
🔗 Fixing Azure CI Relationships

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 1: Linking Resource Groups to Subscriptions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Resource Groups: ✅ Linked: 20, ⏭️  Already Linked: 0, ❌ Errors: 0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 2: Linking VMs to Resource Groups
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VMs: ✅ Linked: 13, ⏭️  Already Linked: 0, ❌ Errors: 0

📊 Summary
Total Relationships Created: 33
  - Resource Groups → Subscriptions: 20
  - VMs → Resource Groups: 13

✅ Azure CI hierarchy is now complete!
```

---

## Complete Azure Hierarchy Example

```
Service Offering: Infrastructure and Cloud Management
  │
  ├─ Application Service: Altus Health - Azure Environment
  │
  ├─ EER Hub Subscription
  │   ├─ rg-eer-scus-paloalto-001
  │   │   └─ vm-eer-paloalto-firewall-001
  │   │       • IP: 10.53.0.4, 10.53.0.36, 10.53.0.20, 10.53.0.52
  │   │       • Public: 4.151.90.158
  │   │       • OS: Linux, Size: Standard_F8s_v2
  │   │
  │   ├─ rg-eer-scus-sharedservices-001
  │   │   ├─ EERADSYNC (10.53.1.5)
  │   │   └─ EERSNOWMID (10.53.1.4)
  │   │
  │   └─ rg-eer-scus-sharedservices-002
  │       ├─ EERDC01 (10.53.1.20)
  │       └─ EERDC02 (10.53.1.21)
  │
  ├─ EER Workloads Subscription
  │   └─ rg-eer24-scus-workloads-01
  │       └─ AZMIGAPPv2 (10.53.2.4)
  │
  └─ Azure subscription 1
      ├─ Avdi
      │   ├─ Domain (10.0.0.6)
      │   ├─ EER-OnePACS-GW (10.0.0.25)
      │   ├─ Fileserver-EER (10.0.0.5)
      │   └─ jumpserver-0 (10.0.0.4)
      │
      ├─ rg-eer24-scus-azmig-01
      │   └─ AZMIGAPP01 (10.0.0.8)
      │
      └─ rg-eer24-scus-jmpbx-01
          └─ JMPBX-EER01 (10.0.0.7)
```

---

## Viewing in ServiceNow

1. Navigate to: **CMDB > Configuration > Azure Subscriptions**
2. Open any subscription (e.g., "EER Hub Subscription")
3. Click the **CI Relationships** tab
4. You should see:
   - **Parent**: Service Offering
   - **Related**: Application Service
   - **Children**: Resource Groups
5. Click on a resource group
6. Click **CI Relationships** tab
7. You should see:
   - **Parent**: Subscription
   - **Children**: VMs

---

## Troubleshooting

### Issue: "Subscription CI not found"

**Cause**: Step 4a (create subscriptions) wasn't run or failed

**Fix:**
```bash
# Verify subscriptions exist
npx tsx scripts/verify-azure-ci-structure.ts config/azure/altus-azure-structure.json

# If missing, create them
npx tsx scripts/create-azure-subscription-cis.ts config/azure/altus-azure-structure.json
```

### Issue: "Resource Group CI not found"

**Cause**: Resource group name mismatch (case-sensitive)

**Fix:**
```bash
# Check actual resource group names in Azure
az group list --subscription <subscription-id> --query "[].name" --output table

# Re-run discovery
npx tsx scripts/discover-azure-vms-cli.ts --tenant exceptional
```

### Issue: "IP addresses are blank"

**Cause**: Using old discovery data or VM networking issue

**Fix:**
```bash
# Re-discover with updated script
npx tsx scripts/discover-azure-vms-cli.ts --tenant exceptional

# Update existing VMs
npx tsx scripts/update-azure-vm-ips.ts backup/azure-discovery/exceptional-emergency-center-vms.json
```

### Issue: "Parent subscription not found for ID: xxx"

**Cause**: Subscription ID mismatch or subscription not created yet

**Debug:**
```bash
# Check what's in ServiceNow
curl -u "$SERVICENOW_USERNAME:$SERVICENOW_PASSWORD" \
  "https://mobiz.service-now.com/api/now/table/cmdb_ci_azure_subscription?sysparm_query=correlation_id=<subscription-id>"

# Verify config file has correct subscription ID
cat config/azure/altus-azure-structure.json | jq '.tenants[] | select(.tenant_name=="Exceptional Emergency Center") | .subscriptions'
```

---

## Next Tenants to Onboard

### Altus Community Healthcare
- Tenant ID: `64c9180e-db30-45b8-af76-82f8930da669`
- Domain: `altushealth.onmicrosoft.com`
- Subscriptions: **TBD** (currently placeholder IDs)

```bash
npx tsx scripts/discover-azure-subscriptions-cli.ts --tenant altus
npx tsx scripts/discover-azure-vms-cli.ts --tenant altus
# ... follow same process as Exceptional
```

### Neighbors Health
- Tenant ID: `fa52c9a8-e65a-4d5f-bbb1-4f545fc79443`
- Domain: `neighborshealth.onmicrosoft.com`
- Subscriptions: **TBD**

```bash
npx tsx scripts/discover-azure-subscriptions-cli.ts --tenant neighbors
npx tsx scripts/discover-azure-vms-cli.ts --tenant neighbors
```

### Austin Emergency Center
- Tenant ID: `059c922d-abff-42ec-8f0a-ca78ccdec003`
- Domain: `austinemergencycenter.onmicrosoft.com`
- Subscriptions: **TBD**

```bash
npx tsx scripts/discover-azure-subscriptions-cli.ts --tenant austin
npx tsx scripts/discover-azure-vms-cli.ts --tenant austin
```

---

## CI Relationship Types

| Relationship | Parent | Child | Type |
|--------------|--------|-------|------|
| Service → Subscription | Service Offering | Subscription | Contains::Contained by |
| Service → Subscription | Application Service | Subscription | Depends on::Used by |
| Subscription → Resource Group | Subscription | Resource Group | Contains::Contained by |
| Resource Group → VM | Resource Group | VM | Contains::Contained by |

---

## Files and Locations

### Configuration
- `config/azure/altus-azure-structure.json` - Master tenant configuration

### Discovery Outputs
- `backup/azure-discovery/<tenant>-subscriptions.json` - Subscription discovery
- `backup/azure-discovery/<tenant>-vms.json` - VM discovery (JSON)
- `backup/azure-discovery/<tenant>-vms.csv` - VM discovery (CSV for review)
- `backup/azure-discovery/<tenant>-resource-groups.json` - Resource group discovery

### Scripts
- `scripts/discover-azure-subscriptions-cli.ts` - Discover subscriptions via Azure CLI
- `scripts/discover-azure-vms-cli.ts` - Discover VMs, resource groups, IPs
- `scripts/create-azure-subscription-cis.ts` - Create subscription CIs
- `scripts/create-azure-resource-group-cis.ts` - Create resource group CIs with relationships
- `scripts/create-azure-vm-cis.ts` - Create VM CIs with relationships
- `scripts/link-azure-subscriptions-to-services.ts` - Link subscriptions to services
- `scripts/verify-azure-ci-structure.ts` - Verify complete structure
- `scripts/fix-azure-ci-relationships.ts` - Fix existing CIs without relationships
- `scripts/update-azure-vm-ips.ts` - Update VM IP addresses

---

## Maintenance

### Adding New VMs

When new VMs are deployed in Azure:

```bash
# Re-discover
npx tsx scripts/discover-azure-vms-cli.ts --tenant exceptional

# Create new VMs (skips existing)
npx tsx scripts/create-azure-vm-cis.ts backup/azure-discovery/exceptional-emergency-center-vms.json
```

### Updating IP Addresses

When IPs change:

```bash
# Re-discover
npx tsx scripts/discover-azure-vms-cli.ts --tenant exceptional

# Update IPs
npx tsx scripts/update-azure-vm-ips.ts backup/azure-discovery/exceptional-emergency-center-vms.json
```

### Adding New Subscriptions

When a new subscription is added:

1. Re-run discovery:
```bash
npx tsx scripts/discover-azure-subscriptions-cli.ts --tenant exceptional
```

2. Create subscription CI:
```bash
npx tsx scripts/create-azure-subscription-cis.ts config/azure/altus-azure-structure.json
```

3. Link to services:
```bash
npx tsx scripts/link-azure-subscriptions-to-services.ts
```

---

## Success Criteria

- ✅ All subscriptions discoverable via Azure CLI
- ✅ All VMs have IP addresses populated
- ✅ Complete CI hierarchy: Service → Subscription → Resource Group → VM
- ✅ All relationships visible in ServiceNow CI Relationships tab
- ✅ Tenant metadata preserved in subscription records
- ✅ Discovery data backed up in JSON/CSV format
- ✅ Scripts are reusable for all tenants
