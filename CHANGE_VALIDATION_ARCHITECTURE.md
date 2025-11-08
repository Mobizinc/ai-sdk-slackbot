# ServiceNow Change Validation - Architecture Diagram

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ServiceNow Instance                                 │
│                    (Sends webhook when change                                │
│                  enters "Assess" state)                                      │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 │ POST /api/servicenow-change-webhook
                                 │ {change_sys_id, change_number,
                                 │  component_type, component_sys_id, ...}
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 WEBHOOK HANDLER (Edge Runtime)                               │
│              api/servicenow-change-webhook.ts (Lines 1-203)                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  1. Verify HMAC Signature ──────────┐                                        │
│                                      │                                        │
│  2. Parse & Validate JSON ──────────┤─────────────────────────────────────┐  │
│                                      │                                      │  │
│  3. Call Service.receiveWebhook() ──┼──> Database INSERT                   │  │
│     - Extract component_type         │    └─> changeValidations table      │  │
│     - Extract component_sys_id       │        - changeNumber               │  │
│                                      │        - changeSysId                │  │
│  4. Enqueue to QStash ──────────────┤        - componentType (KEY)        │  │
│     (async processing)               │        - componentSysId (KEY)       │  │
│                                      │        - payload                    │  │
│  5. Return 202 Accepted ───────────┐        - status: "received"          │  │
│                                      │                                      │  │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       │
                                       ▼
                            ┌────────────────────┐
                            │ PostgreSQL Database │
                            │ changeValidations   │
                            │ table              │
                            └────────────────────┘
