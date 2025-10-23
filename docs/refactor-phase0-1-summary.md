# Phase 0–1 Status: Generate/Passive Refactor

## Overview
- Phase 0 (prep/infrastructure) and Phase 1 (shared services extraction) are complete.
- Work-to-date focuses on feature-flag scaffolding, integration baselines, and three shared services that both orchestrators will consume when we split them.
- Anthropic migration is intentionally out-of-scope here; remaining work targets the passive and active flows in later phases.

## Phase 0 – Prep & Baselines
- **Feature flags** (`lib/config/feature-flags.ts:1`) load `REFACTOR_ENABLED` and `REFACTOR_PASSIVE_ENABLED`, log settings in dev, and expose test overrides (`__setFeatureFlags`, `__resetFeatureFlags`).
- `.env.example:143` documents both flags with defaults off so the legacy handlers stay active until rollout.
- **Integration baselines**
  - `tests/generate-response.integration.test.ts:1` contains 12 scenarios covering tool execution, fallbacks, and response formatting.
  - `tests/handle-passive-messages.integration.test.ts:1` contains 22 scenarios validating detectors, KB triggers, and Slack side effects.
- **Documentation** baseline is captured in `docs/api-contracts-baseline.md:1` (public exports) and `docs/metrics-baseline.md:1` (current measurements).
- **Current monolith size**: `lib/generate-response.ts:1` is 1,272 LOC; `lib/handle-passive-messages.ts:1` is 608 LOC (total 1,880). Target after refactor remains ≤200 LOC per orchestrator wrapper.

## Phase 1 – Shared Services
Three reusable services now encapsulate the heavy integrations. Each follows a singleton + reset helper pattern for testability.

| Service | File | LOC | Key Methods | Tests (count) |
|---------|------|-----|-------------|---------------|
| Slack messaging | `lib/services/slack-messaging.ts:1` | 259 | `postMessage`, `postToThread`, `updateMessage`, `getThreadReplies`, `getThread`, `createStatusUpdater`, `getBotUserId` | `tests/slack-messaging.test.ts:1` (25) |
| Case data | `lib/services/case-data.ts:1` | 214 | `getCase`, `getCaseJournal`, `getCaseWithJournal`, `isResolved`, `getCases` | `tests/case-data.test.ts:1` (31) |
| Search facade | `lib/services/search-facade.ts:1` | 239 | `searchSimilarCases`, `searchKnowledgeBase`, `searchWeb`, `searchAndFormatAsMarkdown` | `tests/search-facade.test.ts:1` (27) |

### Test & Coverage Notes
- New unit tests added in Phase 1: 83 (`25 + 31 + 27`) across the three services.
- Integration suites from Phase 0 total 34 tests (`12 + 22`), providing behavioural parity before refactors land.
- Combined, 117 tests cover the new seams; `pnpm test` passes locally (last run in Phase 1).

## Next Focus – Phase 2 (Passive Flow)
- Break `handle-passive-messages.ts` into `passive/handler.ts`, detector modules, and action modules that call the new services.
- Maintain feature-flag guard (`REFACTOR_PASSIVE_ENABLED`) so we can dual-run new and legacy code.
- Target LOC reduction for passive path: 608 → ~400 spread across ≤7 files (≤100 LOC each).
- Deliver incremental PRs: (1) detector extraction, (2) action/service wiring, (3) orchestrator wrapper.

## Key Takeaways
- Prep work established reliable toggles and integration baselines without changing runtime behaviour.
- Shared services now isolate Slack, ServiceNow, and search logic, satisfying DRY/SRP goals ahead of the orchestrator splits.
- We have the testing harness required to refactor confidently in Phase 2 and beyond.

## Phase 2 – Passive Flow Split (Current Status)
- Refactored modules under `lib/passive/` now exist:
  - `handler.ts:1` (145 LOC) coordinates detectors/actions and mirrors the legacy API under the `REFACTOR_PASSIVE_ENABLED` flag (`lib/handle-passive-messages.ts:1`).
  - `detectors/case-number-extractor.ts:1` (101 LOC) and `detectors/resolution-detector.ts:1` (161 LOC) encapsulate parsing and resolution heuristics.
  - `actions/add-to-context.ts:1` (211 LOC) centralises context updates; `actions/post-assistance.ts:1` (196 LOC) handles Slack messaging; `actions/trigger-kb-workflow.ts:1` (515 LOC) manages KB workflow orchestration.
- Feature-flag plumbing is wired: the legacy file lazily imports `./passive` only when `REFACTOR_PASSIVE_ENABLED` is true, keeping rollback simple.

### Current Status
- File size targets met: `lib/passive/handler.ts` is now 62 LOC and the KB workflow logic is distributed across smaller modules (largest helper 94 LOC).
- Tests added: `tests/passive/handler.test.ts`, `tests/passive/handler-utils.test.ts`, and `tests/passive/trigger-kb-workflow.test.ts` cover passive orchestration, case detection, and KB workflow delegation in addition to the integration suite.
- Documentation alignment: passive module responsibilities documented here remain accurate; no outstanding TODOs for Phase 2.
