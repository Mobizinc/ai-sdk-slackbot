# Multi-Client Deployment Guide
## ServiceNow CMDB Application Services Setup

---

## Overview

This guide explains how to use our ServiceNow setup scripts to deploy complete CMDB structures for multiple clients. The scripts are reusable and follow a consistent pattern.

### What the Scripts Create

**For Each Client:**
1. Service Portfolio (shared MSP structure):
   - 1 Business Service: "Managed Support Services"
   - 6 Service Offerings (Infrastructure, Network, Cybersecurity, etc.)
   - 6 CI Relationships

2. Client-Specific Application Services:
   - 24+ Application Services (customized per client)
   - All linked to appropriate Service Offerings
   - All CI Relationships automatically created

3. (Optional) Infrastructure CI Linking:
   - Firewalls, routers, or other infrastructure CIs
   - Linked to appropriate Service Offerings
   - Establishes service-infrastructure dependencies

---

## Script Architecture

### Core Scripts

1. **`scripts/setup-service-portfolio.ts`**
   - Creates MSP Business Service and Service Offerings
   - **Reusable as-is** for all clients (shared MSP structure)
   - Run ONCE per ServiceNow instance

2. **`scripts/setup-altus-application-services.ts`**
   - Creates client-specific Application Services
   - **Must be customized** for each client
   - Run ONCE per client

3. **`scripts/link-firewalls-to-network-service.ts`** (Optional)
   - Links infrastructure CIs (firewalls) to Service Offerings
   - **Reusable as-is** for most clients
   - Run ONCE per client with firewalls in CMDB

---

## Deployment Checklist for New Client

### Prerequisites
- [ ] Client account exists in ServiceNow (`customer_account` table)
- [ ] Client company record exists in ServiceNow (`core_company` table)
- [ ] Client account number obtained (e.g., ACCT0010145)
- [ ] List of client's services compiled (applications, infrastructure, etc.)
- [ ] ServiceNow credentials configured in `.env.local`

### Deployment Steps

#### Step 1: Service Portfolio (One Time Only)
If not already done, run the portfolio setup:
```bash
# Configure PROD or DEV environment in .env.local
npx tsx scripts/setup-service-portfolio.ts
```

**Expected Output:**
- 1 Business Service created
- 6 Service Offerings created
- 6 CI Relationships created

#### Step 2: Client Application Services
1. Copy the Altus script as a template:
   ```bash
   cp scripts/setup-altus-application-services.ts scripts/setup-[clientname]-application-services.ts
   ```

2. Customize the new script (see Customization Guide below)

3. Set environment variables:
   ```bash
   # In .env.local
   CUSTOMER_ACCOUNT_NUMBER=ACCT0010XXX  # Client's account number
   ```

4. Run the setup:
   ```bash
   npx tsx scripts/setup-[clientname]-application-services.ts
   ```

#### Step 3: Link Infrastructure CIs (Optional)
If the client has firewalls or other infrastructure CIs in CMDB:
```bash
# Link firewalls to Network Management Service Offering
npx tsx scripts/link-firewalls-to-network-service.ts
```

**Expected Output:**
- All client firewalls linked to Network Management Service Offering
- CI Relationships created for each firewall
- Service-infrastructure dependencies established

**When to Use:**
- Client has firewalls in `cmdb_ci_netgear` table
- Firewalls follow naming pattern (e.g., "ClientName - Location")
- Need to establish service dependencies for incident routing

#### Step 4: Verification
```bash
# Verify all services created correctly
npx tsx scripts/verify-all-ci-relationships.ts
```

Check in ServiceNow UI:
- Navigate to Business Service → View CI Relationships
- Verify all Application Services appear under correct Service Offerings
- Check Network Management Service Offering for linked firewalls

---

## Customization Guide

### What to Customize in Application Services Script

When creating a script for a new client, modify these sections:

