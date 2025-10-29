# LangSmith Observability Setup

LangSmith provides comprehensive tracing for all Anthropic LLM calls, including:
- Request/response logging
- Token usage tracking
- Cost analysis
- Performance metrics
- Error tracking

## ✅ Quick Setup (2 Minutes)

### 1. Get Your LangSmith API Key

1. Go to https://smith.langchain.com/
2. Sign in (or create account)
3. Click your profile → Settings → API Keys
4. Create new API key → Copy it

### 2. Set Environment Variables

```bash
# Required: Your LangSmith API key
export LANGSMITH_API_KEY="lsv2_pt_..."

# Optional: Project name (defaults to "default")
export LANGSMITH_PROJECT="ai-slack-bot-production"

# Optional: Explicitly enable/disable (defaults to true if API key present)
export LANGSMITH_TRACING=true
```

### 3. Deploy

That's it! LangSmith will automatically trace all Anthropic calls.

---

## 🔍 Verify It's Working

### Check Logs on Startup

You should see:
```
[LangSmith] Enabled tracing for Anthropic client
[Anthropic] Initialized client
```

If you see:
```
[LangSmith] Tracing enabled but LANGSMITH_API_KEY not set - tracing disabled
```
→ Set your API key

### Check LangSmith Dashboard

1. Go to https://smith.langchain.com/
2. Select your project
3. You should see traces appearing for each LLM call
4. Click any trace to see:
   - Input prompt
   - Output response
   - Token counts (input, output, cache)
   - Latency
   - Cost

---

## 📊 What Gets Tracked

**All Anthropic API calls** are automatically traced:

| Service | What's Traced | Location |
|---------|---------------|----------|
| **Case Classification** | Category/subcategory classification | `lib/services/case-classifier.ts` |
| **Case Triage** | Full triage workflow | `lib/services/case-triage.ts` |
| **KB Generation** | Knowledge article generation | `lib/services/kb-generator.ts` |
| **Intelligent Assistant** | Multi-turn conversations | `lib/services/intelligent-assistant.ts` |
| **Agent Tools** | Tool-calling workflows | `lib/agent/**/*.ts` |

**Each trace includes**:
- ✅ Input tokens (including cache reads)
- ✅ Output tokens
- ✅ Cache creation tokens
- ✅ Cache hit rate
- ✅ Cost ($USD)
- ✅ Latency (ms)
- ✅ Model used (e.g., claude-sonnet-4-5)
- ✅ Full prompt and response

---

## 🎯 Key Metrics to Monitor

### Token Usage
```
View in LangSmith → Metrics → Token Usage
- Total tokens per day
- Cache hit rate (should be >70%)
- Input vs output ratio
```

### Cost Analysis
```
View in LangSmith → Cost
- Daily spend
- Cost per service (classification, KB generation, etc.)
- Top expensive calls
```

### Performance
```
View in LangSmith → Latency
- P50, P95, P99 latencies
- Slowest calls
- Timeout tracking
```

### Errors
```
View in LangSmith → Errors
- Failed API calls
- Rate limit errors
- Timeout errors
```

---

## 🔧 Advanced Configuration

### Custom Project Name

Group traces by environment:

```bash
# Production
LANGSMITH_PROJECT="ai-slack-bot-production"

# Staging
LANGSMITH_PROJECT="ai-slack-bot-staging"

# Development
LANGSMITH_PROJECT="ai-slack-bot-dev"
```

### Disable Tracing (If Needed)

```bash
# Temporarily disable without removing API key
LANGSMITH_TRACING=false
```

### Custom Endpoint

```bash
# For self-hosted LangSmith
LANGSMITH_API_URL="https://your-langsmith-instance.com"
```

---

## 🐛 Troubleshooting

### "Traces not appearing in LangSmith"

**Check 1**: Verify API key is set
```bash
echo $LANGSMITH_API_KEY
# Should output: lsv2_pt_...
```

**Check 2**: Check application logs
```bash
# Should see:
[LangSmith] Enabled tracing for Anthropic client
```

**Check 3**: Make a test LLM call and check logs
```bash
# Run a classification or triage operation
# Check for Anthropic API calls in logs
```

**Check 4**: Verify LangSmith SDK version
```bash
npm list langsmith
# Should be: langsmith@^0.3.74 or later
```

### "Getting 'Failed to wrap Anthropic client' error"

This usually means:
- Incompatible SDK versions
- Network issues reaching LangSmith
- Invalid API key

**Fix**: Check logs for specific error details

### "Some calls are traced, others aren't"

**Cause**: Direct Anthropic SDK usage (bypassing `getAnthropicClient()`)

**Fix**: All LLM calls should use:
```typescript
import { anthropic } from "../model-provider";
// or
import { getAnthropicClient } from "../anthropic-provider";
```

NOT:
```typescript
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic({ apiKey: '...' }); // ❌ Wrong
```

---

## ✅ Quick Test Script

Create `scripts/test-langsmith.ts`:

```typescript
import { anthropic } from '../lib/model-provider';

async function testLangSmith() {
  console.log('Testing LangSmith tracing...');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: 'Say "LangSmith is working!"'
    }]
  });

  console.log('Response:', response.content[0]);
  console.log('Usage:', response.usage);
  console.log('\n✅ Check LangSmith dashboard - trace should appear within 5 seconds');
}

testLangSmith();
```

Run: `tsx scripts/test-langsmith.ts`

---

## 📋 Environment Variables Summary

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LANGSMITH_API_KEY` | ✅ Yes | None | Your LangSmith API key |
| `LANGSMITH_PROJECT` | No | "default" | Project name for grouping |
| `LANGSMITH_TRACING` | No | **true** | Enable/disable tracing |
| `LANGSMITH_API_URL` | No | LangSmith cloud | Custom endpoint |

**Minimum setup**: Just set `LANGSMITH_API_KEY` - everything else has smart defaults!

---

## 🎯 Expected Behavior

**With LangSmith configured**:
```
[LangSmith] Enabled tracing for Anthropic client
[Anthropic] Initialized client
[CaseClassifier] Starting Anthropic classification...
→ Trace appears in LangSmith within 5 seconds
```

**Without LangSmith configured**:
```
[LangSmith] Tracing enabled but LANGSMITH_API_KEY not set - tracing disabled
[Anthropic] Initialized client
[CaseClassifier] Starting Anthropic classification...
→ No traces (but app still works)
```

---

**LangSmith is optional but highly recommended for production monitoring!**
