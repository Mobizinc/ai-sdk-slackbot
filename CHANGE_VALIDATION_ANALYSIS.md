# ServiceNow Change Validation Implementation Analysis

## Overview
This document provides a comprehensive analysis of the ServiceNow change validation system, which automatically validates Standard Changes when they enter the "Assess" state. The system uses webhooks, async processing with QStash, Claude AI synthesis, and posts results back to ServiceNow.

---

## 1. WEBHOOK ENDPOINT: Ingests Change Validation Requests

### File Path
**`/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/api/servicenow-change-webhook.ts`**

### Key Line Numbers
- Lines 1-203: Complete webhook handler

### Current Implementation

**Runtime & Configuration**
- Runtime: `edge` (serverless edge function)
- Dynamic routing: `force-dynamic`
- HMAC signature verification enabled
- QStash async processing support
- LangSmith tracing integration

**Webhook Flow**
1. **Authentication** (Lines 98-108)
   - Verifies HMAC signature using `authenticateWebhookRequest()`
   - Supports both `x-servicenow-signature` and generic `signature` headers
   - Returns 401 if authentication fails

2. **Payload Parsing & Validation** (Lines 113-138)
   - Parses JSON payload
   - Validates against `ServiceNowChangeWebhookSchema`
   - Returns 422 if schema validation fails

3. **Database Persistence** (Lines 147-151)
   - Calls `changeValidationService.receiveWebhook()`
   - Stores in database with:
     - Webhook payload
     - HMAC signature for audit trail
     - Requested by user info
     - Status: "received"

4. **Async Queueing** (Lines 153-154)
   - Attempts to enqueue to QStash using `tryEnqueueValidation()`
   - Worker URL: `/api/workers/process-change-validation`
   - Payload includes: `changeSysId`, `changeNumber`
   - Retries: 3
   - Delay: 0ms

5. **Response** (Lines 156-172)
   - Returns HTTP 202 Accepted
   - Includes processing mode (async/sync)
   - Request ID from database record

**Key Environment Variables**
- `SERVICENOW_WEBHOOK_SECRET`: Required in production for HMAC verification
- `ENABLE_CHANGE_VALIDATION`: Default true (can be disabled)
- `ENABLE_ASYNC_PROCESSING`: Default true (can be disabled)

**Error Handling**
- Parse errors: 400 Bad Request
- Schema validation errors: 422 Unprocessable Entity
- Authentication failures: 401 Unauthorized
- Configuration issues: 503 Service Unavailable

---

## 2. WORKER/EVALUATOR: Async Processing of Change Validations

### File Path
**`/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/api/workers/process-change-validation.ts`**

### Key Line Numbers
- Lines 1-115: Complete worker implementation

### Current Implementation

**Worker Configuration**
- Runtime: `edge`
- Async processing via QStash
- QStash signature verification via `verifySignatureEdge()` wrapper (Line 114)

**Validation Processing Flow**
1. **Payload Receipt** (Lines 44-51)
   - QStash wrapper verifies signature and parses body
   - Extracts `changeSysId` and `changeNumber`
   - Validates required fields

2. **Service Invocation** (Line 56)
   - Calls `changeValidationService.processValidation(changeSysId)`
   - Service returns `ValidationResult` with:
     - `overall_status`: "PASSED", "FAILED", or "WARNING"
     - `checks`: Record of validation check results
     - `synthesis`: Optional human-readable summary

3. **Response** (Lines 65-74)
   - Returns HTTP 200 success
   - Includes processing time and status

4. **Error Handling** (Lines 75-93)
   - Catches errors and logs details
   - Returns HTTP 500 with error message
   - Does NOT retry (QStash handles retries)

**Tracing & Observability**
- LangSmith integration for end-to-end tracing
- Tags: component=worker, operation=process-validation

---

## 3. SERVICE LAYER: ChangeValidationService

### File Path
**`/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/lib/services/change-validation.ts`**

### Key Line Numbers
- Lines 1-540: Complete service implementation

### Current Implementation

