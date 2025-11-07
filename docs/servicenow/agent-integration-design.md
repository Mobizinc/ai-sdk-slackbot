# ServiceNow QA Analyst - Agent Integration Design

## Overview

This document provides implementation guidance for integrating the ServiceNow QA Analyst skill into the ai-sdk-slackbot architecture. The integration follows existing webhook/worker/service patterns and enables automated validation of Standard Changes when they enter "Assess" state.

> **Implementation status (2025-10-24)**
>
> The Python validation utilities (`check_uat_clone_date.py`, `validate_catalog_item.py`, `track_validation.py`, and `servicenow_api.py`) plus sample catalog data have been implemented. However, the TypeScript portions of this design (webhook endpoint, worker endpoint, `changeValidationService`, ServiceNow client extension, and the script-execution harness) are still pending. Items marked **TODO** below represent the remaining work required to complete the integration.

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
    ↓ Executes Python scripts
ServiceNow QA Analyst Skill (Claude Code)
    ↓ Posts results
ServiceNow Change Record (work note)
```

## Implementation Components

### 1. Webhook Endpoint

**File**: `api/servicenow-change-webhook.ts`

> **TODO**: Endpoint not yet implemented. ServiceNow currently has nowhere to POST Assess-state events.

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

> **TODO**: Worker has not been created; queued change validations will fail until this endpoint exists.

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

> **TODO**: Service layer not yet implemented. We need the orchestration logic described below (script execution, Claude synthesis, ServiceNow updates, Neon logging).

**Purpose**: Orchestrate validation logic using the QA Analyst skill

**Pattern**: Follow `lib/services/case-triage.ts` pattern

**Implementation**:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { serviceNowClient } from '@/lib/tools/servicenow';
import { executeScript } from '@/lib/claude-code';

interface ChangeValidationPayload {
  change_sys_id: string;
  change_number: string;
  component_type: string;
  component_sys_id: string;
  submitted_by?: string;
}

interface ValidationResult {
  overall_status: 'PASSED' | 'FAILED' | 'WARNING';
  checks: Record<string, boolean>;
  duration_ms: number;
  synthesized_comment: string;
}

class ChangeValidationService {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
  }

  async validateChange(payload: ChangeValidationPayload): Promise<ValidationResult> {
    const startTime = Date.now();

    try {
      // 1. Execute validation scripts via Claude Code
      const validationScripts = await this.executeValidationScripts(payload);

      // 2. Use Claude to review results and synthesize (ReACT pattern)
      const synthesis = await this.synthesizeResults(payload, validationScripts);

      // 3. Post results to ServiceNow
      await this.postResultsToServiceNow(payload.change_sys_id, synthesis.comment);

      // 4. Log to NeonDB via track_validation.py
      await this.logValidation(payload.change_number, synthesis.validation_results);

      return {
        overall_status: synthesis.status,
        checks: synthesis.checks,
        duration_ms: Date.now() - startTime,
        synthesized_comment: synthesis.comment,
      };

    } catch (error) {
      console.error('[Change Validation] Error:', error);
      
      // Post error to ServiceNow
      await this.postErrorToServiceNow(payload.change_sys_id, error);
      
      throw error;
    }
  }

  private async executeValidationScripts(payload: ChangeValidationPayload) {
    // Execute Python scripts via Claude Code or direct subprocess
    
    // 1. Check UAT clone freshness
    const uatCheck = await executeScript(
      'check_uat_clone_date.py',
      ['--target-environment', 'UAT', '--source-environment', 'PROD']
    );

    // 2. Validate component (catalog item, workflow, etc.)
    let componentCheck;
    if (payload.component_type === 'catalog_item') {
      componentCheck = await executeScript(
        'validate_catalog_item.py',
        [payload.component_sys_id, '--environment', 'UAT', '--output-json', '/tmp/validation.json']
      );
    }

    return {
      uat_status: JSON.parse(uatCheck.stdout),
      component_validation: JSON.parse(componentCheck.stdout),
    };
  }

  private async synthesizeResults(
    payload: ChangeValidationPayload,
    scripts: any
  ): Promise<any> {
    // Use Claude with ServiceNow QA Analyst skill to review and synthesize
    
    const systemPrompt = `You are a ServiceNow QA analyst reviewing validation results. 
Apply the ReACT pattern:
1. Review the raw validation data
2. Reason about what it means and what actions are needed
3. Act by synthesizing clear, actionable findings
4. Communicate results professionally

Use the servicenow-qa-analyst skill for guidance.`;

    const userPrompt = `Review these validation results for ${payload.change_number}:

