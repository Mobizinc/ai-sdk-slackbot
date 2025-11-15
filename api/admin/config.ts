// Shared config utilities
import {
  CONFIG_DEFINITIONS,
  type ConfigDefinition,
  type ConfigKey,
  getConfig,
  refreshConfig,
  serializeConfigValue,
} from "../../lib/config";
import { setAppSetting } from "../../lib/services/app-settings";
import { authorizeAdminRequest, getCorsHeaders } from "./utils";

type ConfigResponse = {
  settings: Record<ConfigKey, unknown>;
  metadata: Record<ConfigKey, ConfigDefinition>;
};

function buildConfigResponse(config: Record<ConfigKey, unknown>): ConfigResponse {
  const metadata: Partial<Record<ConfigKey, ConfigDefinition>> = {};
  const settings: Partial<Record<ConfigKey, unknown>> = {};

  const keys = Object.keys(CONFIG_DEFINITIONS) as ConfigKey[];
  for (const key of keys) {
    const definition = CONFIG_DEFINITIONS[key];
    const isSensitive = Boolean((definition as ConfigDefinition).sensitive);
    metadata[key] = {
      ...definition,
      sensitive: isSensitive,
    };
    settings[key] = isSensitive ? null : config[key];
  }

  const completeSettings = settings as Record<ConfigKey, unknown>;
  const completeMetadata = metadata as Record<ConfigKey, ConfigDefinition>;

  return {
    settings: completeSettings,
    metadata: completeMetadata,
  };
}

export async function GET(request: Request): Promise<Response> {
  const unauthorized = authorizeAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const config = await getConfig();
    return new Response(JSON.stringify(buildConfigResponse(config)), {
      status: 200,
      headers: getCorsHeaders(request, "GET, PATCH, OPTIONS"),
    });
  } catch (error) {
    console.error("[Admin Config] Failed to load configuration:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, "GET, PATCH, OPTIONS"),
  });
}

type PatchPayload =
  | { key: ConfigKey; value: unknown }
  | { updates: Record<ConfigKey, unknown> };

function normalisePatchPayload(body: unknown): Record<ConfigKey, unknown> | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const payload = body as PatchPayload;
  if ("updates" in payload && payload.updates && typeof payload.updates === "object") {
    return payload.updates;
  }

  if ("key" in payload && payload.key) {
    const key = payload.key as ConfigKey;
    const normalised: Partial<Record<ConfigKey, unknown>> = {};
    normalised[key] = (payload as { key: ConfigKey; value: unknown }).value;
    return normalised as Record<ConfigKey, unknown>;
  }

  return null;
}

export async function PATCH(request: Request): Promise<Response> {
  const unauthorized = authorizeAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  let updates: Record<ConfigKey, unknown> | null = null;
  try {
    const body = await request.json();
    updates = normalisePatchPayload(body);
  } catch (error) {
    console.warn("[Admin Config] Failed to parse PATCH payload:", error);
    return new Response("Invalid JSON body.", { status: 400 });
  }

  if (!updates || Object.keys(updates).length === 0) {
    return new Response("No updates provided.", { status: 400 });
  }

  const keys = Object.keys(updates) as ConfigKey[];
  const definitions = CONFIG_DEFINITIONS;

  try {
    for (const key of keys) {
      if (!(key in definitions)) {
        return new Response(`Unknown configuration key: ${key}`, { status: 400 });
      }

      const serialized = serializeConfigValue(key, updates[key]);
      await setAppSetting(key, serialized);
    }

    await refreshConfig();
    const config = await getConfig();

    return new Response(JSON.stringify(buildConfigResponse(config)), {
      status: 200,
      headers: getCorsHeaders(request, "GET, PATCH, OPTIONS"),
    });
  } catch (error) {
    console.error("[Admin Config] Failed to persist configuration:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