**Service Architecture**
```
receiveWebhook() 
  ↓ [webhook ingestion]
  ↓
processValidation() 
  ↓ [main processing]
  ├─ collectValidationFacts()
  │  ├─ getCloneInfo() [environment health]
  │  ├─ getChangeDetails() [change context]
  │  └─ Component-specific collectors:
  │     ├─ getCatalogItem() [for catalog_item]
  │     ├─ getLDAPServer() [for ldap_server]
  │     ├─ getMIDServer() [for mid_server]
  │     └─ getWorkflow() [for workflow]
  │
  ├─ synthesizeWithClaude() [if Claude available]
  │  └─ claude-sonnet-4-5
  │
  └─ postResultsToServiceNow()
```

### Key Methods

#### `receiveWebhook()` (Lines 58-90)
- **Input**: Webhook payload, optional HMAC signature, requested by user
- **Processing**:
  - Validates against `ServiceNowChangeWebhookSchema`
  - Extracts key fields:
    - `change_number`
    - `change_sys_id`
    - `component_type`
    - `component_sys_id`
  - Creates database record with status "received"
- **Output**: `ChangeValidation` database record

#### `processValidation()` (Lines 95-151)
- **Input**: `changeSysId` (string)
- **Processing Flow**:
  1. Fetches record from database
  2. Marks as "processing" in database
  3. Collects validation facts
  4. Synthesizes results (Claude if available, else rules-based)
  5. Updates database with results
  6. Posts work notes back to ServiceNow
- **Output**: `ValidationResult` with status and checks
- **Error Handling**: Catches and logs errors, marks record as "failed"

#### `collectValidationFacts()` (Lines 175-329)
**THIS IS THE CRITICAL COMPONENT-HANDLING METHOD**

**Architecture**
- Timeout wrapper prevents hanging (8-second timeout per operation)
- Parallel fact collection with error resilience
- Graceful fallback: continues even if some collections fail

**Collected Facts Structure**
```typescript
{
  component_type: string,           // From record.componentType
  component_sys_id: string | null,  // From record.componentSysId
  collection_errors: string[],      // All collection failures
  
  // Phase 1: Environment Health
  clone_info: {...},
  clone_freshness_check: {
    is_fresh: boolean,
    age_days: number | null,
    last_clone_date: string | null,
  },
  
  // Phase 2: Change Details
  change_details: {...},
  
  // Phase 3: Component-Specific
  [component_type specific fields],
  checks: {...},  // Component-specific validation checks
}
```

**Component-Specific Validation** (Lines 224-321)

Each component type has a dedicated collector with specific checks:

**1. `catalog_item` (Lines 224-249)**
- **ServiceNow Table**: `sc_cat_item`
- **SysId Field**: `record.componentSysId`
- **API Call**: `getCatalogItem(componentSysId)`
- **Collected Fields**:
  - `name`, `category`, `workflow`, `workflow_start`, `active`
- **Validation Checks**:
  - `has_name`: Name is populated
  - `has_category`: Category is assigned
  - `has_workflow`: Workflow or workflow_start defined
  - `is_active`: Catalog item is active (true or "true")

**2. `ldap_server` (Lines 250-272)**
- **ServiceNow Table**: `cmdb_ci_ldap_server`
- **SysId Field**: `record.componentSysId`
- **API Call**: `getLDAPServer(componentSysId)`
- **Collected Fields**:
  - `listener_enabled`, `mid_server`, `urls`, `paging_enabled`
- **Validation Checks**:
  - `has_listener_enabled`: LDAP listener is enabled
  - `has_mid_server`: MID server is assigned
  - `has_urls`: LDAP URLs are configured

**3. `mid_server` (Lines 273-296)**
- **ServiceNow Table**: `ecc_agent`
- **SysId Field**: `record.componentSysId`
- **API Call**: `getMIDServer(componentSysId)`
- **Collected Fields**:
  - `status`, `capabilities`, `last_check_in`, `version`
- **Validation Checks**:
  - `is_up`: Status is "Up" or "up"
  - `has_capabilities`: Capabilities defined
  - `recently_checked_in`: Last check-in timestamp exists

**4. `workflow` (Lines 297-321)**
- **ServiceNow Table**: `wf_workflow`
- **SysId Field**: `record.componentSysId`
- **API Call**: `getWorkflow(componentSysId)`
- **Collected Fields**:
  - `published`, `checked_out`, `scoped_app`, `description`
- **Validation Checks**:
  - `is_published`: Workflow is published
  - `not_checked_out`: Workflow is not checked out
  - `has_scope`: Scoped app is assigned