```

---

## Async Processing Flow (QStash Queue)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           QStash Message Queue                               │
│  {changeSysId: "...", changeNumber: "CHG0000123"}                            │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                    (Async trigger when queued)
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WORKER (Edge Runtime)                                     │
│          api/workers/process-change-validation.ts (Lines 1-115)             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  1. Verify QStash Signature                                                  │
│                                                                               │
│  2. Extract changeSysId & changeNumber from payload                          │
│                                                                               │
│  3. Call Service.processValidation(changeSysId)                              │
│                                                                               │
│  4. Return 200 with {overall_status, duration_ms}                            │
│                                                                               │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SERVICE LAYER (Core Logic)                                │
│          lib/services/change-validation.ts (Lines 1-540)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  processValidation(changeSysId)                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ 1. Fetch record from database by changeSysId                          │  │
│  │    ├─ componentType = "catalog_item"                                  │  │
│  │    └─ componentSysId = "abc123def456"                                 │  │
│  │                                                                        │  │
│  │ 2. Mark as "processing" in database                                   │  │
│  │                                                                        │  │
│  │ 3. ╔═══════════════════════════════════════════════════════════════╗ │  │
│  │    ║  COLLECT VALIDATION FACTS (collectValidationFacts)           ║ │  │
│  │    ║  ┌──────────────────────────────────────────────────────────┐ ║ │  │
│  │    ║  │ Phase 1: Environment Health                             │ ║ │  │
│  │    ║  │ ├─ getCloneInfo() → clone freshness check               │ ║ │  │
│  │    ║  │ │                                                        │ ║ │  │
│  │    ║  │ Phase 2: Change Details                                 │ ║ │  │
│  │    ║  │ ├─ getChangeDetails() → basic change info               │ ║ │  │
│  │    ║  │ │                                                        │ ║ │  │
│  │    ║  │ Phase 3: COMPONENT-SPECIFIC VALIDATION                  │ ║ │  │
│  │    ║  │ │                                                        │ ║ │  │
│  │    ║  │ ├─ IF componentType === "catalog_item"                  │ ║ │  │
│  │    ║  │ │  └─ getCatalogItem(componentSysId)                    │ ║ │  │
│  │    ║  │ │     ├─ Check: has_name                                │ ║ │  │
│  │    ║  │ │     ├─ Check: has_category                            │ ║ │  │
│  │    ║  │ │     ├─ Check: has_workflow                            │ ║ │  │
│  │    ║  │ │     └─ Check: is_active                               │ ║ │  │
│  │    ║  │ │                                                        │ ║ │  │
│  │    ║  │ ├─ IF componentType === "ldap_server"                   │ ║ │  │
│  │    ║  │ │  └─ getLDAPServer(componentSysId)                     │ ║ │  │
│  │    ║  │ │     ├─ Check: has_listener_enabled                    │ ║ │  │
│  │    ║  │ │     ├─ Check: has_mid_server                          │ ║ │  │
│  │    ║  │ │     └─ Check: has_urls                                │ ║ │  │
│  │    ║  │ │                                                        │ ║ │  │
│  │    ║  │ ├─ IF componentType === "mid_server"                    │ ║ │  │
│  │    ║  │ │  └─ getMIDServer(componentSysId)                      │ ║ │  │
│  │    ║  │ │     ├─ Check: is_up                                   │ ║ │  │
│  │    ║  │ │     ├─ Check: has_capabilities                        │ ║ │  │
│  │    ║  │ │     └─ Check: recently_checked_in                     │ ║ │  │
│  │    ║  │ │                                                        │ ║ │  │
│  │    ║  │ └─ IF componentType === "workflow"                      │ ║ │  │
│  │    ║  │    └─ getWorkflow(componentSysId)                       │ ║ │  │
│  │    ║  │       ├─ Check: is_published                            │ ║ │  │
│  │    ║  │       ├─ Check: not_checked_out                         │ ║ │  │
│  │    ║  │       └─ Check: has_scope                               │ ║ │  │
│  │    ║  │                                                          │ ║ │  │
│  │    ║  │ All API calls have 8-second timeout protection           │ ║ │  │
│  │    ║  │ Failed fetches → all checks set to false (fail-safe)     │ ║ │  │
│  │    ║  │                                                          │ ║ │  │
│  │    ║  └──────────────────────────────────────────────────────────┘ ║ │  │
│  │    ║                                                               ║ │  │
│  │    ║  Returns: {component_type, component_sys_id, checks, facts}  ║ │  │
│  │    ╚═══════════════════════════════════════════════════════════════╝ │  │
│  │                                                                        │  │
│  │ 4. ╔═══════════════════════════════════════════════════════════════╗ │  │
│  │    ║  SYNTHESIS (Choose: Claude OR Rules)                          ║ │  │
│  │    ║                                                               ║ │  │
│  │    ║  IF ANTHROPIC_API_KEY configured:                            ║ │  │
│  │    ║  ├─ synthesizeWithClaude(record, facts)                      ║ │  │
│  │    ║  │  ├─ Call: claude-sonnet-4-5                              ║ │  │
│  │    ║  │  ├─ Prompt includes: componentType context               ║ │  │
│  │    ║  │  ├─ Returns JSON: {overall_status, checks, synthesis}    ║ │  │
│  │    ║  │  └─ Multi-strategy JSON extraction (robust)              ║ │  │
│  │    ║  │                                                            ║ │  │
│  │    ║  ELSE:                                                        ║ │  │
│  │    ║  └─ synthesizeWithRules(record, facts)                       ║ │  │
│  │    ║     ├─ PASSED: All checks true                               ║ │  │
│  │    ║     ├─ FAILED: Critical checks false                         ║ │  │
│  │    ║     └─ WARNING: Some checks false                            ║ │  │
│  │    ║                                                               ║ │  │
│  │    ║  Returns: ValidationResult                                   ║ │  │
│  │    ╚═══════════════════════════════════════════════════════════════╝ │  │
│  │                                                                        │  │
│  │ 5. Update database with results                                       │  │
│  │    ├─ status: "completed"                                            │  │
│  │    ├─ validation_results: JSONB with overall_status & checks          │  │
│  │    └─ processedAt, processingTimeMs                                   │  │
│  │                                                                        │  │
│  │ 6. Post results back to ServiceNow                                    │  │
│  │    └─ postResultsToServiceNow(changeSysId, result)                    │  │
│  │       └─ Format work note with emoji + results                        │  │
│  │          └─ Call: addChangeWorkNote()                                │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
                    ┌────────────────────────────┐
                    │ ServiceNow Work Note Posted │
                    │ ✅ Validation PASSED       │
                    │ • has_name: ✓              │
                    │ • has_category: ✓          │
                    │ etc.                       │
                    └────────────────────────────┘
```

