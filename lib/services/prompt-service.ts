/**
 * Prompt Service
 * Centralized service for managing LLM prompts with caching and variable substitution
 *
 * Features:
 * - In-memory cache with configurable TTL (default 5 minutes)
 * - Variable substitution: {{varName}} → actual value
 * - File-based fallback for critical prompts (reliability)
 * - Version management and rollback support
 * - Thread-safe singleton
 *
 * Performance:
 * - Without cache: ~50-100ms per DB lookup
 * - With cache: <1ms per lookup (memory access)
 */

import { readFile } from "fs/promises";
import path from "path";
import {
  getPromptRepository,
  type PromptType,
  type PromptSearchCriteria,
} from "../db/repositories/prompt-repository";
import type { Prompt, PromptVersion } from "../db/schema";

/**
 * Options for getting a prompt
 */
export interface GetPromptOptions {
  /** Variables to substitute in the prompt */
  variables?: Record<string, string | number | boolean>;
  /** Fallback to file if DB prompt not found (path relative to project root) */
  fallbackToFile?: string;
  /** Fallback to static string if all else fails */
  fallbackToStatic?: string;
  /** Skip cache and fetch fresh from DB */
  skipCache?: boolean;
}

/**
 * Variable extraction result
 */
export interface ExtractedVariables {
  variables: string[];
  hasUnsubstituted: boolean;
  unsubstituted: string[];
}

/**
 * Prompt with metadata for API responses
 */
export interface PromptWithMetadata extends Prompt {
  cacheAge?: number;
  source?: "cache" | "database" | "file" | "static";
}

/**
 * Cache entry with timestamp
 */
interface CacheEntry {
  prompt: Prompt;
  timestamp: number;
}

/**
 * Prompt Service Class
 */
export class PromptService {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly TTL: number;
  private readonly projectRoot: string;

  constructor(options?: { ttlMs?: number; projectRoot?: string }) {
    this.TTL = options?.ttlMs || 5 * 60 * 1000; // 5 minutes default
    this.projectRoot = options?.projectRoot || process.cwd();
  }

  // ============= Core Methods =============

  /**
   * Get prompt by name with caching and fallback support
   */
  async getPrompt(name: string, options?: GetPromptOptions): Promise<string | null> {
    const { variables, fallbackToFile, fallbackToStatic, skipCache } = options || {};

    // Try cache first (unless skipped)
    if (!skipCache) {
      const cached = this.getFromCache(name);
      if (cached) {
        console.log(`[Prompt Service] Cache hit for "${name}"`);
        return this.substituteVariables(cached.content, variables);
      }
    }

    // Try database
    const repo = getPromptRepository();
    const dbPrompt = await repo.findActiveByName(name);

    if (dbPrompt) {
      this.setCache(name, dbPrompt);
      console.log(`[Prompt Service] Loaded from DB: "${name}" (v${dbPrompt.version})`);
      return this.substituteVariables(dbPrompt.content, variables);
    }

    // Try file fallback
    if (fallbackToFile) {
      try {
        const filePath = path.join(this.projectRoot, fallbackToFile);
        const fileContent = await readFile(filePath, "utf-8");
        console.log(`[Prompt Service] Loaded from file fallback: ${fallbackToFile}`);
        return this.substituteVariables(fileContent, variables);
      } catch (error) {
        console.warn(`[Prompt Service] File fallback failed for ${fallbackToFile}:`, error);
      }
    }

    // Try static fallback
    if (fallbackToStatic) {
      console.log(`[Prompt Service] Using static fallback for "${name}"`);
      return this.substituteVariables(fallbackToStatic, variables);
    }

    console.warn(`[Prompt Service] Prompt not found: "${name}"`);
    return null;
  }

  /**
   * Get prompt with full metadata (for admin interface)
   */
  async getPromptWithMetadata(name: string): Promise<PromptWithMetadata | null> {
    const cached = this.getFromCache(name);
    if (cached) {
      const now = Date.now();
      const cacheEntry = this.cache.get(name);
      return {
        ...cached,
        cacheAge: cacheEntry ? now - cacheEntry.timestamp : 0,
        source: "cache",
      };
    }

    const repo = getPromptRepository();
    const prompt = await repo.findByName(name);

    if (prompt) {
      this.setCache(name, prompt);
      return {
        ...prompt,
        cacheAge: 0,
        source: "database",
      };
    }

    return null;
  }

  /**
   * Get all prompts matching criteria
   */
  async getAllPrompts(criteria?: PromptSearchCriteria): Promise<Prompt[]> {
    const repo = getPromptRepository();
    return repo.findAll(criteria);
  }

