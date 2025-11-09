/**
 * GitHub Environment Variables Diagnostic Endpoint
 *
 * This endpoint helps diagnose GitHub App authentication issues by checking:
 * 1. Raw environment variable values from process.env
 * 2. Parsed configuration values from the config system
 * 3. Missing or empty variables
 *
 * Usage: GET /api/admin/debug-github-env
 */

import { config as runtimeConfig, CONFIG_DEFINITIONS } from "../../lib/config";

interface DebugResult {
  timestamp: string;
  environment: string;
  rawEnvironmentVariables: {
    GITHUB_APP_ID: string;
    GITHUB_INSTALLATION_ID: string;
    GITHUB_APP_PRIVATE_KEY: string;
    GITHUB_API_BASE_URL: string;
  };
  parsedConfigValues: {
    githubAppId: string;
    githubInstallationId: string;
    githubAppPrivateKey: string;
    githubApiBaseUrl: string;
  };
  diagnosis: {
    allVariablesSet: boolean;
    missingVariables: string[];
    emptyVariables: string[];
    recommendation: string;
  };
}

function maskSensitiveValue(value: string | undefined): string {
  if (!value || value.trim() === "") {
    return "✗ missing";
  }
  // Show first 4 and last 4 characters, mask the middle
  if (value.length <= 8) {
    return "✓ set (****)";
  }
  return `✓ set (${value.substring(0, 4)}...${value.substring(value.length - 4)})`;
}

function authorize(request: Request): Response | null {
  const isDevelopment =
    !runtimeConfig.vercelEnv || runtimeConfig.vercelEnv === "development";
  if (isDevelopment) {
    return null;
  }

  const adminToken = runtimeConfig.adminApiToken;
  if (!adminToken) {
    return new Response(
      "Admin debug API is disabled in production. Set ADMIN_API_TOKEN to enable.",
      {
        status: 403,
        headers: { "Content-Type": "text/plain" },
      }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      "Unauthorized. Provide Bearer token in Authorization header.",
      {
        status: 401,
        headers: { "Content-Type": "text/plain" },
      }
    );
  }

  const provided = authHeader.substring(7);
  if (provided !== adminToken) {
    return new Response("Forbidden. Invalid admin token.", {
      status: 403,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return null;
}

export async function GET(request: Request): Promise<Response> {
  const unauthorized = authorize(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    // Check raw environment variables
    const rawAppId = process.env.GITHUB_APP_ID;
    const rawInstallationId = process.env.GITHUB_INSTALLATION_ID;
    const rawPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY;
    const rawApiBaseUrl = process.env.GITHUB_API_BASE_URL;

    // Check parsed config values
    const configAppId = runtimeConfig.githubAppId;
    const configInstallationId = runtimeConfig.githubInstallationId;
    const configPrivateKey = runtimeConfig.githubAppPrivateKey;
    const configApiBaseUrl = runtimeConfig.githubApiBaseUrl;

    // Build diagnosis
    const missingVariables: string[] = [];
    const emptyVariables: string[] = [];

    if (!rawAppId) missingVariables.push("GITHUB_APP_ID");
    else if (rawAppId.trim() === "") emptyVariables.push("GITHUB_APP_ID");

    if (!rawInstallationId) missingVariables.push("GITHUB_INSTALLATION_ID");
    else if (rawInstallationId.trim() === "") emptyVariables.push("GITHUB_INSTALLATION_ID");

    if (!rawPrivateKey) missingVariables.push("GITHUB_APP_PRIVATE_KEY");
    else if (rawPrivateKey.trim() === "") emptyVariables.push("GITHUB_APP_PRIVATE_KEY");

    const allVariablesSet = missingVariables.length === 0 && emptyVariables.length === 0;

    let recommendation = "";
    if (!allVariablesSet) {
      recommendation = `GitHub App configuration is incomplete. `;
      if (missingVariables.length > 0) {
        recommendation += `Missing variables: ${missingVariables.join(", ")}. `;
      }
      if (emptyVariables.length > 0) {
        recommendation += `Empty variables: ${emptyVariables.join(", ")}. `;
      }
      recommendation += `\n\nIn Vercel:\n`;
      recommendation += `1. Go to your project settings -> Environment Variables\n`;
      recommendation += `2. Verify these variables are set for the correct environment (Production/Preview/Development)\n`;
      recommendation += `3. After adding or updating variables, trigger a new deployment\n`;
      recommendation += `4. Environment variables are NOT automatically applied to existing deployments\n\n`;
      recommendation += `Note: If variables show as "✗ missing" but you've set them in Vercel, you MUST redeploy for changes to take effect.`;
    } else {
      recommendation = "All GitHub App environment variables are set correctly. ✅";
    }

    const result: DebugResult = {
      timestamp: new Date().toISOString(),
      environment: runtimeConfig.vercelEnv || "development",
      rawEnvironmentVariables: {
        GITHUB_APP_ID: maskSensitiveValue(rawAppId),
        GITHUB_INSTALLATION_ID: maskSensitiveValue(rawInstallationId),
        GITHUB_APP_PRIVATE_KEY: maskSensitiveValue(rawPrivateKey),
        GITHUB_API_BASE_URL: rawApiBaseUrl || `${CONFIG_DEFINITIONS.githubApiBaseUrl.default} (default)`,
      },
      parsedConfigValues: {
        githubAppId: maskSensitiveValue(configAppId),
        githubInstallationId: maskSensitiveValue(configInstallationId),
        githubAppPrivateKey: maskSensitiveValue(configPrivateKey),
        githubApiBaseUrl: configApiBaseUrl || CONFIG_DEFINITIONS.githubApiBaseUrl.default,
      },
      diagnosis: {
        allVariablesSet,
        missingVariables,
        emptyVariables,
        recommendation,
      },
    };

    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } catch (error) {
    console.error("[Debug GitHub Env] Error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
