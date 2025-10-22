import { traceable } from "langsmith/traceable";
import { isLangSmithEnabled } from "./langsmith-tracer";

type TraceableConfig = Record<string, unknown>;

export function withLangSmithTrace<Fn extends (...args: any[]) => any>(
  fn: Fn,
  config: TraceableConfig,
): Fn {
  if (!isLangSmithEnabled()) {
    return fn;
  }

  return traceable(fn, config) as Fn;
}

export function createLangSmithSpan<Fn extends (...args: any[]) => any>(
  name: string,
  fn: Fn,
  config: TraceableConfig = {},
): Fn {
  return withLangSmithTrace(fn, { name, ...config });
}
