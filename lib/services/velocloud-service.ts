import { setTimeout as delay } from "node:timers/promises";

export interface VeloCloudConfig {
  baseUrl: string;
  apiToken?: string;
  enterpriseId?: number;
  username?: string;
  password?: string;
  customerName?: string;
  loginMode?: "enterprise" | "operator";
  logicalId?: string;
  apiUsername?: string;
}

export interface VeloCloudRequestOptions {
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  skipAuth?: boolean;
}

export type VeloCloudEdgeRecord = {
  id?: number;
  name?: string;
  edgeState?: string;
  activationState?: string;
  site?: { name?: string };
  modelNumber?: string;
  lastContact?: number;
  alerts?: unknown[];
  links?: Array<{ linkId?: number; linkState?: string; name?: string }>;
  [key: string]: unknown;
};

export type VeloCloudLinkStatus = {
  name?: string;
  linkId?: number;
  linkState?: string;
  transportType?: string;
  up?: boolean;
  capacityDown?: number;
  capacityUp?: number;
  jitterMs?: number;
  latencyMs?: number;
  lossPct?: number;
  [key: string]: unknown;
};

export type VeloCloudEventRecord = {
  id?: number;
  event?: string;
  severity?: string;
  edgeId?: number;
  message?: string;
  generated?: number;
  [key: string]: unknown;
};

interface AuthState {
  cookie?: string;
  expiresAt?: number;
}

/**
 * Minimal client for VMware VeloCloud (VMware SD-WAN) REST endpoints.
 * Supports token-based auth (recommended) and falls back to username/password session login.
 */
class VeloCloudClient {
  private readonly config: VeloCloudConfig;
  private auth: AuthState = {};

  constructor(config: VeloCloudConfig) {
    this.config = {
      ...config,
      baseUrl: normalizeBaseUrl(config.baseUrl),
    };
  }

  async request<T = any>(options: VeloCloudRequestOptions): Promise<T> {
    const url = new URL(cleanPath(options.path), this.config.baseUrl).toString();
    const method = options.method ?? "POST";
    const controller = new AbortController();
    const timeout = options.timeoutMs ?? 15000;
    const safeSignal = options.signal;

    const timer = setTimeout(() => controller.abort(), timeout);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (!options.skipAuth) {
      await this.ensureAuthenticated();
      if (this.config.apiToken) {
        headers.Authorization = `Token ${this.config.apiToken}`;
      } else if (this.auth.cookie) {
        headers.Cookie = this.auth.cookie;
      }
    }

    const init: RequestInit = {
      method,
      headers,
      signal: safeSignal ?? controller.signal,
    };

    if (options.body !== undefined) {
      init.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`VeloCloud request failed (${response.status} ${response.statusText}): ${truncate(text, 200)}`);
      }

      const text = await response.text();
      if (!text) {
        return undefined as T;
      }

