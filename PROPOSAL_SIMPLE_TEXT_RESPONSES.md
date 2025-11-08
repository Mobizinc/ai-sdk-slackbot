# Proposal: Use Plain Text for LLM Responses (Like Claude for Slack)

## Current Problem

We're using Block Kit for everything:
- LLM narrative responses → Block Kit section blocks
- Case/incident details → Block Kit cards

This causes:
1. **Complexity**: Splitting text across multiple blocks, managing 3000 char limits
2. **msg_too_long errors**: Even with splitting, we hit limits
3. **Poor UX**: Block Kit sections don't flow as naturally as markdown text

## User's Insight

> "Claude for slack sends massive messages but they are slack formatted not block kit"

Claude for Slack sends 10,000+ character responses with zero issues. How? **Plain Slack markdown in the `text` field**, not Block Kit.

## Proposed Solution

### For LLM Narrative Responses
**Use plain Slack markdown text** (no blocks):

```typescript
// ✅ SIMPLE - Just send as text
await setFinalMessage(llmResponse);  // Plain markdown, any length
```

Slack supports very long text fields (40,000 chars). The LLM response naturally formats with:
- Markdown headers, lists, code blocks
- Natural line breaks and paragraphs
- Easy to read, easy to copy/paste

### For Case/Incident Cards
**Keep Block Kit for structured data displays** (optional):

```typescript
// Option A: Just include card details in the text
const response = `
${llmAnalysis}

---
**Case Details:**
• Number: SCS0048475
• Priority: High
• Status: In Progress
`;

// Option B: Use Block Kit only for the card, text for analysis
await setFinalMessage(llmAnalysis, caseCardBlocks);
```

## Benefits

### 1. Simplicity
- No text splitting logic needed
- No block count validation
- No 3000 char limit per block

### 2. Reliability
- No msg_too_long errors
- Works for responses of any length
- Proven approach (Claude for Slack uses it)

### 3. Better UX
- More readable (markdown flows naturally)
- Easy to copy/paste full responses
- Native Slack threading/quoting works better

### 4. Less Code
- Remove `splitTextIntoSectionBlocks()` complexity
- Remove block validation logic
- Simpler error handling

## Example Comparison

### Current (Block Kit):
```typescript
const llmTextBlocks = splitTextIntoSectionBlocks(llmResponse, 'mrkdwn');
const combinedBlocks = [
  ...llmTextBlocks,  // Multiple blocks for text
  { type: "divider" },
  ...caseBlocks      // More blocks for case card
];
await setFinalMessage(fallbackText, combinedBlocks);
```

### Proposed (Plain Text):
```typescript
// Just send the LLM response as markdown text
await setFinalMessage(llmResponse);

// OR if we want case details:
const fullResponse = `${llmResponse}\n\n${formatCaseDetailsAsText(caseData)}`;
await setFinalMessage(fullResponse);
```

## Implementation

1. **Phase 1**: Remove Block Kit from LLM responses
   - Send LLM analysis as plain markdown text
   - Keep case/incident details in text too (or minimal blocks)

2. **Phase 2**: Cleanup
   - Remove `splitTextIntoSectionBlocks()`
   - Remove block validation code
   - Simplify error handling

3. **Phase 3** (optional): Strategic Block Kit usage
   - Add Block Kit only for interactive elements (buttons, forms)
   - Keep narrative content as plain text

## When to Use Block Kit

✅ **Good uses:**
- Interactive buttons (Acknowledge, Escalate, Close)
- Forms and inputs
- Rich media (images with captions)
- Tables/data that benefits from structure

❌ **Bad uses:**
- Long narrative text (use markdown instead)
- LLM analysis/explanations (use markdown)
- Anything over 3000 chars

## Recommendation

**Start simple:** Send LLM responses as plain Slack markdown. It's what works for Claude, it's what users expect, and it eliminates an entire class of errors.

If we need rich displays later, we can add Block Kit strategically for specific use cases.
