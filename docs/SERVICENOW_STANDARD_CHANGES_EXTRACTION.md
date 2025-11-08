# ServiceNow Standard Changes - Extract & Replay

## Overview

This guide documents the process for extracting and replaying Standard Changes from ServiceNow, specifically for "Standard Change for ServiceNow Platform Updates" records.

## Scripts

### 1. Extract Standard Changes (`extract-standard-changes.ts`)

Pulls historical Standard Change records from ServiceNow and exports them in a replayable format.

**Location**: `/scripts/extract-standard-changes.ts`

**What it extracts**:
- Change Request records (`change_request` table)
- State transitions (`change_task` table)
- Component references (`task_ci` table)
- Work notes and comments (`sys_journal_field` table)
- Attachments metadata (`sys_attachment` table)

### 2. Replay Standard Changes (`replay-standard-changes.ts`)

Replays extracted changes into a target ServiceNow environment (dev/test/prod).

**Location**: `/scripts/replay-standard-changes.ts`

**What it replays**:
- Creates new change requests with original field values
- Adds work notes in sequence
- Adds comments in sequence
- Links configuration items (components)
- Preserves as much original data as possible

---

## Prerequisites

### Environment Variables

Add these to your `.env.local`:

```bash
# Source instance (for extraction)
SERVICENOW_URL=https://mobiz.service-now.com
SERVICENOW_USERNAME=your_api_username
SERVICENOW_PASSWORD=your_api_password

# Target instance (for replay) - optional, defaults to source credentials
SERVICENOW_TARGET_URL=https://mobiztest.service-now.com
SERVICENOW_TARGET_USERNAME=your_target_username
SERVICENOW_TARGET_PASSWORD=your_target_password
```

### Required Permissions

Your ServiceNow user must have:
- Read access to `change_request` table
- Read access to `change_task` table
- Read access to `task_ci` table
- Read access to `sys_journal_field` table
- Read access to `sys_attachment` table
- (For replay) Write access to `change_request` and `task_ci` tables

---

## Usage

### Step 1: Extract Standard Changes

```bash
# Extract all Standard Changes for ServiceNow Platform Updates
pnpm run extract:standard-changes
```

**Output**:
- Creates directory: `backup/standard-changes/YYYY-MM-DD/`
- Files created:
  - `change_requests.json` - Raw change request records
  - `state_transitions.json` - State history per change
  - `component_references.json` - CI relationships per change
  - `related_records.json` - Work notes, comments, attachments per change
  - `replayable_payload.json` - Complete bundle for replay
  - `README.md` - Extraction summary and instructions

**Example Output**:
```
📦 Extract Standard Changes for ServiceNow Platform Updates
================================================================================

Configuration:
  Instance: https://mobiz.service-now.com
  Username: api_user

1. Querying Standard Changes
────────────────────────────────────────────────────────────────────────────────
  Fetching from change_request...
    Retrieved 5 records (total: 5)

✅ Found 5 Standard Change(s)

Change Summary:
────────────────────────────────────────────────────────────────────────────────
  CHG0012345
    sys_id: abc123def456
    State: Implement
    Created: 2025-10-15 08:30:00

  ...

✅ Extraction complete!
```

### Step 2: Review Extracted Data

```bash
# Navigate to the output directory
cd backup/standard-changes/2025-11-07/

# View README for extraction summary
cat README.md

# Inspect the replayable payload
cat replayable_payload.json | jq '.'
```

### Step 3: Replay Changes (Dry Run)

```bash
# Preview what would happen (no changes made)
pnpm run replay:standard-changes -- --dry-run

# Preview a specific payload
pnpm run replay:standard-changes -- --dry-run --payload-file=backup/standard-changes/2025-11-07/replayable_payload.json
```

**Example Output**:
```
🔄 Replay Standard Changes Offline
================================================================================

Configuration:
  Payload: backup/standard-changes/2025-11-07/replayable_payload.json
  Dry Run: YES (no changes will be made)

🔍 DRY RUN - Preview
────────────────────────────────────────────────────────────────────────────────

[1/5] Would replay CHG0012345:
  State Transitions: 3
  Component References: 2
  Work Notes: 5
  Comments: 1
  Attachments: 0

...

ℹ️  This was a dry run. No changes were made.
   Remove --dry-run to actually create changes.
```

### Step 4: Replay Changes (Live)

