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

  if (!appId || !installationIdRaw || !privateKey) {
    throw new Error("GitHub App configuration is incomplete. Ensure app id, installation id, and private key are set.");
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

  // Use eval to bypass TypeScript's import transformation and get real dynamic import in CommonJS
  // This allows us to import ES modules (@octokit/rest v21+) from CommonJS code
  const { Octokit } = await eval('import("@octokit/rest")') as typeof import("@octokit/rest");

  return new Octokit({
    auth: token,
    baseUrl: apiBaseUrl,
  });
}
