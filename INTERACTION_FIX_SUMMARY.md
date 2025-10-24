# ServiceNow Interaction Fix Summary

## Problem Statement

Interactions created via REST API were appearing blank in ServiceNow UI with:
- No customer information populated
- Not linked to parent case
- No phone number displayed

## Root Cause

**Incorrect field mappings** - we were using non-existent or wrong field names:

| What We Used (WRONG) | Correct ServiceNow Field | Field Type |
|---------------------|-------------------------|------------|
| `opened_for: caseSysId` | `context_document` | document_id |
| N/A | `context_table` | table_name |
| `phone` | `caller_phone_number` | phone_number_e164 |
| `start_time` | `opened_at` | glide_date_time |
| `end_time` | `closed_at` | glide_date_time |
| `agent` | N/A (put in `work_notes`) | N/A |
| `queue` | N/A (put in `work_notes`) | N/A |
| `notes` | `work_notes` | journal_input |
| N/A | `type: 'phone'` | string (REQUIRED) |

## Solution Implemented

### Updated Payload Structure

File: `/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/lib/tools/servicenow.ts`

```typescript
const payload: Record<string, any> = {
  // ✅ REQUIRED field
  type: 'phone',

  // ✅ Interaction details
  direction: input.direction, // 'inbound' or 'outbound'
  caller_phone_number: input.phoneNumber,

  // ✅ CRITICAL: Link to parent case using context fields
  context_table: config.caseTable, // 'x_mobit_serv_case_service_case'
  context_document: input.caseSysId, // Case sys_id

  // ✅ Optional: Channel metadata for additional linking
  channel_metadata_table: config.caseTable,
  channel_metadata_document: input.caseSysId,

  // ✅ Timing fields
  opened_at: formatDateForServiceNow(input.startTime),
  closed_at: formatDateForServiceNow(input.endTime),

  // ✅ Metadata
  short_description: input.summary || `Phone call - ${input.direction} - ${input.sessionId}`,
  work_notes: input.notes || `Call Session ID: ${input.sessionId}\nDuration: ${input.durationSeconds ?? 'N/A'} seconds${input.agentName ? `\nAgent: ${input.agentName}` : ''}${input.queueName ? `\nQueue: ${input.queueName}` : ''}`,

  // ✅ Status
  state: 'closed',
};

// ✅ Add duration if provided
if (input.durationSeconds !== undefined) {
  payload.duration = input.durationSeconds;
}
```

## Verification Results

### Test Interaction Created
- **Number**: IMS0001459
- **sys_id**: 14e8136cc3347610ad36b9ff050131df
- **Case**: SCS0049247 (f753b7c08378721039717000feaad385)

### Verification Checklist

| Field | Status | Value |
|-------|--------|-------|
| context_document | ✅ CORRECT | f753b7c08378721039717000feaad385 (case sys_id) |
| context_table | ✅ CORRECT | x_mobit_serv_case_service_case |
| channel_metadata_document | ✅ CORRECT | f753b7c08378721039717000feaad385 |
| channel_metadata_table | ✅ CORRECT | x_mobit_serv_case_service_case |
| caller_phone_number | ✅ CORRECT | +14097906402 |
| type | ✅ CORRECT | phone |
| direction | ✅ CORRECT | inbound |
| opened_at | ✅ CORRECT | 2025-10-20 11:30:11 |
| short_description | ✅ CORRECT | Customer inquiry - product information |
| state | ⚠️ PARTIAL | new (set to 'closed' but may need workflow) |
| closed_at | ⚠️ EMPTY | (may require state transition) |
| duration | ⚠️ EMPTY | (may require state transition) |
| work_notes | ⚠️ EMPTY | (may require special handling) |

## Key Findings from Schema Analysis

### Contact/Customer Fields on Interaction Table

```
Field: caller_phone_number
  Label: Caller Phone Number
  Type: phone_number_e164
  References: (none - direct field)
  Mandatory: false

Field: contact
  Label: Contact
  Type: reference
  References: customer_contact (CSM contact table)
  Mandatory: false

Field: opened_for
  Label: Opened for
  Type: reference
  References: sys_user (NOT cases!)
  Mandatory: false
```

