# ServiceNow Interaction Contact/Account Population Fix

## Problem Statement

When creating ServiceNow interaction records for Webex voice calls, the `customer` and `contact` fields were not being populated, even though the interaction was properly linked to a case that had these fields populated.

### Original Issue
- Interaction IMS0001462 created successfully
- `context_document` linked to case SCS0049247 ✅
- `caller_phone_number` populated ✅
- **Customer field: BLANK** ❌
- **Contact field: BLANK** ❌

## Root Cause Analysis

### Investigation Findings

1. **No `customer` field exists on interaction table**
   - The interaction table has a `contact` field (reference to `customer_contact` table)
   - The interaction table has an `account` field (reference to `customer_account` table)
   - There is NO `customer` field on the interaction table

2. **Fields do NOT auto-populate**
   - ServiceNow does not automatically copy `contact` and `account` from the linked case
   - These fields must be explicitly set in the POST payload

3. **Invalid state value**
   - Original code used `state: 'closed'` which is invalid
   - Valid state for completed calls is `'closed_complete'`
   - This caused interactions to default to `state: 'new'`

4. **Missing fields in `ServiceNowCaseResult` interface**
   - The `getCaseBySysId()` method didn't return `contact` or `account` fields
   - These fields were not included in the interface definition

## Solution Implementation

### Changes Made

#### 1. Added Helper Function to Extract Reference Sys IDs
**File:** `/lib/tools/servicenow.ts`

```typescript
/**
 * Extract reference sys_id from ServiceNow reference field
 * Reference fields return as { value: "sys_id", display_value: "name", link: "url" }
 */
function extractReferenceSysId(field: any): string | undefined {
  if (!field) return undefined;
  if (typeof field === "string") return field; // Already a sys_id
  if (typeof field === "object" && field.value) return field.value; // Extract sys_id from reference
  return undefined;
}
```

#### 2. Updated `ServiceNowCaseResult` Interface
**File:** `/lib/tools/servicenow.ts`

```typescript
export interface ServiceNowCaseResult {
  sys_id: string;
  number: string;
  short_description?: string;
  description?: string;
  priority?: string;
  state?: string;
  category?: string;
  subcategory?: string;
  opened_at?: string;
  assignment_group?: string;
  assigned_to?: string;
  opened_by?: string;
  caller_id?: string;
  submitted_by?: string;
  contact?: string; // Reference to customer_contact table (sys_id) - ADDED
  account?: string; // Reference to customer_account table (sys_id) - ADDED
  url?: string;
}
```

#### 3. Updated `getCaseBySysId()` Method
**File:** `/lib/tools/servicenow.ts`

```typescript
return {
  sys_id: extractDisplayValue(raw.sys_id),
  number: extractDisplayValue(raw.number),
  // ... other fields ...
  contact: extractReferenceSysId(raw.contact), // ADDED - Extract contact sys_id
  account: extractReferenceSysId(raw.account), // ADDED - Extract account sys_id
  url: `${config.instanceUrl}/nav_to.do?uri=${table}.do?sys_id=${extractDisplayValue(raw.sys_id)}`,
};
```

#### 4. Updated `createPhoneInteraction()` Method
**File:** `/lib/tools/servicenow.ts`

```typescript
public async createPhoneInteraction(input: {...}): Promise<{...}> {
  const table = "interaction";
  const endpoint = `/api/now/table/${table}`;

  // Fetch case to get contact and account references - ADDED
  const caseData = await this.getCaseBySysId(input.caseSysId);
  if (!caseData) {
    throw new Error(`Case not found: ${input.caseNumber} (${input.caseSysId})`);
  }

  const payload: Record<string, any> = {
    type: 'phone',
    direction: input.direction,
    caller_phone_number: input.phoneNumber,
    context_table: config.caseTable,
    context_document: input.caseSysId,
    channel_metadata_table: config.caseTable,
    channel_metadata_document: input.caseSysId,

    // CRITICAL: Customer contact and account from case - ADDED
    contact: caseData.contact || undefined,
    account: caseData.account || undefined,

    opened_at: formatDateForServiceNow(input.startTime),
    closed_at: formatDateForServiceNow(input.endTime),
    short_description: input.summary || `Phone call - ${input.direction} - ${input.sessionId}`,
    work_notes: input.notes || `...`,

    // FIXED: Use 'closed_complete' instead of 'closed'
    state: 'closed_complete',
  };

  // ... rest of method
}
```

## Valid Interaction State Values

| State | Value | Usage |
|-------|-------|-------|
| New | `new` | Default for new interactions |
| Work in Progress | `work_in_progress` | Active interactions |
| On Hold | `on_hold` | Paused interactions |
| **Closed Complete** | `closed_complete` | **Use for completed calls** |
| Closed Abandoned | `closed_abandoned` | Abandoned interactions |
| Wrap Up | `wrap_up` | Inactive state |

## Testing Results

### Test 1: Updated Code with Case SCS0049247
```
Created: IMS0001473
Contact: Alicia Tarver ✅
Account: Exceptional ✅
State: Closed Complete ✅
Context: Service Case: SCS0049247 ✅
Phone: +1 (409) 790-6402 ✅

SUCCESS: All fields populated correctly!
```

### Test 2: End-to-End Workflow Validation
```
VALIDATION CHECKS:
Contact populated: PASS ✅
Account populated: PASS ✅
State is closed_complete: PASS ✅
Context linked: PASS ✅
Phone number set: PASS ✅
Contact matches case: PASS ✅
Account matches case: PASS ✅

SUCCESS: All validation checks passed!
```

## Case Field Mapping

When creating an interaction from a case, these fields are copied:

| Case Field | Interaction Field | Data Type | Example |
|------------|------------------|-----------|---------|
| `contact` | `contact` | Reference (customer_contact) | "2783f4b1c34ea650a01d5673e401313b" → "Alicia Tarver" |
| `account` | `account` | Reference (customer_account) | "a52ea617c3e6ae501302560fb001310b" → "Exceptional" |
| `sys_id` | `context_document` | Reference | Links interaction to case |
| `number` | (metadata) | String | Case number for logging |

## Impact

### Before Fix
- Interactions created without customer/contact linkage
- Unable to track interactions by customer or account
- Reporting and analytics incomplete
- Customer history fragmented

### After Fix
- All interactions properly linked to customer contacts
- All interactions linked to customer accounts
- Complete customer interaction history
- Accurate reporting and analytics
- Proper data relationships in ServiceNow

## Related Files

- `/lib/tools/servicenow.ts` - Main ServiceNow client implementation
- `/api/cron/sync-voice-worknotes.ts` - Cron job that creates interactions
- `/api/cron/sync-webex-voice.ts` - Webex voice data sync
- `/lib/db/repositories/call-interaction-repository.ts` - Local database storage

## Test Scripts

- `/scripts/test-updated-create-interaction.ts` - Tests updated createPhoneInteraction method
- `/scripts/test-end-to-end-voice-interaction.ts` - Full end-to-end workflow test
- `/scripts/test-create-interaction-with-contact.ts` - Direct API test with contact/account

## Future Considerations

1. **Validation**: Add validation to ensure cases have contact/account before creating interactions
2. **Error Handling**: Handle cases where contact/account are missing gracefully
3. **Logging**: Add detailed logging for troubleshooting contact/account population
4. **Monitoring**: Monitor interaction creation to ensure contact/account are consistently populated
5. **Backfill**: Consider backfilling existing interactions that are missing contact/account data

## References

- ServiceNow Interaction Table API Documentation
- ServiceNow Customer Contact Management
- Webex Contact Center Integration Guide
