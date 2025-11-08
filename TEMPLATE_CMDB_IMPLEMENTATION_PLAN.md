# ServiceNow Template/CMDB Change Validation Enhancement Plan

## Executive Summary

Enhance the ServiceNow change validation system to detect and handle standard change templates (`std_change_template`) and CMDB configuration items (`cmdb_ci`) as component types, with proper metadata collection and fallback mechanisms.

---

## 🎯 Architecture Overview

### Core Enhancements
1. **Component Type Detection**: Webhook layer enriches inbound payloads with appropriate `component_type` and `component_sys_id`
2. **Metadata Collection**: ChangeValidationService branches to fetch template/CMDB-specific metadata
3. **Documentation Integration**: Fact bundle extended with archived documentation fields
4. **Fallback Strategy**: Graceful degradation to archived data when ServiceNow API fails

### Data Flow
```
Webhook (Detection) → Database (Storage) → Collector (Enrichment) → Evaluator (Validation)
     ↓                      ↓                    ↓                        ↓
   Classify            Persist Type         Fetch Metadata          Apply Rules
   Template/CMDB       & Doc Fields         With Fallback          & Synthesize
```

---

## 📋 Implementation Phases

### Phase 1: Schema & Type Updates (2 hours)

#### Database Changes
```typescript
// lib/db/schema.ts - Update componentType to support new values
componentType: text("component_type").notNull(),
// Values: catalog_item, ldap_server, mid_server, workflow, std_change_template, cmdb_ci

// Store template version or CI sys_id (not catalog item)
componentSysId: text("component_sys_id"),
```

#### Migration File
```sql
-- migrations/0024_add_template_cmdb_types.sql
ALTER TABLE change_validations
  ALTER COLUMN component_type TYPE text;

-- Add check constraint for valid types
ALTER TABLE change_validations
  ADD CONSTRAINT valid_component_types CHECK (
    component_type IN (
      'catalog_item',
      'ldap_server',
      'mid_server',
      'workflow',
      'std_change_template',
      'cmdb_ci'
    )
  );
```

#### Zod Schema Updates
```typescript
// lib/schemas/servicenow-change-webhook.ts
export const ChangeComponentSchema = z.object({
  component_type: z.enum([
    'catalog_item',
    'ldap_server',
    'mid_server',
    'workflow',
    'std_change_template',
    'cmdb_ci'
  ]),
  component_sys_id: z.string().optional(),
  // Template-specific fields
  template_version: z.object({
    sys_id: z.string(),
    value: z.string()
  }).optional(),
  // CMDB CI fields
  cmdb_ci: z.object({
    sys_id: z.string(),
    name: z.string()
  }).optional()
});

// Extended payload with documentation fields
export const ChangeValidationPayloadSchema = z.object({
  // ... existing fields ...
  documentation: z.object({
    implementation_plan: z.string().optional(),
    rollback_plan: z.string().optional(),
    test_plan: z.string().optional(),
    justification: z.string().optional()
  }).optional()
});
```

---

### Phase 2: Webhook Enhancement (3 hours)

#### Detection Logic
```typescript
// api/servicenow-change-webhook.ts

function detectComponentType(payload: any): {
  type: string;
  sysId?: string;
} {
  // Priority 1: Standard Change Template
  if (payload.std_change_producer_version?.value) {
    return {
      type: 'std_change_template',
      sysId: payload.std_change_producer_version.value
    };
  }

  // Priority 2: CMDB CI
  if (payload.cmdb_ci?.sys_id) {
    return {
      type: 'cmdb_ci',
      sysId: payload.cmdb_ci.sys_id
    };
  }

  // Priority 3: Existing component types
  if (payload.catalog_item?.sys_id) {
    return {
      type: 'catalog_item',
      sysId: payload.catalog_item.sys_id
    };
  }

  // ... other existing types ...
}

// Store documentation fields in payload archive
const documentationFields = {
  implementation_plan: payload.implementation_plan || payload.archived?.implementation_plan,
  rollback_plan: payload.back_out_plan || payload.archived?.back_out_plan,
  test_plan: payload.test_plan || payload.archived?.test_plan,
  justification: payload.justification || payload.archived?.justification
};

await changeValidationRepository.create({
  // ... other fields ...
  componentType: component.type,
  componentSysId: component.sysId,
  payload: {
    ...originalPayload,
    archived_documentation: documentationFields // Store for fallback
  }
});
```

---

### Phase 3: ServiceNow Client Extensions (4 hours)