  /**
   * Get prompts by type
   */
  async getPromptsByType(type: PromptType): Promise<Prompt[]> {
    const repo = getPromptRepository();
    return repo.findByType(type);
  }

  // ============= CRUD Operations =============

  /**
   * Create a new prompt
   */
  async createPrompt(input: {
    name: string;
    type: PromptType;
    content: string;
    description?: string;
    variables?: string[];
    createdBy?: string;
  }): Promise<Prompt | null> {
    const repo = getPromptRepository();

    // Check if name exists
    if (await repo.nameExists(input.name)) {
      console.error(`[Prompt Service] Prompt name already exists: ${input.name}`);
      return null;
    }

    // Auto-extract variables if not provided
    const extractedVars = this.extractVariables(input.content);
    const variables = input.variables || extractedVars.variables;

    const prompt = await repo.create({
      name: input.name,
      type: input.type,
      content: input.content,
      description: input.description,
      variables,
      createdBy: input.createdBy,
    });

    if (prompt) {
      this.setCache(prompt.name, prompt);
    }

    return prompt;
  }

  /**
   * Update an existing prompt
   */
  async updatePrompt(
    id: string,
    input: {
      content?: string;
      description?: string;
      variables?: string[];
      isActive?: boolean;
      updatedBy?: string;
      changeNotes?: string;
    }
  ): Promise<Prompt | null> {
    const repo = getPromptRepository();

    // Auto-extract variables if content changed and variables not provided
    let variables = input.variables;
    if (input.content && !input.variables) {
      const extracted = this.extractVariables(input.content);
      variables = extracted.variables;
    }

    const updated = await repo.update(id, {
      ...input,
      variables,
    });

    if (updated) {
      // Invalidate cache for this prompt
      this.invalidateByName(updated.name);
      // Re-cache with updated data
      this.setCache(updated.name, updated);
    }

    return updated;
  }

  /**
   * Deactivate a prompt (soft delete)
   */
  async deactivatePrompt(id: string, updatedBy?: string): Promise<boolean> {
    const repo = getPromptRepository();

    // Get prompt to clear cache by name
    const prompt = await repo.findById(id);
    if (prompt) {
      this.invalidateByName(prompt.name);
    }

    return repo.deactivate(id, updatedBy);
  }

  /**
   * Delete a prompt permanently
   */
  async deletePrompt(id: string): Promise<boolean> {
    const repo = getPromptRepository();

    // Get prompt to clear cache by name
    const prompt = await repo.findById(id);
    if (prompt) {
      this.invalidateByName(prompt.name);
    }

    return repo.delete(id);
  }

  // ============= Version Management =============

  /**
   * Get version history for a prompt
   */
  async getVersionHistory(promptId: string): Promise<PromptVersion[]> {
    const repo = getPromptRepository();
    return repo.getVersionHistory(promptId);
  }

  /**
   * Get a specific version
   */
  async getVersion(promptId: string, version: number): Promise<PromptVersion | null> {
    const repo = getPromptRepository();
    return repo.getVersion(promptId, version);
  }

  /**
   * Rollback to a previous version
   */
  async rollbackToVersion(
    promptId: string,
    version: number,
    updatedBy?: string
  ): Promise<Prompt | null> {
    const repo = getPromptRepository();
    const updated = await repo.rollbackToVersion(promptId, version, updatedBy);

    if (updated) {
      this.invalidateByName(updated.name);
      this.setCache(updated.name, updated);
    }

    return updated;
  }

  // ============= Variable Substitution =============

