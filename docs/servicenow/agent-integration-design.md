# ServiceNow QA Analyst - Agent Integration Design

## Overview

This document provides implementation guidance for integrating the ServiceNow QA Analyst skill into the ai-sdk-slackbot architecture. The integration follows existing webhook/worker/service patterns and enables automated validation of Standard Changes when they enter "Assess" state.

### Current Status & Next Steps (Nov 2025)

| Item | Status | Notes |
| --- | --- | --- |
| Webhook + worker endpoints | ✅ Implemented (`api/servicenow-change-webhook.ts`, `api/workers/process-change-validation.ts`) |
| Change validation service | ✅ Implemented (`lib/services/change-validation.ts`) with clone freshness + catalog/LDAP/MID/workflow collectors |
| ServiceNow SDK & extraction | ✅ ServiceNow client, table client, change repository, and automated export script built; dataset saved under `backup/standard-changes/2025-11-07/` |
| CAB-grade prompt | ⏳ Pending – need new persona focused on documentation quality, inferred impact, CAB decisions |
| Replay harness | 🛠 In progress – script scaffold exists, must call service and log Claude verdicts |
| Historical evaluation | 🔍 Planned – start with 5 curated changes, expand to 100-batch job once prompt stabilizes |
| Production rollout | ⏳ Blocked on prompt approval, replay results, ServiceNow business rule deployment, and env/QStash config |

This doc now focuses on the implemented architecture plus the remaining work required to enable CAB-level automatic gating.

### Updated Goal – Architect‑level Gating

We are expanding the scope from "catalog item sanity check" to a **ServiceNow Architect + QA** skill that can evaluate any standard-change component (catalog items, LDAP servers, MID configs, workflows, etc.). The orchestrator must:

1. **Detect component types automatically** from the change payload/template.
2. **Collect the right signals per component** (e.g., LDAP listener flag, MID server binding, workflow states) using lightweight "fact collectors".
3. **Feed those facts to the `servicenow-architect` Claude agent** so it reasons like a platform architect instead of relying on hard-coded rules.
4. **Enforce gating decisions** (pass/warn/fail) and log everything to Neon/ServiceNow for audit.

The architecture below now assumes a pluggable collector framework plus the architect agent prompt (`.claude/agents/servicenow-architect.md`).

> **Implementation status (2025-11-07)**
>
> The webhook, worker, `changeValidationService`, ServiceNow client extensions, and Drizzle persistence are now implemented in the repo (`api/servicenow-change-webhook.ts`, `api/workers/process-change-validation.ts`, `lib/services/change-validation.ts`, `lib/tools/servicenow.ts`, and `lib/db/schema.ts`).
>
> **New**: A reusable ServiceNow SDK has been built with `ServiceNowTableAPIClient` and `ChangeRepository` (see `docs/servicenow-sdk-architecture.md`). This SDK provides reusable patterns for all ServiceNow Table API operations including change data extraction and related records.
>
> This document reflects the live architecture. Future enhancements (new collectors, richer prompts, deployment to production) are noted explicitly where still pending.

## Architecture Pattern

Following the existing `servicenow-webhook → process-case → caseTriageService` pattern:

```
ServiceNow Business Rule (Assess state)
    ↓ HTTPS POST
Webhook: /api/servicenow-change-webhook
    ↓ QStash Queue (async)
Worker: /api/workers/process-change-validation
    ↓
Service: changeValidationService
    ↓ TypeScript collectors (ServiceNow SDK)
ServiceNow QA Analyst Skill (Claude Code)
    ↓ Posts results
ServiceNow Change Record (work note)
```

## Component Signal Collector Framework

To reach architect-level gating, the worker aggregates a **fact bundle** assembled by pluggable collectors:

| Component Type | Detection Signal | Collector Outputs (examples) |
| --- | --- | --- |
| `catalog_item` | `component_type === catalog_item` or template metadata | `{name, active, workflow, category, owner, scoped_app}` |
| `ldap_server` | Template references `u_ldap_server` / `cmdb_ci_ldap_server` | `{listener_enabled, mid_server, timeouts, urls, paging}` |
| `mid_server` | Payload references `ecc_agent` | `{status, capabilities, last_check_in, version}` |
| `workflow` / `business_rule` | Template field `u_script_target` | `{published, checked_out, scope, updated_by}` |