#### Template Metadata Method
```typescript
// lib/tools/servicenow.ts

async getTemplateMetadata(templateVersionSysId: string): Promise<{
  workflow?: string;
  last_updated?: string;
  producer?: {
    catalog_item?: string;
  };
} | null> {
  return await this.withRetry(
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000); // 8-second guard

      try {
        const response = await fetch(
          `${this.config.baseUrl}/api/now/table/std_change_producer_version/${templateVersionSysId}`,
          {
            headers: this.getHeaders(),
            signal: controller.signal
          }
        );

        if (!response.ok) {
          console.warn(`Template fetch failed: ${response.status}`);
          return null;
        }

        const data = await response.json();
        return {
          workflow: data.result?.workflow?.value,
          last_updated: data.result?.sys_updated_on,
          producer: {
            catalog_item: data.result?.std_change_producer?.catalog_item?.value
          }
        };
      } finally {
        clearTimeout(timeout);
      }
    },
    { maxAttempts: 3, initialDelay: 1000 }
  );
}

async getCMDBDetails(ciSysId: string): Promise<{
  class?: string;
  owner?: string;
  environment?: string;
  relationships?: Array<{
    type: string;
    target: string;
  }>;
} | null> {
  return await this.withRetry(
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      try {
        const response = await fetch(
          `${this.config.baseUrl}/api/now/cmdb/instance/${ciSysId}`,
          {
            headers: this.getHeaders(),
            signal: controller.signal
          }
        );

        if (!response.ok) {
          console.warn(`CMDB fetch failed: ${response.status}`);
          return null;
        }

        const data = await response.json();
        return {
          class: data.result?.sys_class_name,
          owner: data.result?.owned_by?.value,
          environment: data.result?.environment?.value,
          relationships: data.result?.relationships?.map((r: any) => ({
            type: r.type?.value,
            target: r.target?.value
          }))
        };
      } finally {
        clearTimeout(timeout);
      }
    },
    { maxAttempts: 3, initialDelay: 1000 }
  );
}
```

---

### Phase 4: Collector Enhancement (4 hours)

#### Branch Logic & Fallback
```typescript
// lib/services/change-validation.ts

async collectValidationFacts(changeValidation: ChangeValidation): Promise<{
  facts: Record<string, any>;
  checks: Record<string, boolean>;
  source: 'api' | 'archived';
}> {
  const facts: Record<string, any> = {};
  const checks: Record<string, boolean> = {};
  let source: 'api' | 'archived' = 'api';

  // Extract documentation from archived payload (always available)
  const archivedDocs = changeValidation.payload?.archived_documentation || {};
  facts.documentation = {
    implementation_plan: archivedDocs.implementation_plan || '',
    rollback_plan: archivedDocs.rollback_plan || '',
    test_plan: archivedDocs.test_plan || '',
    justification: archivedDocs.justification || ''
  };

  // Evaluate documentation completeness
  checks.has_implementation_plan = !!facts.documentation.implementation_plan;
  checks.has_rollback_plan = !!facts.documentation.rollback_plan;
  checks.has_test_plan = !!facts.documentation.test_plan;
  checks.has_justification = !!facts.documentation.justification;

  // Branch by component type
  try {
    switch (changeValidation.componentType) {
      case 'std_change_template':
        const templateData = await this.snClient.getTemplateMetadata(
          changeValidation.componentSysId!
        );

        if (templateData) {
          facts.template = templateData;
          checks.template_has_workflow = !!templateData.workflow;
          checks.template_recently_updated = this.isRecentlyUpdated(templateData.last_updated);
          checks.template_has_catalog = !!templateData.producer?.catalog_item;
        } else {
          // Fallback to archived data
          source = 'archived';
          facts.template = changeValidation.payload?.std_change_producer_version || {};
          checks.template_has_workflow = false;
          checks.template_recently_updated = false;
          checks.template_has_catalog = false;
        }
        break;

      case 'cmdb_ci':
        const cmdbData = await this.snClient.getCMDBDetails(
          changeValidation.componentSysId!
        );

        if (cmdbData) {
          facts.cmdb_ci = cmdbData;
          checks.ci_has_owner = !!cmdbData.owner;
          checks.ci_has_environment = !!cmdbData.environment;
          checks.ci_has_relationships = (cmdbData.relationships?.length || 0) > 0;
        } else {
          // Fallback to archived data
          source = 'archived';
          facts.cmdb_ci = changeValidation.payload?.cmdb_ci || {};
          checks.ci_has_owner = false;
          checks.ci_has_environment = false;
          checks.ci_has_relationships = false;
        }
        break;

      // ... existing component types ...
    }
  } catch (error) {
    console.error(`Failed to collect facts for ${changeValidation.componentType}:`, error);
    source = 'archived';
    // Set all checks to false on API failure
    Object.keys(checks).forEach(key => {
      checks[key] = false;
    });
  }

  return { facts, checks, source };
}

private isRecentlyUpdated(dateStr?: string): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return date > thirtyDaysAgo;
}
```

