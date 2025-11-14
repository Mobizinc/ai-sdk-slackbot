# Tool Contracts

This document defines the contracts between ServiceNow tools and the LLM for the Mobiz Service Desk Assistant.

## Overview

All ServiceNow tools return **pre-formatted summaries** with structured sections that the LLM must use as the primary information source. This approach:

- **Prevents data leakage**: Raw ServiceNow data is never shown to the LLM
- **Ensures consistency**: All responses follow the same structure
- **Reduces hallucination**: LLM doesn't reconstruct data from raw fields
- **Optimizes token usage**: Summaries are concise and focused

## Core Principle

**The LLM should use pre-formatted summary fields as the primary information source, while having flexibility to access raw data for field-specific queries.**

### Hybrid Approach

ServiceNow tools return **both** raw structured data and pre-formatted summaries:

```typescript
{
  case: ServiceNowCaseResult,      // Raw data with all fields
  caseSummary: string               // Pre-formatted summary
}
```

This hybrid approach enables:
- **Field queries**: Direct access to specific fields (e.g., "Who is assigned to SCS0012345?")
- **Overview responses**: Structured narrative using formatted summaries
- **Flexibility**: LLM can choose the appropriate response style based on user query

### Response Types

The validation system classifies responses into three types:

1. **Field Query** (<150 chars OR field pattern detected + <300 chars)
   - Direct answers to specific field questions
   - Can use raw data fields
   - No section structure required
   - Lenient keyword matching (10% threshold)
   - Examples: "Assigned to: John Smith", "Priority: 2 (High)", "Status: Open"

2. **Overview** (≥300 chars OR has multiple section headers)
   - Narrative summaries of cases/incidents
   - Must use formatted summary as primary source
   - Required sections: Summary, Current State
   - Standard keyword matching (20% threshold)
   - Example: Full case summary with sections

3. **Unknown** (Medium-length responses without clear classification)
   - Lenient threshold (15%)
   - Minimal section requirements

## Tool Output Fields

### ServiceNow Case Tools

#### `getCase` / `searchCases`

**Output Field**: `caseSummary` (string)

**Structure**:
```
Summary

[Brief description of the issue]

Current State

Status: [state]
Priority: [priority]
Assigned: [assignee]
SLA: [remaining time]

Latest Activity

• [timestamp] – [user]: [action taken]
• [timestamp] – [user]: [action taken]
• [timestamp] – [user]: [action taken]

Context

[Background information, similar cases, customer details]

References

• [case URL]
```

**Example**:
```
Summary

Email server down affecting 50 users in Finance department.

Current State

Status: Open
Priority: High (1-Critical)
Assigned: John Smith (IT Support)
SLA: 2 hours remaining

Latest Activity

• Oct 28, 15:30 – jsmith: Escalated to Microsoft Support
• Oct 28, 15:15 – jsmith: Checked Azure Service Health - no outages
• Oct 28, 14:45 – jsmith: Monitoring email flow

Context

Known Exchange Online issue. Similar cases: SCS0012300, SCS0012301.
Customer: Contoso Corp (CSP: Mobiz)

References

• https://mobiz.service-now.com/case/SCS0012345
```

#### `getJournalEntries`

**Output Field**: `journalSummary` (string)

**Structure**:
```
Latest Activity

• [timestamp] – [user]: [action]
• [timestamp] – [user]: [action]
• [timestamp] – [user]: [action]
```

**Notes**:
- Entries are sorted newest first
- Limited to ~10 most recent entries
- Timestamps formatted as `Oct 28, 14:23`

### Incident Tools

#### `getIncident` / `searchIncidents`

**Output Field**: `incidentSummary` (string)

**Structure**: Same as `caseSummary` but for incidents

### Search Tools

#### `searchSimilarCases`

**Output Field**: `pattern_summary` (string, max 60 chars)

**Structure**: `[Issue pattern] ([root cause]) - [priority level]`

**Example**: `SharePoint sync failing (authentication) - high priority`

**Notes**:
- Provides pattern ONLY, not full details
- Use to identify similar issues without exposing case details
- LLM should reference pattern, not individual case data

#### `list_service_cases` with filters

**Output Field**: `casesSearchSummary` (string)

**Structure**:
```
Search Results

Found [N] cases for "[query]":

• [CASE-001] – [summary] ([state], Priority: [priority])
• [CASE-002] – [summary] ([state], Priority: [priority])

Pattern: [common resolution pattern if applicable]
```

### Microsoft Learn Search

#### `microsoftLearnSearch`

**Output Fields**:
- `key_points` (array of strings, 2-3 items, max 80 chars each)
- `excerpt` (string, max 150 chars)

**Structure**:
```json
{
  "key_points": [
    "Azure quotas limit resource deployment per region",
    "CSP subscriptions require Partner Center for quota requests",
    "Standard quota increases take 2-3 business days"
  ],
  "excerpt": "Azure quotas are limits on resources... [150 char summary]"
}
```