#### 1. Header Comments (Lines 1-50)
```typescript
/**
 * STEP 2: ServiceNow Application Services Setup Script (ADMIN-ONLY)
 * Creates XX Application Services for [CLIENT NAME]  ← UPDATE
 * ...
 * ENVIRONMENT VARIABLES:
 * - CUSTOMER_ACCOUNT_NUMBER: Account number (default: ACCTXXXXXX)  ← UPDATE
 * ...
 * Application Services Structure:  ← UPDATE LIST
 * - Parent: Service Offering "Application Administration" (X services)
 *   1. [Client Name] - Service A
 *   2. [Client Name] - Service B
 */
```

#### 2. Service Definitions Array (Lines 66-216)
This is the **core customization area**. Replace all 24 Altus services with your client's services.

**Service Definition Structure:**
```typescript
{
  name: '[Client Name] - [Service Name]',           // ← Client-specific
  parentOffering: '[Service Offering Name]',         // ← Keep these
  description: '[Type] - [Description]',             // ← Customize
  serviceType: 'Dedicated Instance' | 'Managed SaaS' // ← Choose one
}
```

**Service Offering Options** (keep these names exactly):
- `'Application Administration'` - For business applications (EMR, SaaS apps, etc.)
- `'Infrastructure and Cloud Management'` - For cloud, servers, file shares, AD
- `'Network Management'` - For networking services (UCaaS, SD-WAN, etc.)
- `'Cybersecurity Management'` - For security services
- `'Helpdesk and Endpoint Support - 24/7'` - For 24/7 support services
- `'Helpdesk and Endpoint - Standard'` - For business hours support

**Service Type Guidelines:**
- `'Dedicated Instance'` - Hosted infrastructure, on-prem apps, dedicated environments
- `'Managed SaaS'` - Third-party SaaS applications managed on behalf of client

#### 3. Function Name (Line 218)
```typescript
async function setup[ClientName]ApplicationServices() {  // ← Update
  console.log('🏗️  STEP 2: [Client Name] Application Services Setup');  // ← Update
```

#### 4. Customer Account Number Default (Line 227)
```typescript
const customerAccountNumber = process.env.CUSTOMER_ACCOUNT_NUMBER || 'ACCT0010XXX';  // ← Update default
```

#### 5. Summary Output (Lines 485-490)
```typescript
console.log('   By Service Offering:');
console.log('     - Application Administration: XX services');      // ← Update counts
console.log('     - Infrastructure and Cloud Management: X services');
console.log('     - Network Management: X service');
console.log('');
console.log('✅ [Client Name] Application Services setup complete!');  // ← Update
```

### What NOT to Change

❌ **Do NOT modify:**
- The overall script structure and flow
- Phase 0, 1, 2 logic
- CI Relationship creation code (lines 374-411, 450-471)
- The vendor sys_id (`'2d6a47c7870011100fadcbb6dabb35fb'`) - This is Mobiz IT
- API endpoints and HTTP methods
- Error handling logic

---

## Example: Converting for "Acme Corporation"

### Original (Altus)
```typescript
const applicationServices: ApplicationServiceDefinition[] = [
  {
    name: 'Altus Health - NextGen Production',
    parentOffering: 'Application Administration',
    description: 'Dedicated Instance - EMR stack for Altus Health',
    serviceType: 'Dedicated Instance',
  },
  {
    name: 'Altus Health - O365 Production',
    parentOffering: 'Infrastructure and Cloud Management',
    description: 'Dedicated Instance - Microsoft 365 tenant for Altus Health',
    serviceType: 'Dedicated Instance',
  },
  // ... 22 more services
];
```

