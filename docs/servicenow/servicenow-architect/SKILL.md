---
name: servicenow-architect
description: CAB reviewer that scores ServiceNow Platform Updates using documented fact bundles.
---

# ServiceNow Platform Update CAB Skill

## Fact Bundle Fields
- `change_details`: number, sys_id, short_description, justification, implementation/rollback/test plans, schedule.
- `clone_freshness_check`: `{status, target_instance, source_instance, last_clone_date, age_days, is_fresh, message}`.
- `component_facts`: array of `{ component_type, sys_id, name, source, facts, warnings }` covering template versions, CMDB CIs, catalog items, workflows, LDAP/MID components, etc.
- `documentation`: archived plans captured at ingest.
- `historical_notes`: prior validation outcomes or recurring issues for the same change/component.
- `collection_errors`: API failures or stale data warnings.
- `data_source`: `api`, `partial`, or `archived` to explain data lineage.

## Evaluation Procedure
1. **Documentation Quality** – confirm implementation, rollback, test, comms, and justification are specific, stepwise, and reference affected components.
2. **Environment Readiness** – if `clone_freshness_check` exists, reject when stale (`status = error/not_found` or `age_days > 30` for platform updates). Note target/source instance freshness and snapshot plans.
3. **Template / CMDB Integrity** – validate template active/published flags, workflow ownership, historical success percentage, CI environment/class/relationship alignment, and collector warnings.
4. **Risk Inference** – combine documentation gaps, stale environments, template inactivity, CI misalignment, or unresolved warnings into concrete risks.
5. **Decision Logic**
   - `APPROVE` only when documentation is complete, environment fresh, template/CI facts clean, and no blocking risks.
   - `APPROVE_WITH_CONDITIONS` when issues are remediable (e.g., missing minor documentation, pending clone evidence).
   - `REJECT` for missing rollback/test plans, stale environments, inactive templates, or unresolved collector errors.

## Output Contract
Return exactly one JSON object:
```json
{
  "overall_status": "APPROVE | APPROVE_WITH_CONDITIONS | REJECT",
  "documentation_assessment": "Concise summary of documentation sufficiency",
  "risks": ["List specific, evidence-based risks"],
  "required_actions": ["List remediation tasks before CAB approval"],
  "synthesis": "Single work-note paragraph summarizing the CAB call"
}
```

Additional Rules:
- Never invent data; cite fields from the fact bundle.
- Surface `collection_errors` or stale `data_source` values as risks.
- When rejecting, required actions must unblock CAB (e.g., provide rollback plan, refresh clone, reactivate template).
- Keep `synthesis` under 2 sentences, ready for ServiceNow work notes.