**Error Handling in Fact Collection**
- Timeouts: If ServiceNow API takes >8 seconds, operation returns null
- Failure Response**: Sets all checks to `false` to prevent false PASS
- Continues Processing: Collection errors logged but don't stop validation

#### `synthesizeWithClaude()` (Lines 335-451)
**LLM-Based Validation Synthesis**

**Model**: Claude Sonnet 4.5

**System Prompt** (Lines 344-360):
- Role: ServiceNow Architect on Change Advisory Board (CAB)
- Responsibilities:
  1. Documentation Quality assessment
  2. Environment Readiness verification
  3. Impact Projection (downstream risks)
  4. Historical Awareness
  5. CAB Decision (APPROVE, APPROVE_WITH_CONDITIONS, REJECT)

**Input Format**:
- Change number, component type, requested by
- Complete `facts` object with component-specific data

**Output Format** (JSON):
```json
{
  "overall_status": "APPROVE|APPROVE_WITH_CONDITIONS|REJECT",
  "documentation_assessment": "...",
  "risks": ["..."],
  "required_actions": ["..."],
  "synthesis": "Work-note-ready paragraph"
}
```

**JSON Extraction Strategy** (Lines 398-425):
1. Try parsing entire response as JSON
2. Try extracting from markdown code block
3. Try finding any JSON object in response
4. Fall back to rules-based validation if all fail

**Error Handling**:
- Catches LLM errors and falls back to rules-based validation
- Logs error details for troubleshooting

#### `synthesizeWithRules()` (Lines 457-492)
**Rules-Based Validation Fallback**

**Decision Logic**:
- PASSED: All checks are `true`
- FAILED: Critical checks (has_*, is_*) are `false`
- WARNING: Some checks failed but not critical

**Output**:
```typescript
{
  overall_status: "PASSED" | "FAILED" | "WARNING",
  checks: {...},
  synthesis: "Emoji + Status + Details"
}
```

#### `postResultsToServiceNow()` (Lines 497-528)
**Posts Validation Results as Work Notes**

**Processing**:
1. Formats result as markdown work note
2. Includes status emoji (✅ ❌ ⚠️)
3. Lists all check results
4. Adds timestamp
5. Calls `addChangeWorkNote(changeSysId, workNote)`

**Error Handling**:
- Catches and logs errors
- Does NOT throw (change was validated regardless)

---

## 4. DATABASE SCHEMA: changeValidations Table

### File Path
**`/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/lib/db/schema.ts`**

### Key Line Numbers
- Lines 1051-1098: Change validations table definition

### Schema Definition

```typescript
export const changeValidations = pgTable(
  "change_validations",
  {
    // Identification
    id: uuid("id").defaultRandom().primaryKey(),
    changeNumber: text("change_number").notNull(),
    changeSysId: text("change_sys_id").notNull(),  // Unique via index
    
    // Component being validated
    componentType: text("component_type").notNull(),     // KEY FIELD
    componentSysId: text("component_sys_id"),            // KEY FIELD (optional)
    
    // Webhook metadata
    payload: jsonb("payload").notNull(),
    hmacSignature: text("hmac_signature"),
    requestedBy: text("requested_by"),
    
    // Lifecycle
    status: text("status").notNull().default("received"),  // received|processing|completed|failed
    validationResults: jsonb("validation_results"),        // {overall_status, checks, synthesis}
    failureReason: text("failure_reason"),
    
    // Timing
    createdAt: timestamp("created_at", {withTimezone: true}).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", {withTimezone: true}).notNull().defaultNow(),
    processedAt: timestamp("processed_at", {withTimezone: true}),
    
    // Diagnostics
    processingTimeMs: integer("processing_time_ms"),
    retryCount: integer("retry_count").default(0).notNull(),
  },
  (table) => ({
    changeNumberIdx: index("idx_change_validations_change_number").on(table.changeNumber),
    changeSysIdIdx: uniqueIndex("idx_change_validations_change_sys_id").on(table.changeSysId),
    statusIdx: index("idx_change_validations_status").on(table.status),
    componentTypeIdx: index("idx_change_validations_component_type").on(table.componentType),
    createdAtIdx: index("idx_change_validations_created_at").on(table.createdAt),
    processedAtIdx: index("idx_change_validations_processed_at").on(table.processedAt),
    statusCreatedIdx: index("idx_change_validations_status_created").on(table.status, table.createdAt),
  })
);
```

### Component Handling Fields

