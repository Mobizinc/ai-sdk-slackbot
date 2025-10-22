# Interaction Parent Field Fix

## Problem Summary

**Issue:** Programmatically created interactions (IMS0001476-IMS0001484) were NOT appearing in the case's related interactions list in ServiceNow UI, even though they had all required data.

**Root Cause:** The interactions were setting `context_document` and `context_table` fields, but these fields are for **metadata only** and do NOT create the UI relationship that makes interactions appear in the case's related list.

## Solution

### The Missing Field: `parent`

The **`parent`** field is the critical field that establishes the parent-child relationship between a case and an interaction, making the interaction visible in the case's related list in the ServiceNow UI.

**Field Comparison:**

| Field | Working Interaction (IMS0001458) | Non-Working (IMS0001476) |
|-------|----------------------------------|--------------------------|
| `parent` | ✓ Case sys_id | ✗ NULL |
| `context_document` | NULL | Case sys_id |
| `context_table` | NULL | `x_mobit_serv_case_service_case` |

### What Each Field Does:

- **`parent`**: Creates the **UI relationship** - makes the interaction appear in the case's related interactions list
- **`context_document`**: Metadata field for record linking context (does NOT create UI relationship)
- **`context_table`**: Specifies the table name for the context document (metadata only)
- **`channel_metadata_document`**: Alternative metadata field for channel-specific linking
- **`channel_metadata_table`**: Table name for channel metadata

## Implementation

### Code Changes

**File:** `/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/lib/tools/servicenow.ts`

**Method:** `createPhoneInteraction()`

**Change:** Added `parent` field to the interaction payload:

```typescript
const payload: Record<string, any> = {
  // ... existing fields ...

  // CRITICAL: Link to parent case using the 'parent' field
  // This is THE field that makes interactions appear in the case's related list!
  parent: input.caseSysId, // Direct reference to the case record

  // Context fields for metadata (do NOT create UI relationship)
  context_table: config.caseTable,
  context_document: input.caseSysId,

  // ... remaining fields ...
};
```

### Testing Results

**Test Interaction:** IMS0001493

```
✓ Parent field correctly set to case sys_id
✓ Interaction appears in case's related list
✓ Visible in ServiceNow UI on case form
```

### Backfill Results

**Backfilled Interactions:** 25 existing interactions

```
Total interactions processed: 25
✓ Successfully updated: 25
✗ Failed: 0
```

All previously created interactions now have the `parent` field set and should appear in their respective case related lists.

## Verification

### How to Verify in ServiceNow UI:

1. Open a case in ServiceNow (e.g., SCS0049247)
2. Navigate to the **Interactions** tab or related list
3. Confirm that all programmatically created interactions appear in the list

### API Verification:

Query interactions linked to a case:

```bash
GET /api/now/table/interaction?sysparm_query=parent={case_sys_id}
```

This query will return all interactions where the `parent` field references the specified case.

## Impact

### Before Fix:
- 25 interactions created but not visible in case UI
- Users couldn't see interaction history on cases
- Interactions existed but were orphaned from UI perspective

### After Fix:
- All new interactions automatically linked to cases
- All existing interactions backfilled with parent field
- Complete interaction history visible on case forms
- Proper parent-child relationship established

## Scripts Created

1. **`diagnose-interaction-linkage.ts`**: Comprehensive diagnostic script to analyze interaction schema and relationships
2. **`compare-interactions.ts`**: Compares working vs non-working interactions
3. **`fix-interaction-parent.ts`**: Test script to fix individual interactions
4. **`test-interaction-with-parent-fix.ts`**: End-to-end test of the fix
5. **`backfill-interaction-parent-field.ts`**: Backfill script for existing interactions (with dry-run mode)

## Key Learnings

### ServiceNow Interaction Schema:

1. **Parent Relationship**: Use `parent` field for UI-visible relationships
2. **Context Fields**: Use for metadata/auditing, not for UI relationships
3. **Related Lists**: Driven by reference fields like `parent`, not context fields
4. **Query Strategy**: Query by `parent` field to get case-related interactions

### Best Practices:

1. Always set `parent` field when creating child records
2. Use context fields for additional metadata
3. Test UI visibility when creating programmatic relationships
4. Verify field purposes in ServiceNow documentation before implementation

## Future Considerations

### Prevention:
- Add validation to ensure `parent` field is set when creating interactions
- Add automated tests that verify UI relationships, not just record creation
- Document field purposes in code comments

### Monitoring:
- Add logging for interaction creation with parent field verification
- Create alerts for interactions without parent field
- Regular audits to ensure all interactions are properly linked

## References

- ServiceNow Interaction Table: `interaction`
- Case Table: `x_mobit_serv_case_service_case`
- ServiceNow Table API: `/api/now/table/{table_name}`
- Parent Field Type: Reference (to task table and its child tables)

## Related Issues

This fix resolves the following:
- Interactions not appearing in case UI
- Missing interaction history on cases
- Orphaned interaction records
- Incomplete customer interaction tracking
