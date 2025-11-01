# VeloCloud REST Tool

Anthropic-native tool that lets the agent query VMware VeloCloud (VMware SD-WAN) orchestrator REST APIs for quick connectivity insight.

## Capabilities & When To Use

- Designed for sites that employ ISP-managed VMware VeloCloud (VMware SD-WAN) appliances—currently Altus, Exceptional, Austin, and Neighbors on the TPX / TelePacific platform.
- Typical trigger is an end user saying “the internet is down,” “we lost phones,” or “the site can’t reach anything.” Use it even if the report originates from the firewall team, because the SD-WAN edge is the authoritative WAN signal.

- List enterprise edges to confirm device state, last contact time, and site/account mapping (`query: "list_edges"`).
- Retrieve link status for a specific edge, including latency, loss, and state (`query: "edge_links"`).
- Pull recent enterprise or edge-scoped events for rapid triage (`query: "enterprise_events"`).

All calls are read-only and mirror the native `/portal/rest/...` endpoints exposed by VeloCloud.

## Configuration

Provide credentials via environment variables before running the agent:

```
VELOCLOUD_URL=https://orchestrator.example.com/
VELOCLOUD_API_TOKEN=token-from-velocloud  # recommended
# Optional alternatives:
# VELOCLOUD_USERNAME=api_user      # VELOCLOUD_LOGIN also accepted
# VELOCLOUD_PASSWORD=super-secret
# VELOCLOUD_ENTERPRISE_ID=12345
# VELOCLOUD_LOGIN_MODE=operator    # defaults to enterprise, tries both
# VELOCLOUD_API_USERNAME=uuid-from-orchestrator
# VELOCLOUD_API_PASSWORD=jwt-or-api-token   # treated as API token when no VELOCLOUD_API_TOKEN is set
# VELOCLOUD_LOGICAL_ID=logical-id-if-required-by-your-tenant
```

For multi-tenant deployments you can suffix variables with an uppercased alias (e.g., `VELOCLOUD_ALLCARE_URL`, `VELOCLOUD_ALLCARE_API_TOKEN`). Pass the same alias as `customerName` in the tool input and the helper resolves the matching credentials.

## Tool Signature

```
queryVelocloud({
  query: "list_edges" | "edge_links" | "enterprise_events",
  enterpriseId?: number,
  edgeId?: number,
  customerName?: string,
  lookbackMinutes?: number,
  limit?: number,
  severity?: string
})
```

- `edge_links` requires `edgeId`.
- `enterprise_events` accepts optional `edgeId` and `severity` filters and defaults to the last 60 minutes.

## Output Shape

Each response includes a human-readable `summary` plus raw data payloads:

- `list_edges` → `{ summary, edges: [...] }`
- `edge_links` → `{ summary, links: [...] }`
- `enterprise_events` → `{ events: { summary, items, total } }`

Use the raw arrays for downstream automation or surface the summary text in Slack updates.
