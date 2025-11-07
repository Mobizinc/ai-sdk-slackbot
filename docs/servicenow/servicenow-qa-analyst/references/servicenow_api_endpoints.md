# ServiceNow REST API Endpoints Reference

This document provides common ServiceNow REST API endpoints and patterns used for quality validation.

## Authentication

All API requests use Basic Authentication with flexible environment variable configuration:

**Credential Lookup Pattern:**
```
SERVICENOW_<ENV>_URL       (e.g., SERVICENOW_UAT_URL)
SERVICENOW_<ENV>_USERNAME  (e.g., SERVICENOW_UAT_USERNAME)
SERVICENOW_<ENV>_PASSWORD  (e.g., SERVICENOW_UAT_PASSWORD)
```

**Alternate Patterns:**
```
<ENV>_SERVICENOW_URL       (e.g., UAT_SERVICENOW_URL)
<ENV>_SERVICENOW_USERNAME
<ENV>_SERVICENOW_PASSWORD
```

**Fallback:**
```
SERVICENOW_URL
SERVICENOW_USERNAME
SERVICENOW_PASSWORD
```

**Request Headers:**
```
Content-Type: application/json
Accept: application/json
Authorization: Basic <base64(username:password)>
```

**Service Account**: `SVC.Mobiz.Integration.TableAPI.PROD`

## Base URLs

- **Development**: https://mobizdev.service-now.com
- **UAT**: https://mobizuat.service-now.com
- **Production**: https://mobiz.service-now.com

## Core Table API

### Get Single Record
```
GET /api/now/table/{table_name}/{sys_id}
Query Parameters:
  sysparm_fields: Comma-separated list of fields to return (CRITICAL for performance)
  sysparm_display_value: true|false (return display values)
  sysparm_exclude_reference_link: true|false
```

**Lightweight Pattern (< 10s execution):**
```python
client = ServiceNowClient.from_environment("UAT")
item = client.get_record(
    "sc_cat_item",
    sys_id,
    fields="sys_id,name,active,workflow,category"  # Only fetch needed fields
)
```

### Query Records
```
GET /api/now/table/{table_name}
Query Parameters:
  sysparm_query: Encoded query string
  sysparm_limit: Maximum records (default: 10000)
  sysparm_offset: Pagination offset
  sysparm_fields: Fields to return (CRITICAL for performance)
  sysparm_display_value: all|true|false
```

**Lightweight Pattern:**
```python
results = client.query_table(
    "sys_clone_history",
    query="target_instance=mobizuat^state=completed^ORDERBYDESClast_completed_time",
    limit=1,
    fields="sys_id,last_completed_time,state"
)
```

### Encoded Query Examples
- `active=true` - Active records
- `name=Test` - Exact match
- `nameLIKEtest` - Contains match
- `sys_created_on>=2024-01-01` - Date range
- `active=true^category=hardware` - AND condition
- `active=true^ORactive=false` - OR condition
- `ORDERBYname` - Sort ascending
- `ORDERBYDESCname` - Sort descending

## Key Tables for Validation

### Catalog Management

#### Catalog Items (sc_cat_item)
```
GET /api/now/table/sc_cat_item/{sys_id}
```

**Lightweight Fields (for < 10s validation):**
- `sys_id` - Unique identifier
- `name` - Display name
- `active` - Active status (boolean)
- `short_description` - Brief description
- `workflow` - Workflow reference
- `category` - Category reference
- `sc_catalogs` - Catalog assignment

**Heavy Fields (avoid for quick validation):**
- `variables` - All variable configurations (250+ fields can timeout)
- `picture` - Icon/image data
- Full reference expansions

**Usage Example:**
```python
# ✅ Fast (< 10s)
item = client.get_catalog_item(
    sys_id,
    fields="sys_id,name,active,workflow,category"
)

# ❌ Slow (can timeout)
item = client.get_catalog_item(sys_id)  # Fetches all 250+ fields
```

#### Catalog Categories (sc_category)
```
GET /api/now/table/sc_category/{sys_id}
Fields:
  - title: Category name
  - parent: Reference to parent category
  - active: true|false
  - order: Display order
```

#### Variables/Questions (item_option_new)
```
GET /api/now/table/item_option_new
Query: cat_item={catalog_item_sys_id}

⚠️ WARNING: Fetching all variables for items with 250+ questions can timeout.
For lightweight validation, skip variable validation entirely.
```

### Workflow Management

