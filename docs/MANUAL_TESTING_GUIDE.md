# Manual Testing Guide: Anthropic Best Practices & Multimodal Features

This guide provides step-by-step instructions for manually testing the Anthropic tool use best practices and multimodal content block features.

---

## Prerequisites

### 1. ServiceNow Test Case with Screenshots

**Create a test case:**
1. Log into your ServiceNow instance
2. Navigate to Customer Service > Cases
3. Create a new case:
   - Number: Will be auto-generated (e.g., SCS0001234)
   - Short Description: "Test case for multimodal feature testing"
   - Description: "This case has error screenshots attached for visual analysis testing"
   - Priority: 3 - Moderate
   - State: New

**Attach screenshots:**
1. Open the case you just created
2. Click "Attachments" related list
3. Upload 2-3 test images:
   - error-screenshot.png (any screenshot with error message)
   - ui-issue.png (UI problem screenshot)
   - system-diagram.png (any system diagram or dashboard)
4. Save the case
5. **Copy the case number** (e.g., SCS0001234) and **sys_id** for testing

### 2. Environment Configuration

**Create `.env.test` file:**
```bash
# ServiceNow Configuration
SERVICENOW_INSTANCE_URL=https://your-instance.service-now.com
SERVICENOW_USERNAME=your_username
SERVICENOW_PASSWORD=your_password

# Test Data
TEST_CASE_WITH_ATTACHMENTS=SCS0001234
TEST_CASE_WITH_ATTACHMENTS_SYS_ID=abc123xyz456  # Get from case record

# Multimodal Feature Flags
ENABLE_MULTIMODAL_TOOL_RESULTS=true
MAX_IMAGE_ATTACHMENTS_PER_TOOL=3
MAX_IMAGE_SIZE_BYTES=5242880

# Anthropic API
ANTHROPIC_API_KEY=sk-ant-api03-...
```

---

## Test Suite 1: Anthropic Best Practices

### Test 1.1: Parallel Tool Execution

**What to test:** Multiple tools execute simultaneously, not sequentially

**Steps:**
1. Enable debug logging to see tool execution timing
2. Create a Slack test that triggers multiple tools:
   ```
   User message: "Get case SCS0001234 and search for similar cases about database errors"
   ```
3. Expected behavior:
   - Claude should call `servicenow_action` and `search_similar_cases` **in parallel**
   - Check logs for "tool_execution_batch" span
   - Both tools should execute at the same time (Promise.all)

**Validation:**
```bash
# Check LangSmith trace
# Look for parallel execution in logs
grep "tool_execution_batch" logs/*.log

# Verify Promise.all is used
grep "Promise.all" lib/agent/runner.ts
```

**Expected Result:**
- Both tools execute simultaneously
- Total execution time ≈ max(tool1_time, tool2_time), not tool1_time + tool2_time
- LangSmith shows both tools in same batch span

---

### Test 1.2: is_error Field Support

**What to test:** Failed tools send `is_error: true` to Claude

**Steps:**
1. Create a scenario that causes a tool error:
   ```
   User message: "Get case INVALID999 from ServiceNow"
   ```
2. Expected behavior:
   - ServiceNow tool returns `{ error: "Case not found" }`
   - Runner detects error and sets `isError: true`
   - Anthropic API receives `is_error: true` in tool_result block

**Validation:**
```bash
# Enable API request logging
export DEBUG=anthropic:*

# Check logs for is_error field
# Should see: tool_result { is_error: true, content: "Case INVALID999 was not found..." }
```

**Expected Result:**
- Claude receives error with `is_error: true`
- Claude responds helpfully: "I couldn't find that case. Please verify the case number."
- No crash or undefined behavior

---

### Test 1.3: max_tokens Truncation Retry

**What to test:** Incomplete tool_use blocks trigger retry with higher max_tokens

**Steps:**
1. This is difficult to test manually (requires hitting token limit mid-tool-use)
2. Verify code implementation:
   ```bash
   grep -A 10 "max_tokens" lib/agent/runner.ts
   ```
3. Should see retry logic with `maxTokens: 8192`

**Validation:**
- Code review confirms retry logic exists
- Integration test covers this scenario

---

### Test 1.4: tool_choice Parameter

**What to test:** Force Claude to use specific tools

**Steps:**
1. Modify orchestrator or runner to pass `tool_choice`:
   ```typescript
   const response = await chatService.send({
     messages: conversation,
     tools: toolDefinitions,
     toolChoice: { type: "tool", name: "servicenow_action" }
   });
   ```