  /**
   * Substitute variables in prompt content
   * Format: {{variableName}}
   */
  substituteVariables(
    content: string,
    variables?: Record<string, string | number | boolean>
  ): string {
    if (!variables || Object.keys(variables).length === 0) {
      return content;
    }

    return content.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      if (varName in variables) {
        return String(variables[varName]);
      }
      // Leave unmatched variables as-is (might be intentional)
      return match;
    });
  }

  /**
   * Extract variables from prompt content
   * Returns list of variable names found
   */
  extractVariables(content: string): ExtractedVariables {
    const matches = content.match(/\{\{(\w+)\}\}/g) || [];
    const variables = [...new Set(matches.map((m) => m.replace(/[{}]/g, "")))];

    return {
      variables,
      hasUnsubstituted: false, // Will be set when checking actual substitution
      unsubstituted: [],
    };
  }

  /**
   * Validate that all variables in content have values
   */
  validateVariables(
    content: string,
    variables: Record<string, string | number | boolean>
  ): ExtractedVariables {
    const extracted = this.extractVariables(content);
    const unsubstituted = extracted.variables.filter((v) => !(v in variables));

    return {
      variables: extracted.variables,
      hasUnsubstituted: unsubstituted.length > 0,
      unsubstituted,
    };
  }

  // ============= Cache Management =============

  /**
   * Get from cache if not expired
   */
  private getFromCache(name: string): Prompt | null {
    const entry = this.cache.get(name);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age >= this.TTL) {
      // Cache expired
      this.cache.delete(name);
      return null;
    }

    return entry.prompt;
  }

  /**
   * Set cache entry
   */
  private setCache(name: string, prompt: Prompt): void {
    this.cache.set(name, {
      prompt,
      timestamp: Date.now(),
    });
  }

  /**
   * Invalidate cache by prompt name
   */
  invalidateByName(name: string): void {
    this.cache.delete(name);
    console.log(`[Prompt Service] Cache invalidated for "${name}"`);
  }

  /**
   * Invalidate all cache entries
   */
  invalidateAll(): void {
    this.cache.clear();
    console.log("[Prompt Service] All cache invalidated");
  }

  /**
   * Invalidate cache by type (for bulk updates)
   */
  async invalidateByType(type: PromptType): Promise<void> {
    const repo = getPromptRepository();
    const prompts = await repo.findByType(type);

    for (const prompt of prompts) {
      this.cache.delete(prompt.name);
    }

    console.log(`[Prompt Service] Cache invalidated for type "${type}" (${prompts.length} entries)`);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    ttlMs: number;
    entries: Array<{ name: string; ageMs: number; isExpired: boolean }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([name, entry]) => ({
      name,
      ageMs: now - entry.timestamp,
      isExpired: now - entry.timestamp >= this.TTL,
    }));

    return {
      size: this.cache.size,
      ttlMs: this.TTL,
      entries,
    };
  }

  /**
   * Prefetch prompts by type (warm cache)
   */
  async prefetch(types?: PromptType[]): Promise<void> {
    const repo = getPromptRepository();

    if (types) {
      for (const type of types) {
        const prompts = await repo.findByType(type);
        for (const prompt of prompts) {
          this.setCache(prompt.name, prompt);
        }
        console.log(`[Prompt Service] Prefetched ${prompts.length} prompts of type "${type}"`);
      }
    } else {
      const prompts = await repo.findAll({ isActive: true });
      for (const prompt of prompts) {
        this.setCache(prompt.name, prompt);
      }
      console.log(`[Prompt Service] Prefetched ${prompts.length} active prompts`);
    }
  }

  // ============= Utility Methods =============

  /**
   * Test prompt with sample variables
   */
  async testPrompt(
    promptId: string,
    variables: Record<string, string | number | boolean>
  ): Promise<{
    original: string;
    substituted: string;
    validation: ExtractedVariables;
  } | null> {
    const repo = getPromptRepository();
    const prompt = await repo.findById(promptId);

    if (!prompt) return null;

    const validation = this.validateVariables(prompt.content, variables);
    const substituted = this.substituteVariables(prompt.content, variables);

    return {
      original: prompt.content,
      substituted,
      validation,
    };
  }

  /**
   * Duplicate a prompt
   */
  async duplicatePrompt(
    id: string,
    newName: string,
    createdBy?: string
  ): Promise<Prompt | null> {
    const repo = getPromptRepository();
    const duplicated = await repo.duplicate(id, newName, createdBy);

    if (duplicated) {
      this.setCache(duplicated.name, duplicated);
    }

    return duplicated;
  }

  /**
   * Get prompt statistics
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    byType: Record<string, number>;
    cacheStats: {
      size: number;
      ttlMs: number;
      entries: Array<{ name: string; ageMs: number; isExpired: boolean }>;
    };
  }> {
    const repo = getPromptRepository();
    const dbStats = await repo.getStats();

    return {
      ...dbStats,
      cacheStats: this.getCacheStats(),
    };
  }
}

// ============= Singleton =============

let promptService: PromptService | null = null;

/**
 * Get singleton instance of Prompt Service
 */
export function getPromptService(): PromptService {
  if (!promptService) {
    promptService = new PromptService();
  }
  return promptService;
}

/**
 * Invalidate prompt cache (use after external updates)
 */
export function invalidatePromptCache(): void {
  if (promptService) {
    promptService.invalidateAll();
  }
}

/**
 * Prefetch prompts (call during app startup)
 */
export async function prefetchPrompts(types?: PromptType[]): Promise<void> {
  const service = getPromptService();
  await service.prefetch(types);
}