### New Client (Acme)
```typescript
const applicationServices: ApplicationServiceDefinition[] = [
  {
    name: 'Acme Corporation - Salesforce CRM',
    parentOffering: 'Application Administration',
    description: 'Managed SaaS - Salesforce Sales Cloud instance',
    serviceType: 'Managed SaaS',
  },
  {
    name: 'Acme Corporation - Microsoft 365',
    parentOffering: 'Infrastructure and Cloud Management',
    description: 'Dedicated Instance - Microsoft 365 tenant for Acme',
    serviceType: 'Dedicated Instance',
  },
  {
    name: 'Acme Corporation - AWS Production Environment',
    parentOffering: 'Infrastructure and Cloud Management',
    description: 'Dedicated Instance - AWS account with EC2, RDS, S3',
    serviceType: 'Dedicated Instance',
  },
  {
    name: 'Acme Corporation - Cisco Meraki SD-WAN',
    parentOffering: 'Network Management',
    description: 'Managed SaaS - Cisco Meraki SD-WAN infrastructure',
    serviceType: 'Managed SaaS',
  },
  // ... add all Acme services
];
```

### File Naming
```bash
# Save as:
scripts/setup-acme-application-services.ts
```

### Environment Variables
```bash
# .env.local
CUSTOMER_ACCOUNT_NUMBER=ACCT0020456  # Acme's account number
```

---

## Service Discovery Process

### How to Determine Client's Services

When onboarding a new client, gather information about:

#### 1. Application Administration Services
- EMR/EHR systems (e.g., Epic, Cerner, NextGen)
- Medical imaging systems (PACS)
- Business applications (CRM, ERP, HR systems)
- SaaS subscriptions managed by MSP (QuickBooks, DocuSign, etc.)

#### 2. Infrastructure and Cloud Management Services
- Cloud platforms (Azure, AWS, GCP)
- Microsoft 365 / Office 365 tenants
- File server infrastructure
- Active Directory / Azure AD
- Endpoint management platforms (Intune, JAMF)
- Backup/DR solutions

#### 3. Network Management Services
- UCaaS/VoIP systems (Vonage, RingCentral, 8x8)
- SD-WAN solutions
- Network monitoring services

#### 4. Cybersecurity Management Services
- SIEM/SOC services
- EDR/XDR platforms
- Firewall management services
- Identity management solutions

#### 5. Helpdesk and Endpoint Support Services
- Desktop support services (24/7 vs business hours)
- Break-fix services
- Printer/peripheral support

### Naming Convention

**Format:** `[Client Name] - [Service Name]`

**Examples:**
- Good: `"Altus Health - NextGen Production"`
- Good: `"Acme Corp - AWS Production Environment"`
- Bad: `"NextGen"` (missing client name)
- Bad: `"Altus-NextGen-Prod"` (inconsistent format)

---

## Linking Infrastructure CIs to Services

### Overview

After creating Application Services, you may need to link infrastructure CIs (firewalls, routers, load balancers) to Service Offerings. This establishes proper service dependencies in the CMDB.

**Important:** Not all clients have infrastructure CIs in ServiceNow CMDB. Use the discovery tools first to verify what infrastructure exists before creating linking scripts.

### Why Link Infrastructure CIs?

**Benefits:**
- **Incident Routing**: ServiceNow can automatically route incidents based on service dependencies
- **Impact Analysis**: Understand which services are affected when infrastructure fails
- **Dependency Mapping**: Visualize complete service delivery chain in CI Relationship Viewer
- **CMDB Completeness**: Follow ITIL best practices for CMDB structure

### Firewall Linking Example (Altus Health)

**Scenario:** Altus Health has 29 firewalls deployed across their locations in the CMDB (`cmdb_ci_netgear` table).

**Problem:** Firewalls exist as standalone CIs with no service associations.

**Solution:** Link all firewalls to "Network Management" Service Offering.

**Implementation:**
```bash
npx tsx scripts/link-firewalls-to-network-service.ts
```

**Result:**
- 29 CI Relationships created: Network Management (parent) → Firewalls (children)
- Relationship type: "Contains::Contained by"
- Firewalls now visible under Network Management in CI Relationship Viewer
- Incidents on firewalls can be routed to Network Management team

### When to Link Infrastructure CIs

