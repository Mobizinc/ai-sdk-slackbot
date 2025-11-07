# LangSmith Tracing Architecture

## Overview

This document describes the centralized LangSmith tracing architecture implemented for the Slack AI agent. The architecture ensures properly nested traces that provide deep visibility into agent operations, from Slack message handlers through orchestration, LLM calls, and tool executions.

## Problem Solved

**Before:** LangSmith traces were flat because:
- Entry points invoked the orchestrator without trace wrappers
- Runner went straight to Anthropic chat service
- No active run tree meant `wrapSDK` couldn't attach children
- Traces appeared as disconnected roots instead of hierarchical spans

**After:** Nested trace hierarchy:
```
Slack Handler (root)
├─ Agent Orchestrator
│  ├─ Load Context
│  ├─ Build Prompt
│  ├─ Agent Runner
│  │  ├─ Anthropic Call Step 1 (LLM)
│  │  │  └─ Anthropic.messages.create (wrapSDK)
│  │  ├─ Tool Execution Batch
│  │  │  ├─ Tool: search_web
│  │  │  └─ Tool: get_weather
│  │  └─ Anthropic Call Step 2 (LLM)
│  │     └─ Anthropic.messages.create (wrapSDK)
│  └─ Format Message
└─ Post Processing
```

## Architecture Components

### 1. Centralized Observability Module (`lib/observability/`)

#### `langsmith-tracer.ts`
Core LangSmith client and utilities:
- **`isTracingEnabled()`**: Check if tracing is active (API key + config)
- **`getLangSmithClient()`**: Get or create singleton client
- **`sanitizeForTracing(data)`**: Remove sensitive data from traces
- **`createTraceMetadata(metadata)`**: Build trace metadata with environment info
- **`createTraceTags(tags)`**: Build searchable trace tags
- **`shouldSampleTrace(rate)`**: Sampling for high-volume scenarios

#### `langsmith-traceable.ts`
Wrapper functions for creating traced operations:
- **`withLangSmithTrace(fn, options)`**: Main wrapper for any async function
  - Creates parent runs when no context exists
  - Creates child runs when called within another trace
  - Automatically propagates AsyncLocalStorage context
  - Captures inputs, outputs, and errors

- **`createChildSpan(options)`**: Manual span creation for fine-grained control
  - Useful for instrumenting specific operations
  - Returns RunTree that must be manually ended

- **Helper wrappers:**
  - `traceLLMCall()`: Specialized for LLM operations
  - `traceToolExecution()`: For tool/function calls
  - `traceEmbedding()`: For embedding generation
  - `traceRetrieval()`: For knowledge base / vector search

#### `index.ts`
Barrel export for clean imports throughout codebase.

### 2. Instrumented Components

#### Slack Message Handlers (`lib/handle-messages.ts`)
- **`handleNewAssistantMessage`**: Wrapped with `withLangSmithTrace`
  - Root span for each Slack message
  - Metadata: channelId, threadTs, userId, messageId
  - Tags: component=slack-handler, operation=message_received

- **`assistantThreadMessage`**: Wrapped with `withLangSmithTrace`
  - Traces thread start events
  - Tags: component=slack-handler, operation=thread_start

#### Agent Pipeline

**Orchestrator (`lib/agent/orchestrator.ts`)**
- Main `run()` method wrapped in trace
- Creates child spans for each stage:
  - `load_context`: Context loading with channel metadata
  - `build_prompt`: Prompt construction with case numbers
  - `agent_runner`: (has own nested spans)
  - `format_message`: Message formatting

**Runner (`lib/agent/runner.ts`)**
- `runAgent()` wrapped with trace
- Creates child spans for:
  - Each LLM call: `anthropic_call_step_N` with usage metrics
  - Tool execution batches: `tool_execution_batch_step_N`
  - Individual tool calls: `tool_[toolName]` with input/output

**Anthropic Provider (`lib/anthropic-provider.ts`)**
- Uses `wrapSDK` from langsmith/wrappers
- Automatically integrates with AsyncLocalStorage context
- Anthropic calls appear as children of active trace context
- **No code changes needed** - respects existing context automatically

#### API Routes

**ServiceNow Webhook (`api/servicenow-webhook.ts`)**
- POST handler wrapped with `withLangSmithTrace`
- Root span for webhook processing
- Tags: component=api, operation=webhook, service=servicenow