```bash
# Replay to target instance (creates actual changes)
pnpm run replay:standard-changes

# Replay a specific payload
pnpm run replay:standard-changes -- --payload-file=backup/standard-changes/2025-11-07/replayable_payload.json

# Replay from a specific directory
pnpm run replay:standard-changes -- --payload-dir=backup/standard-changes/2025-11-07
```

**Example Output**:
```
🔄 Replay Standard Changes Offline
================================================================================

Target Configuration:
  Instance: https://mobiztest.service-now.com
  Username: api_user

🔄 Starting Replay
────────────────────────────────────────────────────────────────────────────────

[1/5] Replaying CHG0012345...
  Step 1: Extracting field values...
  Step 2: Creating change request...
    ✅ Created change: CHG0099001 (xyz789abc123)
  Step 3: Adding 5 work note(s)...
    ✅ Added work note
    ✅ Added work note
    ...
  Step 4: Adding 1 comment(s)...
    ✅ Added comment
  Step 5: Linking 2 component(s)...
    ✅ Linked component
    ✅ Linked component
  ✅ Successfully replayed CHG0012345 -> CHG0099001

...

📊 REPLAY SUMMARY
────────────────────────────────────────────────────────────────────────────────

Total Changes: 5
Successful: 5
Failed: 0

✅ Replay summary saved: backup/standard-changes/2025-11-07/replay_summary.json
```

---

## File Formats

### Replayable Payload Structure

```json
{
  "metadata": {
    "extracted_at": "2025-11-07T10:30:00.000Z",
    "instance_url": "https://mobiz.service-now.com",
    "query": "short_description=Standard Change for ServiceNow Platform Updates",
    "total_changes": 5
  },
  "changes": [
    {
      "change_request": {
        "sys_id": { "value": "abc123", "display_value": "abc123" },
        "number": { "value": "CHG0012345", "display_value": "CHG0012345" },
        "short_description": { "value": "...", "display_value": "..." },
        "state": { "value": "3", "display_value": "Implement" },
        "type": { "value": "standard", "display_value": "Standard" },
        // ... all other fields
      },
      "state_transitions": [
        {
          "sys_id": "...",
          "from_state": "New",
          "to_state": "Assess",
          "sys_created_on": "2025-10-15T08:30:00"
        }
      ],
      "component_references": [
        {
          "sys_id": "...",
          "ci_item": { "value": "ci_sys_id", "display_value": "Component Name" }
        }
      ],
      "related_records": {
        "work_notes": [...],
        "comments": [...],
        "attachments": [...]
      }
    }
  ]
}
```

---

## Advanced Usage

### Custom Query Filters

Edit `scripts/extract-standard-changes.ts` to modify the query:

```typescript
// Current query
const changeQuery = 'short_description=Standard Change for ServiceNow Platform Updates';

// Custom examples:
const changeQuery = 'short_descriptionLIKEPlatform^state=3';  // Platform changes in Implement state
const changeQuery = 'typeINstandard,normal^sys_created_on>=2025-01-01';  // Changes since Jan 1
```

### Extracting Specific Fields

The scripts use `sysparm_display_value=all` to preserve both internal values and display values. To extract specific fields only:

```typescript
const url = `${baseUrl}/api/now/table/${table}?sysparm_query=${query}&sysparm_fields=sys_id,number,state,short_description&sysparm_display_value=all`;
```

### Pagination Control

Adjust the `limit` parameter in `fetchAllRecords()`:

```typescript
// Default: 1000 records per request
await fetchAllRecords<T>(instanceUrl, authHeader, 'change_request', query, 1000);

// Smaller batches for slower connections
await fetchAllRecords<T>(instanceUrl, authHeader, 'change_request', query, 100);
```

---

## Troubleshooting

### Issue: "Failed to query change_request: 401"

**Cause**: Authentication failed

**Solution**:
- Verify `SERVICENOW_USERNAME` and `SERVICENOW_PASSWORD` in `.env.local`
- Check if user account is active
- Confirm user has API access enabled

### Issue: "Found 0 Standard Change(s)"

**Cause**: No records match the query

**Solution**:
- Verify the query in ServiceNow UI first:
  - Navigate to: Change > All Changes
  - Apply filter: `short_description=Standard Change for ServiceNow Platform Updates`
  - Check if any records appear
- Adjust the query in the script if needed

### Issue: "Failed to create change request: No sys_id returned"

**Cause**: User lacks write permissions on target instance

