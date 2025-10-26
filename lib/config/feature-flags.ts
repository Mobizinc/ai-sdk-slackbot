/**
 * Feature Flags Configuration
 *
 * Controls gradual rollout of refactored code paths
 */

export interface FeatureFlags {
  /**
   * Enable refactored agent orchestrator (generate-response.ts split)
   * When false, uses legacy monolithic implementation
   * When true, uses new modular architecture
   */
  refactorEnabled: boolean;

  /**
   * Enable refactored passive flow (handle-passive-messages.ts split)
   * When false, uses legacy implementation
   * When true, uses new detector/action modules
   */
  refactorPassiveEnabled: boolean;
}

/**
 * Load feature flags from environment variables
 */
function loadFeatureFlags(): FeatureFlags {
  const refactorEnabled = (process.env.REFACTOR_ENABLED ?? 'false').toLowerCase() === 'true';
  const refactorPassiveEnabled = (process.env.REFACTOR_PASSIVE_ENABLED ?? 'false').toLowerCase() === 'true';

  // Log configuration on startup (only in development or when flags are enabled)
  if (refactorEnabled || refactorPassiveEnabled || process.env.NODE_ENV === 'development') {
    console.log('[Feature Flags] Configuration:', {
      refactorEnabled,
      refactorPassiveEnabled,
    });
  }

  return {
    refactorEnabled,
    refactorPassiveEnabled,
  };
}

// Singleton instance
let flags: FeatureFlags | null = null;

/**
 * Get current feature flag configuration
 */
export function getFeatureFlags(): FeatureFlags {
  if (!flags) {
    flags = loadFeatureFlags();
  }
  return flags;
}

/**
 * Reset feature flags (for testing)
 */
export function __resetFeatureFlags(): void {
  flags = null;
}

/**
 * Override feature flags (for testing)
 */
export function __setFeatureFlags(overrides: Partial<FeatureFlags>): void {
  flags = {
    ...getFeatureFlags(),
    ...overrides,
  };
}
