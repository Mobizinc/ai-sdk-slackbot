# VeloCloud SD-WAN CI Playbook

## Objective

Make every TPX/TelePacific VeloCloud edge visible to the triage agent so Claude can quickly determine whether a site depends on SD-WAN for internet access. The data also feeds ServiceNow so the CMDB reflects carrier-managed connectivity.

## 1. Pre-flight Checklist

1. `.env.local` must contain VeloCloud orchestrator credentials for Altus/Allcare (`VELOCLOUD_URL`, `VELOCLOUD_API_TOKEN` or username/password). The credentials already live in the repo vault.
2. Confirm ServiceNow credentials (`SERVICENOW_URL/USERNAME/PASSWORD`) are set for the production instance.
3. Ensure the **Allcare-Azure** location CI exists (created during the firewall rebuild) and each Altus firewall is mapped to its site location.
4. Identify the TPX company record: `TPX - TelePacific` (or `TPx Communications`) should exist in **core_company**. The import script will auto-look it up; create it first if missing so `managed_by`/`manufacturer` populate.
5. Optional but recommended: run the firewall rebuild first (`scripts/rebuild-allcare-from-fortimanager.ts`) so locations/network relationships are fresh before attaching Velocloud data.

## 2. Import Edges & Circuits (Automated)

Use the new ingestion script which pulls live data from VeloCloud and pushes it straight into the CMDB.

```bash
# dry run (prints actions, no writes)
npx tsx scripts/import-altus-velocloud-edges.ts --dry-run

# live run (default enterprise configured in env)
npx tsx scripts/import-altus-velocloud-edges.ts

# specify a customer alias if multiple tenants are configured
npx tsx scripts/import-altus-velocloud-edges.ts --customer allcare

# provide a CSV export from the TPX portal if API link stats are unavailable
npx tsx scripts/import-altus-velocloud-edges.ts --csv ~/Downloads/monitor_edges_export.csv
```

What it does:

| Object            | Class                    | Key fields populated                                                                                           |
|-------------------|--------------------------|------------------------------------------------------------------------------------------------------------------|
| Velocloud Edge    | `cmdb_ci_ip_router`      | `name = "<Altus site> Velocloud Edge"`, `serial_number = logicalId`, `asset_tag = VC-<edgeId>`, manufacturer = VMware/Velocloud, `managed_by = TPX`, location = Altus site |
| WAN Circuit (link)| `cmdb_ci_ip_network`     | One per edge link. Stores Link ID, transport type, bandwidth, TPX account metadata, `correlation_id = VC-LINK-<edgeId>-<linkId>` |
| Relationships     | `cmdb_rel_ci`            | Edge → Firewall (`Connects to::Connected by`), Edge → Circuit (`Depends on::Used by`)                                                                  |

The script skips sites it cannot map to an Altus firewall (logging a warning) and is idempotent—re-running updates existing CIs rather than creating duplicates.
If the VeloCloud orchestrator does not permit link-status queries (`edge/getEdgeLinkStatus`), include the portal export CSV with `--csv` and the importer will seed circuits from the “Connected Links” column (still creating the proper relationships). When TPX unlocks the API call, circuits will populate automatically without the CSV.

## 3. Post-Run Validation

Run the following quick checks (either manually or via a helper script):

- **Edge count** – `cmdb_ci_ip_router` where `asset_tagSTARTSWITHVC-` should match the number of edges returned by VeloCloud.
- **Circuit health** – `cmdb_ci_ip_network` where `correlation_idSTARTSWITHVC-LINK-` should equal 2 circuits per dual-homed site (or match the live portal count).
- **Relationships** – the Azure hub firewall (`ACM-AZ-FW01`) should now display 29 spokes under CI Relationships. Each Velocloud edge should show:
  - `Connects to` relationship to its Altus firewall.
  - `Depends on` relationships to TPX circuits.
- **No blanks** – run a query for `cmdb_ci_ip_network` with `subnetISEMPTY^correlation_idSTARTSWITHVC-LINK-` to ensure the script populated metadata (should return zero).

## 4. Surface to Claude & Discovery

1. Store the edge/circuit inventory (or re-query via API) so Discovery/triage prompts can mention SD-WAN status automatically.
2. Update the Connectivity Reasoning agent to note when a site has TPX Velocloud coverage and suggest running `queryVelocloud` before escalating carrier tickets.
3. For cases referencing an Altus site, check the Velocloud status alongside Fortinet/TPX alerts to provide carriers with concrete evidence (link ID, latency data, etc.).

## 5. Operational Checklist

- [ ] Schedule `import-altus-velocloud-edges.ts` (e.g., nightly) so CMDB data stays in sync with TPX changes.
- [ ] When a new Altus site comes online, add the Fortinet firewall first, then rerun the Velocloud importer to attach the SD-WAN gear automatically.
- [ ] Document any unmatched edges in the run log so facilities with missing Fortinet firewalls can be fixed.
- [ ] Train responders that TPX circuit data now lives in CMDB—include circuit ID and bandwidth in incident notes when opening carrier tickets.

## References

- `scripts/import-altus-velocloud-edges.ts` – primary ingestion script (supports `--dry-run` and `--customer` flags)
- `lib/agent/tools/velocloud.ts` – runtime tool for fetching live edge/link status
- `scripts/test-velocloud-tool.ts` – ad-hoc tester for orchestrator connectivity

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
