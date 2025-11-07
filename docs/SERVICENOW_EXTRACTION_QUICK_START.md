# ServiceNow Standard Changes - Quick Start

## 1-Minute Setup

### Extract Changes

```bash
# Extract all Standard Changes
pnpm run extract:standard-changes
```

Output: `backup/standard-changes/YYYY-MM-DD/replayable_payload.json`

### Preview Replay (Dry Run)

```bash
# Preview without making changes
pnpm run replay:standard-changes -- --dry-run
```

### Replay to Target Instance

```bash
# Actually create changes in target instance
pnpm run replay:standard-changes
```

---

## What Gets Extracted

For each "Standard Change for ServiceNow Platform Updates":

- ✅ Change Request (all fields)
- ✅ State transitions
- ✅ Component references
- ✅ Work notes
- ✅ Comments
- ✅ Attachments metadata

---

## File Structure

```
backup/standard-changes/2025-11-07/
├── change_requests.json          # Raw changes
├── state_transitions.json        # State history
├── component_references.json     # CI links
├── related_records.json          # Notes/comments
├── replayable_payload.json       # Complete bundle
├── replay_summary.json           # Replay results
└── README.md                     # Extraction summary
```

---

## Common Commands

```bash
# Extract from production
pnpm run extract:standard-changes

# Preview replay
pnpm run replay:standard-changes -- --dry-run

# Replay specific payload
pnpm run replay:standard-changes -- --payload-file=backup/standard-changes/2025-11-07/replayable_payload.json

# Replay to specific instance
SERVICENOW_TARGET_URL=https://mobiztest.service-now.com pnpm run replay:standard-changes
```

---

## Environment Variables

`.env.local`:

```bash
# Source (extraction)
SERVICENOW_URL=https://mobiz.service-now.com
SERVICENOW_USERNAME=api_user
SERVICENOW_PASSWORD=your_password

# Target (replay) - optional
SERVICENOW_TARGET_URL=https://mobiztest.service-now.com
SERVICENOW_TARGET_USERNAME=api_user
SERVICENOW_TARGET_PASSWORD=your_password
```

---

## Query Customization

Edit `scripts/extract-standard-changes.ts`:

```typescript
// Current query
const changeQuery = 'short_description=Standard Change for ServiceNow Platform Updates';

// Custom examples:
const changeQuery = 'short_descriptionLIKEPlatform^state=3';
const changeQuery = 'sys_created_on>=2025-10-01';
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Check credentials in `.env.local` |
| Found 0 changes | Verify query in ServiceNow UI first |
| Timeout | Reduce pagination limit in code |
| Permission denied | Ensure user has `itil` role |

---

## Full Documentation

See [SERVICENOW_STANDARD_CHANGES_EXTRACTION.md](./SERVICENOW_STANDARD_CHANGES_EXTRACTION.md) for:
- Architecture details
- Advanced usage
- API reference
- Best practices
- Integration examples
