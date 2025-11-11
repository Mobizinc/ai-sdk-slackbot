/**
 * Discovery Context Pack Cache
 *
 * Provides brief caching of discovery context packs to prevent
 * hammering APIs when multiple agents need the same information.
 *
 * Implementation: In-memory LRU cache with configurable TTL
 * Future: Could be backed by Redis for multi-instance deployments
 */

import type { DiscoveryContextPack } from "./context-pack";
import { getConfigValue } from "../../config";

interface CacheEntry {
  pack: DiscoveryContextPack;
  cachedAt: number;
  expiresAt: number;
}

/**
 * Simple in-memory LRU cache for context packs
 */
class DiscoveryContextCache {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;
  private defaultTTLMs: number;

  constructor(maxSize = 100, defaultTTLMinutes = 15) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.defaultTTLMs = defaultTTLMinutes * 60 * 1000;
  }

  /**
   * Get cached context pack if available and not expired
   */
  get(key: string): DiscoveryContextPack | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now >= entry.expiresAt) {
      // Expired - remove and return null
      this.cache.delete(key);
      return null;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.pack;
  }

  /**
   * Set cached context pack with optional TTL override
   */
  set(key: string, pack: DiscoveryContextPack, ttlMinutes?: number): void {
    const now = Date.now();
    const ttlMs = ttlMinutes ? ttlMinutes * 60 * 1000 : this.defaultTTLMs;

    const entry: CacheEntry = {
      pack,
      cachedAt: now,
      expiresAt: now + ttlMs,
    };

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, entry);
  }

  /**
   * Invalidate a specific cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate?: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }

  /**
   * Remove expired entries (garbage collection)
   */
  cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.cache.delete(key);
    }
  }
}

// Singleton instance
let cacheInstance: DiscoveryContextCache | null = null;

/**
 * Get or create the discovery context cache instance
 */
export function getDiscoveryContextCache(): DiscoveryContextCache {
  if (!cacheInstance) {
    const maxSize = ensurePositiveInt(getConfigValue("discoveryContextCacheSize"), 100);
    const ttlMinutes = ensurePositiveInt(getConfigValue("discoveryContextCacheTTLMinutes"), 15);

    cacheInstance = new DiscoveryContextCache(maxSize, ttlMinutes);

    // Schedule periodic cleanup (every 5 minutes)
    if (typeof setInterval !== "undefined") {
      setInterval(() => {
        cacheInstance?.cleanup();
      }, 5 * 60 * 1000);
    }
  }

  return cacheInstance;
}

/**
 * Generate cache key for a discovery context pack
 */
export function generateCacheKey(options: {
  caseNumber?: string;
  channelId?: string;
  threadTs?: string;
  companyName?: string;
}): string {
  const parts: string[] = [];

  if (options.caseNumber) {
    parts.push(`case:${options.caseNumber}`);
  }

  if (options.channelId && options.threadTs) {
    parts.push(`thread:${options.channelId}:${options.threadTs}`);
  } else if (options.channelId) {
    parts.push(`channel:${options.channelId}`);
  }

  if (options.companyName && parts.length === 0) {
    parts.push(`company:${options.companyName}`);
  }

  return parts.join("|") || "unknown";
}

/**
 * Check if caching is enabled
 */
export function isCachingEnabled(): boolean {
  return getConfigValue("discoveryContextCachingEnabled") === true;
}

function ensurePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
}