---

## Component Type Routing Details

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  COMPONENT TYPE CONDITIONAL ROUTING                          │
│                (In collectValidationFacts method)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  record.componentType === "catalog_item" ──────┐                             │
│                                                  ├─> getCatalogItem()        │
│                                                  │                            │
│  record.componentSysId available ───────────────┤   [ServiceNow Table:       │
│                                                  │    sc_cat_item]            │
│                                                  │                            │
│                          ┌──────────────────────┘   Checks:                  │
│                          │                         • has_name                 │
│                          ▼                         • has_category             │
│                          ◄──────────────────────┐   • has_workflow            │
│                                                  │   • is_active              │
│                                                  │                            │
│  record.componentType === "ldap_server" ────────┤─> getLDAPServer()          │
│                                                  │                            │
│                                                  │   [ServiceNow Table:       │
│                                                  │    cmdb_ci_ldap_server]    │
│                                                  │                            │
│                          ┌──────────────────────┘   Checks:                  │
│                          │                         • has_listener_enabled    │
│                          ▼                         • has_mid_server          │
│                          ◄──────────────────────┐   • has_urls               │
│                                                  │                            │
│                                                  │                            │
│  record.componentType === "mid_server" ────────┤─> getMIDServer()           │
│                                                  │                            │
│                                                  │   [ServiceNow Table:       │
│                                                  │    ecc_agent]              │
│                                                  │                            │
│                          ┌──────────────────────┘   Checks:                  │
│                          │                         • is_up                    │
│                          ▼                         • has_capabilities        │
│                          ◄──────────────────────┐   • recently_checked_in    │
│                                                  │                            │
│                                                  │                            │
│  record.componentType === "workflow" ──────────┤─> getWorkflow()            │
│                                                  │                            │
│                                                  │   [ServiceNow Table:       │
│                                                  │    wf_workflow]            │
│                                                  │                            │
│                          ┌──────────────────────┘   Checks:                  │
│                          │                         • is_published            │
│                          ▼                         • not_checked_out         │
│                          ◄──────────────────────┐   • has_scope              │
│                                                  │                            │
│                                                  │                            │
│  Timeout Protection:                            │                            │
│  └─ All API calls wrapped with 8-second timeout ┤                            │
│  └─ If timeout: sets all checks to false        │                            │
│     (fail-safe approach)                         │                            │
│                                                  │                            │
│  ALL component-specific checks stored in:       │                            │
│  └─ facts.checks = {...}                        │                            │
│                                                  │                            │
└──────────────────────────────────────────────────┘
```

---

## Database Schema: Key Fields

```
TABLE: change_validations

