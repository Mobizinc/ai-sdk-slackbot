# ServiceNow Change Validation - Quick Reference

## Component Type & Component SysId Handling

### What Are These Fields?

**`component_type`** - The kind of ServiceNow configuration item being changed
- Examples: `catalog_item`, `ldap_server`, `mid_server`, `workflow`
- Required in webhook payload
- Determines which validation checks to run

**`component_sys_id`** - The unique identifier of the specific item in ServiceNow
- Examples: `"4c7f6d8e1a2b3c4d5e6f7a8b"` (a sys_id from sc_cat_item table)
- Optional in webhook payload
- Used to fetch the specific item from ServiceNow

### Where They're Handled

| Location | File | What Happens |
|----------|------|--------------|
| **Webhook** | `api/servicenow-change-webhook.ts` | Received and validated from payload |
| **Database** | `lib/db/schema.ts` (lines 1063-1064) | Stored in changeValidations table |
| **Service** | `lib/services/change-validation.ts` | Used for component-specific validation |
| **Fact Collection** | `lib/services/change-validation.ts` (lines 224-321) | Routes to correct API method |
| **ServiceNow Client** | `lib/tools/servicenow.ts` (lines 3614-3707) | Component-specific API calls |

---

## Database Storage (changeValidations Table)

```sql
CREATE TABLE change_validations (
  id UUID PRIMARY KEY,
  change_number TEXT NOT NULL,
  change_sys_id TEXT NOT NULL UNIQUE,
  
  -- Component fields
  component_type TEXT NOT NULL,          -- Indexed for analytics
  component_sys_id TEXT,                 -- Optional, no index
  
  -- Results
  validation_results JSONB,              -- {overall_status, checks, synthesis}
  status TEXT DEFAULT 'received',        -- Lifecycle: received → processing → completed/failed
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP,
  processed_at TIMESTAMP,
  processing_time_ms INTEGER,
  ...
);

-- Index for component type analytics
CREATE INDEX idx_change_validations_component_type ON change_validations(component_type);
```

---

## Component-Specific Validation Routes

### 1. Catalog Item (`catalog_item`)
**When**: `componentType === "catalog_item"` AND `componentSysId` exists
**ServiceNow Table**: `sc_cat_item`
**API Call**: `getCatalogItem(componentSysId)`
**Fields Checked**:
- `has_name`: Item has a name
- `has_category`: Item assigned to a category
- `has_workflow`: Item has a workflow defined
- `is_active`: Item is active (not deleted/disabled)

### 2. LDAP Server (`ldap_server`)
**When**: `componentType === "ldap_server"` AND `componentSysId` exists
**ServiceNow Table**: `cmdb_ci_ldap_server`
**API Call**: `getLDAPServer(componentSysId)`
**Fields Checked**:
- `has_listener_enabled`: LDAP listener is enabled
- `has_mid_server`: MID server is assigned
- `has_urls`: LDAP URLs are configured

### 3. MID Server (`mid_server`)
**When**: `componentType === "mid_server"` AND `componentSysId` exists
**ServiceNow Table**: `ecc_agent`
**API Call**: `getMIDServer(componentSysId)`
**Fields Checked**:
- `is_up`: Server status is "Up"
- `has_capabilities`: Server has capabilities defined
- `recently_checked_in`: Server has recent check-in timestamp

### 4. Workflow (`workflow`)
**When**: `componentType === "workflow"` AND `componentSysId` exists
**ServiceNow Table**: `wf_workflow`
**API Call**: `getWorkflow(componentSysId)`
**Fields Checked**:
- `is_published`: Workflow is published
- `not_checked_out`: Workflow is not being edited
- `has_scope`: Workflow has scoped app assigned

---

## Code Flow: Component Type Routing

```typescript
// Step 1: Webhook receives component_type and component_sys_id
const validated = ServiceNowChangeWebhookSchema.parse(webhookData);
// validated.component_type === "catalog_item"
// validated.component_sys_id === "abc123def456"

// Step 2: Service stores both in database
await changeValidationService.receiveWebhook(validated);
// Inserts: componentType: "catalog_item", componentSysId: "abc123def456"

// Step 3: Fact collection routes based on componentType
private async collectValidationFacts(record: ChangeValidation) {
  const facts = {
    component_type: record.componentType,        // "catalog_item"
    component_sys_id: record.componentSysId,     // "abc123def456"
  };
  
  // ROUTING LOGIC
  if (record.componentType === "catalog_item" && record.componentSysId) {
    const catalogItem = await serviceNowClient.getCatalogItem(record.componentSysId);
    if (catalogItem) {
      facts.catalog_item = catalogItem;
      facts.checks = {
        has_name: !!catalogItem.name,
        has_category: !!catalogItem.category,
        has_workflow: !!catalogItem.workflow || !!catalogItem.workflow_start,
        is_active: catalogItem.active === true || catalogItem.active === "true",
      };
    } else {
      facts.checks = {has_name: false, has_category: false, ...};  // Fail-safe
    }
  }
  // ... else if for other component types
  
  return facts;
}

// Step 4: Facts (with component-specific checks) passed to Claude
const validationResult = await this.synthesizeWithClaude(record, facts);
// Claude sees: "component_type: catalog_item, checks: {has_name: true, ...}"

// Step 5: Results stored in database
await this.repository.markCompleted(changeSysId, validationResult);
// Updates validation_results JSONB field
```

