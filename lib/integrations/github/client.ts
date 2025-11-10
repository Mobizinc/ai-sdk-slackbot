import { createSign } from "node:crypto";
import { getConfigValue } from "../../config";
import type { ConfigKey } from "../../config/registry";
import type { Octokit } from "@octokit/rest";

interface InstallationToken {
  token: string;
  expiresAt: number;
}

const TOKEN_REFRESH_BUFFER_MS = 60 * 1000; // refresh 1 minute before expiry

let cachedInstallationToken: InstallationToken | null = null;

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}

type GitHubConfigKey = "githubAppId" | "githubAppPrivateKey" | "githubInstallationId" | "githubApiBaseUrl";

function getStringConfigValue(key: GitHubConfigKey): string | null {
  const raw = getConfigValue(key as ConfigKey);
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getGitHubConfig() {
  const appId = getStringConfigValue("githubAppId");
  const installationIdRaw = getStringConfigValue("githubInstallationId");
  const privateKey = getStringConfigValue("githubAppPrivateKey");
  const apiBaseUrl = getStringConfigValue("githubApiBaseUrl") ?? "https://api.github.com";

  // Log which values are present (without exposing sensitive data)
  console.info("[GitHub Client] Configuration check:", {
    appId: appId ? "✓ present" : "✗ missing",
    installationId: installationIdRaw ? "✓ present" : "✗ missing",
    privateKey: privateKey ? `✓ present (${privateKey.length} chars)` : "✗ missing",
    apiBaseUrl,
  });

  if (!appId || !installationIdRaw || !privateKey) {
    const missing = [];
    if (!appId) missing.push("GITHUB_APP_ID");
    if (!installationIdRaw) missing.push("GITHUB_INSTALLATION_ID");
    if (!privateKey) missing.push("GITHUB_APP_PRIVATE_KEY");

    throw new Error(
      `GitHub App configuration is incomplete. Missing environment variables: ${missing.join(", ")}`
    );
  }

  const installationId = Number.parseInt(installationIdRaw, 10);
  if (!Number.isFinite(installationId)) {
    throw new Error("GitHub installation id must be a numeric string.");
  }

  return {
    appId,
    installationId,
    privateKey: normalizePrivateKey(privateKey),
    apiBaseUrl,
  };
}

function createJwt({ appId, privateKey }: { appId: string; privateKey: string }): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,
    exp: now + 9 * 60,
    iss: appId,
  };

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const encode = (input: Record<string, unknown> | Buffer): string => {
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(JSON.stringify(input));
    return buffer
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  };

  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  const signature = signer.sign(privateKey);
  const encodedSignature = encode(signature);

  return `${signingInput}.${encodedSignature}`;
}

async function fetchInstallationToken(params: {
  appId: string;
  installationId: number;
  privateKey: string;
  apiBaseUrl: string;
}): Promise<{ token: string; expiresAt: number }> {
  console.info(`[GitHub Client] Fetching installation token for app ${params.appId}, installation ${params.installationId}`);

  const jwt = createJwt(params);
  const url = `${params.apiBaseUrl.replace(/\/$/, "")}/app/installations/${params.installationId}/access_tokens`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "ai-sdk-slackbot",
    },
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    console.error(`[GitHub Client] ❌ Failed to fetch installation token (HTTP ${response.status})`, bodyText);
    throw new Error(
      `Failed to fetch GitHub installation token (status ${response.status}): ${
        bodyText || response.statusText
      }`
    );
  }

  const body = (await response.json()) as { token: string; expires_at: string };

  if (!body?.token || !body?.expires_at) {
    throw new Error("GitHub installation token response missing token or expiry");
  }

  const expiresAt = new Date(body.expires_at).getTime() - TOKEN_REFRESH_BUFFER_MS;
  console.info(`[GitHub Client] ✅ Successfully fetched installation token (expires: ${body.expires_at})`);
  return { token: body.token, expiresAt };
}

async function getInstallationToken(): Promise<InstallationToken> {
  if (cachedInstallationToken && cachedInstallationToken.expiresAt > Date.now()) {
    return cachedInstallationToken;
  }

  const { appId, installationId, privateKey, apiBaseUrl } = getGitHubConfig();

  const { token, expiresAt } = await fetchInstallationToken({
    appId,
    installationId,
    privateKey,
    apiBaseUrl,
  });

  cachedInstallationToken = { token, expiresAt };

  return cachedInstallationToken;
}

export async function getGitHubClient(): Promise<Octokit> {
  const { apiBaseUrl } = getGitHubConfig();
  const { token } = await getInstallationToken();

  // Use dynamic import to load ESM module from CommonJS
  // The type assertion helps TypeScript understand the import
  let OctokitClass: typeof Octokit;

  try {
    // Try dynamic import first (works in Node.js and modern environments)
    const module = await import("@octokit/rest");
    OctokitClass = module.Octokit;
  } catch (error) {
    // Fallback for environments that don't support dynamic import
    // This shouldn't happen in Node.js 14+, but provides a safety net
    console.error("[GitHub Client] Dynamic import failed, attempting eval fallback:", error);
    const module = await eval('import("@octokit/rest")') as typeof import("@octokit/rest");
    OctokitClass = module.Octokit;
  }

  return new OctokitClass({
    auth: token,
    baseUrl: apiBaseUrl,
  });
}