**`componentType` Field**
- **Type**: `text("component_type").notNull()`
- **Purpose**: Determines which ServiceNow table and validation checks to use
- **Current Values**: `catalog_item`, `ldap_server`, `mid_server`, `workflow`
- **Indexed**: Yes (idx_change_validations_component_type)
- **Usage in Code**:
  - Line 179: Stored in facts collection
  - Line 224, 250, 273, 297: Conditional checks in `collectValidationFacts()`
  - Line 437: Passed to Claude in LLM context
  - Repository methods: `getByComponentType()` (lines 181-196)

**`componentSysId` Field**
- **Type**: `text("component_sys_id")` (optional)
- **Purpose**: Reference to the specific component being validated
- **Examples**:
  - For catalog_item: sys_id from `sc_cat_item` table
  - For ldap_server: sys_id from `cmdb_ci_ldap_server` table
  - For mid_server: sys_id from `ecc_agent` table
  - For workflow: sys_id from `wf_workflow` table
- **Indexed**: No direct index (but part of payload)
- **Nullable**: Yes (some validations may not have a component_sys_id)
- **Usage in Code**:
  - Line 180: Stored in facts collection
  - Lines 224, 250, 273, 297: Conditional checks before fetching component details
  - Lines 226, 251, 274, 298: Passed to component-specific API methods

### Validation Results Structure

```typescript
validationResults: jsonb("validation_results").$type<{
  overall_status: "PASSED" | "FAILED" | "WARNING";
  checks: Record<string, boolean>;
  synthesis?: string;
}>()
```

**Example for catalog_item**:
```json
{
  "overall_status": "PASSED",
  "checks": {
    "has_name": true,
    "has_category": true,
    "has_workflow": true,
    "is_active": true
  },
  "synthesis": "✅ Change validation PASSED. All required configuration checks completed successfully."
}
```

### Indexes for Query Optimization

1. **changeSysIdIdx (UNIQUE)**
  - Ensures one validation per change
  - Used for lookups by changeSysId

2. **statusIdx**
  - For finding unprocessed/failed validations
  - Cron job query: `WHERE status = 'received'`

3. **componentTypeIdx**
  - For analytics: "Show me all validations for catalog_item type"
  - Repository method: `getByComponentType(componentType)`

4. **statusCreatedIdx (COMPOSITE)**
  - For background job processing
  - Query: `WHERE status = 'received' ORDER BY createdAt`

---

## 5. REPOSITORY: ChangeValidationRepository

### File Path
**`/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/lib/db/repositories/change-validation-repository.ts`**

### Key Line Numbers
- Lines 1-315: Complete repository implementation

### Key Methods

#### `create()` (Lines 16-35)
**Create a new validation record**
- Input: `NewChangeValidation` (includes componentType, componentSysId)
- Output: Saved `ChangeValidation` record
- Logging: Records change number and sys_id

#### `getByChangeSysId()` (Lines 40-53)
**Fetch by change sys_id (primary lookup)**
- Input: `changeSysId`
- Output: `ChangeValidation | null`
- Used by: `processValidation()` in service

#### `getByComponentType()` (Lines 181-196)
**Fetch validations by component type (analytics)**
- Input: `componentType`, optional limit (default 50)
- Output: `ChangeValidation[]`
- Ordered by: Most recent first
- Used for: Reporting, component-specific analysis

#### `markProcessing()`, `markCompleted()`, `markFailed()` (Lines 104-140)
**State transitions with timestamps**
- Updates: status, results, timestamps
- Ensures proper lifecycle tracking

---

## 6. VALIDATION SCHEMAS: Zod Schemas for Type Safety

### File Path
**`/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/lib/schemas/servicenow-change-webhook.ts`**

### Key Line Numbers
- Lines 1-100: All schema definitions

### Schemas

#### `ServiceNowChangeWebhookSchema` (Lines 12-38)
**Inbound webhook payload validation**

```typescript
export const ServiceNowChangeWebhookSchema = z.object({
  // Required fields
  change_sys_id: z.string(),
  change_number: z.string(),
  state: z.string(),
  component_type: z.string(),              // KEY FIELD
  component_sys_id: z.string().optional(), // KEY FIELD
  
  // Optional context
  submitted_by: z.string().optional(),
  short_description: z.string().optional(),
  description: z.string().optional(),
  
  // Change metadata
  business_justification: z.string().optional(),
  risk_level: z.enum(["low", "medium", "high"]).optional(),
  implementation_plan: z.string().optional(),
  rollback_plan: z.string().optional(),
  testing_plan: z.string().optional(),
  
  // Schedule
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
  maintenance_window: z.string().optional(),
});
```

