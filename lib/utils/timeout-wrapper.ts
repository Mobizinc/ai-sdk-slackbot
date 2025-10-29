/**
 * Timeout Wrapper Utility
 * Wraps promises with configurable timeouts and optional fallback values
 */

export class TimeoutError extends Error {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Wrap a promise with a timeout
 *
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param fallback - Optional fallback function to call on timeout
 * @returns Promise that rejects with TimeoutError if timeout is exceeded
 *
 * @example
 * const result = await withTimeout(
 *   generateObject({ model, schema, prompt }),
 *   30000,
 *   () => ({ object: getFallbackContent() })
 * );
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback?: () => T | Promise<T>
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(
        `Operation timed out after ${timeoutMs}ms`,
        timeoutMs
      ));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);

    // If timeout error and fallback provided, use fallback
    if (error instanceof TimeoutError && fallback) {
      console.warn(`[Timeout Wrapper] ${error.message} - using fallback`);
      return await fallback();
    }

    throw error;
  }
}

/**
 * Check if an error is a timeout error
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

/**
 * Wrap multiple promises with a shared timeout
 * All promises must complete within the timeout period
 */
export async function withTimeoutAll<T>(
  promises: Promise<T>[],
  timeoutMs: number
): Promise<T[]> {
  return withTimeout(Promise.all(promises), timeoutMs);
}

/**
 * Wrap multiple promises with a shared timeout
 * Returns results of all promises that complete before timeout
 * Does not reject on timeout, returns partial results
 */
export async function withTimeoutAllSettled<T>(
  promises: Promise<T>[],
  timeoutMs: number
): Promise<PromiseSettledResult<T>[]> {
  try {
    return await withTimeout(Promise.allSettled(promises), timeoutMs);
  } catch (error) {
    if (isTimeoutError(error)) {
      console.warn(`[Timeout Wrapper] Partial results - some promises exceeded ${timeoutMs}ms`);
      // Return empty array on timeout - all promises incomplete
      return [];
    }
    throw error;
  }
}