┌─────────────────────────────────────────────────────────────────────┐
│ id (UUID PRIMARY KEY)                                               │
├─────────────────────────────────────────────────────────────────────┤
│ changeNumber (TEXT)                                                 │
│ changeSysId (TEXT UNIQUE) ◄─────┐                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                   │                                  │
│ ╔════════════════════════════════════════════════════════════════╗ │
│ ║  COMPONENT HANDLING FIELDS (KEY)                              ║ │
│ ║                                                                ║ │
│ ║  componentType (TEXT NOT NULL)  ◄──────────┐  Values:        ║ │
│ ║  [INDEX: idx_change_validations_component_type]               ║ │
│ ║                                             │  • catalog_item ║ │
│ ║  componentSysId (TEXT OPTIONAL) ◄──────────┤  • ldap_server  ║ │
│ ║  [NOT INDEXED]                              │  • mid_server   ║ │
│ ║                                             │  • workflow     ║ │
│ ║  Determines:                                │                 ║ │
│ ║  • Which validation checks to run           │                 ║ │
│ ║  • Which ServiceNow API method to call      │                 ║ │
│ ║  • Component-specific facts to collect      │                 ║ │
│ ║                                             └                 ║ │
│ ╚════════════════════════════════════════════════════════════════╝ │
│                                                                    │
├─────────────────────────────────────────────────────────────────────┤
│ payload (JSONB) ◄─────────────────────┐                             │
│ hmacSignature (TEXT)                   │ Original webhook data      │
│ requestedBy (TEXT)                     │                             │
├─────────────────────────────────────────────────────────────────────┤
│                                        │                             │
│ status (TEXT DEFAULT 'received')       │ Lifecycle:                 │
│ • received (awaiting processing)       │ • received                 │
│ • processing (async worker running)    │ • processing               │
│ • completed (validation done)          │ • completed                │
│ • failed (error during processing)     │ • failed                   │
│                                        │                             │
│ validationResults (JSONB) ◄────────────┤ Validation outcome:        │
│ ├─ overall_status                      │ {                          │
│ │  ("PASSED" | "FAILED" | "WARNING")   │   overall_status: "...",   │
│ │                                       │   checks: {...},           │
│ ├─ checks (Record<string, boolean>)    │   synthesis: "..."         │
│ │  ├─ has_name: true                   │ }                          │
│ │  ├─ has_category: true               │                            │
│ │  ├─ has_workflow: true               │                            │
│ │  └─ is_active: true                  │                            │
│ │                                       │                            │
│ └─ synthesis: "✅ PASSED..." (opt)     │                            │
│                                        │                            │
│ failureReason (TEXT) ◄──────────────────┤ If status="failed"        │
│                                         │                            │
├─────────────────────────────────────────────────────────────────────┤
│ createdAt (TIMESTAMP)  ◄────────────────┐                           │
│ updatedAt (TIMESTAMP)                    │ Timing                    │
│ processedAt (TIMESTAMP)                  │                           │
│ processingTimeMs (INTEGER)               │                           │
│ retryCount (INTEGER DEFAULT 0) ◄─────────┴───────────────────────┐   │
│                                                                  │   │
│ Indexes:                                                        │   │
│ • idx_change_validations_change_number                          │   │
│ • idx_change_validations_change_sys_id (UNIQUE)                │   │
│ • idx_change_validations_status                                 │   │
│ • idx_change_validations_component_type ◄──────────────────────┤   │
│ • idx_change_validations_created_at                             │   │
│ • idx_change_validations_processed_at                           │   │
│ • idx_change_validations_status_created                         │   │
│                                                                  │   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Component Type at Each Stage

```
WEBHOOK PAYLOAD
│
├─ component_type: "catalog_item"
├─ component_sys_id: "4c7f6d8e1a2b3c4d"
│
▼

DATABASE INSERT (changeValidations)
│
├─ componentType: "catalog_item"
├─ componentSysId: "4c7f6d8e1a2b3c4d"
├─ payload: {...original webhook...}
├─ status: "received"
│
▼

FACT COLLECTION (collectValidationFacts)
│
├─ facts.component_type: "catalog_item"
├─ facts.component_sys_id: "4c7f6d8e1a2b3c4d"
├─ facts.catalog_item: {...fields fetched from ServiceNow...}
├─ facts.checks: {
│    has_name: true,
│    has_category: true,
│    has_workflow: true,
│    is_active: true
│  }
│
▼

SYNTHESIS (Claude or Rules)
│
├─ Input: facts with component_type and checks
├─ Claude uses context: "Validating catalog_item"
├─ Returns: ValidationResult
│
▼

VALIDATION RESULTS (Update Database)
│
├─ validationResults.overall_status: "PASSED"
├─ validationResults.checks: {same as facts.checks}
├─ validationResults.synthesis: "✅ Validation PASSED..."
├─ status: "completed"
├─ processedAt: <timestamp>
│
▼

WORK NOTE TO ServiceNow
│
✅ Automated Validation Result: PASSED

Change validation PASSED. All required configuration checks completed successfully.

Check Results:
  • has_name: ✓
  • has_category: ✓
  • has_workflow: ✓
  • is_active: ✓

Validation completed at 2024-11-07T17:30:45.123Z
```

