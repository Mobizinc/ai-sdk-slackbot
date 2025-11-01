/**
 * FortiManager Domain Models
 *
 * Business domain models for FortiManager-managed firewalls
 * Maps API responses to clean business objects
 */

/**
 * Firewall Device
 * Represents a managed firewall in FortiManager
 */
export interface Firewall {
  // Core Identity
  name: string;                  // Device name
  serialNumber: string;          // Serial number
  model: string;                 // Platform/model (e.g., "FortiGate-60F", "FortiGate-100F")

  // Network Configuration
  managementIp: string;          // Management IP address
  publicIpScope: string[];       // Internet-facing/public IP addresses
  internalIpScope: string[];     // Internal/private IP addresses

  // Location
  location?: string;             // Physical location
  latitude?: string;             // GPS latitude
  longitude?: string;            // GPS longitude

  // Status & Operational Data
  status: FirewallStatus;        // Operational status
  connectionStatus: ConnectionStatus;  // Connection to FortiManager
  configStatus: ConfigSyncStatus;      // Configuration sync status

  // Version & Firmware
  firmwareVersion?: string;      // OS/firmware version
  osType?: string;               // OS type (typically "fos" for FortiOS)

  // High Availability
  haMode?: string;               // HA mode if clustered
  haMembers?: HAMember[];        // HA cluster members

  // Management
  managementMode?: string;       // Management mode: "fmg", "unreg"
  policyPackage?: string;        // Assigned policy package
  templateGroup?: string;        // Assigned template group

  // Metadata
  discoveredAt: string;          // ISO timestamp of discovery
  rawData?: any;                 // Raw API response for debugging
}

/**
 * Firewall Status Enum
 */
export enum FirewallStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  UNKNOWN = 'unknown'
}

/**
 * Connection Status Enum
 */
export enum ConnectionStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  UNKNOWN = 'unknown'
}

/**
 * Configuration Sync Status Enum
 */
export enum ConfigSyncStatus {
  IN_SYNC = 'in_sync',
  OUT_OF_SYNC = 'out_of_sync',
  UNKNOWN = 'unknown'
}

/**
 * HA Member
 * Represents a member in a high-availability cluster
 */
export interface HAMember {
  name: string;
  serialNumber: string;
  status?: string;
}

/**
 * Network Interface
 * Represents a network interface on a firewall
 */
export interface NetworkInterface {
  name: string;                  // Interface name (e.g., "port1", "wan1")
  ipAddress: string;             // IP address
  description?: string;          // Interface description
  alias?: string;                // Interface alias
  mode?: string;                 // static, dhcp, pppoe
  status?: string;               // up, down
  type?: string;                 // physical, vlan, loopback
  allowedAccess?: string[];      // Allowed management access services
}

/**
 * Discovery Summary
 * Summary of firewall discovery operation
 */
export interface DiscoverySummary {
  totalFirewalls: number;
  onlineFirewalls: number;
  offlineFirewalls: number;
  models: Record<string, number>;  // Model distribution
  discoveredAt: string;            // ISO timestamp
  fortimanagerUrl: string;         // FortiManager instance URL
}
