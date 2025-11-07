---
name: servicenow-qa-analyst
description: Architect-level validation skill for ServiceNow Standard Changes. Automatically detects affected component types, gathers key configuration signals (catalog items, LDAP servers, MID configs, workflows, etc.), and hands them to the servicenow-architect Claude agent for reasoning. Performs UAT clone freshness checks, component fact collection, risk synthesis, and Neon logging to gate changes in "Assess" state.
---

# ServiceNow QA Analyst Skill

## Purpose
This skill acts as an automated ServiceNow Architect + QA reviewer for Standard Changes. It assembles rich context (clone freshness, component-specific facts, historical validations) so the **servicenow-architect** Claude agent can make gating decisions with platform awareness. Each collector surfaces the minimal signals needed (e.g., LDAP listener flag, MID server status), while Claude handles the reasoning and remediation guidance.

## When to Use This Skill
Use this skill when:
- A ServiceNow Standard Change enters "Assess" state and requires architect-level validation
- You need a single gate that can evaluate multiple ServiceNow component types automatically
- Ensuring UAT freshness and component readiness before production Deployment
- Building a validation trail (Neon + ServiceNow work notes) for audits

## Core Validation Workflow

### Phase 1: Extract Change Context
When the webhook fires:
- Parse change metadata (`change_number`, `change_sys_id`, template id, `component_type`, `component_sys_id`, submitter)
- Determine component categories via template metadata and payload references (e.g., `u_ldap_server` → LDAP collector)
- Build a collector execution plan (one collector per component type involved)

### Phase 2: Environment Health Check
**Execute: `scripts/check_uat_clone_date.py`**

Verify UAT was cloned from Production within the last 30 days:
- Queries `sys_clone_history` table (falls back to `sn_instance_clone_request` if unavailable)
- Returns: `{last_clone_date, days_since_clone, is_stale, status}`
- **If > 30 days old**: Flag as HIGH RISK and recommend fresh clone before validation
- **If < 30 days old**: Proceed with validation

**Why This Matters**: Stale UAT environments can have schema differences that invalidate test results.

### Phase 3: Component Fact Collection (Collectors)

Run registered collectors in parallel. Examples:

- **Catalog Item Collector (`scripts/validate_catalog_item.py`)** – returns metadata snapshot + basic checks (exists/active/workflow/category/name hygiene).
- **LDAP Collector** *(future)* – fetches listener flag, MID binding, timeouts, paging, URLs.
- **MID Server Collector** *(future)* – fetches status, capabilities, last check-in, version.
- **Workflow/Business Rule Collector** *(future)* – fetches published state, scope, updated_by, testing status.

Each collector returns `{component_type, sys_id, checks, facts, warnings, duration_seconds}`. Failures/timeouts are recorded as warnings so Claude can weigh them.

### Phase 4: Review & Synthesis (ReACT Pattern)
**This is where Claude (servicenow-architect agent) takes over:**

1. **Review Results**: Examine validation outputs from Phase 2 and Phase 3
2. **Reason**: Consider the context:
   - What type of change is this?
   - What failed and why?
   - Is this a critical blocker or a warning?
   - What are the downstream impacts?
   - What remediation steps are needed?
3. **Act**: Synthesize findings into:
   - Risk assessment (Critical/Warning/Passed)
   - Specific actionable recommendations
   - Evidence-based explanation
4. **Post Results**: Use ServiceNow API's `post_change_comment()` to add work note to change record

**Key Principle**: Collectors gather signals; the architect agent decides. Never rely solely on scripted pass/fail—Claude must reason like an L2/L3 architect.

### Phase 5: Track Validation (Learning)
**Execute: `scripts/track_validation.py`**

Log validation results to NeonDB:
- Connects to Postgres via `NEON_DATABASE_URL` or `DATABASE_URL`
- Auto-creates `change_validations` table if missing
- Logs: `change_number, validation_date, overall_status, checks, duration_seconds`

**Purpose**: Build validation history for:
- Pattern recognition across changes
- Developer coaching opportunities
- Continuous improvement of standards

## Environment Configuration

**Credential Pattern:**
The scripts use a flexible environment variable lookup pattern:
```
SERVICENOW_<ENV>_URL
SERVICENOW_<ENV>_USERNAME  
SERVICENOW_<ENV>_PASSWORD
```

Or alternate patterns:
```
<ENV>_SERVICENOW_URL
<ENV>_SERVICENOW_USERNAME
<ENV>_SERVICENOW_PASSWORD
```

Or fallback:
```
SERVICENOW_URL
SERVICENOW_USERNAME
SERVICENOW_PASSWORD
```

**Standard Environments:**
- **Development**: mobizdev.service-now.com
- **UAT**: mobizuat.service-now.com  
- **Production**: mobiz.service-now.com

**Authentication**: Service account `SVC.Mobiz.Integration.TableAPI.PROD` with appropriate API access

## Risk Assessment Criteria