---

## Error Handling: Timeout & Fallback

All component API calls have a **8-second timeout**:

```typescript
const catalogItem = await this.withTimeout(
  serviceNowClient.getCatalogItem(record.componentSysId),
  SERVICENOW_TIMEOUT_MS,  // 8000 ms
  "getCatalogItem"
);

if (catalogItem) {
  // Success: Use the data
  facts.checks = {...};
} else {
  // Timeout or error: Fail-safe approach
  // Set all checks to false to prevent false PASS
  facts.checks = {
    has_name: false,
    has_category: false,
    has_workflow: false,
    is_active: false,
  };
  facts.collection_errors.push("Catalog item fetch timed out");
}

// Continue processing even if some collections fail
```

---

## Example: Adding a New Component Type

To support a new component type like `custom_table`:

### 1. Update Zod Schema
```typescript
// lib/schemas/servicenow-change-webhook.ts
export const ServiceNowChangeWebhookSchema = z.object({
  component_type: z.string(),  // Now accepts "custom_table"
  // ...
});
```

### 2. Add ServiceNow Client Method
```typescript
// lib/tools/servicenow.ts
public async getCustomTable(customTableSysId: string): Promise<Record<string, any> | null> {
  try {
    const path = `/api/now/table/custom_table/${customTableSysId}?sysparm_fields=sys_id,name,status,owner`;
    const response = await request<{result: Record<string, any>}>(path);
    return response.result || null;
  } catch (error) {
    console.error(`[ServiceNow] Error fetching custom table ${customTableSysId}:`, error);
    return null;
  }
}
```

### 3. Add Fact Collector
```typescript
// lib/services/change-validation.ts (in collectValidationFacts)
} else if (record.componentType === "custom_table" && record.componentSysId) {
  const customTable = await this.withTimeout(
    serviceNowClient.getCustomTable(record.componentSysId),
    SERVICENOW_TIMEOUT_MS,
    "getCustomTable"
  );
  
  if (customTable) {
    facts.custom_table = customTable;
    facts.checks = {
      has_name: !!customTable.name,
      has_status: !!customTable.status,
      has_owner: !!customTable.owner,
    };
  } else {
    facts.collection_errors.push("Custom table fetch timed out");
    facts.checks = {
      has_name: false,
      has_status: false,
      has_owner: false,
    };
  }
}
```

### 4. Optional: Update Claude Prompt
```typescript
// lib/services/change-validation.ts (in synthesizeWithClaude)
const systemPrompt = `
  ...
  Custom Table Validation:
  - Verify table is properly owned and managed
  - Ensure status is appropriate for deployment
  ...
`;
```

---

## Testing Component Type Handling

```typescript
// Example test
const webhook = {
  change_sys_id: "CHG0000123",
  change_number: "CHG0000123",
  component_type: "catalog_item",           // KEY
  component_sys_id: "4c7f6d8e1a2b3c4d",    // KEY
  submitted_by: "john.doe@example.com",
  // ...
};

// Verify in database
const record = await repository.getByChangeSysId("CHG0000123");
expect(record.componentType).toBe("catalog_item");
expect(record.componentSysId).toBe("4c7f6d8e1a2b3c4d");

// Verify facts collection
const facts = await service.collectValidationFacts(record);
expect(facts.component_type).toBe("catalog_item");
expect(facts.checks).toHaveProperty("has_name");
```

---

## Key Files & Line References

| Aspect | File | Lines |
|--------|------|-------|
| Schema Storage | `lib/db/schema.ts` | 1063-1064 |
| Component Routing | `lib/services/change-validation.ts` | 224-321 |
| API Methods | `lib/tools/servicenow.ts` | 3614-3707 |
| Repository Queries | `lib/db/repositories/change-validation-repository.ts` | 181-196 |
| Zod Validation | `lib/schemas/servicenow-change-webhook.ts` | 12-38 |

---

## Quick Checklist: Component Type Handling

- [ ] `component_type` is required in webhook payload
- [ ] `component_sys_id` is optional but recommended for specific items
- [ ] Component type determines which validation checks to run
- [ ] Component sys_id is passed to component-specific API methods
- [ ] All API calls have 8-second timeout protection
- [ ] Failed API calls set checks to false (fail-safe approach)
- [ ] Both fields are stored in database for audit trail
- [ ] Component type is indexed for analytics/reporting
- [ ] Claude receives component context for intelligent synthesis
