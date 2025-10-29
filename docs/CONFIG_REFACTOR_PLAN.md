# Configuration Refactor Plan

## Objectives
- Replace 100+ scattered `process.env` lookups with a single typed configuration surface.
- Persist non-secret settings (toggles, thresholds, channel IDs) in the existing `app_settings` table.
- Keep secrets in environment variables, but register them in the same schema for documentation purposes.
- Provide a foundation for an authenticated HTML admin panel that edits the stored settings.

## Target Architecture

### 1. Central Definitions Registry
- New module: `lib/config/registry.ts`
- Exports a `CONFIG_DEFINITIONS` object keyed by canonical slug (e.g. `triage.escalation.enabled`).
- Each entry captures:
  - `envVar`: legacy environment variable name (for bootstrap/fallback).
  - `type`: `"boolean" | "number" | "string" | "json"`.
  - `default`: default value when neither DB nor env provide one.
  - `group`: high-level category (`"triage"`, `"catalog"`, `"servicenow"`, `"llm"`, etc.).
  - `sensitive`: boolean flag (hides value in UI/export; defaults to false).
  - `description`: one-liner for docs/admin UI.
- Example:
  ```ts
  export const CONFIG_DEFINITIONS: Record<ConfigKey, ConfigDefinition> = {
    "triage.escalation.enabled": {
      envVar: "ESCALATION_ENABLED",
      type: "boolean",
      default: true,
      group: "triage",
      description: "Send Slack escalations for non-BAU cases.",
    },
    "servicenow.url": {
      envVar: "SERVICENOW_URL",
      type: "string",
      group: "servicenow",
      sensitive: true,
      description: "Base URL for ServiceNow API requests.",
    },
  };
  ```

### 2. Loader With DB Fallback
- New module: `lib/config/loader.ts`
- Responsibilities:
  - Lazy-load cached values via `getConfig()` returning a typed structure.
  - For each definition, load override from `app_settings` table (using existing `getAppSetting` helper).
  - If no DB value, fall back to `process.env[envVar]`.
  - Parse and validate according to the definition `type`. On failure, log and use default.
  - Expose helper `getSetting(key)` to fetch individual values without re-parsing everything.
  - Provide `refreshConfig()` to flush cache when admin UI updates values.
  - All functions async but memoised to reduce await churn. Example signature:
    ```ts
    export async function getConfig(): Promise<ResolvedConfig> { ... }
    export function getCachedConfig(): ResolvedConfig | null { ... }
    export async function refreshConfig(): Promise<void> { ... }
    ```

### 3. Typed Consumer Surface
- Replace `lib/config.ts` with a thin wrapper that calls the loader and returns a strongly typed object:
  ```ts
  import { getConfig } from "./config/loader";
  export type AppConfig = Awaited<ReturnType<typeof getConfig>>;
  export const configPromise = getConfig();
  ```
- Update call sites gradually:
  - Short-term: keep a synchronous mirror for high-traffic paths by exporting `getConfigSync()` which reads the cached version (throws if accessed before initial load).
  - Long-term: migrate services to accept `config` as dependency injection during initialization/startup.

### 4. Persistence API
- Extend `lib/services/app-settings.ts`:
  - `setAppSetting` already upserts text values. Wrap with new helpers that cast from JS types to strings using the same parser/serializer as the loader.
  - Introduce `setAppSettings(partial: Record<ConfigKey, unknown>)` to batch updates (single transaction).
  - Add `listAppSettings()` returning current config with metadata for admin UI rendering.

### 5. Migration Path
1. **Bootstrap**:
   - Populate `CONFIG_DEFINITIONS` incrementally, starting with high-impact groups (triage, catalog redirect, escalation, Slack, ServiceNow).
   - Add migration script to seed DB with current env values:
     ```bash
     pnpm ts-node scripts/migrate-config-to-db.ts
     ```
     - Reads `CONFIG_DEFINITIONS`.
     - For each non-sensitive key, if the DB row is missing and `process.env` has a value, write it.
2. **Refactor Consumers**:
   - Replace direct `process.env` usage with `config` lookups.
   - Remove per-file parsing logic (e.g., boolean coercion) in favour of central parsing.
3. **Documentation Cleanup**:
   - Auto-generate `.env.example` from definitions (flag sensitive vs non-sensitive).
   - Update markdown guides to point to the admin UI or refer to the generated env sample.

### 6. Admin UI (Phase 2)
- Password-protect the existing static HTML with basic auth as a short-term safeguard, and compile the companion TypeScript bundle with `pnpm build:admin` whenever settings metadata changes.
- Populate the UI by calling a new API route (`/api/admin/config`) that:
  - Authenticates via shared secret or session.
  - Uses `listAppSettings()` to return grouped settings with descriptions.
  - Supports PUT/PATCH to `setAppSettings`.
- UI groups toggles and numeric thresholds, marking sensitive fields as read-only (edit via secrets manager).

## Immediate Action Items
1. **Create registry & loader skeleton** (definitions for ~40 highest priority keys).
2. **Implement `getConfig` + cache** and export synchronous accessor for existing code.
3. **Refactor `lib/config.ts` consumers** (escalation, catalog redirect, triage) to use the new access pattern.
4. **Backfill DB** for existing deployed environments using the migration script (note: sensitive keys are skipped automatically).
5. **Review documentation** and replace ad-hoc env listings with references to the single registry/export.

## Long-Term Enhancements
- Generate TypeScript types from `CONFIG_DEFINITIONS` to enforce compile-time safety (`ConfigKey` union, group-specific interfaces).
- Add audit trail to `app_settings` (e.g., `updated_by`, `history` table) once the admin UI is active.
- Integrate with a secrets manager for sensitive keys, keeping the same registry metadata for documentation.
- Instrument config changes (notify Slack when high-risk toggles flip).

## Appendix: Suggested Groups
- `triage.*`: Escalation, async processing, classification behaviour.
- `catalog.*`: Redirect toggles, thresholds, contact info.
- `servicenow.*`: Instance URLs, tables, credentials (sensitive).
- `slack.*`: Bot token, signing secret, channel IDs.
- `llm.*`: Provider keys, models, timeouts.
- `search.*`: Azure search configuration.
- `webex.*`: Contact center API credentials.
- `telemetry.*`: LangSmith, App Insights, logging levels.
- `database.*`: Connection strings (sensitive).
- `experiments.*`: Feature flags under active development.
