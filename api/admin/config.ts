// Shared config utilities
import {
  CONFIG_DEFINITIONS,
  config as runtimeConfig,
  type ConfigDefinition,
  type ConfigKey,
  getConfig,
  refreshConfig,
  serializeConfigValue,
} from "../../lib/config";
import { setAppSetting } from "../../lib/services/app-settings";

type ConfigResponse = {
  settings: Record<ConfigKey, unknown>;
  metadata: Record<ConfigKey, ConfigDefinition>;
};

function buildUnauthorizedResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain",
    },
  });
}

function authorize(request: Request): Response | null {
  const isDevelopment =
    !runtimeConfig.vercelEnv || runtimeConfig.vercelEnv === "development";
  if (isDevelopment) {
    return null;
  }

  const adminToken = runtimeConfig.businessContextAdminToken;
  if (!adminToken) {
    return buildUnauthorizedResponse(
      "Admin configuration API is disabled in production. Set BUSINESS_CONTEXT_ADMIN_TOKEN to enable.",
      403,
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return buildUnauthorizedResponse(
      "Unauthorized. Provide Bearer token in Authorization header.",
      401,
    );
  }

  const provided = authHeader.substring(7);
  if (provided !== adminToken) {
    return buildUnauthorizedResponse("Forbidden. Invalid admin token.", 403);
  }

  return null;
}

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
  const unauthorized = authorize(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const config = await getConfig();
    return new Response(JSON.stringify(buildConfigResponse(config)), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (error) {
    console.error("[Admin Config] Failed to load configuration:", error);
    return new Response("Internal server error", { status: 500 });
  }
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
  const unauthorized = authorize(request);
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
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[Admin Config] Failed to persist configuration:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
