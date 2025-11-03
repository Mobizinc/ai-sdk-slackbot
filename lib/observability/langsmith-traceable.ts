/**
 * LangSmith Traceable Wrapper
 *
 * Provides decorator-style wrappers to create parent runs and propagate
 * AsyncLocalStorage context for nested trace spans.
 */

import { traceable, getCurrentRunTree, withRunTree } from "langsmith/traceable";
import { RunTree } from "langsmith";
import { isTracingEnabled, getLangSmithProject, createTraceMetadata, createTraceTags, sanitizeForTracing, type TraceMetadata, type TraceTags } from "./langsmith-tracer";

/**
 * Wrapper configuration options
 */
export interface TraceableOptions {
  name: string;
  runType?: "llm" | "chain" | "tool" | "retriever" | "embedding" | "prompt";
  metadata?: TraceMetadata | ((...args: any[]) => TraceMetadata);
  tags?: TraceTags | ((...args: any[]) => TraceTags);
  projectName?: string;
}

/**
 * Wrap a function to create a LangSmith trace span.
 * This function automatically handles:
 * - Creating parent runs when no context exists
 * - Creating child runs when called within another traced function
 * - Propagating AsyncLocalStorage context
 * - Capturing inputs, outputs, and errors
 *
 * @example
 * ```typescript
 * const tracedFunction = withLangSmithTrace(
 *   async (input: string) => {
 *     return await processData(input);
 *   },
 *   {
 *     name: "process_data",
 *     runType: "chain",
 *     metadata: { userId: "123" },
 *     tags: { component: "data-processor" }
 *   }
 * );
 *
 * const result = await tracedFunction("test input");
 * ```
 */
export function withLangSmithTrace<Args extends any[], Return>(
  fn: (...args: Args) => Promise<Return>,
  options: TraceableOptions
): (...args: Args) => Promise<Return> {
  // If tracing is disabled, return the original function
  if (!isTracingEnabled()) {
    return fn;
  }

  const {
    name,
    runType = "chain",
    metadata = {},
    tags = {},
    projectName,
  } = options;

  // For static metadata/tags, use langsmith's traceable directly
  if (typeof metadata !== 'function' && typeof tags !== 'function') {
    return traceable(
      fn,
      {
        name,
        run_type: runType,
        project_name: projectName || getLangSmithProject(),
        metadata: createTraceMetadata(metadata),
        tags: Object.values(createTraceTags(tags)),
      }
    ) as (...args: Args) => Promise<Return>;
  }

  // For dynamic metadata/tags, manually create run tree for each invocation
  return async (...args: Args): Promise<Return> => {
    const resolvedMetadata = typeof metadata === 'function'
      ? metadata(...args)
      : metadata;
    const resolvedTags = typeof tags === 'function'
      ? tags(...args)
      : tags;

    // Get parent run if it exists; suppress errors when no context is active
    let parentRun: RunTree | undefined;
    try {
      parentRun = getCurrentRunTree(true) || undefined;
    } catch {
      parentRun = undefined;
    }

    // The LangSmith SDK expects parent runs to have a valid dotted_order.
    // When the context isn't fully initialized (e.g., early in the request lifecycle),
    // getCurrentRunTree may return a run without dotted_order populated, which causes
    // the API to reject the child run. In that case, treat it as a root run instead of
    // attempting to attach to the incomplete parent.
    if (parentRun && parentRun.dotted_order == null) {
      parentRun = undefined;
    }

    // Create run tree for this invocation
    const runTree = new RunTree({
      name,
      run_type: runType,
      project_name: projectName || getLangSmithProject(),
      parent_run: parentRun,
      metadata: createTraceMetadata(resolvedMetadata),
      tags: Object.values(createTraceTags(resolvedTags)),
      inputs: { args: sanitizeForTracing(args) },
      start_time: Date.now(),
    });

    try {
      await runTree.postRun();
    } catch (postError) {
      // Log but don't fail - tracing errors should not break functionality
      console.warn('[LangSmith] Failed to post run (continuing without trace):', {
        name,
        error: postError instanceof Error ? postError.message : String(postError),
      });
      // Continue execution without tracing
      return fn(...args);
    }

    return withRunTree(runTree, async () => {
      try {
        const result = await fn(...args);
        const sanitizedResult = sanitizeForTracing(result);
        try {
          if (sanitizedResult === undefined) {
            await runTree.end();
          } else {
            await runTree.end({ result: sanitizedResult });
          }
        } catch (endError) {
          // Log but don't fail - trace end errors should not affect result
          console.warn('[LangSmith] Failed to end trace (result still returned):', {
            name,
            error: endError instanceof Error ? endError.message : String(endError),
          });
        }
        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        try {
          await runTree.end(undefined, errorMessage);
        } catch (endError) {
          console.warn('[LangSmith] Failed to end trace with error:', endError);
        }
        throw error;
      }
    });
  };
}