**QStash Worker (`api/workers/process-case.ts`)**
- Worker handler wrapped with `withLangSmithTrace`
- Root span for async case processing
- Tags: component=worker, operation=case_processing, service=qstash

## Configuration

### Environment Variables

```bash
# Required for tracing
LANGSMITH_API_KEY=lsv2_pt_...          # Get from https://smith.langchain.com/settings

# Optional configuration
LANGSMITH_PROJECT=slack-ai-agent        # Project name (default: "default")
LANGSMITH_API_URL=https://api.smith.langchain.com  # API endpoint override
LANGSMITH_TRACING=true                  # Enable/disable (default: true when API key present)
```

### Config Registry

Configuration managed in `lib/config/registry.ts`:

```typescript
langsmithApiKey: {
  envVar: "LANGSMITH_API_KEY",
  type: "string",
  default: "",
  group: "telemetry",
  description: "LangSmith API key for tracing LLM calls.",
  sensitive: true,
}

langsmithProject: {
  envVar: "LANGSMITH_PROJECT",
  type: "string",
  default: "",
  group: "telemetry",
  description: "LangSmith project name for trace attribution.",
}

langsmithTracingEnabled: {
  envVar: "LANGSMITH_TRACING",
  type: "boolean",
  default: true,
  group: "telemetry",
  description: "Enable LangSmith tracing. Defaults to true when API key present.",
}
```

## Usage Examples

### Basic Wrapper

```typescript
import { withLangSmithTrace } from '../lib/observability';

const myFunction = withLangSmithTrace(
  async (input: string) => {
    // Your logic here
    return processData(input);
  },
  {
    name: 'process_data',
    runType: 'chain',
    metadata: { inputLength: input.length },
    tags: { component: 'data-processor' }
  }
);

await myFunction('test');
```

### Manual Child Spans

```typescript
import { withLangSmithTrace, createChildSpan } from '../lib/observability';

const parentFunction = withLangSmithTrace(
  async () => {
    // Create manual child span
    const dbSpan = await createChildSpan({
      name: 'database_query',
      runType: 'retriever',
      metadata: { query: 'SELECT * FROM users' },
      tags: { component: 'database' }
    });

    try {
      const result = await db.query('SELECT * FROM users');
      await dbSpan?.end({ rowCount: result.length });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await dbSpan?.end(undefined, errorMessage);
      throw error;
    }
  },
  {
    name: 'parent_operation',
    runType: 'chain',
    tags: { component: 'service' }
  }
);
```

### Specialized Helpers

```typescript
import { traceLLMCall, traceToolExecution, traceRetrieval } from '../lib/observability';

// LLM call tracing
const generateText = traceLLMCall(
  async (prompt: string) => {
    return await llm.generate(prompt);
  },
  {
    name: 'generate_response',
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    temperature: 0.7,
  }
);

// Tool execution tracing
const executeTool = traceToolExecution(
  async (input: any) => {
    return await tool.execute(input);
  },
  {
    name: 'tool_execution',
    toolName: 'search_web',
    toolInput: { query: 'test' },
  }
);

// Retrieval tracing
const searchKB = traceRetrieval(
  async (query: string) => {
    return await vectorDB.search(query, 5);
  },
  {
    name: 'knowledge_base_search',
    query: 'user question',
    topK: 5,
    source: 'azure-search',
  }
);
```

## Testing

### Quick Smoke Test

```bash
# Set required environment variables
export LANGSMITH_API_KEY="lsv2_pt_..."
export ANTHROPIC_API_KEY="sk-ant-..."

# Run basic tracing test
pnpm exec tsx scripts/test-langsmith-tracing.ts
```

### Nested Trace Test

```bash
# Full pipeline test with nested spans
pnpm exec tsx scripts/test-nested-tracing.ts
```

### Verification Checklist

After running tests:

1. **Go to LangSmith Dashboard**: https://smith.langchain.com/
2. **Select your project**: Default or custom project name
3. **Find recent traces**: Within 5-10 seconds of test completion
4. **Verify hierarchy**:
   - Root span exists (e.g., `simulated_slack_handler`)
   - Child spans are nested under parents
   - Anthropic calls appear as children (not roots)
   - Metadata and tags are present
   - Inputs/outputs are captured
   - Errors are properly tracked

## Best Practices

### 1. Always Use Wrappers at Entry Points

```typescript
// ✅ GOOD: Wrap entry point
export const handler = withLangSmithTrace(
  async (event) => {
    return await processEvent(event);
  },
  { name: 'api_handler', runType: 'chain' }
);

// ❌ BAD: No wrapper at entry point
export async function handler(event) {
  return await processEvent(event);
}
```

