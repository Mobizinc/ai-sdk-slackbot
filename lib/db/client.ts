/**
 * Neon Database Client
 * Singleton Drizzle instance for serverless Postgres access
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

let db: ReturnType<typeof drizzle> | null = null;

/**
 * Initialize and return Drizzle database client
 * Creates singleton instance on first call
 */
export function getDb() {
  if (!db) {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      console.warn(
        "[Database] DATABASE_URL not configured. Running in memory-only mode."
      );
      // Return null to signal that DB is not available
      // Repositories will handle this gracefully
      return null;
    }

    try {
      const sql = neon(databaseUrl);
      db = drizzle(sql, { schema });
      console.log("[Database] Connected to Neon Postgres");
    } catch (error) {
      console.error("[Database] Failed to initialize connection:", error);
      return null;
    }
  }

  return db;
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
}