**Link to Service Offerings when:**
- Infrastructure is shared across multiple applications
- Infrastructure provides a specific type of service (network, security, etc.)
- Infrastructure is managed by a dedicated team

**Examples:**
- Firewalls → Network Management Service Offering
- Load Balancers → Network Management Service Offering
- Backup Systems → Infrastructure and Cloud Management Service Offering
- Security Appliances → Cybersecurity Management Service Offering

**Link to Application Services when:**
- Infrastructure is dedicated to a specific application
- Infrastructure is part of application-specific architecture
- Infrastructure lifecycle tied to application

**Examples:**
- Application-specific database server → Specific Application Service
- Dedicated API gateway → Specific Application Service
- Application load balancer → Specific Application Service

### Script Customization for Other Infrastructure

The `link-firewalls-to-network-service.ts` script can be adapted for other infrastructure CIs:

**Customization Points:**
1. **CMDB Table**: Change `cmdb_ci_netgear` to appropriate table
   - `cmdb_ci_lb` for load balancers
   - `cmdb_ci_ip_router` for routers
   - `cmdb_ci_ip_switch` for switches

2. **Service Offering**: Change "Network Management" to target Service Offering
   - "Infrastructure and Cloud Management" for servers/storage
   - "Cybersecurity Management" for security appliances

3. **Query Filter**: Adjust `nameLIKE` filter for client naming pattern

**Example: Link Acme Load Balancers**
```typescript
// Change line 117:
const firewallQueryUrl = `${instanceUrl}/api/now/table/cmdb_ci_lb?sysparm_query=${encodeURIComponent('nameLIKEAcme')}&...`;

// Change line 77:
const serviceOfferingName = 'Network Management';
```

### Discovery Tools

Before linking any infrastructure, use discovery tools to verify what exists:

**1. Discover Company Structure:**
```bash
npx tsx scripts/discover-company-structure.ts "ClientName"
```
- Identifies all related companies
- Finds customer accounts
- Shows parent-child relationships
- Exports to JSON for next step

**2. Extract Server Inventory:**
```bash
npx tsx scripts/extract-company-server-inventory.ts backup/company-analysis/client-company-structure.json
```
- Queries all server CMDB tables
- Exports comprehensive CSV
- Shows company associations
- Identifies servers ready for linking

**3. Sample All Servers (Diagnostic):**
```bash
npx tsx scripts/discover-all-servers-sample.ts
```
- Samples 500+ servers across all clients
- Analyzes naming patterns
- Identifies orphaned servers
- Useful for CMDB data quality analysis

**4. Search by Name Pattern:**
```bash
npx tsx scripts/search-servers-by-pattern.ts "Pattern"
```
- Quick diagnostic search
- Finds servers matching pattern
- Shows company associations
- Verifies server existence

**When Discovery Shows Zero Infrastructure:**
- Client may be cloud-only (Azure, AWS)
- Infrastructure managed outside ServiceNow
- Servers exist but not in traditional CMDB tables
- Document findings and close discovery

**Example: Altus Health**
- Discovery found: 29 firewalls, 0 servers
- Action: Linked firewalls only
- Result: Complete (cloud-only client)

---

## Environment Variables Reference

### Required Variables
```bash
# ServiceNow Instance
SERVICENOW_URL=https://yourinstance.service-now.com
SERVICENOW_USERNAME=your.api.username
SERVICENOW_PASSWORD=your_api_password

# Client-Specific
CUSTOMER_ACCOUNT_NUMBER=ACCT0010145
```

### Optional Variables (for DEV testing)
```bash
# Use DEV_ prefix to test in non-production
DEV_SERVICENOW_URL=https://yourinstance-dev.service-now.com
DEV_SERVICENOW_USERNAME=dev.api.username
DEV_SERVICENOW_PASSWORD=dev_api_password
```

### Environment Detection Logic
The scripts automatically detect which environment to use:
- If `SERVICENOW_URL` is set → **PRODUCTION**
- If only `DEV_SERVICENOW_URL` is set → **DEV**

