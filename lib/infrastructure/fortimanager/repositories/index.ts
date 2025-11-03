/**
 * FortiManager Repositories
 * Central export for FortiManager repository classes
 */

export { FortiManagerFirewallRepository } from './firewall-repository';
export { FortiManagerMonitoringRepository } from './monitoring-repository';
export type {
  SystemResourceMetrics,
  InterfaceStatus,
  DeviceSystemStatus,
  FirewallHealth
} from './monitoring-repository';