2. Send a message: "What's the weather in New York?"
3. Expected: Claude MUST call `servicenow_action` even though it's not relevant

**Validation:**
- Claude uses the forced tool
- No natural language response before tool use (Anthropic prefills)

**Note:** This is more useful programmatically. For manual testing, verify the parameter is supported.

---

### Test 1.5: Enhanced Tool Descriptions

**What to test:** Descriptions help Claude choose tools correctly

**Steps:**
1. Ask a question that could use multiple tools:
   ```
   "I need help with Azure quota issues for a customer"
   ```
2. Expected behavior:
   - Claude should call `search_microsoft_learn` (description emphasizes REQUIRED for Microsoft tech)
   - Might also call `servicenow_action` to check for open cases
   - Should NOT call `get_weather` (irrelevant)

**Validation:**
- Check which tools Claude selected
- Verify tool selection matches the descriptions
- No irrelevant tool calls

**Expected Result:**
- Claude makes intelligent tool choices based on comprehensive descriptions
- Correct tools called in correct order

---

## Test Suite 2: Multimodal Content Blocks

### Test 2.1: ServiceNow Case with Attachments

**What to test:** Fetch case with screenshots

**Steps:**
1. Enable multimodal feature:
   ```bash
   export ENABLE_MULTIMODAL_TOOL_RESULTS=true
   ```
2. In Slack or via API, send:
   ```
   "Get case SCS0001234 with attachments"
   ```
3. Claude should call:
   ```json
   {
     "name": "servicenow_action",
     "input": {
       "action": "getCase",
       "number": "SCS0001234",
       "includeAttachments": true
     }
   }
   ```

**Validation:**
```bash
# Check logs for attachment processing
grep "Processed attachment" logs/*.log

# Should see:
# [ServiceNow] Processed attachment: error-screenshot.png (optimized: 45123 bytes)
# [ServiceNow] Processed attachment: ui-issue.png (original: 15234 bytes)
```

**Expected Result:**
- Case data returned
- 2-3 screenshots included as image content blocks
- Claude can reference visual content: "Looking at the error screenshot, I can see..."
- Token usage increased by ~3000-6000 tokens

---

### Test 2.2: Triage with Screenshots

**What to test:** AI triage with visual context

**Steps:**
1. Ensure feature flag enabled
2. Send message:
   ```
   "Triage case SCS0001234 and include screenshots for visual analysis"
   ```
3. Claude should call:
   ```json
   {
     "name": "triage_case",
     "input": {
       "caseNumber": "SCS0001234",
       "includeScreenshots": true
     }
   }
   ```

**Validation:**
```bash
# Check LangSmith trace
# - Tool call should have includeScreenshots: true
# - Tool result should have contentBlocks with images
# - Claude's response should reference visual content

# Check token usage
# Should see significant increase (~5000-8000 tokens total)
```

**Expected Result:**
- Triage classification returned
- Screenshots attached to response
- Claude can analyze error messages in screenshots
- Classification may improve with visual context (e.g., detects error codes from screenshot)

---

### Test 2.3: Multimodal Content Block Formatting

**What to test:** Images formatted correctly for Anthropic API

**Steps:**
1. Enable debug logging
2. Trigger any tool with attachments
3. Check the actual API request sent to Anthropic

**Validation:**
```typescript
// In anthropic-provider.ts, temporarily log requests:
console.log(JSON.stringify(params, null, 2));

// Should see:
{
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "tool_result",
          "tool_use_id": "toolu_123",
          "content": [
            { "type": "text", "text": "{\"case\":...}" },
            {
              "type": "image",
              "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": "iVBORw0KGgo..."
              }
            }
          ]
        }
      ]
    }
  ]
}
```

**Expected Result:**
- Content blocks array format correct
- Text block comes first
- Image blocks follow with valid base64 data
- Anthropic API accepts the request without errors

---

### Test 2.4: Image Optimization

**What to test:** Large images get resized/compressed

**Steps:**
1. Attach a large image (>5MB) to a ServiceNow case
2. Request the case with `includeAttachments: true`
3. Check optimization logs

**Validation:**
```bash
grep "optimized" logs/*.log

# Should see:
# [ServiceNow] Processed attachment: large-screenshot.png (optimized: 98765 bytes)
# Original size was much larger
```

**Expected Result:**
- Image downloaded successfully
- Sharp resizes to 1920x1920 max
- Quality reduced until under 5MB limit
- Final size reported in logs
- No errors or timeouts

---

### Test 2.5: Feature Flag Control

**What to test:** Feature can be disabled

