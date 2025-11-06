import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { getConfigValue } from "../../config";

interface InstallationToken {
  token: string;
  expiresAt: number;
}

const TOKEN_REFRESH_BUFFER_MS = 60 * 1000; // refresh 1 minute before expiry

let cachedInstallationToken: InstallationToken | null = null;

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}

function getGitHubConfig() {
  const appId = getConfigValue("githubAppId");
  const installationId = getConfigValue("githubInstallationId");
  const privateKey = getConfigValue("githubAppPrivateKey");
  const apiBaseUrl = getConfigValue("githubApiBaseUrl") || "https://api.github.com";

  if (!appId || !installationId || !privateKey) {
    throw new Error("GitHub App configuration is incomplete. Ensure app id, installation id, and private key are set.");
  }

  return {
    appId,
    installationId: Number(installationId),
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
