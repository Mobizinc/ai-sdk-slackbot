# Phase 3 Plan – Active Flow Refactor (`generate-response.ts`)

## Goal
- Decompose `lib/generate-response.ts` (1,272 LOC) into modular agent components that reuse the shared services created in Phases 1–2.
- Preserve the existing API/behaviour behind the `REFACTOR_ENABLED` feature flag while we migrate call sites.
- Establish dedicated unit and integration tests for the new modules so we can safely retire the legacy file once parity is proven.

## Current State (Baseline)
- Monolithic file handles: Zod schemas, tool definitions, context building, LLM orchestration, provider fallbacks, response post-processing, metrics, and Slack updates.
- Shared services now available: `SlackMessagingService`, `CaseDataService`, `SearchFacadeService`, plus existing domain services (KB generator, intelligent assistance, etc.).
- Feature flags: `lib/handle-passive-messages.ts:1` already toggles passive flow; `lib/generate-response.ts:1` still runs legacy implementation regardless of `REFACTOR_ENABLED`.
- Integration tests: `tests/generate-response.integration.test.ts:1` covers 12 behavioural scenarios we must keep green.

## Target Architecture (Phase 3 Modules)
```
lib/
  agent/
    index.ts              // Public exports; toggled via feature flag
    orchestrator.ts       // High-level Slack request handler (≤150 LOC)
    prompt-builder.ts     // Builds system prompt, context segments
    message-formatter.ts  // Slack-friendly formatting, status updates
    tool-registry.ts      // Registers tools & schemas (inject services)
    runner.ts             // Core loop with streaming/tool-call handling
    context-loader.ts     // Pulls case data, search results, history
  agent/tools/
    service-now.ts        // Tool handlers using CaseDataService
    knowledge-base.ts     // Tool handlers for KB generation
    search.ts             // Tool handlers using SearchFacadeService
    ...
```

### Cross-cutting utilities
- `lib/agent/feature-flags.ts` (optional) to encapsulate feature checks.
- Shared types in `lib/agent/types.ts` for agent-specific DTOs.
- Reuse `SlackMessagingService` for status updates (replace direct WebClient calls).

## Implementation Plan
### Phase 3A – Feature Flag & Scaffold ✅
1. Introduce `lib/agent/index.ts` exporting legacy orchestrator initially (no behaviour change).
2. Update `lib/generate-response.ts:1` to `await import('./agent')` when `REFACTOR_ENABLED` is true (mirrors passive flag pattern).
3. Add skeleton files for `orchestrator`, `tool-registry`, `prompt-builder`, and `runner` with TODO stubs; add docstrings outlining responsibilities.
4. Create `tests/agent` folder with placeholder test suites to be filled in later; ensure Vitest setup recognises the new path.

### Phase 3B – Tool & Schema Extraction (In Progress)
1. ✅ Move Zod schemas and tool definitions into `agent/tools/factory.ts` (legacy factory now reused by registry).
2. ✅ Replace direct imports in the legacy file with the factory helper; `generate-response.ts` now calls `createLegacyAgentTools`.
3. ⏳ Add targeted unit tests around tool handlers (current coverage: `tests/agent/tool-registry.test.ts` validates registry wiring; per-tool tests pending).
4. ⏳ Update integration tests to run under both legacy and refactored flags (dual-run harness still outstanding).

### Phase 3C – Context & Prompt Modules
1. Implement `context-loader.ts` that coordinates:
   - Case data fetch (CaseDataService)
   - Search results (SearchFacadeService)
   - Slack thread history (SlackMessagingService)
   - Business context services (existing modules)
2. Implement `prompt-builder.ts` to assemble system prompt, user messages, tool metadata, respecting `sanitizeModelConfig`.
3. Add unit tests for prompt assembly with representative fixtures.

### Phase 3D – Runner & Orchestrator
1. Implement `runner.ts` to wrap LLM calls (initially still using `instrumented-ai` functions), handle streaming/tool calls, and record metrics.
2. Implement `message-formatter.ts` for Slack responses, including status updates via SlackMessagingService.
3. Wire everything through `orchestrator.ts`; update `agent/index.ts` to expose the new orchestrator behind the flag.
4. Expand integration tests to compare legacy vs refactored outputs with the flag toggled.

### Phase 3E – Cleanup & Parity Verification
1. Execute end-to-end tests with `REFACTOR_ENABLED=true` (Slack smoke, ServiceNow canary) to confirm behaviour.
2. Reduce `lib/generate-response.ts` to a thin facade that only handles the flag switch and legacy fallback.
3. Update documentation (`docs/api-contracts-baseline.md`, architecture docs) to reflect new module layout.
4. Prepare Phase 4 (provider swap) by identifying touch points in `runner.ts`.

## Testing Strategy
- **Unit tests**: Each agent module (tool handlers, context loader, prompt builder, runner) gets its own suite with mocked dependencies.
- **Integration tests**: Extend existing suite to run under both flag states. Ensure the fixtures cover tool invocation, context assembly, and error paths.
- **Feature flag tests**: Add targeted tests verifying lazy import behaviour and fallback to legacy.
- **Performance baseline**: Capture timings before/after to ensure added modularity doesn’t regress response latency significantly (document in metrics baseline).

## Risks & Mitigations
- **Contract drift**: Use integration tests to assert identical Slack responses/string outputs between legacy and refactored paths.
- **Dependency loops**: Keep services injected (constructor params) to avoid circular imports (especially with Slack service).
- **File size creep**: Enforce ≤200 LOC per new module via lint rule or manual review; split further if needed (e.g. subdirectories under `agent/tools`).

## Exit Criteria for Phase 3
- `REFACTOR_ENABLED=true` exercises the new agent modules end-to-end with full test coverage.
- `lib/generate-response.ts` <=150 LOC, acting solely as a compatibility wrapper.
- All new modules documented and accompanied by tests.
- Production rollout plan ready (enable flag in staging, monitor, then default-on).

## Current Status
- ✅ Phase 3A complete: feature-flagged agent scaffolding in place (`lib/agent/` modules, legacy delegation, and baseline test).
- ✅ Phase 3B complete: tool extraction with 91 unit tests across 9 tool modules; dual-run integration test harness with 24 tests (12×2 modes).
- ✅ Phase 3C complete: context-loader (45 LOC) and prompt-builder (87 LOC) implemented with comprehensive unit tests.
- ✅ Phase 3D complete: runner (156 LOC), message-formatter (32 LOC), and orchestrator (82 LOC) with 54 new unit tests; all 188 agent tests passing.
- ✅ Phase 3E complete: All 24 integration tests passing with `REFACTOR_ENABLED=true`; `lib/generate-response.ts` reduced to 64-line thin facade; legacy implementation extracted to `lib/legacy-generate-response.ts` (316 LOC).

**Phase 3 Complete**: All modules under 200 LOC, comprehensive test coverage (100% passing), and behavioral parity verified between legacy and refactored implementations.
