# ServiceNow Validation Patterns

This document outlines validation patterns for different ServiceNow change types, optimized for lightweight execution (< 10 seconds).

## Core Philosophy

**Lightweight Over Comprehensive**: Webhooks require fast response times. Focus on metadata-level checks that catch 80% of issues in < 10 seconds. Deep validation can be triggered manually when needed.

## Universal Pre-Checks

These checks apply to ALL change types before specific validation:

### 1. UAT Environment Health Check
**Script**: `check_uat_clone_date.py`
**Execution Time**: < 1 second

```bash
python check_uat_clone_date.py --target-environment UAT --source-environment PROD
```

**Checks:**
- Query `sys_clone_history` (or fallback to `sn_instance_clone_request`)
- Verify UAT was cloned within last 30 days
- Return: `{last_clone_date, days_since_clone, is_stale, status}`

**Decision Tree:**
```
IF days_since_clone > 30:
    STATUS = "CRITICAL"
    ACTION = "Block deployment - recommend fresh UAT clone"
    REASON = "Stale UAT may have schema differences"
ELSE:
    STATUS = "OK"
    ACTION = "Proceed with validation"
```

**Why This Matters**: Stale UAT environments can have:
- Schema differences from Production
- Missing tables or fields
- Different configurations
- Invalid test results

### 2. Change Context Extraction
From webhook payload, extract:
- Change number (CHG0012345)
- Change sys_id
- Change type/category
- Affected component sys_ids
- Submitter information

## Change Type: Catalog Item

**Primary Script**: `validate_catalog_item.py`
**Execution Time**: < 10 seconds
**Validation Scope**: Metadata only (no variables)

### Fields Validated
```python
CATALOG_FIELDS = "sys_id,name,active,short_description,workflow,category,sc_catalogs"
```

### Validation Checks

#### 1. Existence Check
```
CHECK: Does catalog item exist in target environment?
QUERY: GET /api/now/table/sc_cat_item/{sys_id}
RESULT: exists = (status_code == 200)

IF NOT exists:
    STATUS = "FAILED"
    SEVERITY = "CRITICAL"
    REMEDIATION = "Catalog item not found - verify sys_id or migrate from source"
```

#### 2. Active Status
```
CHECK: Is catalog item active?
FIELD: active
EXPECTED: "true"

IF NOT active:
    STATUS = "FAILED"
    SEVERITY = "CRITICAL"
    REMEDIATION = "Set active=true before deployment"
```

#### 3. Display Name Validation
```
CHECK: Display name doesn't contain template keywords
FIELD: name
KEYWORDS: ["copy of", "template", "test", "draft"]

IF keyword in name.lower():
    STATUS = "WARNING"
    SEVERITY = "WARNING"
    REMEDIATION = "Verify display name is correct - likely cloned from template"
    CONTEXT = "Common mistake: Cloning items without updating name"
```

#### 4. Workflow Assignment
```
CHECK: Has workflow attached?
FIELD: workflow
EXPECTED: Non-empty reference

IF NOT workflow:
    STATUS = "FAILED"
    SEVERITY = "CRITICAL"
    REMEDIATION = "Attach appropriate workflow for automation"
```

#### 5. Category Assignment
```
CHECK: Has category or catalog assignment?
FIELDS: category OR sc_catalogs
EXPECTED: At least one non-empty

IF NOT (category OR sc_catalogs):
    STATUS = "FAILED"
    SEVERITY = "CRITICAL"
    REMEDIATION = "Assign item to category for proper organization"
```

### Overall Status Logic
```python
if all([exists, active, display_name_valid, has_workflow, has_category]):
    overall_status = "PASSED"
else:
    overall_status = "FAILED"
```

### What We DON'T Validate (By Design)
❌ **Variables/Questions**: Fetching 250+ variable configs causes timeout
❌ **Workflow Execution**: Requires end-to-end testing (not real-time)
❌ **Approval Routing**: Complex logic requiring state simulation
❌ **Entitlements**: User-specific, context-dependent
❌ **UI Rendering**: Requires browser automation

**Rationale**: These deep validations should be triggered manually or as separate async processes.

## Change Type: Workflow

**Validation Scope**: Metadata verification (lightweight)

### Checks
1. **Existence**: Workflow exists in target environment
2. **Published Status**: Workflow is published (not draft)
3. **Table Assignment**: Has target table configured
4. **Condition**: Has trigger condition (if required)

### Lightweight Query
```python
workflow = client.get_record(
    "wf_workflow",
    sys_id,
    fields="sys_id,name,published,table,condition"
)
```

### Decision Tree
```
IF NOT exists:
    STATUS = "FAILED" - Workflow not found
IF NOT published:
    STATUS = "FAILED" - Workflow not published
IF NOT table:
    STATUS = "WARNING" - No table assignment (may be intentional)
ELSE:
    STATUS = "PASSED"
```

## Change Type: Business Rule

**Validation Scope**: Metadata and basic script checks

### Checks
1. **Existence**: Rule exists in target environment
2. **Active Status**: Rule is active
3. **Table Assignment**: Has target table
4. **When Condition**: Has execution timing (before/after/async/display)
5. **Script Present**: Has script code

