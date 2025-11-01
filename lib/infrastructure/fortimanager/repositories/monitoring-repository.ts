/**
 * FortiManager Monitoring Repository
 *
 * Repository for retrieving live metrics from FortiGate devices via FortiManager proxy API
 * Provides real-time monitoring data for troubleshooting and triage
 */

import { FortiManagerHttpClient } from '../client';

/**
 * System resource metrics
 */
export interface SystemResourceMetrics {
  cpu_usage: number;           // CPU usage percentage
  memory_total: number;        // Total memory in MB
  memory_used: number;         // Used memory in MB
  memory_usage: number;        // Memory usage percentage
  disk_total?: number;         // Total disk in MB
  disk_used?: number;          // Used disk in MB
  disk_usage?: number;         // Disk usage percentage
  session_count?: number;      // Active session count
  connection_status?: number;  // 1=connected, 2=disconnected
  config_sync_status?: number; // 1=in sync, 2=out of sync
}

/**
 * Interface status
 */
export interface InterfaceStatus {
  name: string;                // Interface name (wan1, lan1, port1, etc.)
  status: string;              // up, down
  link: boolean;               // Link detected
  speed: number;               // Speed in Mbps
  duplex: string;              // full, half
  tx_packets: number;          // Transmitted packets
  rx_packets: number;          // Received packets
  tx_bytes: number;            // Transmitted bytes
  rx_bytes: number;            // Received bytes
  tx_errors: number;           // Transmit errors
  rx_errors: number;           // Receive errors
}

/**
 * Device system status
 */
export interface DeviceSystemStatus {
  hostname: string;
  serial: string;
  version: string;             // Firmware version
  build: number;               // Build number
  uptime: number;              // Uptime in seconds
  uptime_formatted: string;    // Human-readable uptime
}

/**
 * Comprehensive firewall health
 */
export interface FirewallHealth {
  device_name: string;
  online: boolean;
  system_status?: DeviceSystemStatus;
  resources?: SystemResourceMetrics;
  interfaces?: InterfaceStatus[];
  queried_at: string;          // ISO timestamp
  error?: string;              // Error message if query failed
}

export class FortiManagerMonitoringRepository {
  constructor(private readonly client: FortiManagerHttpClient) {}