**Solution**:
- Verify `SERVICENOW_TARGET_USERNAME` has `itil` role
- Check ACLs on `change_request` table
- Ensure mandatory fields are populated

### Issue: Rate limiting / timeout errors

**Cause**: Too many requests or slow ServiceNow response

**Solution**:
- Reduce pagination limit: `fetchAllRecords(..., ..., ..., 100)`
- Add delay between requests:
  ```typescript
  await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
  ```

---

## Best Practices

### Extraction

1. **Run during off-peak hours** - Minimize impact on production instance
2. **Test with small queries first** - Add date filters to limit results
3. **Backup output directory** - Copy `backup/standard-changes/` to external storage
4. **Version control payloads** - Store in Git LFS for historical tracking
5. **Document extraction context** - Note why extraction was done and what changes were included

### Replay

1. **Always dry-run first** - Preview changes before applying
2. **Test in dev environment** - Validate replay logic before production
3. **Review field mappings** - Ensure source/target instances have matching fields
4. **Check component references** - Verify CIs exist in target instance
5. **Monitor for errors** - Review `replay_summary.json` for failed changes
6. **Update references** - Map old sys_ids to new sys_ids for subsequent operations

### Security

1. **Never commit credentials** - Keep `.env.local` in `.gitignore`
2. **Use service accounts** - Don't use personal credentials for API access
3. **Rotate passwords regularly** - ServiceNow best practice
4. **Audit API usage** - Track who runs extraction/replay and when
5. **Limit payload access** - Payloads may contain sensitive change data

---

## Architecture

### Extraction Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Query change_request table                                   │
│    Filter: short_description=Standard Change for...             │
│    Pagination: Auto-handled, 1000 records per request           │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. For each change, extract related data:                       │
│    - State transitions (change_task)                            │
│    - Component refs (task_ci)                                   │
│    - Work notes (sys_journal_field, element=work_notes)         │
│    - Comments (sys_journal_field, element=comments)             │
│    - Attachments (sys_attachment)                               │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Bundle into replayable_payload.json                          │
│    - Preserve display_value and value formats                   │
│    - Maintain referential integrity (sys_ids)                   │
│    - Include extraction metadata                                │
└─────────────────────────────────────────────────────────────────┘
```

### Replay Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Load replayable_payload.json                                 │
│    - Parse JSON                                                 │
│    - Validate structure                                         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. For each change:                                             │
│    a. Extract field values (handle nested objects)              │
│    b. POST to /api/now/table/change_request                     │
│    c. Capture new sys_id                                        │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Add related records:                                         │
│    - PATCH work_notes to change                                 │
│    - PATCH comments to change                                   │
│    - POST component links to task_ci                            │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Generate replay_summary.json                                 │
│    - Track successes/failures                                   │
│    - Map original sys_ids to new sys_ids                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## ServiceNow API Reference

### Table API

**Base URL**: `https://{instance}.service-now.com/api/now/table/{table_name}`

**Headers**:
- `Authorization`: Basic {base64(username:password)}
- `Content-Type`: application/json
- `Accept`: application/json

**Query Parameters**:
- `sysparm_query`: Encoded query string
- `sysparm_limit`: Max records per request (default 10000)
- `sysparm_offset`: Pagination offset
- `sysparm_display_value`: `true|false|all` (all returns both formats)
- `sysparm_fields`: Comma-separated field list
- `sysparm_exclude_reference_link`: `true|false`

**Methods**:
- `GET` - Query records
- `POST` - Create record
- `PATCH` - Update record
- `PUT` - Replace record
- `DELETE` - Delete record

### Useful Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `change_request` | Change records | sys_id, number, state, type, short_description |
| `change_task` | Change tasks | change_request, state, assignment_group |
| `task_ci` | Task-CI relationships | task, ci_item |
| `sys_journal_field` | Work notes/comments | element_id, element, value |
| `sys_attachment` | Attachment metadata | table_sys_id, file_name, size_bytes |
| `sys_audit` | Audit trail | tablename, documentkey, fieldname, oldvalue, newvalue |

### Query Operators

- `=` - Equals
- `!=` - Not equals
- `LIKE` - Contains (case-insensitive)
- `IN` - In list
- `>`, `>=`, `<`, `<=` - Comparison
- `^` - AND
- `^OR` - OR
- `^NQ` - New query (parentheses)

**Examples**:
```
short_description=Standard Change for ServiceNow Platform Updates
short_descriptionLIKEPlatform^state=3
typeINstandard,normal^sys_created_on>=2025-01-01
state!=5^state!=7^type=standard
```

