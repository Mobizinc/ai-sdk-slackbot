/**
 * FortiManager Firewall Repository
 *
 * Repository for retrieving firewall data from FortiManager API
 * Provides clean business-level methods for firewall operations
 */

import { FortiManagerHttpClient } from '../client';
import type {
  DeviceListResponse,
  DeviceDetailsResponse,
  DeviceRecord,
  DeviceDetails,
  DeviceInterfaceResponse,
  InterfaceRecord
} from '../types/api-responses';
import type { Firewall, DiscoverySummary, FirewallStatus } from '../types/domain-models';
import { mapDeviceToFirewall } from '../types/firewall-models';

export class FortiManagerFirewallRepository {
  constructor(private readonly client: FortiManagerHttpClient) {}

  /**
   * Get all managed firewall devices
   * Returns list of all FortiGate devices managed by FortiManager
   */
  async getAllFirewalls(): Promise<Firewall[]> {
    console.log('Fetching all managed firewalls...');

    // Get all devices from FortiManager
    const response = await this.client.get<DeviceRecord[]>(
      '/dvmdb/device',
      [
        'name',
        'sn',
        'platform_str',
        'ip',
        'mgmt_mode',
        'conn_status',
        'conf_status',
        'os_ver',
        'os_type',
        'latitude',
        'longitude',
        'location_from',
        'meta_fields'
      ]
    );

    if (!response.result?.[0]?.data) {
      console.log('No devices found');
      return [];
    }

    const devices = response.result[0].data;
    console.log(`Found ${devices.length} device(s)`);

    // Filter to only FortiGate firewalls (os_type === 'fos')
    const firewalls = devices.filter(device =>
      device.os_type === 'fos' || device.platform_str?.toLowerCase().includes('fortigate')
    );

    console.log(`Filtered to ${firewalls.length} FortiGate firewall(s)`);

    // Get interfaces for each firewall to extract IP scopes
    const firewallsWithInterfaces = await Promise.all(
      firewalls.map(async (device) => {
        try {
          const interfaces = await this.getDeviceInterfaces(device.name);
          return mapDeviceToFirewall(device, interfaces);
        } catch (error: any) {
          console.log(`⚠️  Could not fetch interfaces for ${device.name}: ${error.message}`);
          // Return firewall without interface data
          return mapDeviceToFirewall(device);
        }
      })
    );

    return firewallsWithInterfaces;
  }

  /**
   * Get detailed information for a specific firewall
   * @param deviceName - Name of the device in FortiManager
   */
  async getFirewallDetails(deviceName: string): Promise<Firewall> {
    console.log(`Fetching details for ${deviceName}...`);

    const response = await this.client.get<DeviceDetails>(
      `/dvmdb/device/${deviceName}`,
      undefined,
      { skipRetry: false }
    );

    if (!response.result?.[0]?.data) {
      throw new Error(`Device not found: ${deviceName}`);
    }

    const device = response.result[0].data;

    // Get interfaces
    const interfaces = await this.getDeviceInterfaces(deviceName);

    return mapDeviceToFirewall(device, interfaces);
  }

  /**
   * Get network interfaces for a specific device
   * Uses proxy to query the managed FortiGate device directly
   * @param deviceName - Name of the device in FortiManager
   */
  async getDeviceInterfaces(deviceName: string): Promise<InterfaceRecord[]> {
    try {
      // Use FortiManager proxy to query the managed device
      // Endpoint: /sys/proxy/json
      // This proxies FortiOS API calls through FortiManager

      const proxyPayload = {
        url: '/api/v2/cmdb/system/interface',
        target: [deviceName]
      };

      const response = await this.client.exec<InterfaceRecord[]>(
        '/sys/proxy/json',
        proxyPayload
      );

      // Proxy responses have nested structure
      if (!response.result?.[0]?.data) {
        return [];
      }

      // Extract interface data from proxy response
      const proxyData: any = response.result[0].data;

      // Proxy response format varies - handle both direct and nested formats
      let interfaces: InterfaceRecord[] = [];

      if (Array.isArray(proxyData)) {
        // Direct array format
        interfaces = proxyData;
      } else if (proxyData[0]?.response?.results) {
        // Nested format with results
        interfaces = proxyData[0].response.results;
      } else if (proxyData.results) {
        // Alternative nested format
        interfaces = proxyData.results;
      }

      return interfaces;
    } catch (error: any) {
      console.log(`⚠️  Could not fetch interfaces for ${deviceName}: ${error.message}`);
      return [];
    }
  }

  /**
   * Get firewall status
   * @param deviceName - Name of the device
   */
  async getFirewallStatus(deviceName: string): Promise<FirewallStatus> {
    const firewall = await this.getFirewallDetails(deviceName);
    return firewall.status;
  }

  /**
   * Get discovery summary
   * Provides overview of all managed firewalls
   */
  async getDiscoverySummary(): Promise<DiscoverySummary> {
    const firewalls = await this.getAllFirewalls();

    const summary: DiscoverySummary = {
      totalFirewalls: firewalls.length,
      onlineFirewalls: firewalls.filter(f => f.status === 'online').length,
      offlineFirewalls: firewalls.filter(f => f.status === 'offline').length,
      models: {},
      discoveredAt: new Date().toISOString(),
      fortimanagerUrl: this.client.getBaseUrl()
    };

    // Count models
    for (const firewall of firewalls) {
      const model = firewall.model || 'Unknown';
      summary.models[model] = (summary.models[model] || 0) + 1;
    }

    return summary;
  }

  /**
   * Disconnect from FortiManager
   * Performs logout and cleanup
   */
  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }
}