**Notes**:
- `key_points` are actionable takeaways
- `excerpt` provides context
- Always include URL in response

### CMDB Tools

#### `searchCMDB` / `getConfigurationItem`

**Output Field**: `formattedItems` (string)

**Structure**:
```
Infrastructure

• [CI Name] – [Type] ([Environment])
  Status: [operational_status]
  Location: [location]
  Dependencies: [list]
```

#### `createConfigurationItem`

**Output Fields**:
- `summary` – formatted CI snippet describing the newly created record
- `ci` – raw CI object (same shape as `searchCMDB`)
- `relationshipLinked` – boolean indicating if parent relationship was created

**Usage Notes**:
- Requires explicit user instruction and minimum fields: `className`, `name`
- Supports optional `parentSysId` to immediately link via `cmdb_rel_ci`
- Returns formatted summary so the assistant can confirm creation results without re-querying

## LLM Usage Guidelines

### Response Type Guidelines

#### For Field Queries (Short, Direct Answers)

**When to use**: User asks for a specific field value (assigned user, priority, status, etc.)

**Required Behavior**:
1. Use raw data fields OR summary content - both acceptable
2. Keep response concise (<150 chars preferred)
3. No section structure required
4. Must reference SOME content from tool output (can't completely ignore it)

**Examples**:
```
User: "Who is assigned to SCS0012345?"
✅ GOOD: "Assigned to: John Smith"
✅ GOOD: "John Smith"
❌ BAD: "I don't know" (when data is available)
```

#### For Overview Responses (Narrative Summaries)

**When to use**: User asks for full case details, summary, or context

**Required Behavior**:
1. **Use pre-formatted summary as primary source**
   - Read from `caseSummary`, `incidentSummary`, `journalSummary`, etc.
   - Present information conversationally (don't copy-paste verbatim)
   - Integrate with conversation context

2. **Include required sections**:
   - *Summary* (required)
   - *Current State* (required)
   - *Latest Activity* (optional but recommended)
   - *Context* (optional)
   - *References* (optional)

3. **Use Slack markdown formatting**:
   - `*Section Header*` for section names
   - `•` for bullet points
   - `<url|label>` for links

**Examples**:
```
User: "Tell me about case SCS0012345"
✅ GOOD:
*Summary*
Email server down affecting 50 users in Finance department.

*Current State*
Status: Open
Priority: High
Assigned: John Smith
SLA: 2 hours remaining

*Latest Activity*
• Oct 28, 15:30 – jsmith: Escalated to Microsoft Support
```

### Prohibited Behavior (All Response Types)

1. **Never completely ignore tool-provided summaries**
   ```
   ❌ BAD: "I don't have information about that case"
           (when caseSummary was provided)
   ✅ GOOD: Using the summary to answer the question
   ```

2. **Never expose sys_id or internal codes unnecessarily**
   ```
   ❌ BAD: "The sys_id is a1b2c3d4e5f6789"
   ✅ GOOD: "Case SCS0012345"
   ```

3. **For overviews: Don't skip required sections**
   ```
   ❌ BAD: Narrative without section headers (for >300 char responses)
   ✅ GOOD: Structured response with *Summary* and *Current State*
   ```

## Validation

### Response Type Classification

The validation system automatically detects response type using these rules:

1. **Section Headers Check (Priority 1)**
   - If response has ≥2 section headers (e.g., `*Summary*`, `*Current State*`) → **Overview**

2. **Length-Based Classification (Priority 2)**
   - Very short (<150 chars) → **Field Query**
   - Medium (150-299 chars) with field patterns → **Field Query**
   - Long (≥300 chars) → **Overview**

3. **Field Pattern Detection**
   - Patterns like "Assigned to:", "Priority:", "Status:" indicate field queries

### Adaptive Validation Rules

#### Field Query Validation
- **Keyword Matching**: 10% threshold (very lenient)
  - Must use SOME content from summary (can't completely ignore it)
  - Example: 1 out of 10 keywords matched = passes
- **Section Structure**: NOT required
- **Validation Logging**: Info level (not warnings)

#### Overview Validation
- **Keyword Matching**: 20% threshold (standard)
  - Must use substantial content from summary
  - Example: 2 out of 10 keywords matched = passes
- **Section Structure**: REQUIRED
  - Must include: *Summary*, *Current State*
  - Should include: *Latest Activity*, *Context*, *References*
- **Validation Logging**: Warning level for failures

#### Unknown Type Validation
- **Keyword Matching**: 15% threshold (moderate)
- **Section Structure**: Only *Summary* required if >300 chars

### Validation Alerts

In staging/production, validation failures trigger alerts when:
- Multiple required sections are missing (≥2)
- Multiple tools have unused summaries (≥2)
- **Note**: Field query responses do NOT trigger alerts

### Validation Metrics

Tracked metrics:
- Total validations by response type
- Success/failure rate overall and per type
- Common missing elements
- Common unused tools
- Response type breakdown (field_query, overview, unknown)

## Examples

### Field Query Examples

#### Good Field Query Responses

**User**: "Who is assigned to SCS0012345?"
```
✅ "Assigned to: John Smith"
✅ "John Smith"
✅ "John Smith (IT Support team)"
```

**User**: "What's the priority of that case?"
```
✅ "Priority: 2 (High)"
✅ "High priority"
```

**User**: "What's the status?"
```
✅ "Status: Open"
✅ "The case is currently open"
```

#### Bad Field Query Responses

```
❌ "I don't have any information about that case."
(When data is available in tool output)

❌ "OK"
(Completely ignores tool-provided data)
```

### Overview Response Examples

#### Good Overview Response

**User**: "Tell me about case SCS0012345"

```
✅ GOOD (Uses formatted summary with sections):

*Summary*

Email server is down affecting 50 users in the Finance department.

*Current State*

Status: Open
Priority: High
Assigned: John Smith
SLA: 2 hours remaining

*Latest Activity*

• Oct 28, 15:30 – jsmith: Escalated to Microsoft Support
• Oct 28, 15:15 – jsmith: Checked Azure Service Health - no outages

*Context*

This is a known Exchange Online issue. Similar cases were resolved by
restarting the service and verifying Azure connectivity.

*References*

<https://mobiz.service-now.com/case/SCS0012345|SCS0012345>
```

#### Bad Overview Responses

```
❌ BAD (Ignores summary completely):
"I don't have any information about that case."
(When caseSummary was provided with full details)
```

```
❌ BAD (No section structure for long narrative):
"The email server is currently down and affecting about 50 users in the Finance
department. The case is open with high priority and John Smith is assigned to
work on it. He escalated it to Microsoft Support earlier today..."
(Long narrative without section headers - should use *Summary*, *Current State*, etc.)
```

```
❌ BAD (Reconstructed from raw fields):
"The case status is: Open, priority is: 1, assigned to: John Smith, created on:
2025-10-28 14:00:00, description: Users in Finance reporting..."
(Reads raw fields instead of using caseSummary)
```

## Migration Guide

### Before (Raw Data Access)

```typescript
const response = `
  Status: ${incident.state}
  Priority: ${incident.priority}
  Description: ${incident.description}
`;
```

### After (Summary Field)

```typescript
// Tool returns:
{
  incident_id: "...",
  incidentSummary: "Summary\n\n[formatted summary with all sections]"
}

// LLM uses:
*Summary*
[content from incidentSummary]
```

## Testing

### Unit Tests

- `tests/response-validation.test.ts` - Validates response format
- `tests/formatter-snapshots.test.ts` - Ensures formatter output consistency

### Integration Tests

- Mocked LLM responses tested against validation
- Ensures end-to-end response format compliance

### Fixtures

- `tests/fixtures/servicenow-responses.ts` - Sample tool responses for testing

## Troubleshooting

### Validation Failures

**Symptom**: Logs show validation warnings for overview responses

**Common Causes**:
1. LLM ignoring summary fields for narrative responses
2. Long responses (>300 chars) missing section headers
3. Response type misclassification

**Solutions**:
1. Check system prompt emphasizes section structure for overview responses
2. Verify formatters are returning structured summaries
3. Review response type detection rules (lib/utils/response-validator.ts:71-104)

### Missing Sections

**Symptom**: "Response missing expected sections: Summary, Current State" warnings

**Cause**: LLM providing long narrative without section headers

**Detection**: Responses ≥300 chars OR with multiple section headers are classified as overviews

**Solution**:
- Emphasize in prompt that overview-type responses must include section headers
- Field queries (<150 chars) are exempt from section requirements

### Unused Summaries

**Symptom**: "Tool X returned summary but response doesn't appear to use it"

**Cause**: LLM providing generic response instead of using tool data

**Adaptive Thresholds**:
- Field queries: 10% keyword match (very lenient)
- Overviews: 20% keyword match (standard)
- Unknown: 15% keyword match (moderate)

**Solution**:
- For field queries: Check if response uses ANY content from tool output
- For overviews: Check if response uses substantial content from summary
- Review keyword extraction (lib/utils/response-validator.ts:318-368)

### Response Type Misclassification

**Symptom**: Field query being validated as overview (or vice versa)

**Common Causes**:
1. Response length at threshold boundary (~150 or ~300 chars)
2. Missing or extra section headers
3. Field patterns not detected

**Debug Steps**:
1. Check response length (field_query <150, overview ≥300)
2. Count section headers (≥2 headers → overview)
3. Check for field patterns (lib/utils/response-validator.ts:39-48)

**Solution**:
- Adjust response length or add/remove section headers as appropriate
- For field queries: Keep responses <150 chars
- For overviews: Ensure ≥300 chars OR include multiple section headers

## References

- System Prompt: `config/system-prompt.txt` (lines 202-220)
- Response Validator: `lib/utils/response-validator.ts`
- Formatters: `lib/services/servicenow-formatters.ts`
- Validation Tests: `tests/response-validation.test.ts`