---

### Phase 5: Testing Strategy (3 hours)

#### Unit Tests
```typescript
// __tests__/webhook.test.ts
describe('Template/CMDB Detection', () => {
  it('detects standard change template from version field', () => {
    const payload = {
      std_change_producer_version: { value: 'TPL001' },
      catalog_item: { sys_id: 'CAT001' }
    };
    const result = detectComponentType(payload);
    expect(result).toEqual({
      type: 'std_change_template',
      sysId: 'TPL001'
    });
  });

  it('detects CMDB CI from cmdb_ci field', () => {
    const payload = {
      cmdb_ci: { sys_id: 'CI001', name: 'Server01' }
    };
    const result = detectComponentType(payload);
    expect(result).toEqual({
      type: 'cmdb_ci',
      sysId: 'CI001'
    });
  });
});

// __tests__/collector.test.ts
describe('Fact Collection with Fallback', () => {
  it('falls back to archived data on API timeout', async () => {
    // Mock ServiceNow client to timeout
    jest.spyOn(snClient, 'getTemplateMetadata')
      .mockRejectedValue(new Error('Timeout'));

    const validation = {
      componentType: 'std_change_template',
      componentSysId: 'TPL001',
      payload: {
        archived_documentation: {
          implementation_plan: 'Plan A',
          rollback_plan: 'Plan B'
        }
      }
    };

    const result = await service.collectValidationFacts(validation);
    expect(result.source).toBe('archived');
    expect(result.facts.documentation.implementation_plan).toBe('Plan A');
  });
});
```

#### Integration Tests
```typescript
// __tests__/e2e/template-validation.test.ts
describe('Template Change Validation E2E', () => {
  it('processes template change with full metadata', async () => {
    // 1. Send webhook with template data
    const response = await request(app)
      .post('/api/servicenow-change-webhook')
      .send(mockTemplatePayload)
      .set('X-ServiceNow-Signature', validHmac);

    expect(response.status).toBe(200);

    // 2. Wait for processing
    await waitForProcessing(changeNumber);

    // 3. Verify fact collection
    const validation = await getValidation(changeNumber);
    expect(validation.componentType).toBe('std_change_template');
    expect(validation.validationResults.checks.template_has_workflow).toBe(true);
    expect(validation.validationResults.checks.has_implementation_plan).toBe(true);
  });
});
```

---

### Phase 6: Rollout & Monitoring (2 hours)

#### Deployment Checklist
- [ ] Run database migration in staging
- [ ] Deploy code with feature flag (if needed)
- [ ] Monitor webhook logs for detection accuracy
- [ ] Verify ServiceNow API calls stay under 8s
- [ ] Check fallback rate to archived data
- [ ] Validate CAB receives documentation fields
- [ ] Review LangSmith traces for synthesis quality

#### Success Metrics
- Template/CMDB detection rate > 95%
- API success rate > 90% (with fallback for failures)
- Processing time < 10 seconds per validation
- Documentation field availability > 100% (via archive)

---

## 🔒 Risk Mitigation

### Identified Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| ServiceNow API changes | High | Version API calls, maintain fallback |
| Template version not in payload | Medium | Fall back to catalog_item detection |
| CMDB relationships too large | Medium | Limit to first 10 relationships |
| Documentation fields missing | Low | Use empty strings, mark checks false |
| API timeout affects user experience | High | 8-second guard + archived fallback |

---

## 🎯 Key Design Decisions

1. **Component Priority**: Template > CMDB > Catalog (most specific first)
2. **Fallback Philosophy**: Always complete validation, even with degraded data
3. **Documentation Storage**: Archive in payload for guaranteed availability
4. **Timeout Protection**: Hard 8-second limit on all external calls
5. **Check Granularity**: Separate checks for each documentation field

---

## 📊 Estimated Timeline

- **Total Effort**: 18 hours
- **Phase 1-3**: 9 hours (Schema, Webhook, Client)
- **Phase 4**: 4 hours (Collector with fallback)
- **Phase 5**: 3 hours (Testing)
- **Phase 6**: 2 hours (Deployment)

---

## ✅ Next Steps

1. Confirm ServiceNow API endpoints for template/CMDB access
2. Review with team for approval
3. Begin Phase 1: Schema updates
4. Set up feature flag for gradual rollout

---

## 📝 Notes from Codex Analysis

- Architecture maintains existing fail-safe patterns
- Graceful degradation ensures validation always completes
- Documentation fields provide CAB with decision context
- Component detection is deterministic and testable
- All changes follow established codebase patterns