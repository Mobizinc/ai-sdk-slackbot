import { config as runtimeConfig } from "../../lib/config";

const ALLOWED_ORIGINS = [
  "https://admin.mobiz.solutions",
  "https://dev.admin.mobiz.solutions",
];

function resolveOrigin(request: Request): string {
  const origin = request.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }
  return ALLOWED_ORIGINS[0];
}

export function authorizeAdminRequest(request: Request): Response | null {
  const isDevelopment =
    !runtimeConfig.vercelEnv || runtimeConfig.vercelEnv === "development";
  if (isDevelopment) {
    return null;
  }

  const adminToken = runtimeConfig.adminApiToken;
  if (!adminToken) {
    return new Response(
      "Admin API is disabled in production. Set ADMIN_API_TOKEN to enable.",
      {
        status: 403,
        headers: getCorsHeaders(request, "GET, PATCH, POST, DELETE, OPTIONS")
      }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response("Unauthorized. Provide Bearer token.", {
      status: 401,
      headers: getCorsHeaders(request, "GET, PATCH, POST, DELETE, OPTIONS")
    });
  }

  const provided = authHeader.substring(7);
  if (provided !== adminToken) {
    return new Response("Forbidden. Invalid admin token.", {
      status: 403,
      headers: getCorsHeaders(request, "GET, PATCH, POST, DELETE, OPTIONS")
    });
  }

  return null;
}

export function getCorsHeaders(
  request: Request,
  methods = "GET,OPTIONS"
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Access-Control-Allow-Origin": resolveOrigin(request),
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
