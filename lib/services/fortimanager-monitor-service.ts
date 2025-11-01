/**
 * FortiManager Monitoring Service
 *
 * High-level service for monitoring FortiGate firewalls via FortiManager
 * Provides caching, multi-customer support, and LLM-friendly formatting
 */

import { FortiManagerHttpClient, FortiManagerMonitoringRepository } from '../infrastructure/fortimanager';
import type { FirewallHealth } from '../infrastructure/fortimanager/repositories/monitoring-repository';

/**
 * Cache entry
 */
interface CacheEntry {
  data: FirewallHealth;
  timestamp: number;
}

interface HealthResult {
  health: FirewallHealth;
  fromCache: boolean;
}

/**
 * FortiManager instance configuration
 */
export interface FortiManagerConfig {
  url: string;
  apiKey?: string;
  username?: string;
  password?: string;
  customerName?: string;
}

/**
 * FortiManager Monitoring Service
 * Singleton service for monitoring firewalls across multiple customers
 */
export class FortiManagerMonitorService {
  private static instance: FortiManagerMonitorService;
  private cache = new Map<string, CacheEntry>();
  private cacheTTL = 60000; // 60 seconds
  private clients = new Map<string, FortiManagerHttpClient>();

  private constructor() {}

  static getInstance(): FortiManagerMonitorService {
    if (!FortiManagerMonitorService.instance) {
      FortiManagerMonitorService.instance = new FortiManagerMonitorService();
    }
    return FortiManagerMonitorService.instance;
  }

  /**
   * Get FortiManager client for a customer
   * Creates and caches client instances
   */
  private getClient(config: FortiManagerConfig): FortiManagerHttpClient {
    const cacheKey = config.url;

    if (this.clients.has(cacheKey)) {
      return this.clients.get(cacheKey)!;
    }

    // Create new client
    const client = new FortiManagerHttpClient({
      url: config.url,
      apiKey: config.apiKey,
      username: config.username,
      password: config.password,
      defaultTimeout: 15000,  // 15 second timeout for monitoring
      maxRetries: 2           // Fewer retries for real-time monitoring
    });

    this.clients.set(cacheKey, client);
    return client;
  }

  /**
   * Get firewall health metrics
   * Uses cache to avoid hammering FortiManager API
   */
  async getFirewallHealth(
    deviceName: string,
    fortiManagerConfig: FortiManagerConfig,
    options?: {
      includeResources?: boolean;
      includeInterfaces?: boolean;
      includeSystemStatus?: boolean;
      bypassCache?: boolean;
    }
  ): Promise<HealthResult> {
    const cacheKey = `${fortiManagerConfig.url}:${deviceName}`;

    // Check cache unless bypassed
    if (!options?.bypassCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        console.log(`📦 Cache hit for ${deviceName}`);
        return { health: cached.data, fromCache: true };
      }
    }

    // Query FortiManager
    const client = this.getClient(fortiManagerConfig);
    const repository = new FortiManagerMonitoringRepository(client);

    const health = await repository.getFirewallHealth(deviceName, {
      includeResources: options?.includeResources ?? true,
      includeInterfaces: options?.includeInterfaces ?? false,  // Expensive, opt-in
      includeSystemStatus: options?.includeSystemStatus ?? true
    });

    // Cache result
    this.cache.set(cacheKey, {
      data: health,
      timestamp: Date.now()
    });

