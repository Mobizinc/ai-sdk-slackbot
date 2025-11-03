/**
 * FortiManager Infrastructure Module
 *
 * Provides integration with Fortinet FortiManager API
 * for managing FortiGate firewall devices
 */

// Client
export { FortiManagerHttpClient } from './client';
export type { FortiManagerClientConfig, RequestOptions } from './client';

// Repositories
export { FortiManagerFirewallRepository, FortiManagerMonitoringRepository } from './repositories';
export type {
  SystemResourceMetrics,
  InterfaceStatus,
  DeviceSystemStatus,
  FirewallHealth
} from './repositories';

// Types
export type {
  Firewall,
  NetworkInterface,
  DiscoverySummary,
  DeviceRecord,
  DeviceDetails,
  InterfaceRecord
} from './types';

export {
  FirewallStatus,
  ConnectionStatus,
  ConfigSyncStatus
} from './types';
