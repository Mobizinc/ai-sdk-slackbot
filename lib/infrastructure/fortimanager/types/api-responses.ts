/**
 * FortiManager API Response Types
 *
 * Based on FortiManager JSON-RPC 1.0 API specification
 * All API responses follow the standard JSON-RPC format
 */

/**
 * Standard JSON-RPC 1.0 Response Structure
 */
export interface FortiManagerResponse<T = any> {
  id: number;
  result: FortiManagerResult<T>[];
}

export interface FortiManagerResult<T = any> {
  data?: T;
  status: FortiManagerStatus;
  url: string;
}

export interface FortiManagerStatus {
  code: number;  // 0 = success, non-zero = error
  message: string;
}

/**
 * Login/Session Response
 */
export interface LoginResponse {
  id: number;
  result: LoginResult[];
}

export interface LoginResult {
  status: FortiManagerStatus;
  url: string;
}

/**
 * Device List Response
 * Returned from /dvmdb/device endpoint
 */
export interface DeviceListResponse {
  id: number;
  result: [{
    data: DeviceRecord[];
    status: FortiManagerStatus;
    url: string;
  }];
}

/**
 * Device Record (from /dvmdb/device)
 * Contains core device information
 */
export interface DeviceRecord {
  name: string;                  // Device name in FortiManager
  oid: number;                   // Object ID
  sn: string;                    // Serial number
  platform_str?: string;         // Platform model (e.g., "FortiGate-60F")
  ip?: string;                   // Management IP address
  mgmt_mode?: string;            // Management mode: "fmg", "unreg", etc.
  conn_status?: string;          // Connection status: "ONLINE", "OFFLINE"
  conf_status?: string;          // Configuration sync status
  os_ver?: string;               // OS version
  os_type?: string;              // OS type: "fos" (FortiOS), etc.
  adm_usr?: string;              // Admin username
  adm_pass?: string;             // Admin password (encrypted)
  dev_status?: string;           // Device status
  flags?: number;                // Status flags
  latitude?: string;             // GPS latitude
  longitude?: string;            // GPS longitude
  location_from?: string;        // Location source: "gui", "config", "json"
  meta_fields?: Record<string, any>;  // Additional metadata
  vdom?: VdomInfo[];             // VDOM information if available
}

/**
 * VDOM Information
 */
export interface VdomInfo {
  name: string;
  opmode?: string;              // Operation mode
  status?: string;              // VDOM status
}

/**
 * Device Details Response
 * Returned from /dvmdb/device/<device_name> with options
 */
export interface DeviceDetailsResponse {
  id: number;
  result: [{
    data: DeviceDetails;
    status: FortiManagerStatus;
    url: string;
  }];
}

export interface DeviceDetails extends DeviceRecord {
  // Additional fields from detailed query
  ha_mode?: string;             // HA mode if clustered
  ha_slave?: HASlave[];         // HA cluster members
  hostname?: string;            // Device hostname
  policy_pkg?: string;          // Assigned policy package
  template_group?: string;      // Assigned template group
}

export interface HASlave {
  name: string;
  sn: string;
  status?: string;
}

/**
 * Device Interface Response
 * Proxied from managed FortiGate device via /sys/proxy/json
 */
export interface DeviceInterfaceResponse {
  id: number;
  result: [{
    data?: InterfaceRecord[];
    status: FortiManagerStatus;
    url: string;
  }];
}

export interface InterfaceRecord {
  name: string;                 // Interface name (e.g., "port1", "wan1")
  ip: string;                   // IP address
  allowaccess?: string;         // Allowed access services
  alias?: string;               // Interface alias
  description?: string;         // Interface description
  mode?: string;                // Interface mode: "static", "dhcp"
  status?: string;              // Interface status: "up", "down"
  type?: string;                // Interface type: "physical", "vlan"
}

/**
 * Error Response
 */
export interface FortiManagerErrorResponse {
  id: number;
  result: [{
    status: {
      code: number;
      message: string;
    };
    url: string;
  }];
}
