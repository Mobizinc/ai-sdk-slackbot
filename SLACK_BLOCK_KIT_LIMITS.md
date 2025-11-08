# Slack Block Kit Limits Reference

## Character Limits

### Section Block Text Field
- **Maximum**: 3,000 characters
- **Recommended Safe Limit**: 2,800 characters (buffer for formatting)
- **Applies To**: `section` blocks with `text` field

### Other Text Fields
- **Header block**: 150 characters (plain_text only)
- **Context block elements**: 2,000 characters per element
- **Button text**: 75 characters
- **Input labels**: 2,000 characters

## Message Limits

- **Blocks per message**: 50 blocks maximum
- **Total message size**: ~40,000 characters (approximate)
- **Attachments**: 100 attachments per message

## Visual Example

### ❌ BEFORE: Single Block (Causes Error)

```
┌─────────────────────────────────────┐
│ Section Block                       │
│                                     │
│ Text: [5,000 characters]           │  ← EXCEEDS 3000 LIMIT!
│                                     │  ← Slack rejects with msg_too_long
│                                     │
└─────────────────────────────────────┘
```

**Error**: `msg_too_long`

---

### ✅ AFTER: Multiple Blocks (Works!)

```
┌─────────────────────────────────────┐
│ Section Block #1                    │
│                                     │
│ Text: [2,800 characters]           │  ← Under 3000 limit ✓
│ ...intelligent split on paragraph   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Section Block #2                    │
│                                     │
│ Text: [2,200 characters]           │  ← Under 3000 limit ✓
│ ...complete remaining text          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Divider                             │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ServiceNow Case Details             │
│ (additional blocks)                 │
└─────────────────────────────────────┘
```

**Result**: Message displays successfully in Slack!

## Code Examples

### Split Long Text

```typescript
import { splitTextIntoSectionBlocks } from './formatters/servicenow-block-kit';

const longLLMResponse = "...5000+ characters...";

// ❌ DON'T: Put long text in single block
const badBlocks = [
  {
    type: "section",
    text: { type: "mrkdwn", text: longLLMResponse }  // ERROR!
  }
];

// ✅ DO: Split long text across multiple blocks
const goodBlocks = splitTextIntoSectionBlocks(longLLMResponse, 'mrkdwn');
// Returns: Array of section blocks, each under 3000 chars
```

### Combine with Other Blocks

```typescript
const llmBlocks = splitTextIntoSectionBlocks(llmResponse, 'mrkdwn');
const caseBlocks = formatCaseAsBlockKit(caseData);

const combinedBlocks = [
  ...llmBlocks,        // 1-N blocks (depending on length)
  { type: "divider" }, // 1 block
  ...caseBlocks        // M blocks (case details)
];

// Total blocks: 1-N + 1 + M (must be ≤ 50)
```

## Splitting Strategy

The `splitTextIntoSectionBlocks()` function uses intelligent splitting:

1. **Paragraph Breaks** (`\n\n`) - Preferred
   - Preserves natural document structure
   - Best user experience

2. **Line Breaks** (`\n`) - Second choice
   - Keeps related content together
   - Good for bullet lists

3. **Sentence Endings** (`. `, `? `, `! `) - Third choice
   - Splits at logical boundaries
   - Maintains readability

4. **Word Boundaries** (` `) - Fallback
   - Ensures no mid-word splits
   - Last resort for very long paragraphs

## Testing

```bash
# Test the text splitting utility
npx tsx /tmp/test-split-text.ts
```

Expected output:
```
Test 1 - Short text:
  Input length: 47
  Output blocks: 1
  ✓ Expected 1 block

Test 2 - Long text (8000 chars):
  Input length: 8000
  Output blocks: 3
  Block lengths: [ 2800, 2800, 2400 ]
  ✓ Expected 3 blocks, all under 3000 chars

Test 3 - Paragraph text:
  Input length: 3390
  Output blocks: 2
  Block lengths: [ 2828, 558 ]
  ✓ All blocks under 3000 chars
```

## Validation

The `slack-messaging.ts` service includes validation:

```typescript
// Validate block count
if (blocks.length > 50) {
  throw new Error(`Block count exceeds Slack limit: ${blocks.length} (max 50)`);
}

// Validate section text length
if (block.type === 'section' && block.text?.text.length > 3000) {
  throw new Error(`Section block text exceeds limit: ${length} chars (max 3000)`);
}
```

This catches issues **before** sending to Slack, providing clear error messages.

## References

- [Slack Block Kit Reference](https://api.slack.com/reference/block-kit)
- [Block Kit Builder](https://app.slack.com/block-kit-builder)
- [Section Block Docs](https://api.slack.com/reference/block-kit/blocks#section)
