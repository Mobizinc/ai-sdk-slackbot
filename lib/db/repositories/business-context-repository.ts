/**
 * Business Context Repository
 * Database operations for business entity contexts
 */

import { eq, and, ilike } from "drizzle-orm";
import { businessContexts, type BusinessContext, type NewBusinessContext } from "../schema";
import { getDb } from "../client";

export class BusinessContextRepository {
  /**
   * Find business context by entity name (case-insensitive)
   */
  async findByName(entityName: string): Promise<BusinessContext | null> {
    const db = getDb();
    if (!db) return null;

    try {
      const results = await db
        .select()
        .from(businessContexts)
        .where(
          and(
            ilike(businessContexts.entityName, entityName),
            eq(businessContexts.isActive, true)
          )
        )
        .limit(1);

      return results[0] || null;
    } catch (error) {
      console.error(`[Business Context Repo] Error finding by name "${entityName}":`, error);
      return null;
    }
  }

  /**
   * Find business context by entity name or alias
   */
  async findByNameOrAlias(searchTerm: string): Promise<BusinessContext | null> {
    const db = getDb();
    if (!db) return null;

    try {
      // First try exact name match
      const byName = await this.findByName(searchTerm);
      if (byName) return byName;

      // Then search in aliases (PostgreSQL JSONB contains check)
      // We'll do a case-insensitive search through all active entities
      const allContexts = await db
        .select()
        .from(businessContexts)
        .where(eq(businessContexts.isActive, true));

      const searchLower = searchTerm.toLowerCase();

      for (const context of allContexts) {
        if (context.aliases && Array.isArray(context.aliases)) {
          const aliasMatch = context.aliases.some(
            (alias: string) => alias.toLowerCase() === searchLower
          );
          if (aliasMatch) return context;
        }
      }

      return null;
    } catch (error) {
      console.error(`[Business Context Repo] Error finding by name or alias "${searchTerm}":`, error);
      return null;
    }
  }

  /**
   * Get all active business contexts
   */
  async getAllActive(): Promise<BusinessContext[]> {
    const db = getDb();
    if (!db) return [];

    try {
      return await db
        .select()
        .from(businessContexts)
        .where(eq(businessContexts.isActive, true))
        .orderBy(businessContexts.entityName);
    } catch (error) {
      console.error("[Business Context Repo] Error getting all active:", error);
      return [];
    }
  }

  /**
   * Get all contexts of a specific type (CLIENT, VENDOR, PLATFORM)
   */
  async getByType(entityType: string): Promise<BusinessContext[]> {
    const db = getDb();
    if (!db) return [];

    try {
      return await db
        .select()
        .from(businessContexts)
        .where(
          and(
            eq(businessContexts.entityType, entityType),
            eq(businessContexts.isActive, true)
          )
        )
        .orderBy(businessContexts.entityName);
    } catch (error) {
      console.error(`[Business Context Repo] Error getting by type "${entityType}":`, error);
      return [];
    }
  }

  /**
   * Create a new business context
   */
  async create(context: NewBusinessContext): Promise<BusinessContext | null> {
    const db = getDb();
    if (!db) return null;

    try {
      const results = await db
        .insert(businessContexts)
        .values(context)
        .returning();

      return results[0] || null;
    } catch (error) {
      console.error("[Business Context Repo] Error creating context:", error);
      return null;
    }
  }

  /**
   * Update an existing business context
   */
  async update(id: number, updates: Partial<NewBusinessContext>): Promise<BusinessContext | null> {
    const db = getDb();
    if (!db) return null;

    try {
      const results = await db
        .update(businessContexts)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(businessContexts.id, id))
        .returning();

      return results[0] || null;
    } catch (error) {
      console.error(`[Business Context Repo] Error updating context ${id}:`, error);
      return null;
    }
  }

  /**
   * Deactivate a business context (soft delete)
   */
  async deactivate(id: number): Promise<boolean> {
    const db = getDb();
    if (!db) return false;

    try {
      await db
        .update(businessContexts)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(businessContexts.id, id));

      return true;
    } catch (error) {
      console.error(`[Business Context Repo] Error deactivating context ${id}:`, error);
      return false;
    }
  }
}

// Singleton instance
let repository: BusinessContextRepository | null = null;

export function getBusinessContextRepository(): BusinessContextRepository {
  if (!repository) {
    repository = new BusinessContextRepository();
  }
  return repository;
}
