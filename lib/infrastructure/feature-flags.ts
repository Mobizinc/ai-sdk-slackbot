/**
 * Feature Flags for Infrastructure Refactoring
 *
 * Environment variable-based feature flags to control gradual rollout
 * of new repository pattern implementation.
 *
 * Usage:
 *   if (featureFlags.useServiceNowRepositories()) {
 *     // New path: Use repository
 *     return caseRepository.findBySysId(sysId);
 *   } else {
 *     // Old path: Use legacy client
 *     return legacyGetCase(sysId);
 *   }
 */

/**
 * Feature flag configuration
 */
interface FeatureFlagConfig {
  /**
   * Enable ServiceNow repository pattern (percentage 0-100)
   * ENV: FEATURE_SERVICENOW_REPOSITORIES_PCT
   * Default: 0 (disabled)
   */
  serviceNowRepositoriesPct: number;

  /**
   * Enable ServiceNow repositories for specific Slack user IDs (comma-separated)
   * ENV: FEATURE_SERVICENOW_REPOSITORIES_USERS
   * Example: "U01ABC123,U02DEF456"
   */
  serviceNowRepositoriesUsers: string[];

  /**
   * Enable ServiceNow repositories for specific Slack channel IDs (comma-separated)
   * ENV: FEATURE_SERVICENOW_REPOSITORIES_CHANNELS
   * Example: "C01ABC123,C02DEF456"
   */
  serviceNowRepositoriesChannels: string[];

  /**
   * Force enable ServiceNow repositories (overrides percentage)
   * ENV: FEATURE_SERVICENOW_REPOSITORIES_FORCE_ENABLE
   * Default: false
   */
  forceEnable: boolean;

  /**
   * Force disable ServiceNow repositories (takes precedence over all other flags)
   * ENV: FEATURE_SERVICENOW_REPOSITORIES_FORCE_DISABLE
   * Default: false
   */
  forceDisable: boolean;
}

/**
 * Load feature flag configuration from environment variables
 */
function loadFeatureFlagConfig(): FeatureFlagConfig {
  const serviceNowRepositoriesPct = parseInt(
    process.env.FEATURE_SERVICENOW_REPOSITORIES_PCT || "0",
    10,
  );

  const serviceNowRepositoriesUsers = (process.env.FEATURE_SERVICENOW_REPOSITORIES_USERS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const serviceNowRepositoriesChannels = (
    process.env.FEATURE_SERVICENOW_REPOSITORIES_CHANNELS || ""
  )
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const forceEnable = process.env.FEATURE_SERVICENOW_REPOSITORIES_FORCE_ENABLE === "true";
  const forceDisable = process.env.FEATURE_SERVICENOW_REPOSITORIES_FORCE_DISABLE === "true";

  return {
    serviceNowRepositoriesPct: Math.max(0, Math.min(100, serviceNowRepositoriesPct)),
    serviceNowRepositoriesUsers,
    serviceNowRepositoriesChannels,
    forceEnable,
    forceDisable,
  };
}

/**
 * Feature flags instance
 */
class FeatureFlags {
  private config: FeatureFlagConfig;

  constructor() {
    this.config = loadFeatureFlagConfig();
  }

  /**
   * Refresh configuration from environment variables
   * Useful for testing or dynamic config updates
   */
  refresh(): void {
    this.config = loadFeatureFlagConfig();
  }

  /**
   * Check if ServiceNow repositories should be used
   *
   * @param context - Optional context for user/channel-specific flags
   * @returns true if new repository pattern should be used
   */
  useServiceNowRepositories(context?: {
    userId?: string;
    channelId?: string;
    userIdHash?: number; // For consistent percentage-based rollout
  }): boolean {
    // Force disable takes precedence over everything
    if (this.config.forceDisable) {
      return false;
    }

    // Force enable overrides percentage and user/channel checks
    if (this.config.forceEnable) {
      return true;
    }

    // Check user-specific allowlist
    if (context?.userId && this.config.serviceNowRepositoriesUsers.includes(context.userId)) {
      return true;
    }

    // Check channel-specific allowlist
    if (
      context?.channelId &&
      this.config.serviceNowRepositoriesChannels.includes(context.channelId)
    ) {
      return true;
    }

    // Percentage-based rollout
    if (this.config.serviceNowRepositoriesPct > 0) {
      // If no hash provided, use random
      const hash = context?.userIdHash ?? Math.floor(Math.random() * 100);
      return hash < this.config.serviceNowRepositoriesPct;
    }

    // Default: disabled
    return false;
  }

  /**
   * Get current rollout percentage
   */
  getServiceNowRepositoriesPct(): number {
    return this.config.serviceNowRepositoriesPct;
  }

  /**
   * Check if feature is force-enabled
   */
  isServiceNowRepositoriesForceEnabled(): boolean {
    return this.config.forceEnable && !this.config.forceDisable;
  }

  /**
   * Check if feature is force-disabled
   */
  isServiceNowRepositoriesForceDisabled(): boolean {
    return this.config.forceDisable;
  }

  /**
   * Get current configuration (for debugging)
   */
  getConfig(): Readonly<FeatureFlagConfig> {
    return { ...this.config };
  }
}

/**
 * Shared feature flags instance
 */
export const featureFlags = new FeatureFlags();

/**
 * Create hash from string for consistent percentage-based rollout
 * Uses simple hash function to map userId to 0-99 range
 */
export function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash) % 100;
}
