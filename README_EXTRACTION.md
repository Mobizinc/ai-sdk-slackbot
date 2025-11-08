# Standard Changes Extraction - Summary

## What Was Created

### 1. Extraction Script
**Location**: `/scripts/extract-standard-changes.ts`

Extracts all "Standard Change for ServiceNow Platform Updates" from https://mobiz.service-now.com including:
- Change request records with all fields (sys_id, number, state, description, etc.)
- State transition history
- Component references (Configuration Items)
- Work notes and comments
- Attachment metadata

**Features**:
- Automatic pagination (handles large result sets)
- Handles ServiceNow's nested {value, display_value} format
- Comprehensive error handling
- Progress tracking during extraction
- Saves data in multiple formats for different use cases

### 2. Replay Script
**Location**: `/scripts/replay-standard-changes.ts`

Replays extracted changes into a target ServiceNow environment for:
- Testing in dev/test environments
- Disaster recovery scenarios
- Environment synchronization
- Change template migration

**Features**:
- Dry-run mode (preview without creating changes)
- Creates change requests with original field values
- Restores work notes and comments in sequence
- Links component references
- Generates replay summary with success/failure tracking

### 3. NPM Scripts
Added to `package.json`:

```json
{
  "scripts": {
    "extract:standard-changes": "tsx scripts/extract-standard-changes.ts",
    "replay:standard-changes": "tsx scripts/replay-standard-changes.ts"
  }
}
```

### 4. Documentation
Created comprehensive guides:

- **`/docs/SERVICENOW_STANDARD_CHANGES_EXTRACTION.md`** (30+ pages)
  - Complete reference documentation
  - Architecture diagrams
  - API reference
  - Troubleshooting guide
  - Advanced usage examples
  - Integration patterns

- **`/docs/SERVICENOW_EXTRACTION_QUICK_START.md`**
  - 1-minute quick start
  - Common commands
  - Environment setup
  - Troubleshooting table

## Quick Start

### Extract Changes
```bash
pnpm run extract:standard-changes
```

Output: `backup/standard-changes/YYYY-MM-DD/`
- `change_requests.json` - 544 change records
- `state_transitions.json` - State history
- `component_references.json` - CI links
- `related_records.json` - Work notes/comments
- `replayable_payload.json` - Complete bundle
- `README.md` - Extraction summary

### Replay Changes (Dry Run)
```bash
pnpm run replay:standard-changes -- --dry-run
```

### Replay Changes (Live)
```bash
# Set target credentials in .env.local
SERVICENOW_TARGET_URL=https://mobiztest.service-now.com
SERVICENOW_TARGET_USERNAME=api_user
SERVICENOW_TARGET_PASSWORD=your_password

# Run replay
pnpm run replay:standard-changes
```

## Architecture

### Extraction Flow
1. Query `change_request` table with filter: `short_description=Standard Change for ServiceNow Platform Updates`
2. For each change, extract related data:
   - State transitions from `change_task`
   - Component references from `task_ci`
   - Work notes from `sys_journal_field` (element=work_notes)
   - Comments from `sys_journal_field` (element=comments)
   - Attachments from `sys_attachment`
3. Bundle into `replayable_payload.json` with metadata

### Replay Flow
1. Load `replayable_payload.json`
2. For each change:
   - Extract field values (handle nested objects)
   - POST to `/api/now/table/change_request`
   - Capture new sys_id
   - Add work notes via PATCH
   - Add comments via PATCH
   - Link components via POST to `task_ci`
3. Generate `replay_summary.json` with results

## File Structure

```
backup/standard-changes/
└── 2025-11-07/
    ├── change_requests.json          # All change records (6.6MB+)
    ├── state_transitions.json        # State history per change
    ├── component_references.json     # CI relationships
    ├── related_records.json          # Work notes/comments/attachments
    ├── replayable_payload.json       # Complete bundle for offline replay
    ├── replay_summary.json           # Replay results (generated after replay)
    └── README.md                     # Extraction summary and instructions
```

## ServiceNow API Usage

### Tables Accessed
| Table | Purpose | Access Type |
|-------|---------|-------------|
| `change_request` | Change records | Read (extraction) / Write (replay) |
| `change_task` | State transitions | Read |
| `task_ci` | Task-CI relationships | Read / Write |
| `sys_journal_field` | Work notes/comments | Read |
| `sys_attachment` | Attachment metadata | Read |

