/**
 * Import Altus Velocloud Edges & Circuits into ServiceNow
 *
 * Supports live VeloCloud API data with CSV fallback for WAN circuit metadata.
 *
 * Usage:
 *   npx tsx scripts/import-altus-velocloud-edges.ts
 *   npx tsx scripts/import-altus-velocloud-edges.ts --dry-run
 *   npx tsx scripts/import-altus-velocloud-edges.ts --customer allcare --csv ~/Downloads/monitor_edges_export.csv
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import { getVeloCloudService, resolveVeloCloudConfig } from '../lib/services/velocloud-service';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });

type EdgeRecord = Awaited<ReturnType<ReturnType<typeof getVeloCloudService>['listEdges']>>[number];
type LinkRecord = Awaited<ReturnType<ReturnType<typeof getVeloCloudService>['getEdgeLinkStatus']>>[number];

const ALTUS_COMPANY_SYS_ID = 'c3eec28c931c9a1049d9764efaba10f3';
const NETWORK_MANAGEMENT_SERVICE = 'Network Management';
const CONNECTS_TO = 'Connects to::Connected by';
const DEPENDS_ON = 'Depends on::Used by';
const MANUFACTURER_PREFERENCES = ['VMware', 'VeloCloud', 'VMware VeloCloud'];
const ISP_NAME_OPTIONS = ['TPX Communications', 'TPX - TelePacific', 'TPX', 'TPx', 'TelePacific'];

const EDGE_SITE_OVERRIDES_RAW: Record<string, string> = {
  'ACCT0249514 - Austin, TX - Anderson Mil': 'Altus - Anderson Mill',
  'ACCT0251714 - Austin, TX - Arboretum': 'Altus - Arboretum',
  'ACCT0251715 - Austin, TX - Mueller': 'Altus - Mueller',
  'ACCT0249515 - Austin - Pflugerville, TX': 'Altus - Pflugerville',
  'ACCT0243965 - Austin, TX - Riverside': 'Altus - Riversid',
  'ACCT0251716 - Austin. TX - South Lamar': 'Altus - South Lamar',
  'ACCT0242146 - Amarillo North - 2101 S Coulter St': 'Altus - Amarillo N',
  'ACCT0242147 - Amarillo South - 5800 S Coulter St': 'Altus - Amarillo S',
  'ACCT0244972 - Amarillo, TX West': 'Altus - Amarillo W',
  'ACCT0243977 -Beaumont, TX': 'Altus - Beaumont',
  'ACCT0245274 - Brownsville, TX': 'Altus - Brownsville',
  'ACCT0244634 - Fort Worth, TX': 'Altus - FortWorth (Eastchase)',
  'ACCT0245273 - Harlingen, TX': 'Altus - Harlingen',
  'ACCT0242148 - Lubbock. TX': 'Altus - Lubbock',
  'ACCT0242150 - Orange, TX': 'Altus - Orange',
  'ACCT0242957 - Port Arthur, TX': 'Altus - Port Arthur',
  'ACCT0242149 - Tyler, TX': 'Altus - Tyler',
  'ACCT0253460 - Houston, TX - Neighbors Hub': 'Altus - Corporate Office',
  'ACCT0251710 - Lumberton, TX': 'Altus - Lumberton',
  'ACCT0249513 - Lake Jackson, TX': 'Altus - Lake Jackson',
  'ACCT0253461 - Waxahachie, TX': 'Altus - Waxahachie',
  'ACCT0253463 - Pearland, TX - Neighbors': 'Altus - Pearland',
  'ACCT0253467 - Baytown, TX - Neighbors': 'Altus - Baytown',
  'ACCT0245275 - Crosby, TX - Neighbors': 'Altus - Crosby',
  'ACCT0253464 - Humble,TX - Neighbors': 'Altus - Kingwood',
  'ACCT0253458 - Pasadena, TX - Neighbors': 'Altus - Pasadena',
  'ACCT0253457 - Porter, TX - Neighbors': 'Altus - Porter',
};

const EDGE_SITE_OVERRIDES = new Map<string, string>(
  Object.entries(EDGE_SITE_OVERRIDES_RAW).map(([edgeName, siteName]) => [normalizeKey(edgeName), siteName]),
);

export interface ImportOptions {
  customer?: string;
  dryRun?: boolean;
  csvPath?: string;
}

interface ExecutionContext {
  instanceUrl: string;
  authHeader: string;
  dryRun: boolean;
  manufacturerSysId?: string;
  ispSysId?: string;
  firewallSites: Map<string, SiteContext>;
  csvFallback: Map<string, LinkRecord[]>;
}

interface SiteContext {
  sysId: string;
  name: string;
  locationSysId?: string;
  locationName?: string;
}

export async function importAltusVelocloudEdges(options: ImportOptions = {}): Promise<void> {
  const { customer, dryRun = false, csvPath } = options;

  const resolved = resolveVeloCloudConfig(customer);
  if (!resolved) {
    throw new Error(
      'VeloCloud credentials not configured. Set VELOCLOUD_URL plus VELOCLOUD_API_TOKEN (preferred) or VELOCLOUD_USERNAME/VELOCLOUD_PASSWORD.',
    );
  }

  const { config, resolvedCustomer } = resolved;
  const instanceUrl = requireEnv('SERVICENOW_URL');
  const username = requireEnv('SERVICENOW_USERNAME');
  const password = requireEnv('SERVICENOW_PASSWORD');
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  console.log('🌐 ServiceNow Instance:', instanceUrl);
  console.log('👥 Customer:', resolvedCustomer ?? '(default)');
  console.log(`🧪 Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
  if (csvPath) {
    console.log(`📄 CSV Fallback: ${csvPath}`);
  }
  console.log('');

  const service = getVeloCloudService();
  const edges = await service.listEdges(config, config.enterpriseId);
  if (!edges.length) {
    console.log('⚠️  No edges returned from VeloCloud.');
    return;
  }

  const ctx: ExecutionContext = {
    instanceUrl,
    authHeader,
    dryRun,
    manufacturerSysId: undefined,
    ispSysId: undefined,
    firewallSites: await loadAltusFirewallContext(instanceUrl, authHeader),
    csvFallback: csvPath ? loadCsvLinkMap(csvPath) : new Map<string, LinkRecord[]>(),
  };

  ctx.manufacturerSysId = await findCompanySysId(ctx, MANUFACTURER_PREFERENCES);
  ctx.ispSysId = await findCompanySysId(ctx, ISP_NAME_OPTIONS);

  if (!ctx.manufacturerSysId) {
    console.log('⚠️  Manufacturer company not found (VMware/VeloCloud). Manufacturer field will be omitted.');
  }
  if (!ctx.ispSysId) {
    console.log('⚠️  ISP company not found (TPX Communications). Managed By will be omitted.');
  }

  console.log(`📦 VeloCloud edges discovered: ${edges.length}`);
  console.log('');

  let createdEdges = 0;
  let updatedEdges = 0;
  let createdCircuits = 0;
  let updatedCircuits = 0;
  let warnings = 0;

  for (const edge of edges) {
    if (edge.id === undefined) {
      console.log(`⚠️  Edge "${edge.name}" is missing an id. Skipping.`);
      warnings++;
      continue;
    }

    const siteContext = resolveSiteContext(edge, ctx.firewallSites);
    if (!siteContext) {
      console.log(`⚠️  Unable to match edge "${edge.name}" to an Altus firewall/location. Skipping.`);
      warnings++;
      continue;
    }

    const edgeResult = await upsertVelocloudEdge(edge, siteContext, ctx);
    if (edgeResult.result === 'created') createdEdges++;
    if (edgeResult.result === 'updated') updatedEdges++;

    await ensureRelationship(ctx, edgeResult.sysId, siteContext.sysId, CONNECTS_TO);

    let links: LinkRecord[] = [];
    try {
      links = await service.getEdgeLinkStatus(config, {
        enterpriseId: (edge as any)?.enterpriseId ?? config.enterpriseId,
        edgeId: Number(edge.id),
      });
    } catch (error) {
      console.log(`  ⚠️  Unable to fetch link status for edge ${edge.name}: ${(error as Error).message}`);
    }

    if (!links.length) {
      const fallbackLinks = lookupCsvLinks(ctx.csvFallback, edge);
      if (fallbackLinks.length) {
        console.log('  ℹ️  Using CSV fallback for circuit metadata.');
        links = fallbackLinks;
      } else {
        console.log('  ⚠️  No circuit metadata returned; skipping circuit creation.');
        continue;
      }
    }

    for (const link of links) {
      const circuitResult = await upsertVelocloudCircuit(edge, link, siteContext, ctx);
      if (circuitResult.result === 'created') createdCircuits++;
      if (circuitResult.result === 'updated') updatedCircuits++;

      await ensureRelationship(ctx, edgeResult.sysId, circuitResult.sysId, DEPENDS_ON);
    }
  }

  console.log('');
  console.log('📊 Summary');
  console.log('──────────');
  console.log(`Edges Created: ${createdEdges}`);
  console.log(`Edges Updated: ${updatedEdges}`);
  console.log(`Circuits Created: ${createdCircuits}`);
  console.log(`Circuits Updated: ${updatedCircuits}`);
  console.log(`Warnings: ${warnings}`);
}

if (require.main === module) {
  importAltusVelocloudEdges(parseArgsFromCli())
    .then(() => {
      console.log('');
      console.log('✅ Velocloud import complete');
    })
    .catch((error) => {
      console.error('❌ VeloCloud import failed:', error);
      process.exitCode = 1;
    });
}

function parseArgsFromCli(): ImportOptions {
  const args = process.argv.slice(2);
  const options: ImportOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--customer') {
      options.customer = args[i + 1];
      i++;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--csv') {
      options.csvPath = args[i + 1];
      i++;
    }
  }

  return options;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function loadAltusFirewallContext(instanceUrl: string, authHeader: string): Promise<Map<string, SiteContext>> {
  const query = `company=${ALTUS_COMPANY_SYS_ID}^nameSTARTSWITHAltus - `;
  const url = `${instanceUrl}/api/now/table/cmdb_ci_ip_firewall?sysparm_query=${encodeURIComponent(query)}&sysparm_fields=sys_id,name,location&sysparm_display_value=true&sysparm_limit=200&sysparm_exclude_reference_link=true`;
  const resp = await fetch(url, { headers: buildHeaders(authHeader) });
  if (!resp.ok) {
    throw new Error(`Failed to load Altus firewalls: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  const map = new Map<string, SiteContext>();

  for (const item of data.result || []) {
    const sysId: string = item.sys_id;
    const name: string = item.name;
    const locationSysId: string | undefined = item.location?.value || item.location;
    const locationName: string | undefined = item.location?.display_value || item.location;

    const context: SiteContext = {
      sysId,
      name,
      locationSysId,
      locationName,
    };

    registerAllKeys(map, name, context);
    if (locationName) registerAllKeys(map, locationName, context);
    if (locationName?.includes(' - ')) {
      const [, sitePart] = locationName.split(' - ');
      if (sitePart) registerAllKeys(map, sitePart, context);
    }
  }

  return map;
}

function registerAllKeys(map: Map<string, SiteContext>, raw: string | undefined, context: SiteContext) {
  if (!raw) return;
  const keys = generateKeys(raw);
  for (const key of keys) {
    if (!map.has(key)) {
      map.set(key, context);
    }
  }
}

function generateKeys(raw: string): string[] {
  const cleaned = raw.trim();
  if (!cleaned) return [];

  const results = new Set<string>();
  const base = normalizeKey(cleaned);
  if (base) results.add(base);

  const withoutParens = cleaned.replace(/\(.*?\)/g, '').trim();
  const noParenKey = normalizeKey(withoutParens);
  if (noParenKey) results.add(noParenKey);

  const segments = withoutParens
    .split(/[-,/]/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const key = normalizeKey(segment);
    if (key) results.add(key);

    const words = segment.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      const tail = normalizeKey(words[words.length - 1]);
      if (tail) results.add(tail);
      const head = normalizeKey(words[0]);
      if (head) results.add(head);
    } else if (words.length === 1) {
      const single = normalizeKey(words[0]);
      if (single) results.add(single);
    }
  }

  return Array.from(results);
}

function normalizeKey(text: string | undefined): string {
  return (text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findContextByName(firewalls: Map<string, SiteContext>, targetName: string): SiteContext | undefined {
  const keys = generateKeys(targetName);
  for (const key of keys) {
    const context = firewalls.get(key);
    if (context) return context;
  }
  return undefined;
}

function resolveSiteContext(edge: EdgeRecord, firewalls: Map<string, SiteContext>): SiteContext | undefined {
  const candidates: (string | undefined)[] = [edge.site?.name, edge.name, edge.links?.[0]?.name];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const stripped = candidate
      .replace(/ACCT\d+/gi, '')
      .replace(/Velocloud/gi, '')
      .replace(/VeloCloud/gi, '')
      .replace(/neighbors?/gi, '')
      .trim();

    const keys = generateKeys(stripped);
    for (const key of keys) {
      const found = firewalls.get(key);
      if (found) return found;
    }
  }

  if (edge.name) {
    const overrideLocation = EDGE_SITE_OVERRIDES.get(normalizeKey(edge.name));
    if (overrideLocation) {
      const overrideContext = findContextByName(firewalls, overrideLocation);
      if (overrideContext) return overrideContext;
      console.log(`  ⚠️  Override location "${overrideLocation}" not found in CMDB.`);
    }
  }

  return undefined;
}

async function findCompanySysId(ctx: ExecutionContext, preferredNames: string[]): Promise<string | undefined> {
  for (const name of preferredNames) {
    const query = `nameLIKE${encodeURIComponent(name)}`;
    const url = `${ctx.instanceUrl}/api/now/table/core_company?sysparm_query=${query}&sysparm_fields=sys_id,name&sysparm_limit=1`;
    const resp = await fetch(url, { headers: buildHeaders(ctx.authHeader) });
    if (!resp.ok) continue;
    const data = await resp.json();
    if (data.result?.[0]) {
      return data.result[0].sys_id;
    }
  }
  return undefined;
}

async function upsertVelocloudEdge(
  edge: EdgeRecord,
  site: SiteContext,
  ctx: ExecutionContext,
): Promise<{ result: 'created' | 'updated'; sysId: string }> {
  const serial = typeof edge.logicalId === 'string' && edge.logicalId.trim().length > 0 ? edge.logicalId.trim() : `VC-${edge.id}`;
  const assetTag = `VC-${edge.id}`;
  const edgeName = `${site.name} Velocloud Edge`;

  const existing = await findCiByField(ctx, 'cmdb_ci_ip_router', `serial_number=${serial}`);
  const payload: Record<string, any> = {
    name: edgeName,
    serial_number: serial,
    asset_tag: assetTag,
    company: ALTUS_COMPANY_SYS_ID,
    location: site.locationSysId,
    operational_status: edge.edgeState === 'CONNECTED' ? '1' : '2',
    install_status: '1',
    short_description: buildEdgeDescription(edge),
  };

  if (typeof edge.lastContact === 'number' && Number.isFinite(edge.lastContact) && edge.lastContact > 0) {
    payload.last_discovered = new Date(edge.lastContact * 1000).toISOString();
  }
  if (ctx.manufacturerSysId) {
    payload.manufacturer = ctx.manufacturerSysId;
  }
  if (ctx.ispSysId) {
    payload.managed_by = ctx.ispSysId;
  }
  if (edge.modelNumber) {
    payload.model_number = edge.modelNumber;
  }

  if (ctx.dryRun) {
    console.log(`[DRY RUN] Edge ${existing ? 'update' : 'create'} → ${edgeName}`);
    return { result: existing ? 'updated' : 'created', sysId: existing ?? `DRY-${serial}` };
  }

  if (existing) {
    const updateUrl = `${ctx.instanceUrl}/api/now/table/cmdb_ci_ip_router/${existing}`;
    const resp = await fetch(updateUrl, {
      method: 'PATCH',
      headers: buildHeaders(ctx.authHeader),
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Failed to update edge ${edgeName}: ${resp.status} ${resp.statusText} – ${text}`);
    }
    return { result: 'updated', sysId: existing };
  }

  const createUrl = `${ctx.instanceUrl}/api/now/table/cmdb_ci_ip_router`;
  const resp = await fetch(createUrl, {
    method: 'POST',
    headers: buildHeaders(ctx.authHeader),
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to create edge ${edgeName}: ${resp.status} ${resp.statusText} – ${text}`);
  }
  const data = await resp.json();
  return { result: 'created', sysId: data.result.sys_id };
}

function buildEdgeDescription(edge: EdgeRecord): string {
  const parts = [
    `VMware Velocloud edge managed by TPX`,
    edge.modelNumber ? `Model: ${edge.modelNumber}` : '',
    edge.edgeState ? `State: ${edge.edgeState}` : '',
    edge.activationState ? `Activation: ${edge.activationState}` : '',
    edge.site?.name ? `Site: ${edge.site.name}` : '',
    extractAccountCode(edge.name) ? `Account: ${extractAccountCode(edge.name)}` : '',
  ];
  return parts.filter(Boolean).join('. ');
}

function extractAccountCode(name?: string): string | undefined {
  if (!name) return undefined;
  const match = name.match(/ACCT\d+/i);
  return match ? match[0].toUpperCase() : undefined;
}

async function upsertVelocloudCircuit(
  edge: EdgeRecord,
  link: LinkRecord,
  site: SiteContext,
  ctx: ExecutionContext,
): Promise<{ result: 'created' | 'updated'; sysId: string }> {
  const linkId = link.linkId ?? link.name ?? 'unknown';
  const correlationId = `VC-LINK-${edge.id}-${linkId}`;
  const circuitName = `${site.name} - ${link.name || link.transportType || 'Circuit'}`;

  const existing = await findCiByField(ctx, 'cmdb_ci_ip_network', `correlation_id=${correlationId}`);
  const payload: Record<string, any> = {
    name: circuitName,
    correlation_id: correlationId,
    company: ALTUS_COMPANY_SYS_ID,
    location: site.locationSysId,
    install_status: '1',
    operational_status: link.up ? '1' : '2',
    short_description: buildCircuitDescription(link),
    comments: buildCircuitComments(link),
  };

  if (ctx.ispSysId) {
    payload.managed_by = ctx.ispSysId;
    payload.manufacturer = ctx.ispSysId;
  }

  if (ctx.dryRun) {
    console.log(`[DRY RUN] Circuit ${existing ? 'update' : 'create'} → ${circuitName}`);
    return { result: existing ? 'updated' : 'created', sysId: existing ?? `DRY-${correlationId}` };
  }

  if (existing) {
    const updateUrl = `${ctx.instanceUrl}/api/now/table/cmdb_ci_ip_network/${existing}`;
    const resp = await fetch(updateUrl, {
      method: 'PATCH',
      headers: buildHeaders(ctx.authHeader),
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Failed to update circuit ${circuitName}: ${resp.status} ${resp.statusText} – ${text}`);
    }
    return { result: 'updated', sysId: existing };
  }

  const createUrl = `${ctx.instanceUrl}/api/now/table/cmdb_ci_ip_network`;
  const resp = await fetch(createUrl, {
    method: 'POST',
    headers: buildHeaders(ctx.authHeader),
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to create circuit ${circuitName}: ${resp.status} ${resp.statusText} – ${text}`);
  }
  const data = await resp.json();
  return { result: 'created', sysId: data.result.sys_id };
}

function buildCircuitDescription(link: LinkRecord): string {
  const parts = [
    `TPX circuit`,
    link.transportType ? `Transport: ${link.transportType}` : '',
    link.name ? `Port: ${link.name}` : '',
    link.linkId !== undefined ? `Link ID: ${link.linkId}` : '',
  ];
  return parts.filter(Boolean).join(' | ');
}

function buildCircuitComments(link: LinkRecord): string {
  const metrics = [
    link.capacityDown !== undefined ? `Down: ${link.capacityDown} Mbps` : null,
    link.capacityUp !== undefined ? `Up: ${link.capacityUp} Mbps` : null,
    link.latencyMs !== undefined ? `Latency: ${link.latencyMs} ms` : null,
    link.jitterMs !== undefined ? `Jitter: ${link.jitterMs} ms` : null,
    link.lossPct !== undefined ? `Loss: ${link.lossPct}%` : null,
    link.linkState ? `State: ${link.linkState}` : null,
  ].filter(Boolean);
  return metrics.join(' | ');
}

function loadCsvLinkMap(path: string): Map<string, LinkRecord[]> {
  const map = new Map<string, LinkRecord[]>();
  const fs = require('node:fs');

  try {
    if (!fs.existsSync(path)) {
      console.log(`⚠️  CSV fallback file not found: ${path}`);
      return map;
    }

    const content: string = fs.readFileSync(path, 'utf-8');
    const rows = parseCsv(content);
    if (!rows.length) return map;

    const header = rows.shift() ?? [];
    const edgeIdx = header.findIndex((h: string) => normalizeKey(h) === 'edge');
    const linksIdx = header.findIndex((h: string) => normalizeKey(h).includes('connectedlinks'));
    if (edgeIdx === -1 || linksIdx === -1) {
      console.log('⚠️  CSV fallback missing Edge or Connected Links column.');
      return map;
    }

    for (const row of rows) {
      const edgeName = row[edgeIdx]?.replace(/\t/g, ' ').trim();
      if (!edgeName) continue;
      const linksRaw = row[linksIdx]?.replace(/\t/g, ' ').trim();
      if (!linksRaw) continue;

      const linkSegments = linksRaw.split(/[,;]+/).map((segment: string) => segment.trim()).filter(Boolean);
      if (!linkSegments.length) continue;

      const entries: LinkRecord[] = linkSegments.map((name) => ({
        name,
        linkState: 'UNKNOWN',
        up: true,
      }));

      map.set(edgeName, entries);
    }
  } catch (error) {
    console.log(`⚠️  Failed to load CSV fallback: ${(error as Error).message}`);
  }
  return map;
}

function lookupCsvLinks(csvMap: Map<string, LinkRecord[]>, edge: EdgeRecord): LinkRecord[] {
  if (!csvMap.size) return [];
  if (!edge.name) return [];

  const exact = csvMap.get(edge.name);
  if (exact?.length) return exact;

  // fallback by normalized key match
  const targetKey = normalizeKey(edge.name);
  for (const [edgeName, links] of csvMap.entries()) {
    if (normalizeKey(edgeName) === targetKey) {
      return links;
    }
  }
  return [];
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"') {
      const next = content[i + 1];
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      current.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      current.push(cell);
      rows.push(current);
      current = [];
      cell = '';
      if (char === '\r' && content[i + 1] === '\n') {
        i++;
      }
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || current.length > 0) {
    current.push(cell);
    rows.push(current);
  }

  return rows;
}

async function ensureRelationship(ctx: ExecutionContext, parentSysId: string, childSysId: string, type: string) {
  if (ctx.dryRun) {
    console.log(`[DRY RUN] Relationship ${type} ${parentSysId} → ${childSysId}`);
    return;
  }

  const query = `parent=${parentSysId}^child=${childSysId}^type.name=${type}`;
  const url = `${ctx.instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=${encodeURIComponent(query)}&sysparm_fields=sys_id&sysparm_limit=1`;
  const resp = await fetch(url, { headers: buildHeaders(ctx.authHeader) });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to query relationship: ${resp.status} ${resp.statusText} – ${text}`);
  }
  const data = await resp.json();
  if (data.result?.[0]) {
    return;
  }

  const payload = { parent: parentSysId, child: childSysId, type };
  const createUrl = `${ctx.instanceUrl}/api/now/table/cmdb_rel_ci`;
  const createResp = await fetch(createUrl, {
    method: 'POST',
    headers: buildHeaders(ctx.authHeader),
    body: JSON.stringify(payload),
  });
  if (!createResp.ok) {
    const text = await createResp.text();
    throw new Error(`Failed to create relationship (${type}): ${createResp.status} ${createResp.statusText} – ${text}`);
  }
}

async function findCiByField(ctx: ExecutionContext, table: string, query: string): Promise<string | undefined> {
  const url = `${ctx.instanceUrl}/api/now/table/${table}?sysparm_query=${encodeURIComponent(query)}&sysparm_fields=sys_id&sysparm_limit=1`;
  const resp = await fetch(url, { headers: buildHeaders(ctx.authHeader) });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to query ${table}: ${resp.status} ${resp.statusText} – ${text}`);
  }
  const data = await resp.json();
  return data.result?.[0]?.sys_id;
}

function buildHeaders(authHeader: string): Record<string, string> {
  return {
    Authorization: authHeader,
    'Content-Type': 'application/json',
  };
}