---

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ERROR HANDLING PATHS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  WEBHOOK ERRORS:                          PROCESSING ERRORS:                │
│  ───────────────                          ──────────────────                 │
│  ┌─────────────────────┐                  ┌───────────────────────┐          │
│  │ Parse Error         │                  │ Component Fetch      │          │
│  │ └─ 400 Bad Request  │                  │ Timeout (8 sec)      │          │
│  │                     │                  │ └─ Return null       │          │
│  └─────────────────────┘                  │ └─ Set all checks    │          │
│                                            │    to false          │          │
│  ┌─────────────────────┐                  │ (fail-safe)          │          │
│  │ Schema Validation   │                  │                      │          │
│  │ Error               │                  │ ┌──────────────────┐ │          │
│  │ └─ 422 Unprocessable│                  │ │ LLM Synthesis    │ │          │
│  │                     │                  │ │ Error            │ │          │
│  └─────────────────────┘                  │ │ └─ Fall back to  │ │          │
│                                            │ │    rules-based   │ │          │
│  ┌─────────────────────┐                  │ │    validation    │ │          │
│  │ Auth Failed         │                  │ └──────────────────┘ │          │
│  │ (Bad HMAC)          │                  │                      │          │
│  │ └─ 401 Unauthorized │                  │ ┌──────────────────┐ │          │
│  │                     │                  │ │ ServiceNow API   │ │          │
│  └─────────────────────┘                  │ │ Error            │ │          │
│                                            │ │ └─ Log error,    │ │          │
│  ┌─────────────────────┐                  │ │    mark record   │ │          │
│  │ Service             │                  │ │    as "failed"   │ │          │
│  │ Unavailable         │                  │ └──────────────────┘ │          │
│  │ └─ 503 Service      │                  │                      │          │
│  │    Unavailable      │                  └───────────────────────┘          │
│  └─────────────────────┘                                                     │
│                                                                               │
│  DATABASE ERRORS:                         RECOVERY:                         │
│  ───────────────                          ────────                          │
│  ┌─────────────────────┐                  ┌───────────────────────┐          │
│  │ Write Failure       │                  │ Retry Wrapper        │          │
│  │ │                   │                  │ └─ Built-in retries   │          │
│  │ │ with Retry Logic  │                  │    on transient       │          │
│  │ │                   │                  │    failures           │          │
│  │ └─ Auto-retry with  │                  │                       │          │
│  │    exponential      │                  │ QStash Retries        │          │
│  │    backoff          │                  │ └─ 3 retries for      │          │
│  │                     │                  │    queued jobs        │          │
│  └─────────────────────┘                  │                       │          │
│                                            │ Fail-Safe Design      │          │
│                                            │ └─ All API failures   │          │
│                                            │    handled gracefully │          │
│                                            │ └─ Validation        │          │
│                                            │    continues even if  │          │
│                                            │    some facts missing │          │
│                                            └───────────────────────┘          │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## File Organization