/**
 * Create a child span within an existing trace context.
 * This is useful for manual instrumentation where you need finer control.
 *
 * @example
 * ```typescript
 * async function parentFunction() {
 *   const span = await createChildSpan({
 *     name: "database_query",
 *     runType: "retriever",
 *     metadata: { query: "SELECT * FROM users" }
 *   });
 *
 *   try {
 *     const result = await db.query("SELECT * FROM users");
 *     await span.end({ output: result });
 *     return result;
 *   } catch (error) {
 *     await span.end({ error });
 *     throw error;
 *   }
 * }
 * ```
 */
export async function createChildSpan(
  options: TraceableOptions
): Promise<RunTree | null> {
  if (!isTracingEnabled()) {
    return null;
  }

  const {
    name,
    runType = "chain",
    metadata = {},
    tags = {},
    projectName,
  } = options;

  try {
    // Get the current run tree from AsyncLocalStorage
    const parentRun = getCurrentRunTree();
    const normalizedParent = parentRun && parentRun.dotted_order != null
      ? parentRun
      : undefined;

    // Resolve metadata if it's a function
    const resolvedMetadata = typeof metadata === 'function'
      ? metadata()
      : metadata;

    // Resolve tags if it's a function
    const resolvedTags = typeof tags === 'function'
      ? tags()
      : tags;

    // Create a new run tree (child span)
    const runTree = new RunTree({
      name,
      run_type: runType,
      project_name: projectName || getLangSmithProject(),
      parent_run: normalizedParent,
      tags: Object.values(createTraceTags(resolvedTags)),
      metadata: createTraceMetadata(resolvedMetadata),
      start_time: Date.now(),
    });

    try {
      await runTree.postRun();
    } catch (postError) {
      // Log but don't fail - tracing errors should not break functionality
      console.warn('[LangSmith] Failed to post run (continuing without trace):', {
        name,
        error: postError instanceof Error ? postError.message : String(postError),
      });
      return null;
    }

    return runTree;
  } catch (error) {
    console.error('[LangSmith] Failed to create child span:', error);
    return null;
  }
}

/**
 * Helper to trace LLM calls with standardized metadata
 */
export function traceLLMCall<Args extends any[], Return>(
  fn: (...args: Args) => Promise<Return>,
  options: Omit<TraceableOptions, 'runType'> & {
    model?: string;
    provider?: string;
    temperature?: number;
    maxTokens?: number;
  }
): (...args: Args) => Promise<Return> {
  const { model, provider, temperature, maxTokens, metadata = {}, ...rest } = options;

  return withLangSmithTrace(fn, {
    ...rest,
    runType: "llm",
    metadata: {
      ...metadata,
      model,
      provider,
      temperature,
      maxTokens,
    },
    tags: {
      ...rest.tags,
      component: "llm",
      provider: provider || "anthropic",
    },
  });
}

/**
 * Helper to trace tool executions
 */
export function traceToolExecution<Args extends any[], Return>(
  fn: (...args: Args) => Promise<Return>,
  options: Omit<TraceableOptions, 'runType'> & {
    toolName: string;
    toolInput?: any;
  }
): (...args: Args) => Promise<Return> {
  const { toolName, toolInput, metadata = {}, ...rest } = options;

  return withLangSmithTrace(fn, {
    ...rest,
    name: rest.name || `tool_${toolName}`,
    runType: "tool",
    metadata: {
      ...metadata,
      toolName,
      toolInput: sanitizeForTracing(toolInput),
    },
    tags: {
      ...rest.tags,
      component: "tool",
      toolName,
    },
  });
}

/**
 * Helper to trace embedding generation
 */
export function traceEmbedding<Args extends any[], Return>(
  fn: (...args: Args) => Promise<Return>,
  options: Omit<TraceableOptions, 'runType'> & {
    model?: string;
    dimensions?: number;
  }
): (...args: Args) => Promise<Return> {
  const { model, dimensions, metadata = {}, ...rest } = options;

  return withLangSmithTrace(fn, {
    ...rest,
    runType: "embedding",
    metadata: {
      ...metadata,
      model,
      dimensions,
    },
    tags: {
      ...rest.tags,
      component: "embedding",
    },
  });
}

/**
 * Helper to trace retrieval operations (knowledge base, vector search, etc.)
 */
export function traceRetrieval<Args extends any[], Return>(
  fn: (...args: Args) => Promise<Return>,
  options: Omit<TraceableOptions, 'runType'> & {
    query?: string;
    topK?: number;
    source?: string;
  }
): (...args: Args) => Promise<Return> {
  const { query, topK, source, metadata = {}, ...rest } = options;

  return withLangSmithTrace(fn, {
    ...rest,
    runType: "retriever",
    metadata: {
      ...metadata,
      query: query?.slice(0, 200), // Truncate long queries
      topK,
      source,
    },
    tags: {
      ...rest.tags,
      component: "retriever",
      source: source || "unknown",
    },
  });
}

/**
 * Get the current trace context (if any)
 */
export function getCurrentTraceContext(): RunTree | undefined {
  if (!isTracingEnabled()) {
    return undefined;
  }

  try {
    return getCurrentRunTree();
  } catch (error) {
    // No active run tree
    return undefined;
  }
}

/**
 * Check if we're currently within a trace context
 */
export function isWithinTraceContext(): boolean {
  return getCurrentTraceContext() !== undefined;
}