### Lightweight Query
```python
rule = client.get_record(
    "sys_script",
    sys_id,
    fields="sys_id,name,active,table,when,condition"
)
```

### Decision Tree
```
IF NOT exists:
    STATUS = "FAILED" - Rule not found
IF NOT active:
    STATUS = "WARNING" - Rule is inactive (may be intentional)
IF NOT table:
    STATUS = "FAILED" - No table assignment
ELSE:
    STATUS = "PASSED"
```

### What We DON'T Validate (By Design)
❌ **Hard-coded sys_ids**: Requires script parsing and environment comparison
❌ **Infinite loops**: Requires static analysis or runtime testing
❌ **Error handling**: Requires code inspection
❌ **Performance**: Requires execution profiling

## Change Type: UI Policy

**Validation Scope**: Existence and basic configuration

### Checks
1. **Existence**: Policy exists in target environment
2. **Active Status**: Policy is active
3. **Table Assignment**: Has target table
4. **Actions Present**: Has at least one UI policy action configured

### Lightweight Query
```python
policy = client.get_record(
    "sys_ui_policy",
    sys_id,
    fields="sys_id,short_description,active,table"
)

actions = client.query_table(
    "sys_ui_policy_action",
    query=f"ui_policy={sys_id}",
    limit=1,
    fields="sys_id"
)
```

### Decision Tree
```
IF NOT exists:
    STATUS = "FAILED" - Policy not found
IF NOT active:
    STATUS = "WARNING" - Policy is inactive
IF NOT actions:
    STATUS = "WARNING" - No actions configured
ELSE:
    STATUS = "PASSED"
```

## Change Type: Update Set

**Validation Scope**: Update set metadata and item count

### Checks
1. **Existence**: Update set exists
2. **State**: Update set is complete
3. **Items Present**: Has at least one update XML item
4. **Application Scope**: Scoped app reference (if applicable)

### Lightweight Query
```python
update_set = client.get_record(
    "sys_update_set",
    sys_id,
    fields="sys_id,name,state,application"
)

items = client.query_table(
    "sys_update_xml",
    query=f"update_set={sys_id}",
    limit=1,
    fields="sys_id"
)
```

### Decision Tree
```
IF NOT exists:
    STATUS = "FAILED" - Update set not found
IF state != "complete":
    STATUS = "FAILED" - Update set not complete
IF NOT items:
    STATUS = "WARNING" - Empty update set
ELSE:
    STATUS = "PASSED"
```

## ReACT Pattern for AI Agent

After running validation scripts, the AI agent should follow the ReACT pattern:

### 1. Review Results
- Parse validation outputs from scripts
- Identify which checks passed vs failed
- Note execution times and any errors

### 2. Reason
- What type of change is this?
- What failed and why is it significant?
- Is this a critical blocker or acceptable risk?
- What are the downstream impacts?
- What would a QA analyst think about these results?

### 3. Act
- Synthesize findings into clear risk assessment
- Provide specific, actionable remediation steps
- Add context and business impact
- Craft professional work note

### 4. Communicate
- Post synthesized results to change record via `post_change_comment()`
- Use clear formatting (✓/✗ symbols, severity levels)
- Include evidence (specific field values, timestamps)
- Provide next steps

## Example ReACT Synthesis

**Raw Validation Output:**
```json
{
  "overall_status": "FAILED",
  "checks": {
    "exists": true,
    "active": true,
    "display_name_valid": true,
    "has_workflow": false,
    "has_category": false
  },
  "duration_seconds": 1.23
}
```

**AI Agent Synthesis (ReACT):**
```
❌ VALIDATION FAILED - Configuration Incomplete

UAT Environment: ✓ Fresh (cloned 18 days ago)

Catalog Item: "Access: AVD"
✓ Item exists and is active
✓ Display name is clean
✗ Missing workflow attachment - automation will not trigger
✗ Missing category assignment - item won't appear in catalog

Risk Assessment: HIGH - This change will break user experience

Remediation Required:
1. Attach workflow to enable approval/automation flow
2. Assign item to appropriate catalog category

Cannot proceed to production until these critical issues are resolved.

Evidence: sys_id e3c0c4ca83c62e1068537cdfeeaad3ea
```

## Validation Timing Guidelines

Target execution times for different validation types:

| Validation Type | Target Time | Script |
|----------------|-------------|--------|
| UAT Clone Check | < 1s | check_uat_clone_date.py |
| Catalog Item (metadata) | < 10s | validate_catalog_item.py |
| Workflow (basic) | < 5s | Manual API call |
| Business Rule (basic) | < 5s | Manual API call |
| UI Policy (basic) | < 5s | Manual API call |
| Update Set Items | < 10s | Manual API call |

**Total Webhook Processing Time**: Target < 15 seconds for complete validation

## When to Skip Lightweight Validation

Skip automated validation and require manual review for:
- Emergency changes (expedited process)
- Changes affecting multiple environments simultaneously
- Changes with complex dependencies
- Changes requiring end-to-end testing
- Changes to core platform functionality

In these cases, post a work note requesting manual QA review.