#### `ValidationResultSchema` (Lines 45-50)
**Validation result schema**

```typescript
export const ValidationResultSchema = z.object({
  overall_status: z.enum(["PASSED", "FAILED", "WARNING"]),
  checks: z.record(z.string(), z.boolean()),
  synthesis: z.string().optional(),
  remediation_steps: z.array(z.string()).optional(),
});
```

#### `ChangeValidationRequestSchema` (Lines 58-66)
**Internal validation request schema**

```typescript
export const ChangeValidationRequestSchema = z.object({
  changeSysId: z.string(),
  changeNumber: z.string(),
  componentType: z.string(),
  componentSysId: z.string().optional(),
  payload: z.record(z.any()),
  hmacSignature: z.string().optional(),
  requestedBy: z.string().optional(),
});
```

---

## 7. SERVICENOW CLIENT: API Methods for Change Validation

### File Path
**`/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/lib/tools/servicenow.ts`**

### Key Line Numbers
- Lines 3580-3707: Change validation methods

### Client Methods

#### `addChangeWorkNote()` (Lines 3580-3595)
**Posts validation results to change request**

- **Endpoint**: `PATCH /api/now/table/change_request/{changeSysId}`
- **Body**: `{ work_notes: "..." }`
- **Used by**: `postResultsToServiceNow()` in service
- **Error Handling**: Logs and throws errors

#### `getChangeDetails()` (Lines 3600-3609)
**Fetches change request details**

- **Endpoint**: `GET /api/now/table/change_request/{changeSysId}`
- **Fields**: sys_id, number, short_description, state, assignment_group, assigned_to, description
- **Used by**: `collectValidationFacts()` in service
- **Returns**: Record object or null on timeout/error

#### `getCatalogItem()` (Lines 3614-3626)
**Fetches catalog item details**

- **Endpoint**: `GET /api/now/table/sc_cat_item/{catalogItemSysId}`
- **Fields**: sys_id, name, short_description, description, category, active, workflow, workflow_start
- **Timeout**: 8 seconds
- **Used by**: `collectValidationFacts()` when componentType === "catalog_item"
- **Returns**: Record object or null on timeout/error

#### `getLDAPServer()` (Lines 3631-3640)
**Fetches LDAP server configuration**

- **Endpoint**: `GET /api/now/table/cmdb_ci_ldap_server/{ldapServerSysId}`
- **Fields**: sys_id, name, listener_enabled, mid_server, urls, paging_enabled
- **Timeout**: 8 seconds
- **Used by**: `collectValidationFacts()` when componentType === "ldap_server"
- **Returns**: Record object or null on timeout/error

#### `getMIDServer()` (Lines 3645-3654)
**Fetches MID server details**

- **Endpoint**: `GET /api/now/table/ecc_agent/{midServerSysId}`
- **Fields**: sys_id, name, status, capabilities, last_check_in, version
- **Timeout**: 8 seconds
- **Used by**: `collectValidationFacts()` when componentType === "mid_server"
- **Returns**: Record object or null on timeout/error

#### `getWorkflow()` (Lines 3659-3668)
**Fetches workflow details**

- **Endpoint**: `GET /api/now/table/wf_workflow/{workflowSysId}`
- **Fields**: sys_id, name, published, checked_out, scoped_app, description
- **Timeout**: 8 seconds
- **Used by**: `collectValidationFacts()` when componentType === "workflow"
- **Returns**: Record object or null on timeout/error

#### `getCloneInfo()` (Lines 3674-3707)
**Fetches clone/refresh information**

- **Endpoint**: `GET /api/now/table/clone_instance`
- **Query**: `target_instance={targetInstance}^source_instance={sourceInstance}^ORDERBYDESCclone_date`
- **Used by**: `collectValidationFacts()` [Phase 1: Environment Health]
- **Returns**: Object with `last_clone_date`, `clone_age_days`, or null
- **Timeout**: 8 seconds

---

## 8. COMPONENT_TYPE and COMPONENT_SYS_ID Handling Summary

### Flow Diagram