Collectors run in parallel using `ServiceNowClient` (via the new ServiceNow SDK - see `docs/servicenow-sdk-architecture.md`) and return a normalized block `{component_type, sys_id, facts, warnings}`. The worker merges these blocks with clone freshness data and recent Neon history, then forwards the entire context to the **servicenow-architect** Claude agent for reasoning.

**SDK Integration**: The collectors can leverage `ChangeRepository` methods for extracting standard changes, state transitions, component references, work notes, and related records. See `scripts/extract-standard-changes-refactored.ts` for examples of using the SDK.

**Collector requirements**

1. Fetch facts only—do not declare pass/fail.
2. Finish within ~2s; timeouts become `warnings` for the agent to weigh.
3. Emit consistent schema for predictable parsing.
4. Extensible: new component → add collector module + registry entry.

This guarantees the agent always receives the key configuration signals (e.g., LDAP listener flag) and can enforce standards without brittle hard-coded logic.

## Implementation Components

### 1. Webhook Endpoint

**File**: `api/servicenow-change-webhook.ts`

**Purpose**: Receive change validation requests from ServiceNow and queue for async processing

**Pattern**: Follow `api/servicenow-webhook.ts` pattern

**Implementation**:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { qstashClient } from '@/lib/qstash';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 1. Validate webhook secret
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.SERVICENOW_WEBHOOK_SECRET;
    
    if (!authHeader || !expectedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const providedSecret = authHeader.replace('Bearer ', '');
    if (providedSecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Invalid webhook secret' },
        { status: 401 }
      );
    }

    // 2. Parse webhook payload
    const payload = await request.json();
    
    // Expected payload structure from ServiceNow:
    // {
    //   change_sys_id: "abc123",
    //   change_number: "CHG0012345",
    //   state: "Assess",
    //   component_type: "catalog_item",
    //   component_sys_id: "xyz789",
    //   submitted_by: "user@company.com"
    // }

    // 3. Validate required fields
    if (!payload.change_sys_id || !payload.change_number) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 4. Queue to QStash for async processing
    const workerUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/workers/process-change-validation`;
    
    await qstashClient.publishJSON({
      url: workerUrl,
      body: payload,
      retries: 3,
      delay: 0, // Process immediately
    });

    // 5. Return 202 Accepted immediately
    return NextResponse.json(
      {
        status: 'accepted',
        change_number: payload.change_number,
        message: 'Change validation queued for processing'
      },
      { status: 202 }
    );

  } catch (error) {
    console.error('[Change Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**Key Points**:
- Returns 202 Accepted immediately (fast response)
- Authenticates via `SERVICENOW_WEBHOOK_SECRET`
- Queues to QStash for async processing
- No validation logic in webhook (keeps it fast)

---

### 2. Worker Endpoint

**File**: `api/workers/process-change-validation.ts`

**Purpose**: Process queued change validations using the QA Analyst skill

**Pattern**: Follow `api/workers/process-case.ts` pattern

**Implementation**:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureEdge } from '@upstash/qstash/dist/nextjs';
import { changeValidationService } from '@/lib/services/change-validation';
import { logToNeon } from '@/lib/neon-logger';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

async function handler(request: NextRequest) {
  try {
    const payload = await request.json();
    
    console.log('[Change Validation Worker] Processing:', {
      change_number: payload.change_number,
      component_type: payload.component_type,
    });

    // Execute validation using service layer
    const result = await changeValidationService.validateChange(payload);

    // Log to NeonDB
    await logToNeon({
      event: 'change_validation_complete',
      change_number: payload.change_number,
      status: result.overall_status,
      duration_ms: result.duration_ms,
      metadata: result,
    });

    return NextResponse.json(
      {
        success: true,
        change_number: payload.change_number,
        status: result.overall_status,
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('[Change Validation Worker] Error:', error);
    
    // Log error to NeonDB
    await logToNeon({
      event: 'change_validation_error',
      error: String(error),
      payload,
    });

    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// QStash signature verification
export const POST = verifySignatureEdge(handler);
```

**Key Points**:
- Verifies QStash signature
- Delegates to service layer
- Logs results to NeonDB
- Handles errors gracefully

---

### 3. Service Layer

**File**: `lib/services/change-validation.ts`

**Purpose**: Orchestrate validation logic using the servicenow-architect skill

**Implementation summary (`lib/services/change-validation.ts`)**:

1. **Receive & Persist**  
   - Webhook payloads are validated via `ServiceNowChangeWebhookSchema` and stored in the `change_validations` table (Drizzle repository).
