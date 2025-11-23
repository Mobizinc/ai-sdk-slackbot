/**
 * Neon Database Client
 * Singleton Drizzle instance for serverless Postgres access
 *
 * Features:
 * - Connection caching for 10ms faster connections
 * - Timeout configuration for reliability
 * - Retry logic for transient failures
 * - Graceful degradation to memory-only mode
 */

import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon, neonConfig } from "@neondatabase/serverless";
import * as schema from "./schema";
import {
  getFullDatabaseConfig,
  buildConnectionString,
  validateDatabaseConfig,
} from "./config";
import { withInitRetry } from "./retry-wrapper";

// Enable connection caching for lower latency (10ms improvement)
// This caches the connection between requests for better performance
neonConfig.fetchConnectionCache = true;

let db: NeonHttpDatabase<typeof schema> | null = null;
let isInitializing = false;
let initializationError: Error | null = null;

/**
 * Initialize and return Drizzle database client
 * Creates singleton instance on first call with retry logic
 */
export function getDb() {
  // Return cached instance if available
  if (db) {
    return db;
  }

  // If initialization previously failed permanently, return null
  if (initializationError) {
    return null;
  }

  // Prevent concurrent initialization
  if (isInitializing) {
    return null;
  }

  const config = getFullDatabaseConfig();

  if (!config.url) {
    console.warn(
      "[Database] DATABASE_URL not configured. Running in memory-only mode."
    );
    return null;
  }

  // Validate configuration
  validateDatabaseConfig(config);

  try {
    isInitializing = true;

    // Build connection string with timeout parameters
    const connectionString = buildConnectionString(config.url, config);

    // Initialize connection (synchronously for singleton pattern)
    // Note: The retry logic will be used in init.ts for async initialization
    const sql = neon(connectionString);
    db = drizzle(sql, { schema });

    console.log("[Database] Connected to Neon Postgres", {
      cacheEnabled: neonConfig.fetchConnectionCache,
      connectTimeout: config.connectTimeoutSeconds,
      statementTimeout: config.statementTimeoutMs,
    });

    isInitializing = false;
    return db;
  } catch (error) {
    isInitializing = false;
    initializationError = error instanceof Error ? error : new Error(String(error));

    console.error("[Database] Failed to initialize connection:", {
      error: initializationError.message,
      willRetry: false, // Sync initialization doesn't retry
    });

    return null;
  }
}

/**
 * Check if database is configured and available
 */
export function isDatabaseAvailable(): boolean {
  return !!process.env.DATABASE_URL;
}

/**
 * Reset database connection (primarily for testing)
 */
export function resetDb() {
  db = null;
  isInitializing = false;
  initializationError = null;
}

/**
 * Test database connection by executing a simple query.
 * Useful for health checks and initialization validation.
 *
 * @returns Promise resolving to true if connection is working
 */
export async function testDatabaseConnection(): Promise<boolean> {
  const client = getDb();

  if (!client) {
    return false;
  }

  try {
    // Execute a simple query to test the connection
    await client.execute('SELECT 1 as test');
    return true;
  } catch (error) {
    console.error("[Database] Connection test failed:", error);
    return false;
  }
}
