# Refactor Plan: `generate-response.ts` & `handle-passive-messages.ts`

## Goal
- Split the two orchestration-heavy modules into focused services that follow SRP.
- Prepare for future provider work by stabilizing shared abstractions (no provider changes in this phase).
- Preserve current behaviour and test coverage while incrementally carving out services.

## Scope
- Includes: `lib/generate-response.ts`, `lib/handle-passive-messages.ts`, new service modules, unit/integration test updates.
- Excludes: Anthropic-chat migration, embedding changes, dependency swaps, major Slack API rewrites.

## Current Pain Points
- `lib/generate-response.ts` (~3.5k LOC) mixes tool schemas, tool implementations, prompt building, model routing, and Slack response formatting.
- `lib/handle-passive-messages.ts` interleaves Slack event filtering, context persistence, ServiceNow lookups, Azure Search, KB follow-up logic, and messaging.
- Overlapping ServiceNow and Azure Search lookups live in both files, violating DRY and making tests brittle.

## Target Architecture

```
lib/
  agent/
    orchestrator.ts        // Entry point for @mention flow (thin coordinator)
    prompt-builder.ts      // Builds system + context prompts
    tool-registry.ts       // Registers tool schemas and handlers
    message-formatter.ts   // Formats Slack-friendly responses
  passive/
    handler.ts             // Entry point for passive monitor
    extractor.ts           // Detects case numbers, updates context
    rules.ts               // Determines when to assist / trigger KB
    actions.ts             // Performs Slack posts, schedules KB jobs
  services/
    slack.ts               // WebClient calls, thread helpers
    conversation-context.ts// Re-exports context manager, adds helpers
    case-data.ts           // ServiceNow case + journal fetchers
    search.ts              // Azure Search wrapper
    intelligent-assistance.ts // Builds assistance content
    knowledge-base.ts      // KB state machine integration, follow-up messages
```

## Work Breakdown
1. **Introduce Shared Services**
   - Extract Slack helpers into `services/slack.ts`; update both files to consume it.
   - Move ServiceNow/Azure utilities into `case-data.ts` and `search.ts`.
   - Add `intelligent-assistance.ts` with existing message-building logic (reused by active/passive flows).
2. **Refactor Passive Flow**
   - Create `passive/extractor.ts`, `rules.ts`, `actions.ts`, wire through new services.
   - Shrink `handle-passive-messages.ts` to a thin coordinator that delegates to the passive modules.
   - Update tests and add coverage for new passive helpers.
3. **Refactor Active Flow**
   - Move zod schemas + tool definitions into `agent/tool-registry.ts`.
   - Extract prompt assembly into `agent/prompt-builder.ts` and final response shaping into `agent/message-formatter.ts`.
   - Create `agent/orchestrator.ts` that exposes the existing API and coordinates services/tool runner.
   - Update callers (API routes, tests) to import the orchestrator.
4. **Cleanup & Validation**
   - Remove dead code from the original files, leaving only re-exports if necessary.
   - Run lint/test suites; add targeted unit tests for each new service.
   - Document new module boundaries in `docs/architecture.md` (or equivalent).

## Incremental Delivery Notes
- Perform extractions in small PR-sized steps (service extraction, passive split, active split) to ease review.
- Keep existing exports stable (consider temporary re-exports) until all call sites are updated.
- After each step, run `pnpm test` and relevant Slack/ServiceNow smoke tests where possible.

## Risks & Mitigations
- **Regression risk**: Use feature flags or staged rollout (e.g., keep old orchestrator behind env switch) if needed during extraction.
- **Hidden coupling**: Add TODOs for any logic that still leaks across layers; address in follow-up.
- **Test gaps**: Introduce service-level unit tests before removing logic from the monolith files.

## Acceptance Criteria
- `lib/generate-response.ts` and `lib/handle-passive-messages.ts` contain only coordination logic (≤ ~150 LOC each) or re-export wrappers.
- New service modules encapsulate shared behaviour with accompanying tests.
- No duplicate ServiceNow/Azure search logic across modules.
- Existing Slack interaction tests and ServiceNow smoke scripts pass unchanged.
