/**
 * Database Health Check Endpoint
 *
 * Provides detailed health status for the Neon Postgres database connection.
 * Useful for monitoring, debugging, and validating configuration.
 *
 * GET /api/health/database
 *
 * Returns:
 * - Connection status (connected/disconnected)
 * - Latency measurement
 * - Database version
 * - Configuration details
 * - Error information (if any)
 */

import { isDatabaseAvailable, testDatabaseConnection } from '../../lib/db/client';
import { getFullDatabaseConfig } from '../../lib/db/config';

export const dynamic = 'force-dynamic'; // Disable caching for health checks

interface DatabaseHealthResponse {
  status: 'healthy' | 'unhealthy' | 'unavailable';
  timestamp: string;
  database: {
    configured: boolean;
    connected: boolean;
    latencyMs?: number;
    version?: string;
    error?: string;
  };
  configuration: {
    cacheEnabled: boolean;
    connectTimeoutSeconds: number;
    statementTimeoutMs: number;
    maxRetries: number;
  };
}

/**
 * Measure database latency by executing a simple query.
 */
async function measureDatabaseLatency(): Promise<number> {
  const startTime = Date.now();
  await testDatabaseConnection();
  const endTime = Date.now();
  return endTime - startTime;
}

/**
 * Get database version information.
 */
async function getDatabaseVersion(): Promise<string | undefined> {
  try {
    // This would require a database client that can execute raw SQL
    // For now, we'll return undefined as we don't have direct SQL access
    // from the health check without importing the full client
    return undefined;
  } catch (error) {
    return undefined;
  }
}

/**
 * GET handler for database health check
 */
export async function GET(): Promise<Response> {
  const config = getFullDatabaseConfig();
  const isConfigured = isDatabaseAvailable();

  // If database is not configured, return unavailable status
  if (!isConfigured) {
    const response: DatabaseHealthResponse = {
      status: 'unavailable',
      timestamp: new Date().toISOString(),
      database: {
        configured: false,
        connected: false,
      },
      configuration: {
        cacheEnabled: config.enableConnectionCache,
        connectTimeoutSeconds: config.connectTimeoutSeconds,
        statementTimeoutMs: config.statementTimeoutMs,
        maxRetries: config.maxRetries,
      },
    };

    return Response.json(response, { status: 503 });
  }

  // Test database connection and measure latency
  let isConnected = false;
  let latencyMs: number | undefined;
  let error: string | undefined;

  try {
    latencyMs = await measureDatabaseLatency();
    isConnected = true;
  } catch (err) {
    isConnected = false;
    error = err instanceof Error ? err.message : String(err);
  }

  // Get database version
  const version = await getDatabaseVersion();

  // Determine overall health status
  const status: 'healthy' | 'unhealthy' = isConnected ? 'healthy' : 'unhealthy';

  const response: DatabaseHealthResponse = {
    status,
    timestamp: new Date().toISOString(),
    database: {
      configured: true,
      connected: isConnected,
      latencyMs,
      version,
      error,
    },
    configuration: {
      cacheEnabled: config.enableConnectionCache,
      connectTimeoutSeconds: config.connectTimeoutSeconds,
      statementTimeoutMs: config.statementTimeoutMs,
      maxRetries: config.maxRetries,
    },
  };

  // Return 200 if healthy, 503 if unhealthy
  const statusCode = status === 'healthy' ? 200 : 503;

  return Response.json(response, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
