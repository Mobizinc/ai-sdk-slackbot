# CMDB Scripts

This directory contains scripts for:
1. **Azure Tenant Onboarding** - Automated discovery and CI creation for Azure infrastructure
2. **CMDB Pilot** - Manual discovery and documentation for Altus infrastructure

## Quick Start

To run Phase 1 of the pilot (manual discovery):

```bash
./scripts/cmdb-pilot-phase1.sh
```

This interactive script will guide you through:
1. Discovering infrastructure from Slack
2. Creating CI records manually
3. Validating CI records
4. Next steps for ServiceNow upload and testing

---

## Azure Tenant Onboarding

Complete guide: `docs/AZURE_TENANT_ONBOARDING.md`

### Quick Start: Onboard a New Tenant

```bash
# 1. Ensure you're logged into Azure CLI
az login

# 2. Discover subscriptions
npx tsx scripts/discover-azure-subscriptions-cli.ts --tenant exceptional

# 3. Discover VMs and resource groups
npx tsx scripts/discover-azure-vms-cli.ts --tenant exceptional

# 4. Review discovery
open backup/azure-discovery/exceptional-emergency-center-vms.csv

# 5. Create ServiceNow CIs
npx tsx scripts/create-azure-subscription-cis.ts config/azure/altus-azure-structure.json
npx tsx scripts/create-azure-resource-group-cis.ts backup/azure-discovery/exceptional-emergency-center-resource-groups.json
npx tsx scripts/create-azure-vm-cis.ts backup/azure-discovery/exceptional-emergency-center-vms.json

# 6. Link to services
npx tsx scripts/link-azure-subscriptions-to-services.ts

# 7. Verify complete structure
npx tsx scripts/verify-azure-ci-structure.ts config/azure/altus-azure-structure.json
```

### Azure Scripts

**`discover-azure-subscriptions-cli.ts`** - Discover Azure subscriptions via Azure CLI

```bash
# Discover for Exceptional tenant
npx tsx scripts/discover-azure-subscriptions-cli.ts --tenant exceptional

# Other tenants: altus, neighbors, austin
npx tsx scripts/discover-azure-subscriptions-cli.ts --tenant altus
```

**What it does:**
- Queries Azure CLI for all subscriptions (`az account list --all`)
- Filters by tenant ID from config file
- Auto-updates `config/azure/altus-azure-structure.json`
- Saves backup to `backup/azure-discovery/<tenant>-subscriptions.json`

---

**`discover-azure-vms-cli.ts`** - Discover VMs, resource groups, and IP addresses

```bash
# Discover for Exceptional tenant
npx tsx scripts/discover-azure-vms-cli.ts --tenant exceptional
```

**What it does:**
- Queries all subscriptions found in Step 1
- Discovers resource groups (`az group list`)
- Discovers VMs (`az vm list`)
- Gets IP addresses (`az vm list-ip-addresses`)
- Gets power state for each VM
- Exports JSON and CSV reports

**Output:**
- `backup/azure-discovery/<tenant>-vms.json` - Complete VM data
- `backup/azure-discovery/<tenant>-vms.csv` - Human-readable report
- `backup/azure-discovery/<tenant>-resource-groups.json` - Resource group data

---

**`create-azure-subscription-cis.ts`** - Create subscription CIs in ServiceNow

```bash
npx tsx scripts/create-azure-subscription-cis.ts config/azure/altus-azure-structure.json
```

**What it does:**
- Creates Azure subscription CIs in ServiceNow PROD
- Stores tenant ID in `object_id` field
- Stores subscription ID in `correlation_id` field
- Skips subscriptions that already exist

---

**`create-azure-resource-group-cis.ts`** - Create resource group CIs with relationships

```bash
npx tsx scripts/create-azure-resource-group-cis.ts backup/azure-discovery/exceptional-emergency-center-resource-groups.json
```

**What it does:**
- Creates resource group CIs
- Finds parent subscription by `correlation_id`
- Creates "Contains" relationship: Subscription → Resource Group
- Skips existing resource groups

---

**`create-azure-vm-cis.ts`** - Create VM CIs with IP addresses and relationships

```bash
npx tsx scripts/create-azure-vm-cis.ts backup/azure-discovery/exceptional-emergency-center-vms.json
```

