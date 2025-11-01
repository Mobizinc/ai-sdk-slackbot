/**
 * FortiManager Types
 * Central export for all FortiManager type definitions
 */

// API Response Types
export type {
  FortiManagerResponse,
  FortiManagerResult,
  FortiManagerStatus,
  LoginResponse,
  LoginResult,
  DeviceListResponse,
  DeviceRecord,
  VdomInfo,
  DeviceDetailsResponse,
  DeviceDetails,
  HASlave,
  DeviceInterfaceResponse,
  InterfaceRecord,
  FortiManagerErrorResponse
} from './api-responses';

// Domain Models
export type {
  Firewall,
  HAMember,
  NetworkInterface,
  DiscoverySummary
} from './domain-models';

export {
  FirewallStatus,
  ConnectionStatus,
  ConfigSyncStatus
} from './domain-models';

// Mappers
export {
  mapDeviceToFirewall,
  mapInterfaceToNetworkInterface
} from './firewall-models';
