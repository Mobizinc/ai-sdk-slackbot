/**
 * Prompt Repository
 * Database operations for centralized prompt management with versioning
 */

import { eq, and, desc, ilike, sql, asc } from "drizzle-orm";
import {
  prompts,
  promptVersions,
  type Prompt,
  type NewPrompt,
  type PromptVersion,
  type NewPromptVersion,
} from "../schema";
import { getDb } from "../client";

export type PromptType = "system" | "requirement" | "workflow" | "context_template" | "custom";

export interface PromptSearchCriteria {
  type?: PromptType;
  isActive?: boolean;
  searchTerm?: string;
}

export interface UpdatePromptInput {
  content?: string;
  description?: string;
  variables?: string[];
  isActive?: boolean;
  updatedBy?: string;
  changeNotes?: string;
}

export class PromptRepository {
  /**
   * Find prompt by unique name
   */
  async findByName(name: string): Promise<Prompt | null> {
    const db = getDb();
    if (!db) return null;

    try {
      const results = await db
        .select()
        .from(prompts)
        .where(eq(prompts.name, name))
        .limit(1);

      return results[0] || null;
    } catch (error) {
      console.error(`[Prompt Repo] Error finding by name "${name}":`, error);
      return null;
    }
  }

  /**
   * Find active prompt by name (most common use case)
   */
  async findActiveByName(name: string): Promise<Prompt | null> {
    const db = getDb();
    if (!db) return null;

    try {
      const results = await db
        .select()
        .from(prompts)
        .where(and(eq(prompts.name, name), eq(prompts.isActive, true)))
        .limit(1);

      return results[0] || null;
    } catch (error) {
      console.error(`[Prompt Repo] Error finding active by name "${name}":`, error);
      return null;
    }
  }

  /**
   * Find prompt by ID
   */
  async findById(id: string): Promise<Prompt | null> {
    const db = getDb();
    if (!db) return null;

    try {
      const results = await db
        .select()
        .from(prompts)
        .where(eq(prompts.id, id))
        .limit(1);

      return results[0] || null;
    } catch (error) {
      console.error(`[Prompt Repo] Error finding by ID "${id}":`, error);
      return null;
    }
  }

  /**
   * Get all prompts with optional filtering
   */
  async findAll(criteria?: PromptSearchCriteria): Promise<Prompt[]> {
    const db = getDb();
    if (!db) return [];

    try {
      let query = db.select().from(prompts);
      const conditions = [];

      if (criteria?.type) {
        conditions.push(eq(prompts.type, criteria.type));
      }

      if (criteria?.isActive !== undefined) {
        conditions.push(eq(prompts.isActive, criteria.isActive));
      }

      if (criteria?.searchTerm) {
        conditions.push(
          sql`(${prompts.name} ILIKE ${`%${criteria.searchTerm}%`} OR ${prompts.description} ILIKE ${`%${criteria.searchTerm}%`})`
        );
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      return await query.orderBy(prompts.type, prompts.name);
    } catch (error) {
      console.error("[Prompt Repo] Error finding all:", error);
      return [];
    }
  }

  /**
   * Get all active prompts by type
   */
  async findByType(type: PromptType): Promise<Prompt[]> {
    const db = getDb();
    if (!db) return [];

    try {
      return await db
        .select()
        .from(prompts)
        .where(and(eq(prompts.type, type), eq(prompts.isActive, true)))
        .orderBy(prompts.name);
    } catch (error) {
      console.error(`[Prompt Repo] Error finding by type "${type}":`, error);
      return [];
    }
  }

  /**
   * Create a new prompt
   */
  async create(prompt: NewPrompt): Promise<Prompt | null> {
    const db = getDb();
    if (!db) return null;

    try {
      const results = await db.insert(prompts).values(prompt).returning();

      const created = results[0];
      if (created) {
        // Create initial version record
        await this.createVersionRecord({
          promptId: created.id,
          version: 1,
          content: created.content,
          createdBy: created.createdBy,
          changeNotes: "Initial version",
        });
      }

      return created || null;
    } catch (error) {
      console.error("[Prompt Repo] Error creating prompt:", error);
      return null;
    }
  }

  /**
   * Update a prompt and create a new version if content changed
   */
  async update(id: string, updates: UpdatePromptInput): Promise<Prompt | null> {
    const db = getDb();
    if (!db) return null;

    try {
      // Get current prompt
      const current = await this.findById(id);
      if (!current) {
        console.error(`[Prompt Repo] Prompt not found for update: ${id}`);
        return null;
      }

      const contentChanged = updates.content && updates.content !== current.content;
      const newVersion = contentChanged ? current.version + 1 : current.version;

      const updateData: Partial<Prompt> = {
        updatedAt: new Date(),
      };

      if (updates.content !== undefined) updateData.content = updates.content;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.variables !== undefined) updateData.variables = updates.variables;
      if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
      if (updates.updatedBy !== undefined) updateData.updatedBy = updates.updatedBy;
      if (contentChanged) updateData.version = newVersion;

      const results = await db
        .update(prompts)
        .set(updateData)
        .where(eq(prompts.id, id))
        .returning();

      const updated = results[0];

      // Create version record if content changed
      if (updated && contentChanged) {
        await this.createVersionRecord({
          promptId: updated.id,
          version: newVersion,
          content: updates.content!,
          createdBy: updates.updatedBy,
          changeNotes: updates.changeNotes,
        });
      }

      return updated || null;
    } catch (error) {
      console.error(`[Prompt Repo] Error updating prompt ${id}:`, error);
      return null;
    }
  }