---

## Verification and Testing

### Pre-Deployment Verification

1. **Verify Customer Account Exists:**
   ```typescript
   // In ServiceNow, navigate to:
   // Customer Service Management → Accounts → [Search for client]
   // Note the Account Number (e.g., ACCT0010145)
   ```

2. **Verify Service Offerings Exist:**
   ```bash
   # Run in DEV first:
   npx tsx scripts/setup-service-portfolio.ts
   ```

### Post-Deployment Verification

1. **Check Service Counts:**
   ```bash
   npx tsx scripts/verify-all-ci-relationships.ts
   ```

2. **Verify in ServiceNow UI:**
   - Navigate to: **Configuration → Servers → All Servers → (change to) Services → Business Services**
   - Open: "Managed Support Services"
   - Check: "Related Services" tab
   - Verify: All 6 Service Offerings appear
   - Click into each Service Offering
   - Verify: All Application Services appear under correct offering

3. **Check CI Relationships:**
   - Open any CI (Business Service, Service Offering, or Application Service)
   - Click: "CI Relationship" tab or "View Map"
   - Verify: Parent-child relationships visible in graph

---

## Troubleshooting

### Common Issues

#### Issue: "Customer Account not found"
**Cause:** CUSTOMER_ACCOUNT_NUMBER doesn't exist in ServiceNow

**Solution:**
1. Verify account number in ServiceNow: Customer Service Management → Accounts
2. Ensure exact match (including ACCT prefix)
3. Update `.env.local` with correct number

#### Issue: "Service Offering not found"
**Cause:** setup-service-portfolio.ts not run yet

**Solution:**
```bash
npx tsx scripts/setup-service-portfolio.ts
```

#### Issue: "Operation Failed: Check Uniqueness for SN App Service ID"
**Cause:** Missing vendor field (should not happen with updated scripts)

**Solution:** Verify vendor field is included in payload (line 426):
```typescript
vendor: '2d6a47c7870011100fadcbb6dabb35fb', // Mobiz IT
```

#### Issue: Duplicate Services Created
**Cause:** Script run multiple times with different names

**Solution:**
- Scripts are idempotent - they check for existing records by name
- If service name changed between runs, it will create a duplicate
- Manually delete incorrect services in ServiceNow before re-running

#### Issue: No CI Relationships Visible
**Cause:** Missing CI relationship creation (should not happen with updated scripts)

**Solution:** Check Phase 3 output in setup-service-portfolio.ts or inline CI creation in application services script

---

## Best Practices

### Naming Conventions
✅ **Do:**
- Use consistent client name prefix
- Use descriptive service names
- Follow pattern: `[Client] - [Service]`

❌ **Don't:**
- Use abbreviations only (hard to understand)
- Mix naming formats within same client
- Use special characters (except hyphens and spaces)

### Service Organization
✅ **Do:**
- Group related services under correct Service Offering
- Use "Dedicated Instance" for hosted/managed infrastructure
- Use "Managed SaaS" for third-party applications

❌ **Don't:**
- Put all services under one Service Offering
- Mix application and infrastructure services randomly
- Create services for every individual server/device (use Application Services for service-level, not device-level)

### Testing
✅ **Do:**
- Always test in DEV first
- Verify customer account exists before running
- Check Service Offering names match exactly

