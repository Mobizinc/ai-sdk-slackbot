# Feature Flags for Infrastructure Refactoring

Environment variable-based feature flags to control gradual rollout of the new ServiceNow repository pattern.

## Environment Variables

### `FEATURE_SERVICENOW_REPOSITORIES_PCT`
**Type**: Number (0-100)
**Default**: `0` (disabled)
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

## Rollout Strategy

### Phase 1: Internal Testing (Week 1)
```bash
FEATURE_SERVICENOW_REPOSITORIES_USERS="U_ENGINEER1,U_ENGINEER2"
```
- Enable for 2-3 engineer Slack accounts
- Monitor logs for "NEW" vs "OLD" path execution
- Verify no errors

### Phase 2: Canary Channel (Week 2)
```bash
FEATURE_SERVICENOW_REPOSITORIES_CHANNELS="C_TEST_CHANNEL"
```
- Enable for dedicated test channel
- Process real customer cases
- Monitor for any issues

### Phase 3: 1% Rollout (Week 3)
```bash
FEATURE_SERVICENOW_REPOSITORIES_PCT=1
```
- ~1% of all traffic uses new pattern
- Monitor error rates, latency
- If stable for 48 hours, proceed

### Phase 4: 10% Rollout (Week 4)
```bash
FEATURE_SERVICENOW_REPOSITORIES_PCT=10
```
- Significant traffic volume
- Monitor closely for 72 hours
- If stable, proceed

### Phase 5: 50% Rollout (Week 5)
```bash
FEATURE_SERVICENOW_REPOSITORIES_PCT=50
```
- Half of all traffic
- Monitor for 1 week
- If stable, proceed to full rollout

### Phase 6: 100% Rollout (Week 6)
```bash
FEATURE_SERVICENOW_REPOSITORIES_PCT=100
```
- Full migration complete
- Monitor for 1-2 weeks
- Remove old code paths after confidence established

### Emergency Rollback
```bash
# Immediate rollback to legacy implementation
FEATURE_SERVICENOW_REPOSITORIES_FORCE_DISABLE=true
```

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