### 2. Add Meaningful Metadata

```typescript
withLangSmithTrace(fn, {
  name: 'process_case',
  metadata: {
    caseNumber: 'CS0001',
    category: 'Hardware',
    urgency: 'High',
  },
  tags: {
    component: 'case-processor',
    environment: process.env.NODE_ENV,
  }
});
```

### 3. Sanitize Sensitive Data

The `sanitizeForTracing()` function automatically removes:
- API keys
- Passwords
- Tokens
- Secrets
- Authorization headers
- Session data

Always use `createTraceMetadata()` which includes automatic sanitization.

### 4. Use Appropriate Run Types

- **`llm`**: Language model calls
- **`chain`**: Sequences of operations, orchestration
- **`tool`**: Tool/function executions
- **`retriever`**: Database queries, vector search
- **`embedding`**: Embedding generation
- **`prompt`**: Prompt construction/templates

### 5. Handle Errors Properly

```typescript
try {
  const result = await operation();
  await span?.end({ result });
} catch (error) {
  // Errors are passed as second parameter (as string)
  const errorMessage = error instanceof Error ? error.message : String(error);
  await span?.end(undefined, errorMessage);
  throw error;
}
```

**Important**: The RunTree `end()` method signature is:
- `end(outputs?: Record<string, any>, error?: string): Promise<void>`
- Pass outputs as flat key-value pairs (not nested under `outputs` key)
- Pass error as the second parameter (as a string, not Error object)

### 6. Sampling for High Volume

```typescript
import { shouldSampleTrace } from '../lib/observability';

if (shouldSampleTrace(0.1)) {  // 10% sampling
  // Trace this request
} else {
  // Skip tracing
}
```

## Troubleshooting

### Traces Not Appearing

1. **Check API key**: `echo $LANGSMITH_API_KEY`
2. **Check configuration**:
   ```typescript
   import { isTracingEnabled } from '../lib/observability';
   console.log(isTracingEnabled());  // Should be true
   ```
3. **Check project name**: Verify you're looking in the correct project
4. **Wait 10 seconds**: Traces may take 5-10 seconds to appear

### Flat Traces (Not Nested)

1. **Verify entry point is wrapped**: Check that the root function uses `withLangSmithTrace`
2. **Check AsyncLocalStorage**: Ensure you're not breaking the context chain
3. **Avoid parallel execution**: Use sequential calls for proper nesting
4. **Review wrapSDK setup**: Anthropic client should be wrapped once at initialization

### Missing Metadata

1. **Use createTraceMetadata()**: Instead of raw objects
2. **Check serialization**: Ensure metadata is JSON-serializable
3. **Avoid circular references**: In metadata objects

### Performance Impact

Tracing adds minimal overhead (~1-5ms per span). For high-volume scenarios:
- Use sampling: `shouldSampleTrace(0.1)` for 10% tracing
- Disable tracing: `LANGSMITH_TRACING=false`
- Limit metadata size: Truncate large strings/objects

## Future Enhancements

### Phase 1 (Current)
- ✅ Centralized observability module
- ✅ Entry point instrumentation (Slack handlers)
- ✅ Agent pipeline instrumentation (orchestrator, runner)
- ✅ API routes and workers instrumentation
- ✅ Test scripts and validation

### Phase 2 (Future)
- [ ] Auxiliary services (embeddings, quality analysis)
- [ ] ServiceNow integration tracing
- [ ] Webex pipeline tracing
- [ ] Database operations tracing
- [ ] Cache operations tracing

### Phase 3 (Advanced)
- [ ] Custom dashboards in LangSmith
- [ ] Automated alerting on errors/latency
- [ ] Cost tracking and optimization
- [ ] A/B testing with trace-based analysis
- [ ] Production vs. development trace separation

## References

- **LangSmith Documentation**: https://docs.smith.langchain.com/
- **Traceable API**: https://docs.smith.langchain.com/tracing/faq/langchain_specific_guides#using-traceable
- **wrapSDK**: https://docs.smith.langchain.com/tracing/faq/wrapping_sdk
- **AsyncLocalStorage**: https://nodejs.org/api/async_context.html

## Support

For questions or issues:
1. Check this documentation
2. Review test scripts for examples
3. Check LangSmith dashboard for trace details
4. Review error logs for specific failures