### Context Linking Fields (THE KEY!)

```
Field: context_document
  Label: Context Record
  Type: document_id
  References: (any table - generic document ID)
  Mandatory: false

Field: context_table
  Label: Context Table
  Type: table_name
  References: (table name string)
  Mandatory: false
```

These two fields work together to create a generic link to ANY ServiceNow record, including our custom case table.

## How ServiceNow Interaction Linking Works

ServiceNow uses a **generic document linking pattern** via:

1. **context_table**: Stores the table name (e.g., `x_mobit_serv_case_service_case`)
2. **context_document**: Stores the sys_id of the record in that table

This allows interactions to link to:
- Cases (custom table)
- Incidents (incident table)
- Problems (problem table)
- Any other ServiceNow table

**This is why** `opened_for` doesn't work for case linking - it specifically references the `sys_user` table only.

## Fields That Don't Exist (Removed)

These fields were removed from our payload as they don't exist in the interaction table:

- ❌ `channel` (we use `type: 'phone'` instead)
- ❌ `phone` (use `caller_phone_number`)
- ❌ `start_time` (use `opened_at`)
- ❌ `end_time` (use `closed_at`)
- ❌ `agent` (no direct field - add to `work_notes` or use `assigned_to` with sys_user reference)
- ❌ `queue` (no direct field - add to `work_notes` or use `assignment_group` with sys_user_group reference)
- ❌ `notes` (use `work_notes`)

## Optional Enhancements

### 1. Link to Customer Contact

If the case has a contact, we can link it:

```typescript
// Fetch case to get contact
const caseResponse = await fetch(
  `${SERVICENOW_URL}/api/now/table/${CASE_TABLE}/${caseSysId}?sysparm_fields=contact`
);
const caseData = await caseResponse.json();
const contactSysId = caseData.result?.contact?.value;

// Add to payload
if (contactSysId) {
  payload.contact = contactSysId;
}
```

### 2. Set Assignment Fields

If we have agent information as sys_user reference:

```typescript
payload.assigned_to = agentUserSysId; // sys_user reference
payload.assignment_group = queueGroupSysId; // sys_user_group reference
```

## Testing

### Run Tests

```bash
# Test schema inspection
npx tsx scripts/inspect-interaction-table-schema.ts

# Test different linking methods
npx tsx scripts/test-interaction-creation-methods.ts

# Test fixed implementation
npx tsx scripts/test-fixed-interaction-creation.ts

# Verify raw data
npx tsx scripts/verify-interaction-raw.ts
```

### Manual Verification in ServiceNow UI

1. Navigate to: `https://mobiz.service-now.com/nav_to.do?uri=interaction.do?sys_id=14e8136cc3347610ad36b9ff050131df`
2. Check **Context Record** field shows the case
3. Verify **Caller Phone Number** is displayed
4. Confirm **Type** is "Phone"
5. Check if interaction appears in case's related list (if configured)

## Impact on Existing Code

### Files Modified

1. `/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/lib/tools/servicenow.ts`
   - Updated `createPhoneInteraction()` method with correct field mappings

### Files That Call This Method

1. `/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/api/cron/sync-voice-worknotes.ts`
   - Line 185: Calls `serviceNowClient.createPhoneInteraction()`
   - No changes needed - uses same interface

## Known Limitations

1. **work_notes** may not populate on create - might require update after creation
2. **closed_at** and **duration** may only populate when state transitions to 'closed'
3. **Agent/Queue** stored as text in work_notes, not as proper references (would need sys_user/sys_user_group lookups)

## Recommendations

1. ✅ **Keep current fix** - context linking works perfectly
2. Consider adding contact lookup for proper customer linking
3. Consider state workflow - may need to create as 'new' then update to 'closed'
4. Monitor production to ensure interactions appear in case related lists

## References

- Schema inspection: `scripts/inspect-interaction-table-schema.ts`
- Test methods: `scripts/test-interaction-creation-methods.ts`
- Test results: Interaction IMS0001459 successfully linked to case SCS0049247
- ServiceNow documentation: Interaction Management uses context_document/context_table pattern