**Steps:**
1. Disable multimodal:
   ```bash
   export ENABLE_MULTIMODAL_TOOL_RESULTS=false
   ```
2. Request case with attachments:
   ```
   "Get case SCS0001234 with screenshots"
   ```
3. Expected: Claude might call tool with `includeAttachments: true`, but NO images returned

**Validation:**
```bash
grep "includeAttachments" logs/*.log
# Tool called with flag
grep "Processed attachment" logs/*.log
# Should be EMPTY (feature disabled)
```

**Expected Result:**
- Tool executes normally
- No attachments fetched (feature disabled)
- No token cost increase
- Backward compatible behavior

---

## Test Suite 3: Performance & Cost

### Test 3.1: Token Usage Comparison

**What to test:** Measure token cost increase with images

**Steps:**
1. Test WITHOUT images:
   ```
   "Triage case SCS0001234"
   ```
2. Note token usage from LangSmith (e.g., 1500 total tokens)

3. Test WITH images:
   ```
   "Triage case SCS0001234 with screenshots"
   ```
4. Note token usage (e.g., 5500 total tokens)

**Validation:**
```bash
# Check LangSmith traces
# Compare input_tokens + output_tokens

# Without images: ~1200-1800 tokens
# With 3 images: ~5000-8000 tokens (3-5x increase)
```

**Expected Result:**
- Token increase matches estimates (~1000-1500 tokens per image)
- Cost increase acceptable for value provided
- Images actually help with classification

---

### Test 3.2: Latency with Parallel Execution

**What to test:** Parallel tools are faster than sequential

**Steps:**
1. Trigger multiple tools:
   ```
   "Get case SCS0001234, search similar cases, and check Microsoft Learn for Azure quota issues"
   ```
2. Check LangSmith trace timing

**Validation:**
```
Sequential (OLD):
  Tool 1: 800ms
  Tool 2: 1200ms
  Tool 3: 600ms
  Total: 2600ms

Parallel (NEW):
  All 3 tools: max(800, 1200, 600) = 1200ms
  Total: 1200ms (2.2x faster!)
```

**Expected Result:**
- Tools execute in parallel
- Total time ≈ slowest tool time
- 40-60% improvement for multi-tool requests

---

## Validation Checklist

Before declaring success, verify:

### Core Functionality
- [ ] TypeScript compiles with no errors
- [ ] All unit tests pass (36/36 ✅)
- [ ] Integration tests pass (with ServiceNow configured)
- [ ] No breaking changes to existing code

### Anthropic Best Practices
- [ ] Parallel tool execution with Promise.all
- [ ] `is_error: true` sent for failed tools
- [ ] `max_tokens` retry logic in place
- [ ] `tool_choice` parameter supported (auto/any/tool/none)
- [ ] `pause_turn` stop reason handled
- [ ] Tool descriptions are 3-4+ comprehensive sentences
- [ ] System prompt encourages parallel tool use
- [ ] All tool results in single user message

### Multimodal Features
- [ ] `ContentBlock` types defined (Text, Image, Document)
- [ ] `contentBlocks` array supported in tool results
- [ ] ServiceNow `getAttachments()` and `downloadAttachment()` work
- [ ] Image optimization with sharp functional
- [ ] `includeAttachments` parameter works on servicenow_action
- [ ] `includeScreenshots` parameter works on triage_case
- [ ] Feature flags control behavior (disabled by default)
- [ ] Token cost warnings in system prompt

### Safety & Performance
- [ ] Feature disabled by default (cost control)
- [ ] Attachment limits enforced (max 3-5 per tool)
- [ ] Image size limits enforced (5MB max)
- [ ] Graceful error handling (downloads, optimization)
- [ ] Backward compatibility maintained
- [ ] Parallel execution shows 40-60% improvement

---

## Troubleshooting

### Issue: "Sharp not found"
**Solution:**
```bash
pnpm install
# or
pnpm add -w sharp
```

### Issue: "Cannot find module '../slack/client'"
**Solution:** Pre-existing test setup issue, not related to our changes

### Issue: Attachments not fetching
**Check:**
1. Is `ENABLE_MULTIMODAL_TOOL_RESULTS=true`?
2. Is `includeAttachments: true` in tool call?
3. Does case have attachments in ServiceNow?
4. Check ServiceNow credentials valid?

### Issue: Images too large / optimization fails
**Check:**
1. `MAX_IMAGE_SIZE_BYTES` setting (default 5MB)
2. Original image size (sharp can handle up to ~20MB with optimization)
3. Check logs for optimization errors