  /**
   * Soft delete (deactivate) a prompt
   */
  async deactivate(id: string, updatedBy?: string): Promise<boolean> {
    const db = getDb();
    if (!db) return false;

    try {
      await db
        .update(prompts)
        .set({
          isActive: false,
          updatedAt: new Date(),
          updatedBy,
        })
        .where(eq(prompts.id, id));

      return true;
    } catch (error) {
      console.error(`[Prompt Repo] Error deactivating prompt ${id}:`, error);
      return false;
    }
  }

  /**
   * Reactivate a deactivated prompt
   */
  async reactivate(id: string, updatedBy?: string): Promise<boolean> {
    const db = getDb();
    if (!db) return false;

    try {
      await db
        .update(prompts)
        .set({
          isActive: true,
          updatedAt: new Date(),
          updatedBy,
        })
        .where(eq(prompts.id, id));

      return true;
    } catch (error) {
      console.error(`[Prompt Repo] Error reactivating prompt ${id}:`, error);
      return false;
    }
  }

  /**
   * Hard delete a prompt (use with caution)
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    if (!db) return false;

    try {
      await db.delete(prompts).where(eq(prompts.id, id));
      return true;
    } catch (error) {
      console.error(`[Prompt Repo] Error deleting prompt ${id}:`, error);
      return false;
    }
  }

  // ============= Version Management =============

  /**
   * Create a version record
   */
  private async createVersionRecord(version: NewPromptVersion): Promise<PromptVersion | null> {
    const db = getDb();
    if (!db) return null;

    try {
      const results = await db.insert(promptVersions).values(version).returning();
      return results[0] || null;
    } catch (error) {
      console.error("[Prompt Repo] Error creating version record:", error);
      return null;
    }
  }

  /**
   * Get version history for a prompt
   */
  async getVersionHistory(promptId: string): Promise<PromptVersion[]> {
    const db = getDb();
    if (!db) return [];

    try {
      return await db
        .select()
        .from(promptVersions)
        .where(eq(promptVersions.promptId, promptId))
        .orderBy(desc(promptVersions.version));
    } catch (error) {
      console.error(`[Prompt Repo] Error getting version history for ${promptId}:`, error);
      return [];
    }
  }

  /**
   * Get a specific version of a prompt
   */
  async getVersion(promptId: string, version: number): Promise<PromptVersion | null> {
    const db = getDb();
    if (!db) return null;

    try {
      const results = await db
        .select()
        .from(promptVersions)
        .where(
          and(eq(promptVersions.promptId, promptId), eq(promptVersions.version, version))
        )
        .limit(1);

      return results[0] || null;
    } catch (error) {
      console.error(`[Prompt Repo] Error getting version ${version} for ${promptId}:`, error);
      return null;
    }
  }