---

## Integration with Existing Codebase

### Related Files

- `/lib/tools/servicenow.ts` - Main ServiceNow tools integration
- `/lib/schemas/servicenow-change-webhook.ts` - Change webhook schemas
- `/scripts/extract-servicenow-reference-data.ts` - Reference data extraction pattern
- `/scripts/backfill-interactions-to-servicenow.ts` - Example of ServiceNow writes

### Reusing Extraction Patterns

The extraction logic can be adapted for other ServiceNow tables:

```typescript
// Extract incidents
const incidents = await fetchAllRecords<IncidentRecord>(
  instanceUrl,
  authHeader,
  'incident',
  'active=true^priority=1'
);

// Extract CMDB CIs
const cis = await fetchAllRecords<ConfigurationItem>(
  instanceUrl,
  authHeader,
  'cmdb_ci',
  'operational_status=1'
);
```

### Webhook Integration

The change validation webhook (`/api/servicenow-change-webhook.ts`) could be enhanced to validate against extracted historical data:

```typescript
import historicalChanges from '../backup/standard-changes/latest/replayable_payload.json';

// In webhook handler
const similarChanges = historicalChanges.changes.filter(c =>
  c.change_request.component_type === incomingPayload.component_type
);

// Validate against historical patterns
```

---

## Maintenance

### Script Updates

Both scripts follow ServiceNow best practices and should be maintained as follows:

**When to update**:
- ServiceNow instance upgrade changes API behavior
- New required fields added to change_request table
- Additional related tables need extraction
- Performance optimization needed for large datasets

**Testing updates**:
1. Test against ServiceNow Personal Developer Instance (PDI)
2. Validate with small dataset first (`sysparm_limit=10`)
3. Compare output format with previous extractions
4. Verify replay functionality with dry-run

### Monitoring

Track script usage and health:

```bash
# Log extraction runs
echo "$(date) - Extracted ${total_changes} changes" >> logs/extraction.log

# Monitor payload sizes
du -sh backup/standard-changes/*/

# Check for errors in replay
grep "Failed" backup/standard-changes/*/replay_summary.json
```

---

## FAQ

**Q: Can I extract changes from multiple instances?**

A: Yes, run the extraction script multiple times with different credentials. Set `SERVICENOW_URL`, `SERVICENOW_USERNAME`, `SERVICENOW_PASSWORD` before each run.

**Q: How do I extract only recent changes?**

A: Modify the query:
```typescript
const changeQuery = 'short_description=Standard Change for ServiceNow Platform Updates^sys_created_on>=2025-10-01';
```

**Q: Can I replay to the same instance I extracted from?**

A: Yes, but be aware you'll create duplicate changes. Use target credentials:
```bash
SERVICENOW_TARGET_URL=https://mobiz.service-now.com
```

**Q: How do I handle attachments?**

A: The current scripts extract attachment metadata only. To download actual files:
```typescript
const downloadUrl = `${instanceUrl}/api/now/attachment/${attachmentSysId}/file`;
const fileResponse = await fetchWithAuth(downloadUrl, authHeader);
const fileBuffer = await fileResponse.arrayBuffer();
fs.writeFileSync(`attachments/${fileName}`, Buffer.from(fileBuffer));
```

**Q: Can I schedule automatic extractions?**

A: Yes, use cron or CI/CD:
```bash
# crontab entry (daily at 2 AM)
0 2 * * * cd /path/to/project && pnpm run extract:standard-changes >> logs/extraction.log 2>&1
```

**Q: How do I validate extracted data integrity?**

A: Compare field counts:
```typescript
// In ServiceNow, count changes
const uiCount = /* manual count from UI */;

// Compare with extraction
const extraction = JSON.parse(fs.readFileSync('backup/.../replayable_payload.json'));
console.assert(extraction.metadata.total_changes === uiCount);
```

---

## Support

For issues or questions:
1. Check ServiceNow API documentation: https://developer.servicenow.com/dev.do
2. Review ServiceNow instance logs: System Logs > System Log > All
3. Check script output for specific error messages
4. Verify credentials and permissions in ServiceNow User Administration
5. Contact ServiceNow support for API-related issues

---

## Change Log

- **2025-11-07**: Initial version
  - Extract standard changes with full related records
  - Replay functionality with dry-run mode
  - Comprehensive error handling and pagination
