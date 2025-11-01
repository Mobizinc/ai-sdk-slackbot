# VeloCloud SD-WAN CI Playbook

## Objective

Make every TPX/TelePacific VeloCloud edge visible to the triage agent so Claude can quickly determine whether a site depends on SD-WAN for internet access. The data also feeds ServiceNow so the CMDB reflects carrier-managed connectivity.

## 1. Export Edge Inventory

1. Ensure `.env` / `.env.local` contains the correct VeloCloud credentials (API token or username/password) for each tenant you manage:
   ```
   VELOCLOUD_CUSTOMERA_URL=https://orchestrator.example.com
   VELOCLOUD_CUSTOMERA_API_TOKEN=token
   ```
2. Run the exporter (use `all` to iterate across every configured tenant):
   ```bash
   pnpm tsx scripts/export-velocloud-edges.ts all
   # optionally specify a single tenant
   pnpm tsx scripts/export-velocloud-edges.ts customera
   # change output location
   pnpm tsx scripts/export-velocloud-edges.ts all --out=ci-records/velocloud-edges.alt.json
   ```
3. The script writes a normalized payload to `ci-records/velocloud-edges.json` (see `ci-records/velocloud-edges.template.json` for structure).

Fields captured per edge:
- `edge_id`, `logical_id`, `edge_name`
- `site_name` (when provided by TPX)
- `edge_state`, `activation_state`, `last_contact`
- `model_number`, `account_hint` (first `ACCTxxxxx` token in the name)

## 2. Load Into ServiceNow

1. Create or reuse a CI class (recommended: `cmdb_ci_carrier_device` or a custom subclass like `u_sdwan_edge`).
2. Map payload fields to CI attributes:
   | Payload field | Suggested SN attribute | Notes |
   |---------------|-----------------------|-------|
   | `edge_name`   | `name`                | Keep the TPX naming convention |
   | `logical_id`  | `serial_number`       | Unique identifier from VeloCloud |
   | `model_number`| `model_number`        | Populate manufacturer `= VMware` or `= TPX` |
   | `edge_state`  | `u_edge_state`        | Custom string field if needed |
   | `account_hint`| `u_account_number`    | Helps reconcile with billing |
   | `last_contact`| `last_discovered`     | Convert to DateTime |
3. Create relationships:
   - **Depends on** the site/location CI (facility or office)
   - **Provides connectivity to** the customer firewall CI (Fortinet, Palo Alto, SonicWall, etc.)
   - Optional: link to WAN circuits or carrier contracts.

## 3. Surface to Claude & Discovery

1. Store the exported JSON in the context manager or hydrate an internal lookup so the Discovery agent can attach `sdwan_edge` metadata to the case.
2. Update the Discovery agent snippets to include:
   ```
   "sdwan_edges": [
     {
       "site": "Amarillo North",
       "provider": "TPX",
       "edge_name": "ACCT0242146 - Amarillo North - 2101 S Coulter St",
       "edge_state": "CONNECTED",
       "last_contact": "2025-01-07T23:59:00.000Z"
     }
   ]
   ```
3. Adjust the Connectivity Reasoning Agent to:
   - Look up the site’s VeloCloud edge before running tests.
   - Mention “VeloCloud-connected location” in summaries so humans know the SD-WAN dependency.
4. Optional: add a heuristic that, when a case references a site with an SD-WAN edge, automatically suggests running `queryVelocloud` for last-mile verification.

## 4. Operational Checklist

- [ ] Schedule the exporter (e.g., GitHub Action or QStash job) to refresh the edge inventory daily.
- [ ] Confirm new/renamed edges are syncing into ServiceNow via integration hub or data import sets.
- [ ] Validate CMDB relationship rules so SD-WAN edges appear on site dependency maps.
- [ ] Train responders that “VeloCloud edge present” means they should verify TPX connectivity in parallel with firewall checks.

## References

- `scripts/export-velocloud-edges.ts` – edge exporter
- `ci-records/velocloud-edges.template.json` – payload example
- `lib/agent/tools/velocloud.ts` – Anthropic tool using the SD-WAN data