❌ **Don't:**
- Run directly in PROD without DEV testing
- Assume service offering names (they're case-sensitive)
- Skip verification steps

---

## Appendix: Script Flow Diagram

```
┌─────────────────────────────────────────┐
│ Step 1: setup-service-portfolio.ts      │
│ (Run ONCE per ServiceNow instance)      │
└──────────────┬──────────────────────────┘
               │
               ├─► Phase 1: Create Business Service
               │   "Managed Support Services"
               │
               ├─► Phase 2: Create 6 Service Offerings
               │   - Application Administration
               │   - Infrastructure and Cloud Management
               │   - Network Management
               │   - Cybersecurity Management
               │   - Helpdesk and Endpoint Support - 24/7
               │   - Helpdesk and Endpoint - Standard
               │
               └─► Phase 3: Create 6 CI Relationships
                   (Business Service → Service Offerings)

┌─────────────────────────────────────────┐
│ Step 2: setup-[client]-applications.ts  │
│ (Run ONCE per client)                   │
└──────────────┬──────────────────────────┘
               │
               ├─► Phase 0: Lookup Customer Account
               │   (Verify client exists in ServiceNow)
               │
               ├─► Phase 1: Lookup Service Offerings
               │   (Get sys_ids for parent linkage)
               │
               └─► Phase 2: Create Application Services
                   For each service:
                   1. Check if exists
                   2. Create if missing
                   3. Create CI Relationship
                   4. Link to parent Service Offering
                   5. Link to Customer Account
                   6. Set vendor to Mobiz IT

┌─────────────────────────────────────────┐
│ Step 3: link-firewalls-to-network-      │
│         service.ts (OPTIONAL)           │
│ (Run per client with infrastructure)   │
└──────────────┬──────────────────────────┘
               │
               ├─► Phase 1: Lookup Service Offering
               │   (e.g., Network Management)
               │
               ├─► Phase 2: Query Infrastructure CIs
               │   (e.g., Firewalls from cmdb_ci_netgear)
               │
               └─► Phase 3: Create CI Relationships
                   For each infrastructure CI:
                   1. Check if relationship exists
                   2. Create if missing
                   3. Link to Service Offering

┌─────────────────────────────────────────┐
│ Result: Complete CMDB Structure         │
└─────────────────────────────────────────┘

Business Service (1)
└─ Service Offerings (6)
   ├─ Application Administration
   │  └─ Application Services (X per client)
   ├─ Infrastructure and Cloud Management
   │  └─ Application Services (X per client)
   ├─ Network Management
   │  ├─ Application Services (X per client)
   │  └─ Infrastructure CIs (firewalls, etc.)
   ├─ Cybersecurity Management
   ├─ Helpdesk and Endpoint Support - 24/7
   └─ Helpdesk and Endpoint - Standard
```

---

## Quick Reference: File Locations

```
scripts/
├── setup-service-portfolio.ts                      ← Shared MSP structure (reuse as-is)
├── setup-altus-application-services.ts             ← Altus example (copy as template)
├── setup-[newclient]-application-services.ts       ← Your new client script
├── link-firewalls-to-network-service.ts            ← Link infrastructure CIs to services
├── discover-company-structure.ts                   ← Multi-company discovery tool
├── extract-company-server-inventory.ts             ← Server inventory extraction
├── discover-all-servers-sample.ts                  ← CMDB-wide server analysis
├── search-servers-by-pattern.ts                    ← Diagnostic search tool
├── verify-all-ci-relationships.ts                  ← Verification script
└── test-altus-application-services.ts              ← Optional: Create test script

docs/
├── Multi_Client_Deployment_Guide.md                ← This document
├── Altus_Infrastructure_Linking_Summary.md         ← Infrastructure linking record
├── PROD_Service_Deployment_Summary.md              ← Altus deployment record
└── Setup_Scripts_CI_Relationship_Update.md         ← Technical details

backup/
├── company-analysis/
│   └── {client}-company-structure.json             ← Discovery outputs
└── server-analysis/
    └── {client}-server-inventory.csv               ← Server inventory exports
```

---

## Support and Questions

For questions or issues:
1. Check Troubleshooting section above
2. Review Altus script as working reference
3. Verify ServiceNow CMDB structure in UI
4. Check script output logs for specific errors

---

**Document Version:** 1.2
**Last Updated:** 2025-10-15
**Tested With:** Altus Health deployment (24 Application Services + 29 firewalls linked, PROD)
**New:** Discovery tools for company structure and server inventory analysis
