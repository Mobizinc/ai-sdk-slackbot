/**
 * Database Initialization
 * Loads context and state from database on startup/first request
 *
 * Features:
 * - Retry logic for transient failures
 * - Connection validation before loading data
 * - Graceful degradation to memory-only mode
 * - Detailed logging for debugging
 */

import { getContextManager } from "../context-manager";
import { getKBStateMachine } from "../services/kb-state-machine";
import { isDatabaseAvailable, testDatabaseConnection } from "./client";
import { withInitRetry } from "./retry-wrapper";

let initialized = false;
let initializationAttempts = 0;

/**
 * Initialize database and load persisted data
 * Safe to call multiple times (only runs once)
 */
export async function initializeDatabase(): Promise<void> {
  if (initialized) {
    return; // Already initialized
  }

  initializationAttempts++;

  if (!isDatabaseAvailable()) {
    console.log("[Database Init] DATABASE_URL not configured, running in memory-only mode");
    initialized = true;
    return;
  }

  try {
    console.log(`[Database Init] Starting initialization (attempt ${initializationAttempts})...`);

    // Test database connection with retry
    const isConnected = await withInitRetry(
      async () => {
        const result = await testDatabaseConnection();
        if (!result) {
          throw new Error('Database connection test failed');
        }
        return result;
      },
      'test database connection'
    );

    if (!isConnected) {
      throw new Error('Database connection unavailable');
    }

    console.log('[Database Init] Connection validated successfully');

    // Load case contexts from database with retry
    await withInitRetry(async () => {
      const contextManager = getContextManager();
      await contextManager.loadFromDatabase();
    }, 'load case contexts');

    // Load KB generation states from database with retry
    await withInitRetry(async () => {
      const stateMachine = getKBStateMachine();
      await stateMachine.loadFromDatabase();
    }, 'load KB states');

    console.log("[Database Init] Initialization complete", {
      attempts: initializationAttempts,
    });
    initialized = true;
  } catch (error) {
    console.error("[Database Init] Initialization failed after retries:", {
      error: error instanceof Error ? error.message : String(error),
      attempts: initializationAttempts,
    });

    // Continue without database - app will work in memory-only mode
    console.warn("[Database Init] Continuing in memory-only mode");
    initialized = true;
  }
}

/**
 * Reset initialization state (for testing)
 */
export function resetInitialization(): void {
  initialized = false;
  initializationAttempts = 0;
}