**What it does:**
- Creates VM CIs with IP addresses
- Populates `ip_address` field with primary private IP
- Includes all IPs (private and public) in `short_description`
- Finds parent resource group by name
- Creates "Contains" relationship: Resource Group → VM
- Skips existing VMs

---

**`link-azure-subscriptions-to-services.ts`** - Link subscriptions to Altus services

```bash
npx tsx scripts/link-azure-subscriptions-to-services.ts
```

**What it does:**
- Finds all Azure subscription CIs
- Links to Service Offering: "Infrastructure and Cloud Management"
- Links to Application Service: "Altus Health - Azure Environment"
- Skips existing relationships

---

**`verify-azure-ci-structure.ts`** - Verify complete CI structure

```bash
npx tsx scripts/verify-azure-ci-structure.ts config/azure/altus-azure-structure.json
```

**What it validates:**
- ✅ All subscriptions exist in ServiceNow
- ✅ Tenant IDs stored correctly in `object_id`
- ✅ Subscription IDs stored correctly in `correlation_id`
- ✅ Service Offering relationships exist
- ✅ Application Service relationships exist

---

**`fix-azure-ci-relationships.ts`** - Fix existing CIs without relationships

```bash
npx tsx scripts/fix-azure-ci-relationships.ts \
  backup/azure-discovery/exceptional-emergency-center-resource-groups.json \
  backup/azure-discovery/exceptional-emergency-center-vms.json
```

**What it does:**
- Links existing resource groups to parent subscriptions
- Links existing VMs to parent resource groups
- Skips relationships that already exist
- Use this after updating CI creation scripts

---

**`update-azure-vm-ips.ts`** - Update IP addresses for existing VM CIs

```bash
npx tsx scripts/update-azure-vm-ips.ts backup/azure-discovery/exceptional-emergency-center-vms.json
```

**What it does:**
- Finds existing VM CIs by name
- Updates `ip_address` field with primary private IP
- Updates `short_description` with all IPs
- Skips VMs that already have correct IPs

---

## Individual Scripts

### Infrastructure Discovery

**`discover-infrastructure.ts`** - Scan Slack channels for infrastructure mentions

```bash
# Scan #altus-support for last 90 days
npx tsx scripts/discover-infrastructure.ts --channel altus-support --days 90

# Scan different channel
npx tsx scripts/discover-infrastructure.ts --channel network-team --days 30
```

**What it does:**
- Extracts IP addresses, hostnames, and UNC share paths from Slack messages
- Cross-references against ServiceNow CMDB
- Identifies undocumented infrastructure
- Generates priority list sorted by mention frequency
- Exports JSON report with related cases and context

**Output:**
- Console report showing missing vs documented infrastructure
- JSON file: `infrastructure-discovery-{channel}-{timestamp}.json`

---

### CI Validation

**`validate-ci.ts`** - Validate CI JSON files against template schema

```bash
# Validate single file
npx tsx scripts/validate-ci.ts examples/altus-file-server-example.json

# Validate multiple files
npx tsx scripts/validate-ci.ts ci-records/*.json

# Validate all examples
npx tsx scripts/validate-ci.ts examples/*.json
```

**What it validates:**
- ✅ Required fields (name, type, support_team)
- ✅ Field formats (IP addresses, URLs, enums)
- ✅ Naming conventions (Customer-Function-Location)
- ✅ Data completeness (tags, purpose, documentation)
- ⚠️  Recommendations for AI searchability

**Scoring:**
- 🟢 90-100: Excellent
- 🟡 70-89: Good (minor improvements needed)
- 🔴 0-69: Needs work

**Exit codes:**
- `0` - All files valid
- `1` - One or more files invalid (useful for CI/CD)

---

### CMDB Search Tests

These scripts test ServiceNow CMDB search functionality:

**`test-cmdb-search.ts`** - Search for specific IP address

```bash
npx tsx scripts/test-cmdb-search.ts
```

Searches for 10.252.0.40 to verify CMDB lookup works.

**`test-cmdb-altus.ts`** - Search for Altus-related CIs

```bash
npx tsx scripts/test-cmdb-altus.ts
```

Searches for any CI with "altus" in the name.

**`test-cmdb-cidr.ts`** - Search entire 10.252.0.0/x network range

```bash
npx tsx scripts/test-cmdb-cidr.ts
```

Shows CMDB coverage by subnet for the 10.252.0.0 network.

