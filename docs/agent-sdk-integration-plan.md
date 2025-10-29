# Claude Agent SDK Integration Plan

## Goal
Adopt Anthropic's Claude Agent SDK as the long-term foundation for our Slack assistant, enabling managed sessions, tool permissions, and MCP-powered connectors while keeping the current direct `messages.create` flow stable during transition.

## Guiding Principles
- Preserve existing behaviour until SDK integration is feature-complete (feature flag for rollout).
- Build abstraction layers so the agent pipeline (orchestrator, passive handlers) stays agnostic to the transport.
- Favour incremental adoption: start with stateless requests, layer on sessions, then permissions/MCP.
- Maintain observability (usage metrics, tracing) throughout the migration.

## Workstreams

### 1. Baseline Assessment & Design
- Audit current direct Anthropic usage (`lib/services/anthropic-chat.ts`, `lib/agent/runner.ts`) vs. SDK capabilities.
- Document how Slack threads, case numbers, and passive contexts should map to Agent SDK sessions.
- Define the initial adapter interface (`ChatBackend`) that both legacy and SDK implementations will satisfy.

### 2. Abstraction Layer
- Create a `ChatBackend` interface and refactor the agent runner to depend on it.
- Provide a legacy implementation (current Anthropic client) and scaffold an Agent SDK-backed variant behind a feature flag.
- Ensure orchestration layers can pass through session identifiers and metadata required by the SDK.

### 3. Session Lifecycle
- Decide session keys (e.g. Slack `channelId + threadTs`, ServiceNow case number) and retention policy.
- Implement session start/resume logic in the SDK adapter.
- Update context loader/output formatter to propagate session IDs and handle reconnect scenarios.

### 4. Tool Registration & Permissions
- Model existing tools (`lib/agent/tool-registry.ts`, passive actions) using SDK tool descriptors.
- Define permission groups/roles per the SDK’s permissions guide; configure defaults in `lib/config`.
- Create tests to verify the agent honours allow/deny rules, both in legacy and SDK modes.

### 5. MCP Strategy
- Identify candidate tools for MCP (ServiceNow, Azure Search, KB generator helpers).
- Prototype one MCP server or SDK connector and integrate it end-to-end via the adapter.
- Establish deployment/runtime expectations for hosting MCP servers alongside the bot.

### 6. Observability & Configuration
- Extend config registry with Agent SDK credentials, endpoints, and feature flag toggles.
- Integrate SDK telemetry (sessions, tool calls) into existing logging/LangSmith hooks.
- Update smoke/import tests to cover the new adapter path.

### 7. Rollout & Back-compat
- Add integration tests covering both legacy and SDK backends (guarded by flag).
- Document deployment checklist, including required env vars and new operational playbooks.
- Plan phased rollout: internal testing, pilot workspace, full production.

## Deliverables
- Adapter interface and dual implementation (legacy + Agent SDK).
- Session management design doc & implemented lifecycle hooks.
- Tool permission schemas and MCP connector prototype.
- Updated configuration, telemetry, and deployment docs.
- Automated tests ensuring parity between legacy and SDK paths.

## Risks & Mitigations
- **Regression risk:** maintain feature flag and dual-path tests.
- **Operational complexity:** document new infrastructure (MCP servers) and monitor resource usage.
- **Timeline creep:** treat MCP integration as parallelizable milestone; core adapter and sessions unblock most benefits.

## Next Steps
1. Finalise baseline assessment / design doc (see Workstream 1).
2. Implement adapter layer with no behavioural change.
3. Enable SDK path in staging with limited tools to validate sessions.
4. Iterate on permissions/MCP based on pilot feedback.