```
lib/
├── services/
│   └── change-validation.ts ◄─────────────────────┐
│       ├─ receiveWebhook()                        │ Service layer
│       ├─ processValidation()                     │ (core business logic)
│       ├─ collectValidationFacts()                │
│       │  ├─ getCloneInfo()                       │
│       │  ├─ getChangeDetails()                   │
│       │  ├─ Component routing                    │
│       │  │  ├─ getCatalogItem()                  │
│       │  │  ├─ getLDAPServer()                   │
│       │  │  ├─ getMIDServer()                    │
│       │  │  └─ getWorkflow()                     │
│       │  └─ withTimeout() wrapper                │
│       ├─ synthesizeWithClaude()                  │
│       ├─ synthesizeWithRules()                   │
│       └─ postResultsToServiceNow()               │
│                                                   │
├── db/                                             │
│   ├── schema.ts ◄──────────────────────┐         │
│   │   └─ changeValidations table       │         │ Data layer
│   │      ├─ componentType              │         │
│   │      └─ componentSysId             │         │
│   │                                     │         │
│   └── repositories/                    │         │
│       └── change-validation-repository.ts        │
│           ├─ create()                  │         │
│           ├─ getByChangeSysId()        │         │
│           ├─ getByComponentType()      │         │
│           └─ mark{Processing,Completed,Failed}() │
│                                         │         │
├── schemas/                             │         │
│   └── servicenow-change-webhook.ts ◄───┤──────┐
│       ├─ ServiceNowChangeWebhookSchema │       │ Validation schemas
│       ├─ ValidationResultSchema        │       │
│       └─ ChangeValidationRequestSchema │       │
│                                         │       │
├── tools/                               │       │
│   └── servicenow.ts ◄──────────────────┤───┐  │ ServiceNow client
│       ├─ addChangeWorkNote()           │   │  │
│       ├─ getChangeDetails()            │   │  │
│       ├─ getCatalogItem()              │   │  │
│       ├─ getLDAPServer()               │   │  │
│       ├─ getMIDServer()                │   │  │
│       ├─ getWorkflow()                 │   │  │
│       └─ getCloneInfo()                │   │  │
│                                         │   │  │
api/                                     │   │  │
├── servicenow-change-webhook.ts ◄────────┴───┐ Webhook handler
│   └─ POST /api/servicenow-change-webhook    │ (edge runtime)
│      ├─ Verify HMAC                         │
│      ├─ Validate schema                     │
│      ├─ Call service.receiveWebhook()       │
│      └─ Enqueue to QStash                   │
│                                             │
└── workers/                                  │
    └── process-change-validation.ts ◄────────┘ Worker
        ├─ Verify QStash signature              (edge runtime)
        ├─ Call service.processValidation()
        └─ Return 200 success

tests/
├── api/
│   └── workers/
│       └── process-change-validation.test.ts
├── lib/
│   ├── services/
│   │   └── change-validation.test.ts
│   └── db/repositories/
│       └── change-validation-repository.test.ts
└── integration/
    └── change-validation-integration.test.ts
```

---

## Component Type Support Matrix

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    COMPONENT TYPE SUPPORT MATRIX                              ║
╠════════════════════╦══════════════════╦════════════════════╦════════════════╣
║ Component Type     ║ ServiceNow Table ║ Validation Checks  ║ Status         ║
╠════════════════════╬══════════════════╬════════════════════╬════════════════╣
║ catalog_item       ║ sc_cat_item      ║ 4 checks           ║ ✓ Implemented  ║
║ ldap_server        ║ cmdb_ci_ldap..   ║ 3 checks           ║ ✓ Implemented  ║
║ mid_server         ║ ecc_agent        ║ 3 checks           ║ ✓ Implemented  ║
║ workflow           ║ wf_workflow      ║ 3 checks           ║ ✓ Implemented  ║
║                    ║                  ║                    ║                ║
║ [custom_type]      ║ [custom_table]   ║ [N/A]              ║ ℹ Extensible   ║
║                    ║                  ║                    ║   (see docs)   ║
╚════════════════════╩══════════════════╩════════════════════╩════════════════╝
```