2. **Process (worker)**  
   - `processValidation(changeSysId)` loads the record, marks it `processing`, and gathers facts.
3. **Phase 1 – Environment Health**  
   - Calls `serviceNowClient.getCloneInfo('uat','prod')` with an 8 s timeout, producing `clone_freshness_check` (`is_fresh`, `age_days`, `last_clone_date`). Failures/timeout add to `collection_errors`.
4. **Phase 2 – Component Facts**  
   - Branches on `componentType` (catalog item, LDAP server, MID server, workflow) and fetches the relevant fields via `serviceNowClient`. Each branch sets explicit boolean checks so Claude sees the pass/fail signals even on timeout.
5. **Phase 3 – Synthesis**  
   - If Anthropics is configured, `synthesizeWithClaude` uses the `servicenow-architect` prompt (ReACT pattern with environment-health requirement) to produce `{overall_status, checks, synthesis}`. Otherwise the service falls back to deterministic rules.
6. **Persistence & Notifications**  
   - Results are persisted via the repository, posted back to the change record through `serviceNowClient.addChangeWorkNote`, and exposed to the worker response. Errors mark the record failed and post an error work note.

**Key Points**:
- No Python subprocesses; all collectors run inside the service with request-level timeouts.
- Drizzle repository (`change_validations` table) replaces the old `track_validation.py` logger.
- Claude prompt includes the environment-health gate and component standards.
- Additional collectors can be added by extending `collectValidationFacts`.

---

### 4. ServiceNow Client Extension

**File**: `lib/tools/servicenow.ts`

**Key additions (already implemented)**:

- `addChangeWorkNote(changeSysId, workNote)` – wraps the ServiceNow PATCH call to append work notes (lib/tools/servicenow.ts:3572‑3585).
- `getChangeDetails`, `getCatalogItem`, `getLDAPServer`, `getWorkflow`, `getCloneInfo` – thin API helpers used by the service's fact collectors.

**ServiceNow SDK Architecture** (see `docs/servicenow-sdk-architecture.md`):

The codebase now includes a reusable ServiceNow SDK with three layers:
1. **ServiceNowHttpClient** (`lib/infrastructure/servicenow/client/http-client.ts`) - Low-level HTTP operations with retry logic
2. **ServiceNowTableAPIClient** (`lib/infrastructure/servicenow/client/table-api-client.ts`) - Generic CRUD operations for any table with automatic pagination
3. **Domain Repositories** (`lib/infrastructure/servicenow/repositories/`) - High-level domain-specific operations (e.g., `ChangeRepository`, `IncidentRepository`)

Collectors can use `ChangeRepository` methods for:
- `fetchCompleteChange(changeSysId)` - Get change with all related records
- `fetchStateTransitions(changeSysId)` - Get change tasks
- `fetchComponentReferences(changeSysId)` - Get linked CIs
- `fetchWorkNotes(changeSysId)` - Get work notes
- `fetchStandardChanges(pattern)` - Query standard changes by description

Example usage: `scripts/extract-standard-changes-refactored.ts`

---

### 5. Database Schema

**Implementation**: Defined in `lib/db/schema.ts` (Drizzle) and `lib/db/migrations`.

**Table**: `change_validations`

```sql
CREATE TABLE IF NOT EXISTS change_validations (
    id SERIAL PRIMARY KEY,
    change_number VARCHAR(50),
    validation_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    overall_status VARCHAR(20),
    checks JSONB,
    duration_seconds DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_change_validations_change_number ON change_validations(change_number);
CREATE INDEX idx_change_validations_date ON change_validations(validation_date);
CREATE INDEX idx_change_validations_status ON change_validations(overall_status);
```

**Note**: Table and indexes already exist via Drizzle migrations. The legacy `track_validation.py` logger is no longer used.

---

## ServiceNow Configuration

### Business Rule Configuration

**Table**: `change_request`
**When**: After
**Insert**: false
**Update**: true
**Filter Condition**: `state` changes to "Assess"

**Script**:

> **TODO**: Business rule has not been deployed in ServiceNow. Configure after the webhook endpoint is live.

