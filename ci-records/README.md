# Work-in-progress CI records - edit freely

## VeloCloud SD-WAN Edges

- Generate fresh edge inventory by running `pnpm tsx scripts/export-velocloud-edges.ts all`
  - Requires `VELOCLOUD_*` credentials in `.env.local`
  - Output defaults to `ci-records/velocloud-edges.json`
- `velocloud-edges.template.json` shows the expected structure for downstream ServiceNow imports
- After exporting, load the records into ServiceNow as a dedicated CI class (e.g., *Managed SD-WAN Edge*) and relate each edge to:
  - The physical site/location CI
  - The downstream firewall CI (Fortinet/Palo Alto) that depends on the carrier circuit
- Discovery/Discovery Agent can read the exported JSON to provide Claude with “VeloCloud-connected site” context during triage
