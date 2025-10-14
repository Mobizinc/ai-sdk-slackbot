/**
 * Client Settings Repository
 * Manages per-client configuration for catalog redirect and other features
 */

import { getDb } from '../client';
import { clientSettings, catalogRedirectLog, type ClientSettings, type NewClientSettings, type NewCatalogRedirectLog, type CatalogRedirectLog } from '../schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';

export interface RedirectMetrics {
  clientId: string;
  clientName: string;
  totalRedirects: number;
  redirectsByType: Record<string, number>;
  averageConfidence: number;
  autoClosedCount: number;
  autoClosedRate: number;
  topKeywords: Array<{ keyword: string; count: number }>;
  topSubmitters: Array<{ submitter: string; count: number }>;
  redirectsByDay: Array<{ date: string; count: number }>;
}

export class ClientSettingsRepository {
  /**
   * Get client settings by client ID
   */
  async getClientSettings(clientId: string): Promise<ClientSettings | null> {
    try {
      const db = getDb();
      if (!db) return null;

      const result = await db
        .select()
        .from(clientSettings)
        .where(eq(clientSettings.clientId, clientId))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error('[ClientSettingsRepository] Error getting client settings:', error);
      return null;
    }
  }

  /**
   * Get client settings by client name (case-insensitive)
   */
  async getClientSettingsByName(clientName: string): Promise<ClientSettings | null> {
    try {
      const db = getDb();
      if (!db) return null;

      const result = await db
        .select()
        .from(clientSettings)
        .where(sql`LOWER(${clientSettings.clientName}) = LOWER(${clientName})`)
        .limit(1);

      return result[0] || null;
    } catch (error) {
      console.error('[ClientSettingsRepository] Error getting client settings by name:', error);
      return null;
    }
  }

  /**
   * Create or update client settings
   */
  async upsertClientSettings(settings: NewClientSettings): Promise<ClientSettings> {
    try {
      const db = getDb();
      if (!db) throw new Error('Database not available');

      const existing = await this.getClientSettings(settings.clientId);

      if (existing) {
        // Update existing
        const updated = await db
          .update(clientSettings)
          .set({
            ...settings,
            updatedAt: new Date(),
          })
          .where(eq(clientSettings.clientId, settings.clientId))
          .returning();

        return updated[0];
      } else {
        // Insert new
        const inserted = await db
          .insert(clientSettings)
          .values(settings)
          .returning();

        return inserted[0];
      }
    } catch (error) {
      console.error('[ClientSettingsRepository] Error upserting client settings:', error);
      throw error;
    }
  }