  /**
   * Get system resource metrics (CPU, memory, disk)
   * Uses FortiManager device database: /dvmdb/device/{name}
   *
   * Note: Real-time CPU/memory metrics require proxy to FortiGate (/api/v2/monitor/system/resource)
   * which needs additional proxy permissions. This method uses connection status and config status
   * from FortiManager's device database as a health indicator.
   */
  async getSystemResources(deviceName: string): Promise<SystemResourceMetrics | null> {
    try {
      // Query FortiManager device database
      const response = await this.client.get(
        `/dvmdb/device/${deviceName}`,
        undefined
      );

      const deviceData = response.result?.[0]?.data;
      if (!deviceData) return null;

      // Extract available metrics from device database
      // Note: This doesn't have real-time CPU/memory, but has connection/config status
      return {
        cpu_usage: 0,  // Not available without proxy
        memory_total: deviceData.vm_mem || 0,
        memory_used: 0,  // Not available without proxy
        memory_usage: 0,  // Not available without proxy
        disk_total: deviceData.hdisk_size || undefined,
        disk_used: undefined,
        disk_usage: undefined,
        session_count: undefined,
        connection_status: deviceData.conn_status || 0,  // 1=online, 2=offline
        config_sync_status: deviceData.conf_status || 0  // 1=in_sync, 2=out_of_sync
      };
    } catch (error: any) {
      console.log(`⚠️  Could not fetch system resources for ${deviceName}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get interface status for all interfaces
   * Proxies to FortiGate: /api/v2/monitor/system/interface
   */
  async getInterfaceStatus(deviceName: string): Promise<InterfaceStatus[]> {
    try {
      const response = await this.client.exec(
        '/sys/proxy/json',
        {
          url: '/api/v2/monitor/system/interface',
          target: [deviceName]
        }
      );

      // Parse proxy response
      const proxyData = response.result?.[0]?.data;
      if (!proxyData) return [];

      // Handle nested proxy response
      let interfaces: any[] = [];
      if (Array.isArray(proxyData) && proxyData[0]?.response?.results) {
        interfaces = proxyData[0].response.results;
      } else if (proxyData.results) {
        interfaces = proxyData.results;
      } else if (Array.isArray(proxyData)) {
        interfaces = proxyData;
      }

      // Map to InterfaceStatus
      return interfaces.map(iface => ({
        name: iface.name || '',
        status: iface.status || 'unknown',
        link: iface.link === true || iface.link === 'up',
        speed: parseInt(iface.speed) || 0,
        duplex: iface.duplex || 'unknown',
        tx_packets: parseInt(iface.tx_packets) || 0,
        rx_packets: parseInt(iface.rx_packets) || 0,
        tx_bytes: parseInt(iface.tx_bytes) || 0,
        rx_bytes: parseInt(iface.rx_bytes) || 0,
        tx_errors: parseInt(iface.tx_errors) || 0,
        rx_errors: parseInt(iface.rx_errors) || 0
      }));
    } catch (error: any) {
      console.log(`⚠️  Could not fetch interface status for ${deviceName}: ${error.message}`);
      return [];
    }
  }

  /**
   * Get device system status
   * Uses FortiManager device database: /dvmdb/device/{name}
   *
   * Note: Proxy to FortiGate REST API (/api/v2/monitor/*) requires additional permissions.
   * This method uses FortiManager's device database which provides connection status,
   * firmware version, and HA info without needing proxy permissions.
   */
  async getDeviceStatus(deviceName: string): Promise<DeviceSystemStatus | null> {
    try {
      // Query FortiManager device database (not proxy)
      const response = await this.client.get(
        `/dvmdb/device/${deviceName}`,
        undefined  // Get all fields
      );

      const deviceData = response.result?.[0]?.data;
      if (!deviceData) return null;

      // Extract firmware version
      const osVersion = deviceData.os_ver || 0;
      const patchLevel = deviceData.patch || 0;
      const build = deviceData.build || 0;
      const versionString = `${osVersion}.${patchLevel}.${build}`;

      return {
        hostname: deviceData.hostname || deviceName,
        serial: deviceData.sn || '',
        version: versionString,
        build: build,
        uptime: 0,  // Not available from dvmdb
        uptime_formatted: 'N/A'
      };
    } catch (error: any) {
      console.log(`⚠️  Could not fetch device status for ${deviceName}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get comprehensive firewall health
   * Combines all metrics into single response
   */
  async getFirewallHealth(
    deviceName: string,
    options?: {
      includeResources?: boolean;
      includeInterfaces?: boolean;
      includeSystemStatus?: boolean;
    }
  ): Promise<FirewallHealth> {
    const opts = {
      includeResources: true,
      includeInterfaces: true,
      includeSystemStatus: true,
      ...options
    };

    const health: FirewallHealth = {
      device_name: deviceName,
      online: false,
      queried_at: new Date().toISOString()
    };

    try {
      // Try to get system status first (determines if device is reachable)
      if (opts.includeSystemStatus) {
        health.system_status = await this.getDeviceStatus(deviceName) || undefined;
        health.online = !!health.system_status;
      }

      // Get resources if device is online
      if (health.online && opts.includeResources) {
        health.resources = await this.getSystemResources(deviceName) || undefined;
      }

      // Get interfaces if device is online
      if (health.online && opts.includeInterfaces) {
        health.interfaces = await this.getInterfaceStatus(deviceName);
      }

      return health;
    } catch (error: any) {
      health.error = error.message;
      return health;
    }
  }
}

/**
 * Format uptime seconds to human-readable string
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.join(' ') || '< 1m';
}
