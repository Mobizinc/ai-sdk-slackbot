import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { getConfigValue } from "../../config";
import type { ConfigKey } from "../../config/registry";

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

async function getInstallationToken(): Promise<InstallationToken> {
  if (cachedInstallationToken && cachedInstallationToken.expiresAt > Date.now()) {
    return cachedInstallationToken;
  }

  const { appId, installationId, privateKey } = getGitHubConfig();

  const auth = createAppAuth({
    appId,
    privateKey,
    installationId,
  });

  const authResult = await auth({ type: "installation" });

  const expiresAt = new Date(authResult.expiresAt).getTime() - TOKEN_REFRESH_BUFFER_MS;

  cachedInstallationToken = {
    token: authResult.token,
    expiresAt,
  };

  return cachedInstallationToken;
}

export async function getGitHubClient(): Promise<Octokit> {
  const { apiBaseUrl } = getGitHubConfig();
  const { token } = await getInstallationToken();

  return new Octokit({
    auth: token,
    baseUrl: apiBaseUrl,
  });
}