```javascript
(function executeRule(current, previous) {
    try {
        var webhookUrl = gs.getProperty('custom.qa.validation.webhook.url');
        var webhookSecret = gs.getProperty('custom.qa.validation.webhook.secret');
        
        if (!webhookUrl || !webhookSecret) {
            gs.error('QA Validation: Webhook URL or secret not configured');
            return;
        }

        // Determine component type and sys_id from change
        var componentType = determineComponentType(current);
        var componentSysId = getComponentSysId(current);

        var payload = {
            change_sys_id: current.sys_id.toString(),
            change_number: current.number.toString(),
            state: current.state.getDisplayValue(),
            component_type: componentType,
            component_sys_id: componentSysId,
            submitted_by: current.sys_created_by.toString(),
            short_description: current.short_description.toString()
        };

        var request = new sn_ws.RESTMessageV2();
        request.setEndpoint(webhookUrl);
        request.setHttpMethod('POST');
        request.setRequestHeader('Content-Type', 'application/json');
        request.setRequestHeader('Authorization', 'Bearer ' + webhookSecret);
        request.setRequestBody(JSON.stringify(payload));

        var response = request.execute();
        var statusCode = response.getStatusCode();

        if (statusCode === 202) {
            gs.info('QA Validation: Queued validation for ' + current.number);
            current.work_notes = 'Automated validation queued - results will be posted shortly.';
            current.setWorkflow(false); // Prevent workflow from firing on this update
            current.update();
        } else {
            gs.error('QA Validation: Webhook failed with status ' + statusCode);
        }

    } catch (e) {
        gs.error('QA Validation: Error executing business rule: ' + e.message);
    }

    function determineComponentType(changeRecord) {
        // Logic to determine what type of change this is
        // Could check description, custom fields, or related records
        
        // Example: Check if there's a catalog item reference
        if (!changeRecord.u_catalog_item.nil()) {
            return 'catalog_item';
        }
        
        // Default to generic validation
        return 'generic';
    }

    function getComponentSysId(changeRecord) {
        // Logic to extract the component sys_id
        
        if (!changeRecord.u_catalog_item.nil()) {
            return changeRecord.u_catalog_item.toString();
        }
        
        return '';
    }

})(current, previous);
```

### System Properties

Add these to ServiceNow:

```
custom.qa.validation.webhook.url = https://your-app.vercel.app/api/servicenow-change-webhook
custom.qa.validation.webhook.secret = [generate secure secret]
```

---

## Environment Variables

Add to `.env.local`:

```bash
# ServiceNow QA Validation
SERVICENOW_WEBHOOK_SECRET="[same secret as ServiceNow]"

# ServiceNow Environments (for Python scripts)
SERVICENOW_UAT_URL="https://mobizuat.service-now.com"
SERVICENOW_UAT_USERNAME="SVC.Mobiz.Integration.TableAPI.PROD"
SERVICENOW_UAT_PASSWORD="[secure password]"

SERVICENOW_PROD_URL="https://mobiz.service-now.com"
SERVICENOW_PROD_USERNAME="SVC.Mobiz.Integration.TableAPI.PROD"
SERVICENOW_PROD_PASSWORD="[secure password]"

# NeonDB (for validation logging)
NEON_DATABASE_URL="postgresql://..."
```

---

## Deployment Checklist

### Phase 1: Infrastructure ⚠️ **PENDING DEPLOYMENT**
- [ ] Add environment variables to Vercel *(scripts use `.env.local`; production env vars still need to be set)*
- [ ] Deploy webhook endpoint (`/api/servicenow-change-webhook`) - **Code exists, not deployed**
- [ ] Deploy worker endpoint (`/api/workers/process-change-validation`) - **Code exists, not deployed**
- [ ] Verify QStash configuration

### Phase 2: ServiceNow Configuration ⚠️ **PENDING SERVICENOW SETUP**
- [ ] Create system properties for webhook URL and secret
- [ ] Create business rule on change_request table - **Script ready (line 321-393), not deployed**
- [ ] Test business rule fires when change enters "Assess" state
- [ ] Verify payload structure

### Phase 3: Service Layer ✅ **IMPLEMENTED**
- [x] Implement `changeValidationService`
- [x] Add `addChangeWorkNote` to ServiceNow client
- [x] Test catalog/LDAP/MID/workflow collectors
- [x] Build reusable ServiceNow SDK (`ServiceNowTableAPIClient`, `ChangeRepository`)
- [x] Create data extraction scripts using SDK (`extract-standard-changes-refactored.ts`)
- [ ] Validate Claude synthesis end-to-end in production env **← NEEDS PRODUCTION TEST**

### Phase 4: Database ✅ **IMPLEMENTED**
- [x] Create `change_validations` table (Drizzle migration)
- [x] Add indexes
- [x] Implement Drizzle repository for change validations
- [ ] Verify repository logging/queries under load **← NEEDS LOAD TEST**