    return { health, fromCache: false };
  }

  async getFirewallHealthReport(
    deviceName: string,
    fortiManagerConfig: FortiManagerConfig,
    options?: {
      includeInterfaces?: boolean;
      includeResources?: boolean;
      bypassCache?: boolean;
    }
  ): Promise<{
    health: FirewallHealth;
    summary: string;
    warnings: string[];
    connection: {
      connected: boolean;
      status: string;
      configSync: string;
      configInSync: boolean;
    };
    fromCache: boolean;
  }> {
    const { health, fromCache } = await this.getFirewallHealth(deviceName, fortiManagerConfig, {
      ...options,
      includeResources: options?.includeResources ?? true,
      includeSystemStatus: true
    });

    const report = this.buildSummary(deviceName, health, {
      includeInterfaces: options?.includeInterfaces ?? false,
    });

    return {
      health,
      summary: report.summary,
      warnings: report.warnings,
      connection: report.connection,
      fromCache,
    };
  }

  private buildSummary(
    deviceName: string,
    health: FirewallHealth,
    options: { includeInterfaces: boolean }
  ): {
    summary: string;
    warnings: string[];
    connection: {
      connected: boolean;
      status: string;
      configSync: string;
      configInSync: boolean;
    };
  } {
    const lines: string[] = [];
    const warnings: string[] = [];

    if (!health.online) {
      const reason = health.error ? ` (${health.error})` : '';
      return {
        summary: `❌ Firewall ${deviceName} is unreachable via FortiManager${reason}`,
        warnings: [`FortiManager could not reach ${deviceName}${reason}`],
        connection: {
          connected: false,
          status: "DISCONNECTED",
          configSync: "UNKNOWN",
          configInSync: false,
        },
      };
    }

    lines.push(`🔥 Firewall: ${deviceName}`);
    lines.push(`Status: ✅ ONLINE via FortiManager`);

    if (health.system_status) {
      lines.push(`Hostname: ${health.system_status.hostname}`);
      lines.push(`Serial: ${health.system_status.serial}`);
      lines.push(`Firmware: ${health.system_status.version} (build ${health.system_status.build})`);
    }

    const resources = health.resources;
    let connectionText = "UNKNOWN";
    let connected = true;

    if (resources?.connection_status !== undefined) {
      connectionText = resources.connection_status === 1 ? "CONNECTED" : "DISCONNECTED";
      connected = resources.connection_status === 1;
      lines.push(`Connection: ${connected ? "✅ Connected to FortiManager" : "❌ Not connected to FortiManager"}`);
      if (!connected) {
        warnings.push("FortiManager flags the firewall as disconnected.");
      }
    }

    let configSyncText = "UNKNOWN";
    let configInSync = true;

    if (resources?.config_sync_status !== undefined) {
      configInSync = resources.config_sync_status === 1;
      configSyncText = configInSync ? "IN_SYNC" : "OUT_OF_SYNC";
      lines.push(`Config Sync: ${configInSync ? "✅ In Sync" : "⚠️ Out of Sync"}`);
      if (!configInSync) {
        warnings.push("Configuration is out of sync with FortiManager.");
      }
    }

    if (resources) {
      if (resources.memory_total > 0) {
        lines.push(`Memory (Total): ${Math.round(resources.memory_total)} MB`);
      }
      if (resources.disk_total !== undefined && resources.disk_total > 0) {
        lines.push(`Disk (Total): ${Math.round(resources.disk_total)} MB`);
      }
      if (resources.session_count !== undefined) {
        lines.push(`Sessions: ${resources.session_count.toLocaleString()}`);
      }
    }

    if (options.includeInterfaces && health.interfaces && health.interfaces.length > 0) {
      lines.push("");
      lines.push("🔌 Interface Highlights:");
      const downInterfaces = health.interfaces.filter((iface) => !iface.link);
      const noisyInterfaces = health.interfaces.filter(
        (iface) => iface.tx_errors > 0 || iface.rx_errors > 0
      );

      if (downInterfaces.length === 0 && noisyInterfaces.length === 0) {
        lines.push("  All monitored interfaces report link up.");
      } else {
        for (const iface of downInterfaces.slice(0, 5)) {
          lines.push(`  ❌ ${iface.name}: link DOWN (${iface.status})`);
        }
        for (const iface of noisyInterfaces.slice(0, 5)) {
          const errors = iface.tx_errors + iface.rx_errors;
          lines.push(`  ⚠️ ${iface.name}: ${errors} errors (tx:${iface.tx_errors}, rx:${iface.rx_errors})`);
        }
        if (downInterfaces.length + noisyInterfaces.length > 5) {
          lines.push("  ...additional interface issues truncated");
        }
        if (downInterfaces.length > 0) {
          warnings.push(`Interfaces reporting link down: ${downInterfaces.map((i) => i.name).join(", ")}`);
        }
      }
    }

    lines.push("");
    lines.push(`⏰ Queried at: ${new Date(health.queried_at).toLocaleString()}`);

    return {
      summary: lines.join("\n"),
      warnings,
      connection: {
        connected,
        status: connectionText,
        configSync: configSyncText,
        configInSync,
      },
    };
  }

  /**
   * Clear cache for specific device or all
   */
  clearCache(deviceName?: string): void {
    if (deviceName) {
      // Clear all cache entries for this device (across all FortiManagers)
      for (const [key] of this.cache) {
        if (key.endsWith(`:${deviceName}`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /**
   * Disconnect all FortiManager clients
   */
  async disconnectAll(): Promise<void> {
    for (const [, client] of this.clients) {
      await client.disconnect();
    }
    this.clients.clear();
  }
}

/**
 * Get singleton instance
 */
export function getFortiManagerMonitorService(): FortiManagerMonitorService {
  return FortiManagerMonitorService.getInstance();
}
