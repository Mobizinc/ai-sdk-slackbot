/**
 * Observability Module
 *
 * Centralized exports for LangSmith tracing and observability utilities.
 */

// Core tracing utilities
export {
  isTracingEnabled,
  getLangSmithClient,
  getLangSmithProject,
  sanitizeForTracing,
  createTraceMetadata,
  createTraceTags,
  shouldSampleTrace,
  generateTraceId,
  __resetLangSmithClient,
  type TraceMetadata,
  type TraceTags,
} from './langsmith-tracer';

// Traceable wrappers
export {
  withLangSmithTrace,
  createChildSpan,
  traceLLMCall,
  traceToolExecution,
  traceEmbedding,
  traceRetrieval,
  getCurrentTraceContext,
  isWithinTraceContext,
  type TraceableOptions,
} from './langsmith-traceable';
