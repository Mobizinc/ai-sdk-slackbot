# Azure Configuration Files

This directory contains Azure tenant and subscription configuration for creating CIs in ServiceNow CMDB.

## File Structure

- `altus-azure-structure.json` - Altus and related entities (Neighbors, Austin, Exceptional)
- `client-name-azure-structure.json` - Template for other clients
- `README.md` - This file

## Configuration Schema

```json
{
  "client_name": "Client Display Name",
  "company_sys_id": "ServiceNow company record sys_id",
  "description": "Brief description",
  "tenants": [
    {
      "tenant_name": "Azure AD Tenant Name",
      "tenant_id": "Azure AD Tenant ID (GUID)",
      "tenant_domain": "tenant.onmicrosoft.com",
      "company_name": "ServiceNow Company Name",
      "subscriptions": [
        {
          "subscription_name": "Subscription Display Name",
          "subscription_id": "Azure Subscription ID (GUID)",
          "subscription_type": "Production|Development|Test",
          "environment": "Production|Development|Test|Staging",
          "link_to_application_service": "Application Service Name (optional)",
          "description": "Subscription purpose"
        }
      ]
    }
  ],
  "notes": []
}
```

## ServiceNow Azure CMDB Model

ServiceNow **does NOT have** the following tables:
- ❌ `cmdb_ci_azure_tenant` (no tenant table)
- ❌ `cmdb_ci_azure_management_group` (no management group table)

ServiceNow flattens the Azure hierarchy:

**Real Azure Hierarchy:**
```
Tenant (Azure AD)
└── Management Group (optional)
    └── Subscription
        └── Resource Group
            └── Resources (VMs, storage, etc.)
```

**ServiceNow CMDB Hierarchy:**
```
cmdb_ci_azure_subscription (top-level)
└── cmdb_ci_resource_group
    └── cmdb_ci_cloud_host (VMs)
```

## How Tenant Information is Stored

Since ServiceNow has no tenant table, tenant metadata is embedded in subscription CI records:

| Azure Concept | ServiceNow Field | Purpose |
|---------------|------------------|---------|
| Tenant ID | `object_id` | Stores Azure AD Tenant GUID |
| Tenant Domain | `short_description` | Includes tenant domain for reference |
| Subscription ID | `correlation_id` | Stores Azure Subscription GUID |
| Subscription Name | `name` | Display name in ServiceNow |

## Before Creating CIs

### 1. Get Altus Company sys_id

Run:
```bash
npx tsx scripts/discover-company-structure.ts "Altus"
```

Update `company_sys_id` in config file.

### 2. Get Azure Subscription IDs

**Option A: Azure CLI (if you have access)**
```bash
# Login
az login

# List subscriptions per tenant
az account list --all --output table

# Or per tenant explicitly
az account list --tenant 64c9180e-db30-45b8-af76-82f8930da669 --output table
```

**Option B: Azure Portal**
- Navigate to Subscriptions
- Copy subscription ID for each subscription
- Update PLACEHOLDER_SUBSCRIPTION_ID values in config

**Option C: Ask Altus IT Team**
- Request list of active Azure subscriptions per tenant
- Include: Subscription Name, Subscription ID, Purpose/Environment

### 3. Verify Application Services Exist

Check if these Application Services exist in ServiceNow:
- "Altus Health - Azure Environment" (or similar)
- Or adjust `link_to_application_service` values in config

Run:
```bash
npx tsx scripts/verify-application-services.ts
```

## Using the Configuration

### Create Subscription CIs

```bash
npx tsx scripts/create-azure-subscription-cis.ts config/azure/altus-azure-structure.json
```

### Link to Services

```bash
npx tsx scripts/link-azure-subscriptions-to-services.ts config/azure/altus-azure-structure.json
```

### Verify

```bash
npx tsx scripts/verify-azure-ci-structure.ts config/azure/altus-azure-structure.json
```

## Template for Other Clients

Copy `altus-azure-structure.json` to `client-name-azure-structure.json` and update:
1. Client name
2. Company sys_id (from ServiceNow)
3. Tenant details (from Azure AD)
4. Subscription details (from Azure)
5. Application Service mappings (from ServiceNow)

## Notes

- Configuration is idempotent - safe to run multiple times
- Scripts check for existing CIs before creating
- Tenant metadata embedded in subscription records
- No custom tables required
- Works with standard ServiceNow CMDB schema
