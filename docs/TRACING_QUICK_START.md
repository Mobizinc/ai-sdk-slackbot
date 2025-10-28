# LangSmith Tracing - Quick Start Guide

## Setup (2 minutes)

### 1. Get API Key
```bash
# Go to https://smith.langchain.com/settings
# Copy your API key (starts with lsv2_pt_...)
```

### 2. Configure Environment
```bash
export LANGSMITH_API_KEY="lsv2_pt_..."
export LANGSMITH_PROJECT="slack-ai-agent"  # Optional, defaults to "default"
```

### 3. Verify Setup
```bash
pnpm exec tsx scripts/test-langsmith-tracing.ts
```

## Basic Usage

### Wrap Any Function

```typescript
import { withLangSmithTrace } from '../lib/observability';

const myFunction = withLangSmithTrace(
  async (input: string) => {
    return await processData(input);
  },
  {
    name: 'process_data',
    runType: 'chain',
    metadata: { inputLength: input.length },
    tags: { component: 'processor' }
  }
);
```

### Add Child Spans

```typescript
import { withLangSmithTrace, createChildSpan } from '../lib/observability';

const parentOp = withLangSmithTrace(
  async () => {
    const span = await createChildSpan({
      name: 'database_query',
      runType: 'retriever',
      tags: { component: 'db' }
    });

    const result = await db.query('...');
    await span?.end({ rowCount: result.length });
    return result;
  },
  { name: 'parent_operation', runType: 'chain' }
);
```

## Run Types

Choose the appropriate type:

- **`llm`** - Language model calls
- **`chain`** - Sequences of operations
- **`tool`** - Tool/function executions
- **`retriever`** - Database queries, searches
- **`embedding`** - Embedding generation
- **`prompt`** - Prompt construction

## Common Patterns

### API Handler

```typescript
export const POST = withLangSmithTrace(
  async (request: Request) => {
    // Your handler logic
    return Response.json({ success: true });
  },
  {
    name: 'api_endpoint_name',
    runType: 'chain',
    tags: { component: 'api', operation: 'endpoint_name' }
  }
);
```

### Async Worker

```typescript
const workerHandler = withLangSmithTrace(
  async (request: Request) => {
    // Process background job
    return Response.json({ success: true });
  },
  {
    name: 'worker_job_name',
    runType: 'chain',
    tags: { component: 'worker', operation: 'job_name' }
  }
);
```

### LLM Call

```typescript
import { traceLLMCall } from '../lib/observability';

const generateText = traceLLMCall(
  async (prompt: string) => {
    return await llm.generate(prompt);
  },
  {
    name: 'generate_response',
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
  }
);
```

## Viewing Traces

1. Go to https://smith.langchain.com/
2. Select your project
3. Recent traces appear within 5-10 seconds
4. Click trace to see hierarchy
5. Inspect metadata, inputs, outputs, timing

## Troubleshooting

### Traces Not Appearing

```typescript
import { isTracingEnabled } from '../lib/observability';
console.log('Tracing enabled:', isTracingEnabled());
```

Check:
- ✅ LANGSMITH_API_KEY is set
- ✅ LANGSMITH_TRACING is not "false"
- ✅ Wait 10 seconds for trace propagation
- ✅ Check correct project in dashboard

### Flat Traces (Not Nested)

- ✅ Ensure entry point is wrapped
- ✅ Don't break AsyncLocalStorage chain
- ✅ Use sequential calls, not parallel
- ✅ Check that child functions run in same context

### Missing Metadata

```typescript
// ✅ GOOD: Use createTraceMetadata
import { createTraceMetadata } from '../lib/observability';

withLangSmithTrace(fn, {
  name: 'operation',
  metadata: createTraceMetadata({ userId: 'U123' }),
});

// ❌ BAD: Raw object with sensitive data
withLangSmithTrace(fn, {
  name: 'operation',
  metadata: { apiKey: 'secret' },  // Will be sanitized but better to use helper
});
```

## Performance

### Default Behavior
- Minimal overhead (~1-5ms per span)
- Safe for production use

### High-Volume Scenarios

```typescript
import { shouldSampleTrace, withLangSmithTrace } from '../lib/observability';

if (shouldSampleTrace(0.1)) {  // 10% sampling
  return withLangSmithTrace(fn, options)();
} else {
  return fn();
}
```

## Disable Tracing

```bash
# Temporarily disable
export LANGSMITH_TRACING=false

# Or remove API key
unset LANGSMITH_API_KEY
```

## Examples in Codebase

**Entry Point:**
- `lib/handle-messages.ts:65` - Slack message handler

**Pipeline:**
- `lib/agent/orchestrator.ts:29` - Agent orchestrator
- `lib/agent/runner.ts:26` - Agent runner with LLM calls

**API Routes:**
- `api/servicenow-webhook.ts:243` - Webhook handler
- `api/workers/process-case.ts:35` - Background worker

## Best Practices

1. ✅ Always wrap entry points
2. ✅ Add meaningful metadata (IDs, user info)
3. ✅ Use appropriate run types
4. ✅ Handle errors (automatically captured)
5. ✅ Use sanitization helpers
6. ✅ Sample high-volume endpoints
7. ✅ Keep trace names descriptive

## Full Documentation

See `/Users/hamadriaz/Documents/codebase/ai-sdk-slackbot/LANGSMITH_TRACING.md` for:
- Architecture details
- Advanced patterns
- All configuration options
- Complete API reference
- Troubleshooting guide