```
Webhook Received
  ↓
Extract component_type and component_sys_id from payload
  ↓
Store in database (changeValidations table)
  ↓
Process Validation starts
  ↓
collectValidationFacts():
  ├─ Store both fields in facts object
  ├─ Use component_type for conditional logic:
  │  ├─ "catalog_item" → getCatalogItem(component_sys_id)
  │  ├─ "ldap_server" → getLDAPServer(component_sys_id)
  │  ├─ "mid_server" → getMIDServer(component_sys_id)
  │  └─ "workflow" → getWorkflow(component_sys_id)
  └─ Store component-specific checks in facts.checks
  ↓
synthesizeWithClaude():
  ├─ Pass facts (including componentType and checks) to Claude
  └─ Claude uses component-specific context for synthesis
  ↓
postResultsToServiceNow():
  └─ Post validation results as work note
```

### Key Characteristics

**componentType**
- **Immutable**: Set at webhook receipt, never changed
- **Indexed**: Yes, for analytics and filtering
- **Used for**: Conditional logic, fact collection routing, reporting
- **Currently Supported**: catalog_item, ldap_server, mid_server, workflow
- **Extensible**: New types can be added by:
  1. Adding new conditional block in `collectValidationFacts()`
  2. Creating ServiceNow client method for component details
  3. Defining component-specific checks

**componentSysId**
- **Optional**: Some validations may not have a specific component
- **Purpose**: Direct reference to component in ServiceNow
- **Passed To**: Component-specific API methods (getCatalogItem, getLDAPServer, etc.)
- **Timeout Protection**: All API calls have 8-second timeout
- **Error Handling**: If component fetch fails, all checks set to false (fail-safe)

---

## 9. Configuration & Environment Variables

### Required for Webhook Processing
- `SERVICENOW_WEBHOOK_SECRET`: HMAC signature verification (production)
- `SERVICENOW_INSTANCE_URL`: ServiceNow instance URL
- `SERVICENOW_USERNAME` + `SERVICENOW_PASSWORD`: OR
- `SERVICENOW_API_TOKEN`: ServiceNow authentication

### Feature Flags
- `ENABLE_CHANGE_VALIDATION`: Enable/disable entire feature (default: true)
- `ENABLE_ASYNC_PROCESSING`: Enable/disable QStash async (default: true)
- `QSTASH_CURRENT_SIGNING_KEY`: QStash signature verification
- `QSTASH_NEXT_SIGNING_KEY`: QStash signature fallback

### Optional for Claude Integration
- `ANTHROPIC_API_KEY`: For Claude-powered synthesis (optional)

---

## 10. Data Flow Sequence

```
1. WEBHOOK ARRIVAL
   ├─ POST /api/servicenow-change-webhook
   ├─ Request body includes:
   │  ├─ change_sys_id
   │  ├─ change_number
   │  ├─ component_type (e.g., "catalog_item")
   │  └─ component_sys_id (e.g., "abc123def456")
   └─ HMAC signature for verification

2. WEBHOOK PROCESSING (api/servicenow-change-webhook.ts)
   ├─ Verify HMAC signature
   ├─ Validate JSON schema
   ├─ Call changeValidationService.receiveWebhook()
   └─ Enqueue to QStash

3. DATABASE PERSISTENCE
   ├─ Create changeValidations record:
   │  ├─ changeNumber
   │  ├─ changeSysId
   │  ├─ componentType = "catalog_item"
   │  ├─ componentSysId = "abc123def456"
   │  ├─ payload = {...}
   │  ├─ status = "received"
   │  └─ createdAt
   └─ Return 202 Accepted to caller

4. ASYNC PROCESSING (api/workers/process-change-validation.ts)
   ├─ QStash calls worker with payload
   │  ├─ changeSysId
   │  └─ changeNumber
   └─ Worker calls changeValidationService.processValidation()

5. FACT COLLECTION (lib/services/change-validation.ts)
   ├─ Fetch DB record by changeSysId
   ├─ collectValidationFacts():
   │  ├─ getCloneInfo() [environment health]
   │  ├─ getChangeDetails() [change context]
   │  ├─ componentType === "catalog_item" → getCatalogItem("abc123def456")
   │  │  ├─ Check: has_name
   │  │  ├─ Check: has_category
   │  │  ├─ Check: has_workflow
   │  │  └─ Check: is_active
   │  └─ Store all facts + checks
   └─ Return facts object

6. SYNTHESIS (Claude or Rules)
   ├─ If ANTHROPIC_API_KEY configured:
   │  └─ synthesizeWithClaude() with facts + component context
   ├─ Else:
   │  └─ synthesizeWithRules() based on checks
   └─ Return ValidationResult

7. POSTING RESULTS
   ├─ Format work note with:
   │  ├─ Status emoji
   │  ├─ Check results
   │  └─ Synthesis
   ├─ addChangeWorkNote(changeSysId, workNote)
   └─ Update DB status to "completed"

8. RESPONSE TO WORKER
   ├─ Worker returns 200 success
   ├─ Includes overall_status
   └─ QStash logs completion
```

