# API Contracts Baseline (Pre-Refactor)

This document captures the current public API contracts for the modules being refactored. These contracts MUST be preserved during and after the refactor to ensure backwards compatibility.

**Date**: 2025-10-22
**Purpose**: Baseline for refactor - DO NOT break these contracts

---

## `lib/generate-response.ts`

### Primary Export

```typescript
export const generateResponse: (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
  options?: {
    channelId?: string;
    channelName?: string;
    threadTs?: string;
  }
) => Promise<string>
```

**Description**: Main entry point for active @mention flow. Generates AI responses with tool execution support.

**Parameters**:
- `messages`: Array of conversation messages (user and assistant turns)
- `updateStatus?`: Optional callback for real-time status updates during processing
- `options?`: Optional context (channel info, thread timestamp)

**Returns**: Promise resolving to Slack-formatted markdown response string

**Example**:
```typescript
const response = await generateResponse(
  [{ role: "user", content: "Help with case SCS0001234" }],
  (status) => console.log(status),
  { channelId: "C123456", threadTs: "1234567890.123456" }
);
```

### Test Injection Points

```typescript
export const __setGenerateTextImpl: (
  impl: (args: any) => Promise<any>
) => void

export const __resetGenerateTextImpl: () => void
```

**Description**: Test helpers for mocking LLM behavior in tests

**Usage**: Only for testing - allows mocking the underlying generateText call

---

## `lib/handle-passive-messages.ts`

### Primary Exports

#### `handlePassiveMessage`

```typescript
export async function handlePassiveMessage(
  event: GenericMessageEvent,
  botUserId: string
): Promise<void>
```

**Description**: Main entry point for passive message monitoring. Detects case numbers, triggers assistance, and manages KB workflows.

**Parameters**:
- `event`: Slack message event object
- `botUserId`: Bot's user ID (to avoid processing own messages)

**Returns**: Promise (void) - performs side effects (posts messages, updates context)

**Side Effects**:
- May post intelligent assistance messages to Slack
- May trigger KB generation workflow
- Updates context manager with case information
- Fetches case data from ServiceNow

**Example**:
```typescript
await handlePassiveMessage(
  {
    type: "message",
    channel: "C123456",
    user: "U789USER",
    text: "Working on SCS0001234",
    ts: "1234567890.123456"
  },
  "U123BOT"
);
```

#### `notifyResolution`

```typescript
export async function notifyResolution(
  channelId: string,
  threadTs: string,
  caseNumber: string
): Promise<void>
```

**Description**: Triggers KB generation workflow when case is marked as resolved

**Parameters**:
- `channelId`: Slack channel ID
- `threadTs`: Thread timestamp
- `caseNumber`: ServiceNow case number

**Returns**: Promise (void)

**Side Effects**:
- Posts KB workflow messages to Slack thread
- Updates KB gathering state in context manager

#### `cleanupTimedOutGathering`

```typescript
export async function cleanupTimedOutGathering(): Promise<void>
```

**Description**: Cleanup function for timed-out KB gathering sessions

**Returns**: Promise (void)

**Side Effects**:
- Abandons KB workflows that exceeded timeout
- Posts abandonment messages to Slack
- Cleans up context manager state

#### `extractCaseNumbers`

```typescript
export function extractCaseNumbers(text: string): string[]
```

**Description**: Extract ServiceNow case numbers from text

**Parameters**:
- `text`: Message text to search

**Returns**: Array of unique case numbers found (e.g., ["SCS0001234", "INC0005678"])

**Supported Formats**:
- SCS numbers: `SCS0001234`
- INC numbers: `INC0005678`
- CASE numbers: `CASE0001234`
- RITM numbers: `RITM0001234`

---


## Backwards Compatibility Requirements

### During Refactor (Phases 1-4)

1. **Preserve all exports**: Original files must continue exporting same functions
2. **Re-export from new modules**: Use temporary re-export wrappers
3. **Feature flag control**: New code paths behind feature flags
4. **No breaking changes**: All existing tests must pass

**Example Re-Export Pattern**:
```typescript
// lib/generate-response.ts (during refactor)
import { generateResponse as generateResponseNew } from './agent/orchestrator';
import { generateResponse as generateResponseOld } from './agent/legacy/generate-response-old';
import { getFeatureFlags } from './config/feature-flags';

export const generateResponse = (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
  options?: any
) => {
  const flags = getFeatureFlags();
  if (flags.refactorEnabled) {
    return generateResponseNew(messages, updateStatus, options);
  }
  return generateResponseOld(messages, updateStatus, options);
};
```

### After Refactor (Phase 5)

1. **Direct exports**: Remove re-export wrappers
2. **Update import paths**: Change call sites to import from new locations
3. **Delete old code**: Move deprecated code to `lib/deprecated/` for 2 weeks
4. **Update documentation**: Reflect new module structure

---

## Call Sites (Files that import these modules)

### `lib/generate-response.ts` importers:
- `lib/handle-app-mention.ts` - Main @mention handler
- `tests/*.test.ts` - Test files

### `lib/handle-passive-messages.ts` importers:
- `api/events.ts` - Slack event router
- `tests/*.test.ts` - Test files

---

## Deprecation Timeline

| Phase | Status | Timeline |
|-------|--------|----------|
| Phase 0-4 | Feature flag controlled | Weeks 1-6 |
| Phase 5 | Re-exports only | Week 7 |
| +2 weeks | Deprecated folder | Weeks 8-9 |
| Final | Old code deleted | Week 10 |

---

## Testing Requirements

1. **Integration tests**: Must pass throughout refactor
2. **API contract tests**: Verify function signatures unchanged
3. **Behavioral tests**: Verify same inputs produce same outputs
4. **Feature flag tests**: Test both old and new code paths

---

## Notes

- This document represents the **minimum** API surface to preserve
- Internal implementation can change freely
- Private functions (prefixed with `_`) can be modified without constraints
- Test helpers (prefixed with `__`) must remain for testing compatibility
