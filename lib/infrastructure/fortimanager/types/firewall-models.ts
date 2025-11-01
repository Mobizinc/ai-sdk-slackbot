/**
 * Firewall Model Mappers
 *
 * Maps FortiManager API responses to business domain models
 */

import type { DeviceRecord, DeviceDetails, InterfaceRecord } from './api-responses';
import type {
  Firewall,
  HAMember,
  NetworkInterface
} from './domain-models';
import {
  FirewallStatus,
  ConnectionStatus,
  ConfigSyncStatus
} from './domain-models';

/**
 * Map DeviceRecord from API to Firewall domain model
 */
export function mapDeviceToFirewall(
  device: DeviceRecord | DeviceDetails,
  interfaces?: InterfaceRecord[]
): Firewall {
  return {
    // Core Identity
    name: device.name,
    serialNumber: device.sn,
    model: device.platform_str || 'Unknown Model',

    // Network Configuration
    managementIp: device.ip || '',
    publicIpScope: extractPublicIPs(interfaces),
    internalIpScope: extractInternalIPs(interfaces),

    // Location
    location: extractLocation(device),
    latitude: device.latitude,
    longitude: device.longitude,

    // Status
    status: mapFirewallStatus(device.conn_status),
    connectionStatus: mapConnectionStatus(device.conn_status),
    configStatus: mapConfigStatus(device.conf_status),

    // Version & Firmware
    firmwareVersion: device.os_ver,
    osType: device.os_type,

    // High Availability
    haMode: ('ha_mode' in device) ? device.ha_mode : undefined,
    haMembers: ('ha_slave' in device && device.ha_slave)
      ? device.ha_slave.map(mapHAMember)
      : undefined,

    // Management
    managementMode: device.mgmt_mode,
    policyPackage: ('policy_pkg' in device) ? device.policy_pkg : undefined,
    templateGroup: ('template_group' in device) ? device.template_group : undefined,

    // Metadata
    discoveredAt: new Date().toISOString(),
    rawData: device
  };
}

/**
 * Map connection status string to enum
 */
function mapFirewallStatus(connStatus?: string | number): FirewallStatus {
  if (!connStatus) return FirewallStatus.UNKNOWN;

  // Handle numeric status codes (1 = online, 2 = offline, etc.)
  if (typeof connStatus === 'number') {
    if (connStatus === 1) return FirewallStatus.ONLINE;
    if (connStatus === 2) return FirewallStatus.OFFLINE;
    return FirewallStatus.UNKNOWN;
  }

  const status = String(connStatus).toUpperCase();
  if (status === 'ONLINE' || status.includes('UP')) {
    return FirewallStatus.ONLINE;
  }
  if (status === 'OFFLINE' || status.includes('DOWN')) {
    return FirewallStatus.OFFLINE;
  }

  return FirewallStatus.UNKNOWN;
}

/**
 * Map connection status string to enum
 */
function mapConnectionStatus(connStatus?: string | number): ConnectionStatus {
  if (!connStatus) return ConnectionStatus.UNKNOWN;

  // Handle numeric status codes
  if (typeof connStatus === 'number') {
    if (connStatus === 1) return ConnectionStatus.CONNECTED;
    if (connStatus === 2) return ConnectionStatus.DISCONNECTED;
    return ConnectionStatus.UNKNOWN;
  }

  const status = String(connStatus).toUpperCase();
  if (status === 'ONLINE' || status.includes('CONNECTED')) {
    return ConnectionStatus.CONNECTED;
  }
  if (status === 'OFFLINE' || status.includes('DISCONNECTED')) {
    return ConnectionStatus.DISCONNECTED;
  }

  return ConnectionStatus.UNKNOWN;
}

/**
 * Map configuration sync status string to enum
 */
function mapConfigStatus(confStatus?: string | number): ConfigSyncStatus {
  if (!confStatus) return ConfigSyncStatus.UNKNOWN;

  // Handle numeric status codes
  if (typeof confStatus === 'number') {
    if (confStatus === 1) return ConfigSyncStatus.IN_SYNC;
    if (confStatus === 2) return ConfigSyncStatus.OUT_OF_SYNC;
    return ConfigSyncStatus.UNKNOWN;
  }

  const status = String(confStatus).toUpperCase();
  if (status === 'INSYNC' || status.includes('SYNC')) {
    return ConfigSyncStatus.IN_SYNC;
  }
  if (status === 'OUTOFSYNC' || status.includes('OUT')) {
    return ConfigSyncStatus.OUT_OF_SYNC;
  }

  return ConfigSyncStatus.UNKNOWN;
}

/**
 * Map HA slave to HAMember
 */
function mapHAMember(slave: { name: string; sn: string; status?: string }): HAMember {
  return {
    name: slave.name,
    serialNumber: slave.sn,
    status: slave.status
  };
}

/**
 * Extract location from device metadata
 * Priority: custom meta field > coordinates > empty
 */
function extractLocation(device: DeviceRecord | DeviceDetails): string | undefined {
  // Check for location in meta fields
  if (device.meta_fields?.location) {
    return device.meta_fields.location;
  }

  // Check for GPS coordinates
  if (device.latitude && device.longitude) {
    return `${device.latitude}, ${device.longitude}`;
  }

  return undefined;
}

/**
 * Extract public/Internet-facing IP addresses from interfaces
 * Typically WAN interfaces or interfaces with public IP ranges
 */
function extractPublicIPs(interfaces?: InterfaceRecord[]): string[] {
  if (!interfaces || interfaces.length === 0) return [];

  const publicIps: string[] = [];

  for (const iface of interfaces) {
    // Check if interface name suggests public/WAN (wan, wan1, port1, etc.)
    const isWanInterface = /^(wan|port1|external)/i.test(iface.name);

    // Check if IP is in public range (not private)
    const isPublicIP = iface.ip && !isPrivateIP(iface.ip);

    if ((isWanInterface || isPublicIP) && iface.ip) {
      publicIps.push(iface.ip);
    }
  }

  return publicIps;
}

/**
 * Extract internal/private IP addresses from interfaces
 */
function extractInternalIPs(interfaces?: InterfaceRecord[]): string[] {
  if (!interfaces || interfaces.length === 0) return [];

  const internalIps: string[] = [];

  for (const iface of interfaces) {
    // Check if interface name suggests internal (lan, internal, dmz, etc.)
    const isInternalInterface = /^(lan|internal|dmz|private)/i.test(iface.name);

    // Check if IP is in private range
    const isPrivate = iface.ip && isPrivateIP(iface.ip);

    if ((isInternalInterface || isPrivate) && iface.ip) {
      internalIps.push(iface.ip);
    }
  }

  return internalIps;
}

/**
 * Check if IP address is in private range
 * Private ranges: 10.x.x.x, 172.16-31.x.x, 192.168.x.x
 */
function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);

  if (parts.length !== 4 || parts.some(isNaN)) {
    return false;  // Invalid IP
  }

  // 10.0.0.0/8
  if (parts[0] === 10) return true;

  // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;

  return false;
}

/**
 * Map InterfaceRecord to NetworkInterface
 */
export function mapInterfaceToNetworkInterface(iface: InterfaceRecord): NetworkInterface {
  return {
    name: iface.name,
    ipAddress: iface.ip,
    description: iface.description,
    alias: iface.alias,
    mode: iface.mode,
    status: iface.status,
    type: iface.type,
    allowedAccess: iface.allowaccess ? iface.allowaccess.split(' ') : undefined
  };
}