**Critical Issues (Block deployment):**
- UAT clone > 30 days old (environment staleness)
- Catalog item doesn't exist in target environment
- Catalog item is inactive
- Missing workflow attachment (required for automation)
- Missing category assignment (required for organization)

**Warnings (Review before deployment):**
- Display names containing template keywords (potential cloning mistakes)
- Environment connectivity issues
- Performance concerns (validation taking > 10 seconds)

**Passed Validations:**
- Document successful checks to build confidence
- Note which components passed all validations

## Output Deliverables

1. **Synthesized Work Note** - Posted to ServiceNow change record via `post_change_comment()`:
   - Clear PASS/FAIL/WARNING status
   - Specific issues found with evidence
   - Actionable remediation steps
   - Risk assessment

2. **Validation Report** - Comprehensive documentation (if requested):
   - Environment health status
   - Component-by-component results
   - Evidence (API responses, field values)
   - Recommendations

3. **Historical Data** - Logged to NeonDB:
   - Enables pattern tracking
   - Supports continuous improvement
   - Provides audit trail

## Using Bundled Resources

### Scripts

**`scripts/servicenow_api.py`** - Core ServiceNow REST API client
- Class: `ServiceNowClient`
- Constructor: `ServiceNowClient.from_environment("UAT")` 
- Methods:
  - `get_record(table, sys_id, fields=None)` - Get single record
  - `query_table(table, query, limit=10, fields=None)` - Query records
  - `get_catalog_item(sys_id, fields=None)` - Convenience wrapper
  - `post_change_comment(change_sys_id, comment)` - Post work note
- Returns: Parsed JSON dictionaries (never prints raw responses)

**`scripts/check_uat_clone_date.py`** - UAT clone freshness checker
- Execution: `python check_uat_clone_date.py --target-environment UAT --source-environment PROD`
- Returns: `{target_instance, last_clone_date, days_since_clone, is_stale, status}`
- Fallback: Uses `sn_instance_clone_request` if `sys_clone_history` unavailable
- Threshold: 30 days (configurable via `--stale-after-days`)

**`scripts/validate_catalog_item.py`** - Catalog item collector
- Execution: `python validate_catalog_item.py <sys_id> --environment UAT`
- Fields Checked: Only metadata (no variables)
- Returns: `{catalog_item_sys_id, item_name, overall_status, duration_seconds, checks, snapshot}` (used as `facts` for Claude)
- Exit Codes: 0 = passed, 1 = failed, 2 = error

**`scripts/track_validation.py`** - NeonDB validation logger
- Function: `log_validation(change_number, validation_results)`
- Auto-creates: `change_validations` table if missing
- Environment: Uses `NEON_DATABASE_URL` or `DATABASE_URL`
- Purpose: Historical tracking for pattern analysis

**`scripts/requirements.txt`** - Python dependencies
```
requests>=2.31.0
psycopg2-binary>=2.9.9
```

### Future Collectors

- `scripts/collect_ldap_server.py` (planned)
- `scripts/collect_mid_server.py` (planned)
- `scripts/collect_workflow.py` (planned)

### References

**`references/servicenow_api_endpoints.md`** - ServiceNow REST API patterns and examples

**`references/validation_patterns.md`** - Change-type-specific validation logic and decision trees

**`references/common_mistakes.md`** - Database of known developer mistakes (continuously updated)

**`references/standards.md`** - Living organizational standards document

**`references/neondb_schema.md`** - NeonDB schema documentation for change_validations table

**`references/catalog_sample.json`** - Sample catalog item data structures for testing and documentation

### Assets

**`assets/kb_template.md`** - Knowledge base article template for comprehensive validation reports

**`assets/pre_submission_checklist.md`** - Checklist developers complete before change submission

**`assets/change_comment_template.md`** - Template for formatting work notes posted to change records

## Key Principles

1. **Speed Matters**: All validations must complete in < 10 seconds (lightweight checks only)
2. **Context Over Data**: Don't just report results - add intelligence and actionable guidance
3. **Evidence-Based**: Provide proof for all findings (field values, API responses)
4. **Learn Continuously**: Track patterns via NeonDB to improve standards over time
5. **Clear Communication**: Make findings actionable with specific remediation steps
6. **ReACT Pattern**: Review → Reason → Act → Communicate (don't just forward raw validation output)

## Integration Notes

**Webhook Trigger**: Standard Changes trigger validation when entering "Assess" state
**Async Execution**: Scripts should be executed asynchronously (via QStash) to avoid timeout
**Response Time**: Return 202 Accepted immediately, process validation asynchronously
**Notification**: Post results back to change record via `post_change_comment()` when complete

## Limitations & Trade-offs

**What This Skill DOES:**
- Fast lightweight validation (< 10 seconds)
- Metadata-level checks (exists, active, workflow, category)
- UAT freshness verification
- Clone date tracking

**What This Skill DOES NOT Do:**
- Deep variable validation (250+ fields would timeout)
- Workflow execution testing
- End-to-end functional testing
- Business rule logic validation
- UI policy validation

**Rationale**: Production webhooks need fast response times. Deep validation can be triggered manually when needed.
