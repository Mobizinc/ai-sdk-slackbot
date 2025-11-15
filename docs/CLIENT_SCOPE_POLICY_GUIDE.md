# Client Scope Policy Guide

This guide explains how to onboard additional client contracts into the agent architecture so the ServiceNow orchestration flow can enforce Non-BAU guardrails deterministically.

## Overview

The runtime uses `lib/services/client-scope-policy-service.ts` to load JSON policy files placed under `config/client-policies/`. Each policy captures:

- Canonical client identity + aliases (matching ServiceNow `account_id` / business context names)
- Hour thresholds for incidents vs. service requests
- Onsite allocations and approval rules
- Examples of in-scope vs. out-of-scope work
- Escalation triggers/contacts and metadata about the source document

Discovery packs automatically attach the resolved policy, the classification agent reasons about it (adding a `scope_analysis` block), and `CaseTriageService` evaluates the output against the contract to produce a deterministic `scope_evaluation` used by escalations/supervisor flows.

## Adding a New Client Policy

1. **Gather contract data**  
   Capture the client’s SOW / MSA details: response hour caps, onsite allocations, disallowed/project examples, escalation contacts, and document references.

2. **Create the JSON file**  
   Copy `config/client-policies/_template.json` to a new file named after the client (kebab case recommended, e.g., `neighbors-emergency-center.json`). Fill out the fields:
   - `client`: canonical name + aliases that appear in ServiceNow `account_id` or business context records.
   - `effortThresholds`: integer hours for incidents vs service requests (omit if not specified).
   - `onsiteSupport`: monthly allocation, overage rate, whether pre-approval is required, emergency definition/notes.
   - `allowedWorkExamples` / `disallowedWorkExamples`: short bullet examples pulled from the contract.
   - `escalation.triggers` and optional `contacts` (name/role/email/channel).
   - `metadata`: cite the source document or folder for auditors.

3. **Validate locally**  
   Run the focused tests to ensure the policy parses and discovery packs pick it up:
   ```bash
   pnpm vitest tests/client-scope-evaluator.test.ts tests/discovery-context-pack.test.ts --run
   ```
   Add or update fixtures/tests if the new contract needs bespoke evaluator behavior.

4. **Wire additional automation (optional)**  
   If the client requires custom escalation routing, extend `lib/config/escalation-channels.ts` or the supervisor config to map the new `clientName` / aliases to the correct Slack channel.

5. **Document**  
   Reference the new policy in any runbooks or onboarding docs so operations knows the contract is enforced automatically.

## Tips

- Keep the JSON minimal and focused on deterministic rules. Narrative clauses can live in the source document referenced in `metadata`.
- Aliases should include every label that might appear in ServiceNow (`account_id`, `account`, Slack channel name) to maximize hit rate during discovery.
- When hour caps differ for multiple tiers, pick the lowest enforced value and note nuances in `metadata.notes` or `onsiteSupport.notes`.
- PR reviewers can diff the JSON directly—no hidden migrations required.