### Phase 5: Testing ⚠️ **ALL PENDING**
- [ ] Unit test webhook endpoint
- [ ] Unit test worker endpoint
- [ ] Integration test: Create test change in ServiceNow UAT
- [ ] Verify validation executes and results post back
- [ ] Test error handling scenarios

### Phase 6: Monitoring ⚠️ **ALL PENDING**
- [ ] Add logging to Vercel
- [ ] Monitor QStash queue
- [ ] Set up alerts for validation failures
- [ ] Create dashboard for validation metrics

---

## Summary: What's Complete vs. Pending

### ✅ **Complete** (Development Ready):
- All TypeScript code implementation (webhook, worker, service, SDK)
- Database schema and migrations
- ServiceNow SDK architecture with repositories
- Data extraction scripts
- ServiceNow business rule script (ready to deploy)

### ⚠️ **Pending** (Deployment Required):
- **Vercel Deployment**: Webhook and worker endpoints exist but not deployed to production
- **Environment Variables**: Need to be set in Vercel production environment
- **ServiceNow Configuration**: Business rule needs to be created in ServiceNow
- **Testing**: No unit or integration tests written yet
- **Monitoring**: No observability infrastructure set up
- **Production Validation**: Claude synthesis hasn't been tested end-to-end in production

---

## Testing Strategy

### Unit Tests

**Webhook**:
```typescript
describe('ServiceNow Change Webhook', () => {
  it('should return 401 without valid secret', async () => {
    // Test unauthorized access
  });

  it('should return 202 and queue to QStash', async () => {
    // Test successful queuing
  });

  it('should return 400 for invalid payload', async () => {
    // Test validation
  });
});
```

**Service**:
```typescript
describe('Change Validation Service', () => {
  it('should execute validation scripts', async () => {
    // Test script execution
  });

  it('should synthesize results using Claude', async () => {
    // Test ReACT synthesis
  });

  it('should post results to ServiceNow', async () => {
    // Test posting
  });
});
```

### Integration Test

1. Create test Standard Change in ServiceNow UAT
2. Set change to "Assess" state
3. Verify business rule fires
4. Verify webhook receives payload
5. Verify QStash queues request
6. Verify worker processes validation
7. Verify results posted back to change record
8. Verify logged to NeonDB

---

## Monitoring & Observability

### Metrics to Track

1. **Validation Volume**
   - Changes validated per day
   - Success rate (PASSED vs FAILED)
   - Average validation time

2. **Performance**
   - Script execution time
   - Claude synthesis time
   - End-to-end processing time

3. **Errors**
   - Webhook failures
   - Script execution failures
   - ServiceNow posting failures

### Dashboards

Create dashboard with:
- Validation success rate over time
- Common failure reasons
- Average processing time
- Queue depth

### Alerts

Set up alerts for:
- Webhook returning 500
- Worker failing > 3 times
- Validation taking > 30 seconds
- Queue backing up

---

## Rollback Plan

If issues arise:

1. **Disable business rule** in ServiceNow (quick kill switch)
2. **Revert webhook deployment** to previous version
3. **Clear QStash queue** if needed
4. **Manual validation** fallback process

---

## Future Enhancements

1. **Multi-component validation**: Handle changes affecting multiple items
2. **Async deep validation**: Queue deep variable validation as separate job
3. **Learning loop**: Auto-update standards.md based on patterns
4. **Slack notifications**: Alert team on critical validation failures
5. **Dashboard**: Real-time validation monitoring UI

---

## Questions & Clarifications

Before implementing, confirm:

1. ✅ Standard Change trigger state: **Assess**
2. ✅ Validation strictness: **Missing workflow/category = FAIL**
3. ✅ Auto-posting: **NO - Agent synthesizes then posts**
4. ✅ NeonDB table: **Auto-creates if missing**

5. ✅ **Collectors**: Component facts are gathered via ServiceNow REST helpers inside `collectValidationFacts`. No subprocess execution is required.

6. ⚠️ **Future**: For new component types, add a collector branch (or future pluggable module) plus prompt additions.

---

## Success Criteria

The integration is successful when:

1. ✅ Standard Change enters "Assess" → Webhook fires
2. ✅ Validation completes in < 15 seconds
3. ✅ Results posted to change record as work note
4. ✅ Validation logged to NeonDB
5. ✅ No timeout issues
6. ✅ Error handling works gracefully
7. ✅ Team can see validation history in dashboard