---

## Workflow Example

### Phase 1: Manual Discovery (Week 1)

```bash
# Step 1: Run the guided pilot script
./scripts/cmdb-pilot-phase1.sh

# OR do it manually:

# 1. Discover infrastructure
npx tsx scripts/discover-infrastructure.ts --channel altus-support --days 60

# 2. Review the JSON report
cat infrastructure-discovery-altus-support-*.json | jq '.missing'

# 3. Create CI records based on findings
# Use templates/cmdb-ci-template.json as starting point
# See examples/altus-file-server-example.json for reference

# 4. Validate your CI records
npx tsx scripts/validate-ci.ts ci-records/altus-*.json

# 5. Fix any validation errors and re-validate
npx tsx scripts/validate-ci.ts ci-records/altus-server-1.json
```

### Phase 2: Refinement (Week 2)

After documenting first 3 CIs and testing with PeterPool:

```bash
# 1. Discover more infrastructure
npx tsx scripts/discover-infrastructure.ts --channel altus-support --days 90

# 2. Document 10-15 more CIs using refined template

# 3. Batch validate
npx tsx scripts/validate-ci.ts ci-records/*.json

# 4. Upload to ServiceNow (manual or scripted)
```

### Phase 3: Semi-Automation (Week 3-4)

Use discovery script to find gaps, then have AI assist with drafting:

```bash
# Find undocumented infrastructure
npx tsx scripts/discover-infrastructure.ts --channel altus-support --days 90

# Use PeterPool to draft CI records based on conversation context
# (Feature to be built in lib/services/cmdb-drafter.ts)
```

---

## File Locations

**Templates:**
- `templates/cmdb-ci-template.json` - JSON schema for CI records

**Examples:**
- `examples/altus-file-server-example.json` - 10.252.0.40 L Drive example

**CI Records:**
- `ci-records/` - Directory for manually created CIs (not in git)

**Documentation:**
- `docs/CMDB_PILOT_ALTUS.md` - Complete 4-phase pilot plan

---

## Environment Variables

Required in `.env.local`:

```bash
# Slack
SLACK_BOT_TOKEN=xoxb-...

# ServiceNow
SERVICENOW_INSTANCE_URL=https://yourinstance.service-now.com
SERVICENOW_USERNAME=admin
SERVICENOW_PASSWORD=your_password
```

---

## Tips

### For AI Searchability

When creating CI records, focus on:

1. **Tags**: Include common terms users say
   - "L drive" not just "file share"
   - "10.252.0.40" not just the hostname
   - User-facing names: "altus.share"

2. **Purpose**: Write for troubleshooting context
   - "Primary file share for Altus HQ users. Hosts departmental folders, user home directories, and shared resources. Commonly accessed as 'L Drive' via mapped network drive."
   - Not: "File server"

3. **Known Issues**: Capture tribal knowledge
   - Include exact error messages users report
   - Link to related ServiceNow cases
   - Provide specific workarounds

### Validation Best Practices

- Run validation frequently while creating CIs
- Aim for 90+ score before submitting
- Pay attention to warnings - they improve searchability
- Use consistent naming: `Customer-Function-Location`

### Discovery Best Practices

- Start with 30-60 days of history
- Focus on channels where infrastructure is discussed
- Export JSON reports for reference
- Cross-check against existing documentation

---

## Troubleshooting

**"Channel not found"**
- Ensure bot is invited to the channel
- Check channel name spelling (no # prefix in script)

**"ServiceNow not configured"**
- Check `.env.local` has correct credentials
- Run test script: `npx tsx scripts/test-cmdb-search.ts`

**"No infrastructure found"**
- Try broader date range (90+ days)
- Check different channels
- Verify messages contain IPs/hostnames/shares

**Validation fails**
- Read error messages carefully
- Check against template structure
- See example file for reference
- Common issues: missing required fields, invalid enum values

---

## Next Steps

After Phase 1 completion:

1. **Upload to ServiceNow** - Decide on import method
2. **Test PeterPool** - Verify AI can find CIs
3. **Refine Template** - Based on what worked/didn't work
4. **Scale Up** - Document 10-15 more CIs
5. **Automate** - Move to Phase 3 (AI-assisted drafting)

See `docs/CMDB_PILOT_ALTUS.md` for complete roadmap.
