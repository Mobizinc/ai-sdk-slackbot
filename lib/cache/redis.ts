import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    const value = await redis.get<T>(key);
    return (value as T) ?? null;
  } catch (error) {
    console.warn(`[Redis] get failed for ${key}:`, error);
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
  if (!redis) return false;
  try {
    await redis.set(key, value, { ex: ttlSeconds });
    return true;
  } catch (error) {
    console.warn(`[Redis] set failed for ${key}:`, error);
    return false;
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  if (!redis) return;
  try {
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.warn(`[Redis] del failed for keys ${keys.join(',')}:`, error);
  }
}