      try {
        return JSON.parse(text) as T;
      } catch (error) {
        throw new Error(`Unable to parse VeloCloud response JSON: ${(error as Error).message}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureAuthenticated() {
    if (this.config.apiToken) {
      return;
    }

    if (!this.config.username || !this.config.password) {
      throw new Error("VeloCloud credentials missing. Provide VELOCLOUD_API_TOKEN or VELOCLOUD_USERNAME/VELOCLOUD_PASSWORD.");
    }

    const stillValid = this.auth.expiresAt && this.auth.expiresAt > Date.now() + 30_000;
    if (stillValid) {
      return;
    }

    const orderedLoginModes = this.config.loginMode
      ? [this.config.loginMode]
      : (["enterprise", "operator"] as const);

    let lastError = "Failed to establish VeloCloud session.";

    for (const mode of orderedLoginModes) {
      const path = mode === "operator" ? "login/operatorLogin" : "login/enterpriseLogin";
      const result = await this.request<{ sessionId?: string; errMsg?: string }>({
        path,
        method: "POST",
        body: {
          username: this.config.username,
          password: this.config.password,
        },
        skipAuth: true,
      });

      if (result?.sessionId) {
        this.auth = {
          cookie: `velocloud.sessionId=${result.sessionId}`,
          expiresAt: Date.now() + 30 * 60 * 1000,
        };
        await delay(100);
        return;
      }

      const payload = result ? truncate(JSON.stringify(result), 200) : "no payload";
      lastError = result?.errMsg || `Login ${mode} failed (response: ${payload})`;
    }

    throw new Error(lastError);
  }
}

/**
 * Singleton service that wraps client creation and common operations.
 */
export class VeloCloudService {
  private static instance: VeloCloudService;
  private clients = new Map<string, VeloCloudClient>();

  static getInstance(): VeloCloudService {
    if (!VeloCloudService.instance) {
      VeloCloudService.instance = new VeloCloudService();
    }
    return VeloCloudService.instance;
  }

  private getClient(config: VeloCloudConfig): VeloCloudClient {
    const key = clientKey(config);
    const existing = this.clients.get(key);
    if (existing) {
      return existing;
    }
    const client = new VeloCloudClient(config);
    this.clients.set(key, client);
    return client;
  }

  async listEdges(config: VeloCloudConfig, enterpriseId?: number): Promise<VeloCloudEdgeRecord[]> {
    const client = this.getClient(config);
    const targetEnterprise = enterpriseId ?? config.enterpriseId;
    const body = targetEnterprise ? { enterpriseId: targetEnterprise } : {};
    const result = await client.request<VeloCloudEdgeRecord[] | { data?: VeloCloudEdgeRecord[] }>({
      path: "enterprise/getEnterpriseEdges",
      body,
    });

    if (Array.isArray(result)) {
      return result;
    }

    if (result && Array.isArray((result as any).data)) {
      return (result as any).data;
    }

    return [];
  }

  async getEdgeLinkStatus(
    config: VeloCloudConfig,
    params: { enterpriseId?: number; edgeId: number }
  ): Promise<VeloCloudLinkStatus[]> {
    const client = this.getClient(config);
    const targetEnterprise = params.enterpriseId ?? config.enterpriseId;
    const body: Record<string, unknown> = {
      edgeId: params.edgeId,
    };
    if (targetEnterprise !== undefined) {
      body.enterpriseId = targetEnterprise;
    }

    const result = await client.request<{ linkStatus?: VeloCloudLinkStatus[] } | VeloCloudLinkStatus[]>({
      path: "edge/getEdgeLinkStatus",
      body,
    });

    if (Array.isArray(result)) {
      return result;
    }

    if (result?.linkStatus && Array.isArray(result.linkStatus)) {
      return result.linkStatus;
    }

    return [];
  }

  async getEnterpriseEvents(
    config: VeloCloudConfig,
    options: {
      enterpriseId?: number;
      edgeId?: number;
      limit?: number;
      lookbackMinutes?: number;
      severity?: string;
    } = {}
  ): Promise<VeloCloudEventRecord[]> {
    const client = this.getClient(config);
    const targetEnterprise = options.enterpriseId ?? config.enterpriseId;
    const now = Date.now();
    const from = options.lookbackMinutes ? now - options.lookbackMinutes * 60_000 : now - 60 * 60_000;

    const body: Record<string, unknown> = {
      type: "EVENT",
      filter: {
        time: {
          start: Math.trunc(from / 1000),
          end: Math.trunc(now / 1000),
        },
        edgeId: options.edgeId ?? undefined,
        severity: options.severity ?? undefined,
      },
      limit: options.limit ?? 50,
    };

    if (targetEnterprise !== undefined) {
      body.enterpriseId = targetEnterprise;
    }

    const result = await client.request<{ data?: VeloCloudEventRecord[] } | VeloCloudEventRecord[]>({
      path: "event/getEnterpriseEvents",
      body,
    });

    if (Array.isArray(result)) {
      return result;
    }

    if (result?.data && Array.isArray(result.data)) {
      return result.data;
    }

    return [];
  }

  formatEdgeSummary(edges: VeloCloudEdgeRecord[], limit = 5): string {
    if (!edges.length) {
      return "No edges returned.";
    }

    const lines: string[] = [];
    const subset = edges.slice(0, limit);
    for (const edge of subset) {
      const name = edge.name ?? `Edge ${edge.id ?? "unknown"}`;
      const state = edge.edgeState ?? edge.activationState ?? "UNKNOWN";
      const siteName = typeof edge.site === "object" && edge.site?.name ? ` @ ${edge.site.name}` : "";
      lines.push(`${name}${siteName} — state: ${state}`);
    }

    if (edges.length > subset.length) {
      lines.push(`...and ${edges.length - subset.length} more edges`);
    }

    return lines.join("\n");
  }

  formatLinkSummary(links: VeloCloudLinkStatus[]): string {
    if (!links.length) {
      return "No link data returned.";
    }

    const lines: string[] = [];
    for (const link of links) {
      const name = link.name ?? `Link ${link.linkId ?? "unknown"}`;
      const state = link.linkState ?? (link.up ? "UP" : "DOWN");
      const latency = link.latencyMs !== undefined ? `${link.latencyMs}ms` : "latency n/a";
      const loss = link.lossPct !== undefined ? `${link.lossPct}% loss` : "loss n/a";
      lines.push(`${name} — ${state}, ${latency}, ${loss}`);
    }
    return lines.join("\n");
  }
}

export function getVeloCloudService(): VeloCloudService {
  return VeloCloudService.getInstance();
}

export function resolveVeloCloudConfig(
  requested?: string
): { config: VeloCloudConfig; resolvedCustomer: string } | null {
  const candidates = buildCandidateOrder(requested);
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const normalized = normalizeCustomer(candidate);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);

    const config = loadConfigForCustomer(normalized);
    if (config) {
      return {
        config,
        resolvedCustomer: normalized,
      };
    }
  }

  return null;
}

export function listAvailableVeloCloudCustomers(): string[] {
  const customers = new Set<string>();

  for (const key of Object.keys(process.env)) {
    const match = key.match(/^VELOCLOUD_([A-Z0-9_]+)_(BASE_URL|URL)$/);
    if (match) {
      customers.add(match[1].toLowerCase());
    }
  }

  if (process.env.VELOCLOUD_URL || process.env.VELOCLOUD_BASE_URL) {
    customers.add("default");
  }

  return Array.from(customers).sort();
}

function normalizeBaseUrl(baseUrl: string): string {
  if (!baseUrl) {
    throw new Error("VeloCloud baseUrl is required.");
  }
  const url = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return url.includes("/portal/rest/") ? url : `${url}portal/rest/`;
}

function cleanPath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

function clientKey(config: VeloCloudConfig): string {
  const parts = [
    config.baseUrl,
    config.apiToken ?? "",
    config.username ?? "",
    config.customerName ?? "",
    config.apiUsername ?? "",
    config.logicalId ?? "",
  ];
  return parts.join("|");
}

function buildCandidateOrder(requested?: string): string[] {
  const available = listAvailableVeloCloudCustomers();
  const order: string[] = [];

  if (requested) {
    order.push(requested);
  }

  for (const customer of available) {
    if (customer !== "default") {
      order.push(customer);
    }
  }

  order.push("default");

  return order;
}

function loadConfigForCustomer(customer: string): VeloCloudConfig | null {
  const isDefault = customer === "default";
  const suffix = isDefault ? "" : `_${customer.toUpperCase()}`;

  const url = isDefault
    ? process.env.VELOCLOUD_URL || process.env.VELOCLOUD_BASE_URL
    : process.env[`VELOCLOUD${suffix}_URL`] || process.env[`VELOCLOUD${suffix}_BASE_URL`];

  let apiToken = isDefault
    ? process.env.VELOCLOUD_API_TOKEN || process.env.VELOCLOUD_TOKEN
    : process.env[`VELOCLOUD${suffix}_API_TOKEN`] || process.env[`VELOCLOUD${suffix}_TOKEN`];

  const apiUsername = isDefault
    ? process.env.VELOCLOUD_API_USERNAME
    : process.env[`VELOCLOUD${suffix}_API_USERNAME`];

  const apiPassword = isDefault
    ? process.env.VELOCLOUD_API_PASSWORD
    : process.env[`VELOCLOUD${suffix}_API_PASSWORD`];

  if (!apiToken && apiPassword) {
    apiToken = apiPassword;
  }

  const username = isDefault
    ? process.env.VELOCLOUD_USERNAME || process.env.VELOCLOUD_LOGIN || apiUsername
    : process.env[`VELOCLOUD${suffix}_USERNAME`] ||
      process.env[`VELOCLOUD${suffix}_LOGIN`] ||
      apiUsername;

  const password = isDefault
    ? process.env.VELOCLOUD_PASSWORD || (apiToken ? undefined : apiPassword)
    : process.env[`VELOCLOUD${suffix}_PASSWORD`] ||
      (apiToken ? undefined : apiPassword);

  const enterpriseRaw = isDefault
    ? process.env.VELOCLOUD_ENTERPRISE_ID
    : process.env[`VELOCLOUD${suffix}_ENTERPRISE_ID`];

  const enterpriseId =
    enterpriseRaw !== undefined && enterpriseRaw !== ""
      ? Number.parseInt(enterpriseRaw, 10)
      : undefined;

  const loginModeRaw = isDefault
    ? process.env.VELOCLOUD_LOGIN_MODE
    : process.env[`VELOCLOUD${suffix}_LOGIN_MODE`];

  const loginMode = normalizeLoginMode(loginModeRaw);

  const logicalId = isDefault
    ? process.env.VELOCLOUD_LOGICAL_ID
    : process.env[`VELOCLOUD${suffix}_LOGICAL_ID`];

  if (!url) {
    return null;
  }

  if (!apiToken && !(username && password)) {
    return null;
  }

  const config: VeloCloudConfig = {
    baseUrl: url,
    apiToken: apiToken || undefined,
    enterpriseId: Number.isFinite(enterpriseId) ? enterpriseId : undefined,
    username: username || undefined,
    password: password || undefined,
    loginMode,
    logicalId: logicalId || undefined,
    apiUsername: apiUsername || undefined,
  };

  if (customer !== "default") {
    config.customerName = customer;
  }

  return config;
}

function normalizeCustomer(customer: string): string {
  if (!customer) {
    return "default";
  }
  const normalized = customer.toLowerCase().replace(/[^a-z0-9]/g, "_");
  return normalized === "" ? "default" : normalized;
}

function normalizeLoginMode(value?: string): VeloCloudConfig["loginMode"] {
  if (!value) {
    return undefined;
  }
  const normalized = value.toLowerCase().trim();
  if (normalized === "operator") {
    return "operator";
  }
  if (normalized === "enterprise") {
    return "enterprise";
  }
  return undefined;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}…`;
}