  /**
   * Rollback prompt to a previous version
   */
  async rollbackToVersion(
    promptId: string,
    version: number,
    updatedBy?: string
  ): Promise<Prompt | null> {
    const db = getDb();
    if (!db) return null;

    try {
      // Get the version to rollback to
      const targetVersion = await this.getVersion(promptId, version);
      if (!targetVersion) {
        console.error(`[Prompt Repo] Version ${version} not found for prompt ${promptId}`);
        return null;
      }

      // Get current prompt
      const current = await this.findById(promptId);
      if (!current) {
        console.error(`[Prompt Repo] Prompt not found: ${promptId}`);
        return null;
      }

      // Update with rollback content (this creates a new version)
      return await this.update(promptId, {
        content: targetVersion.content,
        updatedBy,
        changeNotes: `Rollback to version ${version}`,
      });
    } catch (error) {
      console.error(`[Prompt Repo] Error rolling back to version ${version}:`, error);
      return null;
    }
  }

  // ============= Utility Methods =============

  /**
   * Check if a prompt name already exists
   */
  async nameExists(name: string, excludeId?: string): Promise<boolean> {
    const db = getDb();
    if (!db) return false;

    try {
      const conditions = [eq(prompts.name, name)];
      if (excludeId) {
        conditions.push(sql`${prompts.id} != ${excludeId}`);
      }

      const results = await db
        .select({ id: prompts.id })
        .from(prompts)
        .where(and(...conditions))
        .limit(1);

      return results.length > 0;
    } catch (error) {
      console.error(`[Prompt Repo] Error checking name existence:`, error);
      return false;
    }
  }

  /**
   * Get prompt statistics
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    byType: Record<string, number>;
  }> {
    const db = getDb();
    if (!db) return { total: 0, active: 0, byType: {} };

    try {
      const all = await db.select().from(prompts);
      const active = all.filter((p) => p.isActive).length;
      const byType: Record<string, number> = {};

      for (const prompt of all) {
        byType[prompt.type] = (byType[prompt.type] || 0) + 1;
      }

      return { total: all.length, active, byType };
    } catch (error) {
      console.error("[Prompt Repo] Error getting stats:", error);
      return { total: 0, active: 0, byType: {} };
    }
  }

  /**
   * Duplicate a prompt with a new name
   */
  async duplicate(id: string, newName: string, createdBy?: string): Promise<Prompt | null> {
    const db = getDb();
    if (!db) return null;

    try {
      const original = await this.findById(id);
      if (!original) {
        console.error(`[Prompt Repo] Original prompt not found: ${id}`);
        return null;
      }

      // Check if new name already exists
      if (await this.nameExists(newName)) {
        console.error(`[Prompt Repo] Prompt name already exists: ${newName}`);
        return null;
      }

      return await this.create({
        name: newName,
        type: original.type,
        content: original.content,
        description: original.description
          ? `Copy of: ${original.description}`
          : `Copy of ${original.name}`,
        variables: original.variables,
        createdBy,
      });
    } catch (error) {
      console.error(`[Prompt Repo] Error duplicating prompt ${id}:`, error);
      return null;
    }
  }

  /**
   * Bulk upsert prompts (useful for seeding)
   */
  async upsertMany(
    items: Array<{
      name: string;
      type: PromptType;
      content: string;
      description?: string;
      variables?: string[];
      createdBy?: string;
    }>
  ): Promise<{ created: number; updated: number }> {
    const db = getDb();
    if (!db) return { created: 0, updated: 0 };

    let created = 0;
    let updated = 0;

    for (const item of items) {
      try {
        const existing = await this.findByName(item.name);

        if (existing) {
          // Update if content differs
          if (existing.content !== item.content) {
            await this.update(existing.id, {
              content: item.content,
              description: item.description,
              variables: item.variables,
              updatedBy: item.createdBy,
              changeNotes: "Bulk upsert update",
            });
            updated++;
          }
        } else {
          await this.create({
            name: item.name,
            type: item.type,
            content: item.content,
            description: item.description,
            variables: item.variables || [],
            createdBy: item.createdBy,
          });
          created++;
        }
      } catch (error) {
        console.error(`[Prompt Repo] Error upserting "${item.name}":`, error);
      }
    }

    return { created, updated };
  }
}

// Singleton instance
let repository: PromptRepository | null = null;

export function getPromptRepository(): PromptRepository {
  if (!repository) {
    repository = new PromptRepository();
  }
  return repository;
}
