/**
 * Database Retry Wrapper
 *
 * Provides retry logic with exponential backoff for database operations.
 * Designed to handle transient network failures common with serverless
 * database connections (Neon Postgres over HTTP).
 *
 * Features:
 * - Exponential backoff with jitter
 * - Configurable retry attempts and delays
 * - Intelligent error classification (retryable vs non-retryable)
 * - Integration with existing error-handler.ts
 * - Detailed logging for observability
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 5) */
  maxAttempts: number;

  /** Initial delay in milliseconds (default: 100ms) */
  initialDelayMs: number;

  /** Maximum delay in milliseconds (default: 5000ms) */
  maxDelayMs: number;

  /** Backoff multiplier for exponential growth (default: 2) */
  backoffMultiplier: number;

  /** Maximum jitter as percentage of delay (default: 0.2 = 20%) */
  jitterFactor: number;

  /** Operation name for logging (default: 'database operation') */
  operationName: string;
}

export interface RetryMetrics {
  totalAttempts: number;
  successfulAttempt: number | null;
  totalDelayMs: number;
  errors: Array<{ attempt: number; error: string; delayMs?: number }>;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 5,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitterFactor: 0.2,
  operationName: 'database operation',
};

/**
 * Error patterns that indicate the operation should be retried.
 * Based on Neon Postgres and network error patterns.
 */
const RETRYABLE_ERROR_PATTERNS = [
  // Network errors
  'fetch failed',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ENETUNREACH',
  'EAI_AGAIN',

  // Database connection errors
  'connect ETIMEDOUT',
  'Connection terminated unexpectedly',
  'Connection timeout',
  'database connection failed',
  'could not connect to server',

  // Neon-specific errors
  'Error connecting to database',
  'NeonDbError',

  // Timeout errors
  'statement timeout',
  'query timeout',
  'operation timed out',

  // Temporary errors
  'too many connections',
  'connection pool exhausted',
  'server is starting up',
];

/**
 * Error patterns that should NOT be retried.
 * These indicate permanent failures or user errors.
 */
const NON_RETRYABLE_ERROR_PATTERNS = [
  // Authentication errors
  'authentication failed',
  'password authentication failed',
  'invalid authorization specification',
  'role does not exist',

  // Schema/validation errors
  'relation does not exist',
  'column does not exist',
  'invalid input syntax',
  'duplicate key',
  'violates not-null constraint',
  'violates foreign key constraint',
  'violates unique constraint',
  'violates check constraint',

  // Permission errors
  'permission denied',
  'insufficient privilege',

  // Query errors
  'syntax error',
  'division by zero',
];

/**
 * Determine if an error should be retried based on error patterns.
 */
function isRetryableError(error: unknown): boolean {
  const errorMessage = getErrorMessage(error).toLowerCase();

  // Check for non-retryable patterns first (these take priority)
  const isNonRetryable = NON_RETRYABLE_ERROR_PATTERNS.some(pattern =>
    errorMessage.includes(pattern.toLowerCase())
  );

  if (isNonRetryable) {
    return false;
  }

  // Check for retryable patterns
  const isRetryable = RETRYABLE_ERROR_PATTERNS.some(pattern =>
    errorMessage.includes(pattern.toLowerCase())
  );

  return isRetryable;
}

/**
 * Extract error message from various error types.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Check for nested cause
    if ('cause' in error && error.cause) {
      const causeMessage = getErrorMessage(error.cause);
      return `${error.message} (${causeMessage})`;
    }
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return String(error);
}

/**
 * Calculate delay for the next retry attempt with exponential backoff and jitter.
 *
 * @param attempt Current attempt number (0-indexed)
 * @param options Retry options
 * @returns Delay in milliseconds
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
  // Exponential backoff: initialDelay * (multiplier ^ attempt)
  const exponentialDelay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);

  // Add jitter to prevent thundering herd
  // Jitter range: delay * (1 - jitterFactor) to delay * (1 + jitterFactor)
  const jitterRange = cappedDelay * options.jitterFactor;
  const jitter = (Math.random() * 2 - 1) * jitterRange; // Random value between -jitterRange and +jitterRange

  return Math.max(0, Math.round(cappedDelay + jitter));
}

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a database operation with automatic retry logic.
 *
 * @param operation The async operation to execute
 * @param options Retry configuration options
 * @returns Promise resolving to the operation result
 * @throws The last error if all retry attempts fail
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   async () => await db.insert(users).values({ name: 'John' }),
 *   { operationName: 'insert user' }
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_OPTIONS, ...options };
  const metrics: RetryMetrics = {
    totalAttempts: 0,
    successfulAttempt: null,
    totalDelayMs: 0,
    errors: [],
  };

  let lastError: unknown;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    metrics.totalAttempts++;

    try {
      // Execute the operation
      const result = await operation();

      // Success! Record metrics and return
      metrics.successfulAttempt = attempt + 1;

      if (attempt > 0) {
        // Log successful retry
        console.log(`[DB Retry] ${opts.operationName} succeeded after ${attempt + 1} attempts`, {
          totalAttempts: metrics.totalAttempts,
          totalDelayMs: metrics.totalDelayMs,
        });
      }

      return result;
    } catch (error) {
      lastError = error;
      const errorMessage = getErrorMessage(error);

      // Determine if we should retry
      const shouldRetry = isRetryableError(error);
      const isLastAttempt = attempt === opts.maxAttempts - 1;

      if (!shouldRetry) {
        // Non-retryable error - fail immediately
        console.error(`[DB Retry] ${opts.operationName} failed with non-retryable error:`, {
          error: errorMessage,
          attempt: attempt + 1,
        });
        metrics.errors.push({ attempt: attempt + 1, error: errorMessage });
        throw error;
      }

      if (isLastAttempt) {
        // Last attempt failed - give up
        console.error(`[DB Retry] ${opts.operationName} failed after ${opts.maxAttempts} attempts:`, {
          error: errorMessage,
          totalDelayMs: metrics.totalDelayMs,
          attempts: metrics.errors,
        });
        metrics.errors.push({ attempt: attempt + 1, error: errorMessage });
        throw error;
      }

      // Calculate delay for next retry
      const delayMs = calculateDelay(attempt, opts);
      metrics.totalDelayMs += delayMs;
      metrics.errors.push({ attempt: attempt + 1, error: errorMessage, delayMs });

      // Log retry attempt
      console.warn(`[DB Retry] ${opts.operationName} failed, retrying...`, {
        error: errorMessage,
        attempt: attempt + 1,
        maxAttempts: opts.maxAttempts,
        delayMs,
        nextAttempt: attempt + 2,
      });

      // Wait before retrying
      await sleep(delayMs);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError;
}

/**
 * Convenience wrapper for database query operations.
 * Uses sensible defaults for query operations.
 */
export async function withQueryRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  return withRetry(operation, {
    operationName,
    maxAttempts: 5,
    initialDelayMs: 100,
    maxDelayMs: 5000,
  });
}

/**
 * Convenience wrapper for database write operations.
 * Uses fewer retries but longer delays for write operations.
 */
export async function withWriteRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  return withRetry(operation, {
    operationName,
    maxAttempts: 3,
    initialDelayMs: 200,
    maxDelayMs: 3000,
  });
}

/**
 * Convenience wrapper for database initialization.
 * Uses aggressive retries for initialization failures.
 */
export async function withInitRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  return withRetry(operation, {
    operationName,
    maxAttempts: 3,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
  });
}
