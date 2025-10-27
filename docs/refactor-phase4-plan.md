# Phase 4 – Anthropic-Native Runtime (Complete)

## Current Status
- Anthropic Messages is the only runtime path. Legacy files (`lib/legacy-generate-response.ts`, `lib/instrumented-ai.ts`) and rollout flags have been removed as part of this PR. If any feature flags remain for zero-risk deployment, they are limited to non-runtime code and will be removed in a follow-up phase.
- All orchestration code (agent + passive flows) now resides under `lib/agent/*` and `lib/passive/*` and executes unconditionally.
- Shared services (`kb-generator`, `case-quality-analyzer`, `intelligent-assistant`, `interactive-kb-assistant`, `troubleshooting-assistant`, `case-classifier`, `case-resolution-summary`, escalation message builder) call `AnthropicChatService` directly.
- AI SDK packages (`ai`, `@ai-sdk/openai`, `@ai-sdk/gateway`) have been deleted from the dependency tree. `lib/model-provider.ts` now exposes only Anthropic metadata.
- Tests were updated to mock the Anthropic runner instead of `generateText`, and smoke scripts stub `AnthropicChatService` where needed.

## Deliverables Achieved
1. Anthropic chat runner (`lib/agent/runner.ts`) orchestrates tool calls, retries, and status updates.
2. Prompt, context, and formatting modules produce Anthropic-compatible message arrays.
3. Every service uses the unified Anthropic client abstraction; no `process.env` fallbacks or AI SDK helpers remain.
4. Dependency cleanup: only `@anthropic-ai/sdk` (runtime) and `openai` (embeddings) are required.
5. Documentation and scripts have been updated to reflect the Anthropic-native architecture.

## Follow-On Tasks
- Monitor staging/production metrics with the Anthropic-native path enabled 100%.
- Continue gathering latency/cost benchmarks for the new pipeline.
- Optional: explore replacing OpenAI embeddings once an Anthropic alternative is available.

With Phase 4 complete, the codebase is fully Anthropic-native and ready for further optimisations without the legacy AI SDK dependencies.
