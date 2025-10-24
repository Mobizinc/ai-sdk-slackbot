# ServiceNow Interaction Linking Solution

## Problem
Interactions created via REST API were appearing blank with no customer information and not linked to parent cases.

## Root Cause Analysis

### Original Incorrect Payload
```javascript
{
  opened_for: caseSysId,  // WRONG - this expects sys_user reference, not case reference
  phone: '+14097906402',
  // ... other fields
}
```

### Why It Failed
1. **`opened_for`** field references `sys_user` table (not cases)
2. **`contact`** field references `customer_contact` table (CSM contacts)
3. **NO direct field** exists to link an interaction to a case/incident
4. The fields `agent`, `phone`, `queue` don't exist in the standard interaction table

## Solution: Use Context Fields

### Correct Payload Structure
```javascript
{
  // Interaction type and basics
  type: 'phone',  // Required field
  direction: 'inbound',
  short_description: 'Phone call description',
  state: 'closed',

  // ✅ CRITICAL: Link to parent case using context fields
  context_table: 'x_mobit_serv_case_service_case',  // Your case table name
  context_document: caseSysId,  // Case sys_id

  // Optional: Alternative/additional linking
  channel_metadata_table: 'x_mobit_serv_case_service_case',
  channel_metadata_document: caseSysId,

  // Contact/User linking (if needed)
  contact: contactSysId,  // Reference to customer_contact table
  opened_for: userSysId,  // Reference to sys_user table (not case!)

  // Phone information
  caller_phone_number: '+14097906402',  // Correct field name

  // Timing
  opened_at: '2025-10-20 11:30:11',  // Use opened_at, not start_time
  closed_at: '2025-10-20 11:30:11',   // Use closed_at, not end_time

  // Duration (in seconds as integer or glide_duration format)
  duration: durationSeconds,

  // Additional metadata
  work_notes: 'Call Session ID: xxx\nDuration: xxx seconds',
}
```

## Key Field Mappings

### Interaction Table Schema

| Our Field | ServiceNow Field | Type | References | Purpose |
|-----------|------------------|------|------------|---------|
| caseSysId | `context_document` | document_id | any table | Link to parent case |
| N/A | `context_table` | table_name | N/A | Specify case table name |
| contactSysId | `contact` | reference | customer_contact | CSM contact |
| userSysId | `opened_for` | reference | sys_user | User who opened |
| phoneNumber | `caller_phone_number` | phone_number_e164 | N/A | Phone number |
| startTime | `opened_at` | glide_date_time | N/A | Interaction start |
| endTime | `closed_at` | glide_date_time | N/A | Interaction end |
| duration | `duration` | glide_duration | N/A | Call duration |
| 'phone' | `type` | string | N/A | **Required** |
| 'inbound'/'outbound' | `direction` | string | N/A | Call direction |
| 'closed'/'new' | `state` | string | N/A | Interaction state |

### Fields That DON'T Exist (our mistakes)
- ❌ `opened_for` as case reference (it's for sys_user only)
- ❌ `phone` (use `caller_phone_number`)
- ❌ `start_time` (use `opened_at`)
- ❌ `end_time` (use `closed_at`)
- ❌ `agent` (use `assigned_to` or `opened_by` which reference sys_user)
- ❌ `queue` (use `assignment_group` which references sys_user_group)
- ❌ `notes` (use `work_notes`)

## Verified Solution

Tested Method 1 successfully created interaction with proper linking:

```
Interaction: IMS0001457
context_document: Service Case: SCS0049247 (f753b7c08378721039717000feaad385)
context_table: x_mobit_serv_case_service_case
```

## Implementation Changes Needed

### Update `lib/tools/servicenow.ts`

```typescript
public async createPhoneInteraction(input: {
  caseSysId: string;
  caseNumber: string;
  channel: string;
  direction: string;
  phoneNumber: string;
  sessionId: string;
  startTime: Date;
  endTime: Date;
  durationSeconds?: number;
  agentName?: string;
  queueName?: string;
  summary?: string;
  notes?: string;
}): Promise<{
  interaction_sys_id: string;
  interaction_number: string;
  interaction_url: string;
}> {
  const table = "interaction";
  const endpoint = `/api/now/table/${table}`;

  // Build interaction payload with CORRECT field names
  const payload: Record<string, any> = {
    // Required field
    type: 'phone',

    // Interaction details
    direction: input.direction,
    caller_phone_number: input.phoneNumber,  // ✅ Changed from 'phone'

    // ✅ CRITICAL: Link to parent case using context fields
    context_table: process.env.SERVICENOW_CASE_TABLE || 'x_mobit_serv_case_service_case',
    context_document: input.caseSysId,

    // Optional: Channel metadata for additional linking
    channel_metadata_table: process.env.SERVICENOW_CASE_TABLE || 'x_mobit_serv_case_service_case',
    channel_metadata_document: input.caseSysId,

    // Timing - use correct field names
    opened_at: formatDateForServiceNow(input.startTime),  // ✅ Changed from 'start_time'
    closed_at: formatDateForServiceNow(input.endTime),    // ✅ Changed from 'end_time'

    // Metadata
    short_description: input.summary || `Phone call - ${input.direction} - ${input.sessionId}`,
    work_notes: input.notes || `Call Session ID: ${input.sessionId}\nDuration: ${input.durationSeconds ?? 'N/A'} seconds`,

    // Status
    state: 'closed',
  };

  // Add duration if provided
  if (input.durationSeconds !== undefined) {
    payload.duration = input.durationSeconds;
  }

  // Agent name can be added to work_notes since there's no direct 'agent' field
  // assigned_to requires sys_user reference which we don't have from agent name string

  const data = await request<{
    result: {
      sys_id: string;
      number: string;
    };
  }>(endpoint, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!data.result) {
    throw new Error('Failed to create phone interaction: No response from ServiceNow');
  }

  return {
    interaction_sys_id: data.result.sys_id,
    interaction_number: data.result.number,
    interaction_url: `${config.instanceUrl}/nav_to.do?uri=interaction.do?sys_id=${data.result.sys_id}`,
  };
}
```

## Contact Linking (Optional Enhancement)

If we want to also link the interaction to the customer contact from the case:

```typescript
// First, fetch the case to get the contact
const caseResponse = await fetch(
  `${SERVICENOW_URL}/api/now/table/${CASE_TABLE}/${caseSysId}?sysparm_fields=contact`,
  { headers: { Authorization: `Basic ${auth}` } }
);
const caseData = await caseResponse.json();
const contactSysId = caseData.result?.contact?.value;

// Then include in interaction payload
if (contactSysId) {
  payload.contact = contactSysId;
}
```

## Testing

Run the test script to verify:
```bash
npx tsx scripts/test-interaction-creation-methods.ts
```

Then check ServiceNow UI:
1. Navigate to interaction record (e.g., IMS0001457)
2. Verify "Context Record" field shows the case number
3. Verify interaction appears in case's related list (if configured)

## References

- Interaction table schema queried via: `scripts/inspect-interaction-table-schema.ts`
- Test methods validated via: `scripts/test-interaction-creation-methods.ts`
- ServiceNow docs: Interaction Management uses context fields for generic record linking
