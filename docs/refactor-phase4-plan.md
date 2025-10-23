# Phase 4 Plan – Anthropic-Native Runtime

## Objective
Replace the AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/gateway`) with a first-party Anthropic Messages implementation while preserving existing features (tool calling, retries, fallbacks, tracing, formatting) across the agent and supporting services. This phase completes the “no AI SDK” goal and prepares the codebase for further Anthropic-specific enhancements.

## Scope
- **Included**
  - Agent runtime (`lib/agent/*`, `lib/generate-response.ts`)
  - Shared services that call `generateText`/`tool` (`lib/services/*`, scripts)
  - Provider selection (`lib/model-provider.ts`, `lib/instrumented-ai.ts`)
  - Feature flags, tests, and documentation updates
- **Excluded**
  - Embedding provider swap (OpenAI embeddings remain for now)
  - Passive flow (already refactored in Phase 2)
  - New Anthropic features (prompt caching, system prompts) beyond parity requirements

## Current Dependencies
- `lib/instrumented-ai.ts` re-exports `generateText`, `tool`, and `stepCountIs` from `ai`.
- `lib/model-provider.ts` constructs AI SDK-based models and fallbacks (Anthropic via gateway/OpenAI).
- Multiple services (`kb-generator`, `case-quality-analyzer`, `interactive-kb-assistant`, etc.) directly invoke `generateText` or `tool`.
- Tests rely on AI SDK behavior for stubbing/mocking.

**Direct call sites (to be migrated)**
- `lib/generate-response.ts:1`
- `lib/services/kb-generator.ts:1`
- `lib/services/case-quality-analyzer.ts:1`
- `lib/services/intelligent-assistant.ts:1`
- `lib/services/interactive-kb-assistant.ts:1`
- `lib/services/troubleshooting-assistant.ts:1`
- `lib/services/case-classifier.ts:1`
- `lib/services/case-resolution-summary.ts:1`
- `lib/instrumented-ai.ts:1`
- `scripts/test-exact-config.ts:8`, `scripts/test-gateway-simple.ts:6`

## Deliverables
1. Anthropic chat runner capable of tool calling, streaming, and tracing (`lib/agent/runner.ts` + new `lib/services/anthropic-chat.ts`).
2. Prompt/context builder and message formatter updated to interact with the new runner.
3. Refactored services using a unified Anthropic client abstraction (no `ai` imports).
4. Feature flag path that allows fallback to legacy AI SDK during rollout.
5. Removal of AI SDK dependencies from `package.json`, environment docs, and configuration files.

## Implementation Stages

### Phase 4A – Core Anthropic Client ✅ (basic send path; retries/streaming TBD)
- Build `lib/services/anthropic-chat.ts`:
  - Wrap `@anthropic-ai/sdk` Messages endpoint with configurable model, retries, and streaming support.
  - Support tool definitions and responses compatible with the legacy agent contracts.
  - Integrate LangSmith tracing (reusing `wrapSDK` or new spans).
- Update `lib/anthropic-provider.ts` as needed to expose the new runner.
- Add unit tests with mocked Anthropic SDK responses.

### Phase 4B – Agent Runner Integration (In Progress)
- Implement `lib/agent/runner.ts` using the Anthropic client (Phase 3 scaffold).
- Translate legacy tool schema/handler format into Anthropic’s `tool_choice`/`tool_result` payloads.
- Ensure `stepCountIs` equivalent logic (max tool turns) is enforced within the runner.
- Wire the runner into `lib/agent/orchestrator.ts`; keep legacy executor fallback via `legacyExecutor`.
- Extend `tests/agent` to cover runner behavior (successful response, tool call, retry logic).

✅ Runner now calls `AnthropicChatService`, handles sequential tool calls, and returns formatted text. Covered by `tests/agent/runner.test.ts`.

### Phase 4C – Prompt & Message Modules (In Progress)
- Implement `lib/agent/context-loader.ts` and `lib/agent/prompt-builder.ts` to produce Anthropic-compatible message arrays (system + user + tool messages).
- Implement `lib/agent/message-formatter.ts` for Slack-friendly output and status updates.
- Update integration suite (`tests/generate-response.integration.test.ts`) to run against both legacy and refactored paths (feature flag table-driven).

✅ `context-loader.ts` now aggregates case/business context and similar cases; `prompt-builder.ts` builds enhanced system prompt; `message-formatter.ts` produces Slack-friendly output. Unit tests added under `tests/agent`.
⬜ Integration suites still run only against the legacy path; add dual-run coverage toggling `REFACTOR_ENABLED`.

### Phase 4D – Service Migration (In Progress)
- Update services using `generateText`/`tool` to call the new agent utilities:
  - `lib/services/kb-generator.ts`
  - `lib/services/case-quality-analyzer.ts`
  - `lib/services/intelligent-assistant.ts`
  - `lib/services/interactive-kb-assistant.ts`
  - `lib/services/troubleshooting-assistant.ts`
  - `lib/services/case-classifier.ts`
  - Scripts under `scripts/` that import `instrumented-ai`.
- Provide thin facades (e.g., `getAnthropicChatService`) to avoid repeating setup.
- Add focused unit tests per service to confirm Anthropic calls and error handling.

✅ `kb-generator.ts`, `case-resolution-summary.ts`, `case-quality-analyzer.ts`, `intelligent-assistant.ts`, and `interactive-kb-assistant.ts` now prefer Anthropic when the feature flag is enabled. ✅ All scripts now exercise the Anthropic runner; no remaining generateText consumers outside fallback paths.

### Phase 4E – Cleanup & Dependency Removal
- Remove `lib/instrumented-ai.ts` or convert into re-export of new runner helpers.
- Simplify `lib/model-provider.ts` to prefer Anthropic directly; retire AI Gateway/OpenAI fallbacks or reimplement them via first-party SDKs.
- Update documentation (`docs/refactor-phase3-plan.md`, `docs/api-contracts-baseline.md`, `docs/metrics-baseline.md`) to reflect the new stack.
- Purge AI SDK packages from `package.json`/`pnpm-lock.yaml`; adjust build/test scripts.

### Phase 4F – Validation & Rollout
- Run full test suite with `REFACTOR_ENABLED=true`.
- Execute smoke tests (Slack, ServiceNow) via Phase 0 fixtures.
- Capture latency/cost metrics before and after; compare against `docs/metrics-baseline.md`.
- Toggle feature flag on staging; monitor for regressions before default-on.

## Risks & Mitigations
- **Tool compatibility**: Anthropic tool schema differs from AI SDK. Mitigate by adding adapter layer and comprehensive tests.
- **Streaming behavior**: Ensure slack/status updates still work; add runner tests for streaming transcripts.
- **Fallback coverage**: Decide on new fallback strategy (e.g., optional OpenAI via native SDK) to replace AI SDK’s `stepCountIs` fallback.
- **Testing debt**: Large service surface requires unit and integration coverage; schedule time for fixture updates.

## Success Criteria
- `ai` and `@ai-sdk/*` no longer appear in dependencies or runtime code.
- Feature flag ON path passes all integration tests and smoke checks.
- Agent modules (`runner`, `prompt-builder`, `context-loader`, `message-formatter`, `tool-registry`) are fully implemented and ≤200 LOC each.
- Documentation and runbooks describe the Anthropic-native architecture and rollout plan.
