/**
 * Business Context Repository
 * Database operations for business entity contexts
 */

import { eq, and, ilike } from "drizzle-orm";
import {
  businessContexts,
  type BusinessContext,
  type BusinessContextCmdbIdentifier,
  type NewBusinessContext,
} from "../schema";
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
   * Get all business contexts (including inactive)
   */
  async getAll(): Promise<BusinessContext[]> {
    const db = getDb();
    if (!db) return [];

    try {
      return await db
        .select()
        .from(businessContexts)
        .orderBy(businessContexts.entityName);
    } catch (error) {
      console.error("[Business Context Repo] Error getting all:", error);
      return [];
    }
  }

  /**
   * Find business context by ID
   */
  async findById(id: number): Promise<BusinessContext | null> {
    const db = getDb();
    if (!db) return null;

    try {
      const results = await db
        .select()
        .from(businessContexts)
        .where(eq(businessContexts.id, id))
        .limit(1);

      return results[0] || null;
    } catch (error) {
      console.error(`[Business Context Repo] Error finding by ID ${id}:`, error);
      return null;
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
   * Append a CMDB identifier to an entity (creates entity if allowed and missing)
   */
  async appendCmdbIdentifier(
    entityName: string,
    identifier: BusinessContextCmdbIdentifier,
    options: {
      createIfMissing?: boolean;
      entityType?: string;
      defaults?: Partial<NewBusinessContext>;
    } = {}
  ): Promise<BusinessContext | null> {
    const db = getDb();
    if (!db) return null;

    const existing = await this.findByName(entityName);

    if (!existing) {
      if (!options.createIfMissing) {
        console.warn(
          `[Business Context Repo] appendCmdbIdentifier skipped – ${entityName} does not exist`);
        return null;
      }

      if (!options.entityType) {
        throw new Error(
          `Cannot create ${entityName} without entityType when appending CMDB identifier`
        );
      }

      const newContext: NewBusinessContext = {
        entityName,
        entityType: options.entityType,
        industry: options.defaults?.industry,
        description: options.defaults?.description,
        aliases: options.defaults?.aliases ?? [],
        relatedEntities: options.defaults?.relatedEntities ?? [],
        technologyPortfolio: options.defaults?.technologyPortfolio,
        serviceDetails: options.defaults?.serviceDetails,
        keyContacts: options.defaults?.keyContacts ?? [],
        slackChannels: options.defaults?.slackChannels ?? [],
        cmdbIdentifiers: [identifier],
        contextStewards: options.defaults?.contextStewards ?? [],
        isActive: options.defaults?.isActive ?? true,
      };

      const created = await this.create(newContext);
      return created;
    }

    const existingIdentifiers = Array.isArray(existing.cmdbIdentifiers)
      ? existing.cmdbIdentifiers
      : [];

    const alreadyExists = existingIdentifiers.some((existingIdentifier) => {
      if (identifier.sysId && existingIdentifier.sysId) {
        if (existingIdentifier.sysId === identifier.sysId) return true;
      }

      if (identifier.ciName && existingIdentifier.ciName) {
        if (existingIdentifier.ciName.toLowerCase() === identifier.ciName.toLowerCase()) return true;
      }

      if (identifier.ipAddresses?.length) {
        const normalized = identifier.ipAddresses.map((ip) => ip.trim());
        const existingIps = existingIdentifier.ipAddresses?.map((ip) => ip.trim()) ?? [];
        if (normalized.some((ip) => existingIps.includes(ip))) return true;
      }

      return false;
    });

    if (alreadyExists) {
      console.log(
        `[Business Context Repo] CMDB identifier already present for ${entityName}, skipping append.`
      );
      return existing;
    }

    const updatedIdentifiers = [...existingIdentifiers, identifier];

    const results = await db
      .update(businessContexts)
      .set({
        cmdbIdentifiers: updatedIdentifiers,
        updatedAt: new Date(),
      })
      .where(eq(businessContexts.id, existing.id))
      .returning();

    return results[0] || null;
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

  /**
   * Delete a business context permanently
   */
  async delete(id: number): Promise<boolean> {
    const db = getDb();
    if (!db) return false;

    try {
      await db
        .delete(businessContexts)
        .where(eq(businessContexts.id, id));

      return true;
    } catch (error) {
      console.error(`[Business Context Repo] Error deleting context ${id}:`, error);
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
