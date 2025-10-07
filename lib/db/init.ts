/**
 * Database Initialization
 * Loads context and state from database on startup/first request
 */

import { getContextManager } from "../context-manager";
import { getKBStateMachine } from "../services/kb-state-machine";
import { isDatabaseAvailable } from "./client";

let initialized = false;

/**
 * Initialize database and load persisted data
 * Safe to call multiple times (only runs once)
 */
export async function initializeDatabase(): Promise<void> {
  if (initialized) {
    return; // Already initialized
  }

  if (!isDatabaseAvailable()) {
    console.log("[Database Init] DATABASE_URL not configured, running in memory-only mode");
    initialized = true;
    return;
  }

  try {
    console.log("[Database Init] Starting initialization...");

    // Load case contexts from database
    const contextManager = getContextManager();
    await contextManager.loadFromDatabase();

    // Load KB generation states from database
    const stateMachine = getKBStateMachine();
    await stateMachine.loadFromDatabase();

    console.log("[Database Init] Initialization complete");
    initialized = true;
  } catch (error) {
    console.error("[Database Init] Initialization failed:", error);
    // Continue without database - app will work in memory-only mode
    initialized = true;
  }
}

/**
 * Reset initialization state (for testing)
 */
export function resetInitialization(): void {
  initialized = false;
}