UAT Status:
${JSON.stringify(scripts.uat_status, null, 2)}

Component Validation:
${JSON.stringify(scripts.component_validation, null, 2)}

Synthesize these results into:
1. Overall status (PASSED/FAILED/WARNING)
2. Clear work note for ServiceNow change record
3. Specific remediation steps if needed

Return JSON with: {status, checks, comment, validation_results}`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    // Parse Claude's response (expects JSON)
    const content = response.content[0];
    if (content.type === 'text') {
      return JSON.parse(content.text);
    }

    throw new Error('Unexpected response format');
  }

  private async postResultsToServiceNow(change_sys_id: string, comment: string) {
    // Use existing serviceNowClient
    await serviceNowClient.postChangeComment(change_sys_id, comment);
  }

  private async postErrorToServiceNow(change_sys_id: string, error: any) {
    const errorComment = `❌ Validation Error

An error occurred during automated validation:
${String(error)}

Please contact the automation team or validate manually.`;

    await serviceNowClient.postChangeComment(change_sys_id, errorComment);
  }

  private async logValidation(change_number: string, validation_results: any) {
    // Execute track_validation.py script
    await executeScript('track_validation.py', [
      change_number,
      JSON.stringify(validation_results),
    ]);
  }
}

export const changeValidationService = new ChangeValidationService();
```

**Key Points**:
- Executes Python validation scripts
- Uses Claude with QA Analyst skill for synthesis (ReACT)
- Posts results back to ServiceNow
- Logs to NeonDB
- Handles errors gracefully

---

### 4. ServiceNow Client Extension

**File**: `lib/tools/servicenow.ts`

**Additions needed**:

> **TODO**: `postChangeComment` helper is still missing from `lib/tools/servicenow.ts`. Without this, the worker cannot write validation notes back to ServiceNow.

```typescript
// Add method for posting change comments
async postChangeComment(changeSysId: string, comment: string): Promise<void> {
  const url = `${this.baseUrl}/api/now/table/change_request/${changeSysId}`;
  
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      work_notes: comment,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to post change comment: ${response.statusText}`);
  }
}
```

---

### 5. Database Schema

**File**: Database migration or init script

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

**Note**: The Python `track_validation.py` script will auto-create this table if missing, but adding it to your schema migrations ensures consistency.

> **TODO**: No migration or Prisma model has been added yet. Decide whether to rely on the Python script for table creation or add an explicit migration.

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

### Phase 1: Infrastructure
- [ ] Add environment variables to Vercel *(partially done: Python scripts rely on `.env.local`, but Vercel env vars still pending)*
- [ ] Deploy webhook endpoint (`/api/servicenow-change-webhook`) *(TODO)*
- [ ] Deploy worker endpoint (`/api/workers/process-change-validation`) *(TODO)*
- [ ] Verify QStash configuration *(TODO)*

### Phase 2: ServiceNow Configuration
- [ ] Create system properties for webhook URL and secret
- [ ] Create business rule on change_request table
- [ ] Test business rule fires when change enters "Assess" state
- [ ] Verify payload structure

### Phase 3: Service Layer
- [ ] Implement `changeValidationService` *(TODO)*
- [ ] Add `postChangeComment` to ServiceNow client *(TODO)*
- [x] Test script execution (check_uat_clone_date.py, validate_catalog_item.py)
- [ ] Test Claude synthesis with QA Analyst skill *(pending service layer)*

### Phase 4: Database
- [ ] Create `change_validations` table (or verify auto-creation)
- [ ] Add indexes
- [ ] Test `track_validation.py` logging

### Phase 5: Testing
- [ ] Unit test webhook endpoint
- [ ] Unit test worker endpoint  
- [ ] Integration test: Create test change in ServiceNow UAT
- [ ] Verify validation executes and results post back
- [ ] Test error handling scenarios

### Phase 6: Monitoring
- [ ] Add logging to Vercel
- [ ] Monitor QStash queue
- [ ] Set up alerts for validation failures
- [ ] Create dashboard for validation metrics

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

5. ⚠️ **NEW**: Where to store Python scripts?
   - Option A: Bundle in repo, execute via subprocess
   - Option B: Deploy to Claude Code, call via API
   - **Recommendation**: Bundle in repo for reliability

6. ⚠️ **NEW**: How to handle multiple component types?
   - Catalog items: Use validate_catalog_item.py
   - Workflows/Business Rules: Direct API validation
   - **Recommendation**: Start with catalog items, expand later

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