  /**
   * Update specific settings fields for a client
   */
  async updateClientSettings(
    clientId: string,
    updates: Partial<Omit<ClientSettings, 'id' | 'clientId' | 'createdAt'>>
  ): Promise<ClientSettings | null> {
    try {
      const db = getDb();
      if (!db) return null;

      const result = await db
        .update(clientSettings)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(clientSettings.clientId, clientId))
        .returning();

      return result[0] || null;
    } catch (error) {
      console.error('[ClientSettingsRepository] Error updating client settings:', error);
      throw error;
    }
  }

  /**
   * Get all client settings
   */
  async getAllClientSettings(): Promise<ClientSettings[]> {
    try {
      const db = getDb();
      if (!db) return [];

      const result = await db
        .select()
        .from(clientSettings)
        .orderBy(clientSettings.clientName);

      return result;
    } catch (error) {
      console.error('[ClientSettingsRepository] Error getting all client settings:', error);
      return [];
    }
  }

  /**
   * Get clients with catalog redirect enabled
   */
  async getClientsWithRedirectEnabled(): Promise<ClientSettings[]> {
    try {
      const db = getDb();
      if (!db) return [];

      const result = await db
        .select()
        .from(clientSettings)
        .where(eq(clientSettings.catalogRedirectEnabled, true))
        .orderBy(clientSettings.clientName);

      return result;
    } catch (error) {
      console.error('[ClientSettingsRepository] Error getting clients with redirect enabled:', error);
      return [];
    }
  }

  /**
   * Log a catalog redirect
   */
  async logRedirect(log: NewCatalogRedirectLog): Promise<void> {
    try {
      const db = getDb();
      if (!db) return;

      await db
        .insert(catalogRedirectLog)
        .values(log);

      console.log(`[ClientSettingsRepository] Logged redirect for case ${log.caseNumber}`);
    } catch (error) {
      console.error('[ClientSettingsRepository] Error logging redirect:', error);
      // Don't throw - logging failure shouldn't break the redirect
    }
  }

  /**
   * Get redirect metrics for a client
   */
  async getRedirectMetrics(clientId: string, days: number = 30): Promise<RedirectMetrics> {
    try {
      const db = getDb();
      if (!db) {
        return {
          clientId,
          clientName: clientId,
          totalRedirects: 0,
          redirectsByType: {},
          averageConfidence: 0,
          autoClosedCount: 0,
          autoClosedRate: 0,
          topKeywords: [],
          topSubmitters: [],
          redirectsByDay: [],
        };
      }

      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days);

      // Get all redirects for client in time window
      const redirects = await db
        .select()
        .from(catalogRedirectLog)
        .where(
          and(
            eq(catalogRedirectLog.clientId, clientId),
            gte(catalogRedirectLog.redirectedAt, sinceDate)
          )
        )
        .orderBy(desc(catalogRedirectLog.redirectedAt));

      const client = await this.getClientSettings(clientId);
      const clientName = client?.clientName || clientId;

      // Calculate metrics
      const totalRedirects = redirects.length;
      const autoClosedCount = redirects.filter((r: CatalogRedirectLog) => r.caseClosed).length;
      const autoClosedRate = totalRedirects > 0 ? autoClosedCount / totalRedirects : 0;

      // Average confidence
      const avgConfidence = totalRedirects > 0
        ? redirects.reduce((sum: number, r: CatalogRedirectLog) => sum + r.confidence, 0) / totalRedirects
        : 0;

      // Redirects by type
      const redirectsByType: Record<string, number> = {};
      redirects.forEach((r: CatalogRedirectLog) => {
        redirectsByType[r.requestType] = (redirectsByType[r.requestType] || 0) + 1;
      });

      // Top keywords
      const keywordCounts = new Map<string, number>();
      redirects.forEach((r: CatalogRedirectLog) => {
        r.matchedKeywords.forEach((keyword: string) => {
          keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
        });
      });
      const topKeywords = Array.from(keywordCounts.entries())
        .map(([keyword, count]) => ({ keyword, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Top submitters
      const submitterCounts = new Map<string, number>();
      redirects.forEach((r: CatalogRedirectLog) => {
        if (r.submittedBy) {
          submitterCounts.set(r.submittedBy, (submitterCounts.get(r.submittedBy) || 0) + 1);
        }
      });
      const topSubmitters = Array.from(submitterCounts.entries())
        .map(([submitter, count]) => ({ submitter, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Redirects by day
      const redirectsByDay = new Map<string, number>();
      redirects.forEach((r: CatalogRedirectLog) => {
        const date = r.redirectedAt.toISOString().split('T')[0];
        redirectsByDay.set(date, (redirectsByDay.get(date) || 0) + 1);
      });
      const redirectsByDayArray = Array.from(redirectsByDay.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return {
        clientId,
        clientName,
        totalRedirects,
        redirectsByType,
        averageConfidence: avgConfidence,
        autoClosedCount,
        autoClosedRate,
        topKeywords,
        topSubmitters,
        redirectsByDay: redirectsByDayArray,
      };
    } catch (error) {
      console.error('[ClientSettingsRepository] Error getting redirect metrics:', error);
      return {
        clientId,
        clientName: clientId,
        totalRedirects: 0,
        redirectsByType: {},
        averageConfidence: 0,
        autoClosedCount: 0,
        autoClosedRate: 0,
        topKeywords: [],
        topSubmitters: [],
        redirectsByDay: [],
      };
    }
  }

  /**
   * Get recent redirects for a client
   */
  async getRecentRedirects(clientId: string, limit: number = 50) {
    try {
      const db = getDb();
      if (!db) return [];

      const result = await db
        .select()
        .from(catalogRedirectLog)
        .where(eq(catalogRedirectLog.clientId, clientId))
        .orderBy(desc(catalogRedirectLog.redirectedAt))
        .limit(limit);

      return result;
    } catch (error) {
      console.error('[ClientSettingsRepository] Error getting recent redirects:', error);
      return [];
    }
  }

  /**
   * Get repeat offenders (users who submit many incorrect cases)
   */
  async getRepeatOffenders(clientId: string, days: number = 30, minRedirects: number = 3) {
    try {
      const db = getDb();
      if (!db) return [];

      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days);

      const redirects = await db
        .select()
        .from(catalogRedirectLog)
        .where(
          and(
            eq(catalogRedirectLog.clientId, clientId),
            gte(catalogRedirectLog.redirectedAt, sinceDate)
          )
        );

      // Count redirects per submitter
      const submitterCounts = new Map<string, number>();
      redirects.forEach((r: CatalogRedirectLog) => {
        if (r.submittedBy) {
          submitterCounts.set(r.submittedBy, (submitterCounts.get(r.submittedBy) || 0) + 1);
        }
      });

      // Filter to repeat offenders
      const repeatOffenders = Array.from(submitterCounts.entries())
        .filter(([_, count]) => count >= minRedirects)
        .map(([submitter, count]) => ({ submitter, redirectCount: count }))
        .sort((a, b) => b.redirectCount - a.redirectCount);

      return repeatOffenders;
    } catch (error) {
      console.error('[ClientSettingsRepository] Error getting repeat offenders:', error);
      return [];
    }
  }

  /**
   * Delete client settings
   */
  async deleteClientSettings(clientId: string): Promise<boolean> {
    try {
      const db = getDb();
      if (!db) return false;

      await db
        .delete(clientSettings)
        .where(eq(clientSettings.clientId, clientId));

      return true;
    } catch (error) {
      console.error('[ClientSettingsRepository] Error deleting client settings:', error);
      return false;
    }
  }
}

// Singleton instance
let clientSettingsRepository: ClientSettingsRepository | null = null;

export function getClientSettingsRepository(): ClientSettingsRepository {
  if (!clientSettingsRepository) {
    clientSettingsRepository = new ClientSettingsRepository();
  }
  return clientSettingsRepository;
}