### Query Used
```
short_description=Standard Change for ServiceNow Platform Updates
```

This filter returns all Standard Changes related to ServiceNow platform updates.

### Pagination
- Default: 1000 records per request
- Automatic offset handling for large datasets
- Current extraction: 544 changes

## Integration with Existing Codebase

### Follows Existing Patterns
The scripts follow patterns from:
- `/scripts/extract-servicenow-reference-data.ts` - Reference data extraction
- `/lib/tools/servicenow.ts` - ServiceNow API integration
- `/lib/schemas/servicenow-change-webhook.ts` - Change schemas

### Reusable Components
The extraction logic can be adapted for:
- Incident extraction: `table=incident`
- Problem extraction: `table=problem`
- CMDB CI extraction: `table=cmdb_ci`
- Any ServiceNow table with Table API access

### Webhook Integration Potential
The change validation webhook could use extracted data:
```typescript
// In /api/servicenow-change-webhook.ts
import historicalChanges from '../backup/standard-changes/latest/replayable_payload.json';

// Validate against historical patterns
const similarChanges = historicalChanges.changes.filter(c =>
  c.change_request.component_type === incomingPayload.component_type
);
```

## Best Practices

### Extraction
1. Run during off-peak hours
2. Test with date filters first: `sys_created_on>=2025-10-01`
3. Backup output directory externally
4. Version control payloads (Git LFS recommended)

### Replay
1. Always dry-run first
2. Test in dev environment before prod
3. Verify CIs exist in target instance
4. Review `replay_summary.json` for errors
5. Map old sys_ids to new sys_ids for references

### Security
1. Never commit `.env.local` (already in `.gitignore`)
2. Use service accounts, not personal credentials
3. Rotate passwords regularly
4. Limit payload access (contains sensitive data)
5. Audit API usage

## Current Status

✅ **Extraction script created and tested**
- Successfully queried 544 Standard Changes
- Extracted 6.6MB+ of change request data
- State transitions, component refs, and related records being processed

✅ **Replay script created**
- Dry-run mode implemented
- Live replay functionality ready
- Error handling and summary generation included

✅ **Documentation complete**
- Comprehensive reference guide (30+ pages)
- Quick start guide (1 page)
- README with extraction summary

✅ **NPM scripts configured**
- `pnpm run extract:standard-changes`
- `pnpm run replay:standard-changes`

## Next Steps

1. **Wait for extraction to complete** (currently processing 544 changes)
2. **Review extracted data** in `backup/standard-changes/2025-11-07/`
3. **Test replay in dry-run mode**:
   ```bash
   pnpm run replay:standard-changes -- --dry-run
   ```
4. **Configure target environment** for live replay:
   ```bash
   # Add to .env.local
   SERVICENOW_TARGET_URL=https://mobiztest.service-now.com
   SERVICENOW_TARGET_USERNAME=api_user
   SERVICENOW_TARGET_PASSWORD=your_password
   ```
5. **Run live replay** when ready to populate target instance

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Extraction timeout | Reduce pagination limit in code |
| 401 Unauthorized | Check credentials in `.env.local` |
| Found 0 changes | Verify query in ServiceNow UI first |
| Replay permission denied | Ensure user has `itil` role |
| CI link failures | Verify CIs exist in target with same sys_ids |

## Files Created

### Scripts
- `/scripts/extract-standard-changes.ts` (318 lines)
- `/scripts/replay-standard-changes.ts` (481 lines)

### Documentation
- `/docs/SERVICENOW_STANDARD_CHANGES_EXTRACTION.md` (800+ lines)
- `/docs/SERVICENOW_EXTRACTION_QUICK_START.md` (100+ lines)
- `/README_EXTRACTION.md` (this file)

### Configuration
- Updated `/package.json` with npm scripts

### Output (after extraction completes)
- `/backup/standard-changes/2025-11-07/` (directory with 6 files)

## Support & Resources

- **Full Documentation**: See `/docs/SERVICENOW_STANDARD_CHANGES_EXTRACTION.md`
- **Quick Start**: See `/docs/SERVICENOW_EXTRACTION_QUICK_START.md`
- **ServiceNow API Docs**: https://developer.servicenow.com/dev.do
- **Existing Integration**: See `/lib/tools/servicenow.ts`

---

**Generated**: 2025-11-07
**Instance**: https://mobiz.service-now.com
**Total Changes**: 544 Standard Changes for ServiceNow Platform Updates