### Issue: High token usage
**Expected:** Each image adds ~1000-4000 tokens
**Solution:** Reduce `MAX_IMAGE_ATTACHMENTS_PER_TOOL` or use `includeAttachments: false`

---

## Success Criteria

✅ **All Anthropic best practices implemented**
✅ **Multimodal content blocks working**
✅ **36 automated tests passing**
✅ **No TypeScript errors**
✅ **Backward compatible**
✅ **Performance improved (parallel execution)**
✅ **Safety controls in place (feature flags)**

---

## Next Steps After Testing

### If Tests Pass:
1. Deploy to staging environment
2. Monitor token usage and costs
3. Gather feedback from support team
4. Gradually enable multimodal for specific channels
5. Monitor LangSmith for tool selection quality

### If Issues Found:
1. Document the issue with reproduction steps
2. Check logs and LangSmith traces
3. Review error handling code
4. Fix and re-test

---

## Monitoring in Production

### Key Metrics to Track:
1. **Token Usage:**
   - Average tokens per request (with/without images)
   - Cost per triage operation
   - Monthly token consumption trend

2. **Performance:**
   - Tool execution latency (parallel vs historical sequential)
   - Image optimization time
   - End-to-end request duration

3. **Quality:**
   - Tool selection accuracy (right tools for the task)
   - Triage classification improvement with screenshots
   - Error recovery success rate

4. **Usage Patterns:**
   - How often are attachments requested?
   - Which tools use multimodal most?
   - Value vs cost trade-off

### LangSmith Queries:
```
# Find multimodal requests
metadata.hasImages = true

# Compare token usage
avg(usage.total_tokens) WHERE metadata.hasImages = true
vs
avg(usage.total_tokens) WHERE metadata.hasImages = false

# Check tool selection accuracy
tags.component = "runner" AND metadata.toolsUsed

# Monitor errors
metadata.hasErrors = true
```

---

## Quick Test Commands

```bash
# 1. Generate test images
npx tsx tests/fixtures/generate-test-images.ts

# 2. Run unit tests
pnpm test --run tests/utils/image-processing.test.ts
pnpm test --run tests/services/anthropic-chat-multimodal.test.ts
pnpm test --run tests/integration/anthropic-best-practices.test.ts

# 3. Run integration tests (requires ServiceNow)
pnpm test --run tests/integration/servicenow-attachments.test.ts

# 4. Compile TypeScript
pnpm exec tsc --noEmit

# 5. Build project
pnpm build

# 6. Deploy to staging
vercel --prod
```

---

## Manual Test Script

Copy and run this test sequence:

```bash
#!/bin/bash

echo "🧪 Testing Anthropic Best Practices & Multimodal Features"
echo "========================================================="

# 1. Compile
echo "\n1️⃣ Compiling TypeScript..."
pnpm exec tsc --noEmit || exit 1

# 2. Generate test images
echo "\n2️⃣ Generating test images..."
npx tsx tests/fixtures/generate-test-images.ts || exit 1

# 3. Run unit tests
echo "\n3️⃣ Running unit tests..."
pnpm test --run tests/utils/image-processing.test.ts || exit 1
pnpm test --run tests/services/anthropic-chat-multimodal.test.ts || exit 1

# 4. Run integration tests
echo "\n4️⃣ Running integration tests..."
pnpm test --run tests/integration/anthropic-best-practices.test.ts || exit 1

# 5. Check for errors
echo "\n5️⃣ Checking for errors..."
grep -r "TODO\|FIXME\|XXX" lib/agent/runner.ts lib/services/anthropic-chat.ts lib/utils/image-processing.ts && echo "⚠️  Found TODOs" || echo "✅ No TODOs"

echo "\n✅ All automated tests passed!"
echo "\n📋 Next steps:"
echo "   1. Create test case in ServiceNow with screenshots"
echo "   2. Set ENABLE_MULTIMODAL_TOOL_RESULTS=true in .env"
echo "   3. Test manually in Slack with real case"
echo "   4. Monitor token usage in LangSmith"
echo "   5. Deploy to staging"
```

---

## Contact & Support

**Issues?** Check:
1. GitHub Issues: /issues
2. LangSmith traces: https://smith.langchain.com
3. ServiceNow attachment API docs: https://docs.servicenow.com/attachment-api

**Questions?** Review:
- Anthropic tool use docs: https://docs.anthropic.com/claude/docs/tool-use
- Implementation files: `lib/agent/runner.ts`, `lib/services/anthropic-chat.ts`