---

## 11. Testing & Validation

### Unit Tests Location
- **Webhook**: `/tests/api/servicenow-change-webhook.test.ts`
- **Worker**: `/tests/api/workers/process-change-validation.test.ts`
- **Service**: `/tests/lib/services/change-validation.test.ts`
- **Repository**: `/tests/lib/db/repositories/change-validation-repository.test.ts`
- **Integration**: `/tests/integration/change-validation-integration.test.ts`

### Test Coverage Areas
1. HMAC signature verification
2. Schema validation
3. Component-specific fact collection
4. Claude synthesis with JSON extraction
5. Rules-based fallback validation
6. Work note posting
7. Database state transitions
8. Error handling and timeouts

---

## 12. Key Design Patterns

### 1. Timeout Protection
All ServiceNow API calls wrapped with 8-second timeouts to prevent hanging:
```typescript
const result = await this.withTimeout(
  serviceNowClient.getChangeDetails(record.changeSysId),
  SERVICENOW_TIMEOUT_MS,
  "getChangeDetails"
);
```

### 2. Graceful Degradation
If component fetch fails, validation continues with `checks` set to false:
```typescript
if (catalogItem) {
  facts.checks = {has_name: !!catalogItem.name, ...};
} else {
  facts.checks = {has_name: false, ...};  // Fail-safe
}
```

### 3. Conditional Routing by Component Type
```typescript
if (record.componentType === "catalog_item" && record.componentSysId) {
  // Run catalog_item-specific validation
} else if (record.componentType === "ldap_server" && record.componentSysId) {
  // Run ldap_server-specific validation
}
```

### 4. Multi-Strategy JSON Extraction from LLM
Attempts multiple strategies to extract JSON from Claude response, with fallback to rules-based validation.

### 5. Async-First with Synchronous Fallback
Primary: QStash async processing
Secondary: If async fails, validation still happens synchronously in webhook handler

---

## 13. Potential Extensibility

To add a new component type (e.g., "service_catalog"):

1. **Update Webhook Schema**
   - Add to accepted component_type values

2. **Add ServiceNow Client Method**
   ```typescript
   public async getServiceCatalog(sysId: string): Promise<Record<string, any> | null> {
     const path = `/api/now/table/service_catalog/${sysId}?sysparm_fields=...`;
     return await request<{result: Record<string, any>}>(path);
   }
   ```

3. **Add Fact Collector in Service**
   ```typescript
   } else if (record.componentType === "service_catalog" && record.componentSysId) {
     const catalog = await this.withTimeout(...);
     if (catalog) {
       facts.service_catalog = catalog;
       facts.checks = {
         has_name: !!catalog.name,
         // ... other checks
       };
     }
   }
   ```

4. **Update Claude System Prompt** (optional)
   - Add guidance for new component type

---

## Summary Table

| Component | File | Type | Purpose |
|-----------|------|------|---------|
| **Webhook** | api/servicenow-change-webhook.ts | Edge Function | Receives, validates, queues change validations |
| **Worker** | api/workers/process-change-validation.ts | Edge Worker | Async processor triggered by QStash |
| **Service** | lib/services/change-validation.ts | Business Logic | Orchestrates validation workflow |
| **Repository** | lib/db/repositories/change-validation-repository.ts | Data Access | Persistence layer for validations |
| **Schema (DB)** | lib/db/schema.ts | Database | changeValidations table definition |
| **Schema (Zod)** | lib/schemas/servicenow-change-webhook.ts | Validation | Webhook payload validation |
| **ServiceNow Client** | lib/tools/servicenow.ts | API Client | Communication with ServiceNow |

