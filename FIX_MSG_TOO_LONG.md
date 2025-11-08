# Fix: msg_too_long Error for Long LLM Responses in Slack

## Problem Summary

The application was experiencing `msg_too_long` errors when displaying ServiceNow case/incident details with LLM analysis in Slack. The error occurred when the LLM response exceeded Slack Block Kit's character limits.

**Error Details**:
```
error: 'msg_too_long',
hadBlocks: false,
blockCount: 0,
textPreview: '{"text":"*Summary*\\nSCS0048475 is a NetScaler upgrade project...'
```

## Root Cause

The code was placing the entire LLM response (which could be 5,000+ characters) into a single section block's text field:

```typescript
// ❌ INCORRECT: Single block can exceed 3000 char limit
const combinedBlocks = [
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: llmResponse  // Could be 5000+ characters!
    }
  },
  { type: "divider" },
  ...blocks
];
```

**Slack Block Kit Limits**:
- **Section block text field**: **3,000 characters maximum**
- **Overall message**: 50 blocks maximum
- **Total message size**: ~40,000 characters (approximate)

When the LLM response exceeded 3,000 characters, Slack rejected the entire payload with `msg_too_long`.

## Solution

Created a utility function `splitTextIntoSectionBlocks()` that intelligently splits long text across multiple section blocks, each respecting the 3,000 character limit.

### Key Features:

1. **Intelligent Splitting**: Splits on paragraph boundaries, sentences, then word boundaries (in that priority order)
2. **Safe Buffer**: Uses 2,800 characters as the split point (leaves 200 char buffer for formatting)
3. **Preserves Formatting**: Maintains markdown formatting across splits
4. **Handles Edge Cases**: Empty text, single-block text, very long text

## Changes Made

### 1. Created Text Splitting Utility (`lib/formatters/servicenow-block-kit.ts`)

```typescript
export function splitTextIntoSectionBlocks(
  text: string,
  textType: 'mrkdwn' | 'plain_text' = 'mrkdwn'
): any[]
```

**Features**:
- Splits long text into multiple section blocks
- Each block under 3,000 characters (uses 2,800 safe limit)
- Intelligently splits on:
  1. Paragraph breaks (`\n\n`) - preferred
  2. Line breaks (`\n`) - second choice
  3. Sentence endings (`. `, `? `, `! `) - third choice
  4. Word boundaries (` `) - fallback

**Test Results**:
- Short text (47 chars): 1 block ✓
- Long text (8,000 chars): 3 blocks [2800, 2800, 2400] ✓
- Paragraph text (3,390 chars): 2 blocks [2828, 558] ✓

### 2. Updated Incident Handler (`lib/handle-app-mention.ts:271-302`)

**Before**:
```typescript
const combinedBlocks = [
  {
    type: "section",
    text: { type: "mrkdwn", text: llmResponse }  // ❌ Can exceed 3000 chars
  },
  { type: "divider" },
  ...incidentBlocks
];
```

**After**:
```typescript
const llmTextBlocks = blockKitModule.splitTextIntoSectionBlocks(llmResponse, 'mrkdwn');
const combinedBlocks = [
  ...llmTextBlocks,  // ✓ Multiple blocks, each under 3000 chars
  { type: "divider" },
  ...incidentBlocks
];
```

### 3. Updated Case Handler (`lib/handle-app-mention.ts:303-338`)

Applied the same fix to case detail rendering.

### 4. Enhanced Validation (`lib/services/slack-messaging.ts:127-153`)

Added validation to catch issues before sending to Slack:

```typescript
// Validate block count (Slack limit: 50 blocks)
if (options.blocks.length > 50) {
  throw new Error(`Block count exceeds Slack limit: ${options.blocks.length} blocks (max 50)`);
}

// Validate section block text length (Slack limit: 3000 characters)
if (block.type === 'section' && block.text?.text) {
  const textLength = block.text.text.length;
  if (textLength > 3000) {
    throw new Error(
      `Section block ${i} text exceeds Slack limit: ${textLength} chars (max 3000). ` +
      `Use splitTextIntoSectionBlocks() utility to split long text.`
    );
  }
}
```

## Testing

### Manual Test
1. Query a ServiceNow case with long LLM analysis (5000+ chars)
2. Verify message displays correctly in Slack
3. Confirm all formatting is preserved
4. Check that text is split naturally (not mid-sentence)

### Automated Test
```bash
npx tsx /tmp/test-split-text.ts
```

Results:
- ✓ Short text: 1 block
- ✓ Long text (8000 chars): 3 blocks, all under 3000 chars
- ✓ Paragraph text: Splits on paragraph boundaries
- ✓ All blocks valid

## Impact

### Before Fix:
- LLM responses over 3,000 characters caused `msg_too_long` errors
- Users couldn't see full analysis for complex cases
- Error message was cryptic (`hadBlocks: false`)

### After Fix:
- ✓ Handles LLM responses of any length
- ✓ Splits intelligently on natural boundaries
- ✓ Preserves all formatting and content
- ✓ Provides clear validation errors if limits are still exceeded
- ✓ Works for both incidents and cases

## Files Modified

1. `/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/lib/formatters/servicenow-block-kit.ts`
   - Added `SLACK_LIMITS` constants
   - Added `splitTextIntoSectionBlocks()` utility function

2. `/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/lib/handle-app-mention.ts`
   - Updated incident detail handler (lines 271-302)
   - Updated case detail handler (lines 303-338)
   - Now uses `splitTextIntoSectionBlocks()` for LLM responses

3. `/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/lib/services/slack-messaging.ts`
   - Added block count validation (50 block limit)
   - Added section text length validation (3000 char limit)
   - Enhanced error messages

## Future Considerations

1. **Monitor Block Count**: If combined blocks (LLM + ServiceNow details) exceed 50 blocks, consider:
   - Truncating journal entries
   - Summarizing LLM response
   - Using Slack's file upload for full details

2. **Performance**: The text splitting utility is O(n) and efficient. For very long texts (100k+ chars), consider streaming or pagination.

3. **User Experience**: Consider adding a visual indicator when text is split across multiple blocks (e.g., "Continued..." at block boundaries).

## References

- [Slack Block Kit Documentation](https://api.slack.com/block-kit)
- [Slack Block Kit Builder](https://app.slack.com/block-kit-builder)
- [Slack API Limits](https://api.slack.com/docs/rate-limits)