#### Workflows (wf_workflow)
```
GET /api/now/table/wf_workflow/{sys_id}
Important Fields:
  - name: Workflow name
  - published: true|false
  - table: Target table
  - condition: When to trigger
```

### Change Management

#### Change Requests (change_request)
```
GET /api/now/table/change_request/{sys_id}

Important Fields:
  - number: Change number (CHGxxxxxxx)
  - short_description: Title
  - description: Detailed description
  - state: new|assess|authorize|scheduled|implement|review|closed
  - type: standard|normal|emergency
  - assigned_to: Assignee
  - work_notes: Comments/notes
```

**Post Work Note (PATCH):**
```
PATCH /api/now/table/change_request/{sys_id}
Body: {"work_notes": "Validation complete: All checks passed."}
```

**Usage Example:**
```python
client.post_change_comment(
    change_sys_id="abc123",
    comment="✓ Validation PASSED\n- UAT clone fresh (18 days)\n- Catalog item active\n- Workflow attached"
)
```

### Clone Management

#### Clone History (sys_clone_history)
```
GET /api/now/table/sys_clone_history
Query: target_instance={instance_name}^state=completed^ORDERBYDESClast_completed_time

Important Fields:
  - sys_id: Record identifier
  - source_instance: Source instance name
  - target_instance: Target instance name
  - state: completed|failed|in_progress
  - last_completed_time: Completion timestamp
  - sys_created_on: Clone start time
```

**Fallback Table (if sys_clone_history unavailable):**
```
GET /api/now/table/sn_instance_clone_request
Query: target_instance.instance_name={instance_name}^state=Completed^ORDERBYDESCcompleted

Fields:
  - sys_id: Record identifier
  - target_instance: Reference to target instance
  - source_instance: Reference to source instance
  - state: Completed|Failed|In Progress
  - completed: Completion timestamp
  - started: Start timestamp
```

## ServiceNowClient Helper Methods

The `servicenow_api.py` script provides a lightweight client:

```python
from servicenow_api import ServiceNowClient

# Initialize from environment variables
client = ServiceNowClient.from_environment("UAT")

# Get a single record (with field filtering)
record = client.get_record(
    table="sc_cat_item",
    sys_id="abc123",
    fields="sys_id,name,active"
)

# Query table (with field filtering)
results = client.query_table(
    table="sys_clone_history",
    query="target_instance=mobizuat^state=completed",
    limit=1,
    fields="sys_id,last_completed_time"
)

# Get catalog item (convenience wrapper)
item = client.get_catalog_item(
    sys_id="abc123",
    fields="sys_id,name,active,workflow,category"
)

# Post work note to change
client.post_change_comment(
    change_sys_id="abc123",
    comment="Validation complete: PASSED"
)
```

## Performance Best Practices

### 🚀 Fast (< 10 seconds)
1. **Always specify fields**: Use `fields` parameter to limit response size
2. **Limit results**: Use `limit` parameter appropriately
3. **Skip variables**: Don't fetch item_option_new for catalog items with 250+ variables
4. **Use specific queries**: Narrow results with precise encoded queries
5. **Fetch metadata only**: Get only active, name, workflow, category - not full records

### ❌ Slow (timeouts possible)
1. Fetching all fields from large tables
2. Querying item_option_new without limits
3. Deep reference expansions
4. Fetching 250+ variable configurations
5. Not using field filtering

## Error Handling

Common HTTP Status Codes:
- **200**: Success
- **400**: Bad Request (invalid query)
- **401**: Unauthorized (authentication failed)
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found (record doesn't exist)
- **500**: Internal Server Error

The `ServiceNowClient` automatically raises `ServiceNowError` on failures.

## Rate Limiting

ServiceNow may rate limit API requests:
- Respect rate limits (typically 5000 requests/hour)
- Implement exponential backoff on 429 responses
- Use field filtering to reduce response size
- Batch queries when possible

## Critical Patterns for Webhook Validation

**UAT Clone Check (< 1 second):**
```python
# Checks clone freshness via sys_clone_history or fallback table
status = evaluate_clone_status(client, "mobizuat", stale_after_days=30)
# Returns: {target_instance, last_clone_date, days_since_clone, is_stale, status}
```

**Lightweight Catalog Validation (< 10 seconds):**
```python
# Validates only metadata fields (no variables)
result = validate_catalog_item(client, sys_id)
# Returns: {overall_status, checks, duration_seconds, snapshot}
```

**Post Results to Change (< 1 second):**
```python
# Synthesized work note with ReACT intelligence
client.post_change_comment(change_sys_id, synthesized_comment)
```
