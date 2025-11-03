# Feature Flags for Infrastructure Refactoring

## 🚀 Default Behavior: NEW Repository Pattern Enabled

**The new repository pattern is ENABLED BY DEFAULT (100%).**

You don't need to set any environment variables to use it. Just deploy and it works!

## Environment Variables (Optional)

### `FEATURE_SERVICENOW_REPOSITORIES_PCT`
**Type**: Number (0-100)
**Default**: `100` ✨ (NEW pattern enabled)
**Description**: Percentage of requests that should use the new repository pattern.

```bash
# Roll out to 10% of traffic
export FEATURE_SERVICENOW_REPOSITORIES_PCT=10

# Roll out to 50% of traffic
export FEATURE_SERVICENOW_REPOSITORIES_PCT=50

# Roll out to 100% (full rollout)
export FEATURE_SERVICENOW_REPOSITORIES_PCT=100
```

### `FEATURE_SERVICENOW_REPOSITORIES_USERS`
**Type**: Comma-separated Slack user IDs
**Default**: `` (empty)
**Description**: Allowlist of specific Slack users who should use the new pattern (useful for testing with specific users).

```bash
# Enable for specific test users
export FEATURE_SERVICENOW_REPOSITORIES_USERS="U01ABC123,U02DEF456,U03GHI789"
```

### `FEATURE_SERVICENOW_REPOSITORIES_CHANNELS`
**Type**: Comma-separated Slack channel IDs
**Default**: `` (empty)
**Description**: Allowlist of specific Slack channels where the new pattern should be used (useful for testing in dedicated channels).

```bash
# Enable for test channels only
export FEATURE_SERVICENOW_REPOSITORIES_CHANNELS="C01ABC123,C02DEF456"
```

### `FEATURE_SERVICENOW_REPOSITORIES_FORCE_ENABLE`
**Type**: Boolean (`true`/`false`)
**Default**: `false`
**Description**: Force enable the new pattern for ALL requests (overrides percentage). Useful for testing.

```bash
# Force enable for testing
export FEATURE_SERVICENOW_REPOSITORIES_FORCE_ENABLE=true
```

### `FEATURE_SERVICENOW_REPOSITORIES_FORCE_DISABLE`
**Type**: Boolean (`true`/`false`)
**Default**: `false`
**Description**: Force disable the new pattern for ALL requests (takes precedence over all other flags). Emergency kill switch.

```bash
# Emergency rollback
export FEATURE_SERVICENOW_REPOSITORIES_FORCE_DISABLE=true
```

## Usage in Code

```typescript
import { featureFlags, hashUserId } from "@/lib/infrastructure/feature-flags";

// Simple check (uses random for percentage-based rollout)
if (featureFlags.useServiceNowRepositories()) {
  // NEW: Use repository pattern
  const case = await caseRepository.findBySysId(sysId);
} else {
  // OLD: Use legacy client
  const case = await legacyClient.getCase(sysId);
}

// With user/channel context (for consistent experience per user)
const userIdHash = hashUserId(slackUserId);
if (featureFlags.useServiceNowRepositories({
  userId: slackUserId,
  channelId: slackChannelId,
  userIdHash: userIdHash,
})) {
  // NEW path
} else {
  // OLD path
}
```

## Deployment Strategy (Simplified)

### Standard Deployment (Recommended)

**Just deploy** - The new pattern is enabled by default (100%).

No environment variables needed! The system will:
- ✅ Use NEW repository pattern for all operations
- ✅ Automatically fall back to OLD on errors
- ✅ Log all operations for monitoring

**Monitor logs** for "NEW path" vs "OLD path" execution to ensure everything works.

### Emergency Rollback (If Needed)

If you encounter issues, instantly disable the new pattern:

```bash
# Rollback to legacy implementation
FEATURE_SERVICENOW_REPOSITORIES_FORCE_DISABLE=true
```

This takes **< 1 second** to rollback all operations to the legacy code.

### Optional: Gradual Rollout (If You're Cautious)

If you want to be extra careful, you can still do gradual rollout:

```bash
# Start with 10% of traffic
FEATURE_SERVICENOW_REPOSITORIES_PCT=10

# Increase gradually
FEATURE_SERVICENOW_REPOSITORIES_PCT=50
FEATURE_SERVICENOW_REPOSITORIES_PCT=100
```

But this is **optional** - the new pattern is well-tested and has automatic fallback.

## Monitoring

Log execution path on every ServiceNow operation:

```typescript
const useNewPath = featureFlags.useServiceNowRepositories(context);
console.log(`[ServiceNow] Using ${useNewPath ? "NEW" : "OLD"} path for operation`, {
  operation: "getCase",
  caseNumber,
  userId: context.userId,
  featureEnabled: useNewPath,
});
```

## Testing Feature Flags

```typescript
import { featureFlags } from "@/lib/infrastructure/feature-flags";

describe("Feature Flags", () => {
  beforeEach(() => {
    // Set test environment variables
    process.env.FEATURE_SERVICENOW_REPOSITORIES_PCT = "50";
    featureFlags.refresh(); // Reload config
  });

  it("should respect percentage rollout", () => {
    // Test with hash < 50 (should enable)
    expect(featureFlags.useServiceNowRepositories({ userIdHash: 25 })).toBe(true);

    // Test with hash >= 50 (should disable)
    expect(featureFlags.useServiceNowRepositories({ userIdHash: 75 })).toBe(false);
  });
});
```

## Debugging

Check current feature flag configuration:

```typescript
const config = featureFlags.getConfig();
console.log("Feature Flag Config:", config);
// Output:
// {
//   serviceNowRepositoriesPct: 10,
//   serviceNowRepositoriesUsers: ["U01ABC123"],
//   serviceNowRepositoriesChannels: [],
//   forceEnable: false,
//   forceDisable: false
// }
```
