/**
 * Database Configuration
 *
 * Centralized configuration for Neon Postgres connections.
 * Handles connection string building, timeout configuration,
 * and environment-based settings.
 */

export interface DatabaseConfig {
  /** Base DATABASE_URL from environment */
  url: string | undefined;

  /** Connection timeout in seconds (default: 10) */
  connectTimeoutSeconds: number;

  /** Statement/query timeout in milliseconds (default: 30000 = 30s) */
  statementTimeoutMs: number;

  /** Idle transaction timeout in milliseconds (default: 30000 = 30s) */
  idleInTransactionTimeoutMs: number;

  /** Enable connection caching for lower latency (default: true) */
  enableConnectionCache: boolean;

  /** Maximum retry attempts for connections (default: 5) */
  maxRetries: number;

  /** Initial retry delay in milliseconds (default: 100) */
  initialRetryDelayMs: number;

  /** Maximum retry delay in milliseconds (default: 5000) */
  maxRetryDelayMs: number;
}

/**
 * Get database configuration from environment variables.
 */
export function getDatabaseConfig(): DatabaseConfig {
  return {
    url: process.env.DATABASE_URL,

    connectTimeoutSeconds: getEnvNumber('DB_CONNECT_TIMEOUT_SECONDS', 10),
    statementTimeoutMs: getEnvNumber('DB_STATEMENT_TIMEOUT_MS', 30000),
    idleInTransactionTimeoutMs: getEnvNumber('DB_IDLE_IN_TRANSACTION_TIMEOUT_MS', 30000),

    enableConnectionCache: getEnvBoolean('DB_ENABLE_CONNECTION_CACHE', true),

    maxRetries: getEnvNumber('DB_RETRY_MAX_ATTEMPTS', 5),
    initialRetryDelayMs: getEnvNumber('DB_RETRY_INITIAL_DELAY_MS', 100),
    maxRetryDelayMs: getEnvNumber('DB_RETRY_MAX_DELAY_MS', 5000),
  };
}

/**
 * Build a connection string with timeout parameters.
 *
 * @param baseUrl Base DATABASE_URL
 * @param config Database configuration
 * @returns Connection string with timeout parameters
 */
export function buildConnectionString(baseUrl: string, config: DatabaseConfig): string {
  // Parse the URL to check if it already has parameters
  const url = new URL(baseUrl);

  // Add timeout parameters if not already present
  if (!url.searchParams.has('connect_timeout')) {
    url.searchParams.set('connect_timeout', String(config.connectTimeoutSeconds));
  }

  if (!url.searchParams.has('statement_timeout')) {
    url.searchParams.set('statement_timeout', String(config.statementTimeoutMs));
  }

  if (!url.searchParams.has('idle_in_transaction_session_timeout')) {
    url.searchParams.set(
      'idle_in_transaction_session_timeout',
      String(config.idleInTransactionTimeoutMs)
    );
  }

  // Ensure SSL mode for production
  if (!url.searchParams.has('sslmode')) {
    url.searchParams.set('sslmode', 'require');
  }

  return url.toString();
}

/**
 * Check if database is configured (URL is set).
 */
export function isDatabaseConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

/**
 * Get environment-specific configuration overrides.
 */
export function getEnvironmentConfig(): Partial<DatabaseConfig> {
  const nodeEnv = process.env.NODE_ENV || 'development';

  switch (nodeEnv) {
    case 'production':
      return {
        // Production: More aggressive timeouts and retries
        statementTimeoutMs: 30000, // 30s
        maxRetries: 5,
        enableConnectionCache: true,
      };

    case 'development':
      return {
        // Development: Longer timeouts for debugging
        statementTimeoutMs: 60000, // 60s
        maxRetries: 3,
        enableConnectionCache: true,
      };

    case 'test':
      return {
        // Test: Shorter timeouts, fewer retries
        statementTimeoutMs: 10000, // 10s
        maxRetries: 2,
        enableConnectionCache: false, // Disable cache for test isolation
      };

    default:
      return {};
  }
}

/**
 * Get complete database configuration with environment overrides.
 */
export function getFullDatabaseConfig(): DatabaseConfig {
  const baseConfig = getDatabaseConfig();
  const envConfig = getEnvironmentConfig();

  return {
    ...baseConfig,
    ...envConfig,
  };
}

// Helper functions

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;

  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;

  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Validate database configuration and log warnings for common issues.
 */
export function validateDatabaseConfig(config: DatabaseConfig): void {
  if (!config.url) {
    console.warn('[DB Config] DATABASE_URL not configured - running in memory-only mode');
    return;
  }

  // Validate timeout values
  if (config.connectTimeoutSeconds < 5) {
    console.warn(
      `[DB Config] Connect timeout is very low (${config.connectTimeoutSeconds}s) - may cause connection failures`
    );
  }

  if (config.statementTimeoutMs < 5000) {
    console.warn(
      `[DB Config] Statement timeout is very low (${config.statementTimeoutMs}ms) - may cause query failures`
    );
  }

  // Validate retry configuration
  if (config.maxRetries < 1) {
    console.warn(`[DB Config] Max retries is less than 1 - retries disabled`);
  }

  if (config.maxRetries > 10) {
    console.warn(
      `[DB Config] Max retries is very high (${config.maxRetries}) - may cause excessive delays`
    );
  }

  // Log configuration in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[DB Config] Database configuration:', {
      hasUrl: !!config.url,
      connectTimeoutSeconds: config.connectTimeoutSeconds,
      statementTimeoutMs: config.statementTimeoutMs,
      enableConnectionCache: config.enableConnectionCache,
      maxRetries: config.maxRetries,
    });
  }
}
