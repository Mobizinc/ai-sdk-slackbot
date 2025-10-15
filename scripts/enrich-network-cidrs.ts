/**
 * Enrich Network CIDRs from CSV
 *
 * Read ALTUS_CIDR.csv and create enriched template for ServiceNow import
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });

interface CIDRRecord {
  shortCode: string;
  brand: string;
  facility: string;
  rdo: string;
  cidr: string;
  network3: string;
  primaryDNS: string;
  secondaryDNS: string;
  suffix: string;
  firewall: string;
}

interface EnrichedNetwork {
  index: number;
  status: string; // NEW or EXISTS
  name: string;
  sys_id: string;
  ip_address: string; // Network address (e.g., "10.246.5.0")
  subnet: string; // Subnet mask in CIDR notation (e.g., "24")
  cidr_full: string; // Full CIDR (e.g., "10.246.5.0/24")
  location_name: string;
  location_sys_id: string; // Will be filled by looking up location
  dns_domain: string;
  dns_primary: string;
  dns_secondary: string;
  company: string;
  company_sys_id: string; // Altus Customer Account
  short_description: string;
  comments: string;
  brand: string;
  short_code: string;
}

function parseCSV(csvPath: string): CIDRRecord[] {
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  const records: CIDRRecord[] = [];

  for (let i = 1; i < lines.length; i++) { // Skip header
    const line = lines[i];

    // Skip empty lines or Azure vnets
    if (!line.trim() || line.includes('Vnet') || line.includes('Azure') || line.startsWith(',,')) {
      continue;
    }

    const parts = line.split(',');

    if (parts.length < 7) continue;

    const shortCode = parts[0]?.trim() || '';
    const brand = parts[1]?.trim() || '';
    const facility = parts[2]?.trim() || '';
    const rdo = parts[3]?.trim() || '';
    const cidr = parts[6]?.trim() || '';
    const network3 = parts[7]?.trim() || '';
    const primaryDNS = parts[8]?.trim() || '';
    const secondaryDNS = parts[9]?.trim() || '';
    const suffix = parts[10]?.trim() || '';
    const firewall = parts[12]?.trim() || '';

    // Only include physical location networks with valid CIDR
    if (facility && cidr && cidr.includes('/')) {
      records.push({
        shortCode,
        brand,
        facility,
        rdo,
        cidr,
        network3,
        primaryDNS,
        secondaryDNS,
        suffix,
        firewall,
      });
    }
  }

  return records;
}

function parseCIDR(cidr: string): { address: string; mask: string } {
  const parts = cidr.split('/');
  if (parts.length !== 2) {
    return { address: cidr, mask: '' };
  }

  return {
    address: parts[0].trim(),
    mask: parts[1].trim(),
  };
}

function generateLocationName(facility: string, shortCode: string): string {
  // Generate location name that matches ServiceNow location naming
  // Examples: "Pearland", "Anderson Mill", "AMA North"

  // Special cases
  if (facility === 'Corp Office' || facility === 'Corporate Office') {
    return 'Corporate Office';
  }

  return facility;
}

async function getLocationSysId(instanceUrl: string, authHeader: string, locationName: string): Promise<string> {
  // Try to find location by name
  const query = encodeURIComponent(`name=${locationName}`);
  const url = `${instanceUrl}/api/now/table/cmn_location?sysparm_query=${query}&sysparm_limit=1`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.result && data.result.length > 0) {
        return data.result[0].sys_id;
      }
    }
  } catch (error) {
    console.error(`  ⚠️  Failed to lookup location: ${locationName}`);
  }

  return 'TODO:LOOKUP';
}

async function enrichNetworkCIDRs() {
  console.log('📝 Enriching Network CIDRs');
  console.log('='.repeat(70));
  console.log('');

  const csvPath = '/Users/hamadriaz/Documents/ALTUS_CIDR.csv';

  if (!fs.existsSync(csvPath)) {
    console.error('❌ CSV file not found:', csvPath);
    process.exit(1);
  }

  console.log('Reading CIDR data from:', csvPath);
  console.log('');

  const records = parseCSV(csvPath);
  console.log(`Found ${records.length} physical location networks`);
  console.log('');

  // Get ServiceNow credentials for location lookups
  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  let authHeader = '';
  if (instanceUrl && username && password) {
    authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    console.log('✅ ServiceNow credentials configured - will lookup location sys_ids');
  } else {
    console.log('⚠️  ServiceNow credentials not configured - will use placeholder sys_ids');
  }
  console.log('');

  console.log('─'.repeat(70));
  console.log('Enriching Network Records:');
  console.log('─'.repeat(70));
  console.log('');

  const enriched: EnrichedNetwork[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const { address, mask } = parseCIDR(record.cidr);

    const locationName = generateLocationName(record.facility, record.shortCode);

    // Lookup location sys_id
    let locationSysId = 'TODO:LOOKUP';
    if (authHeader && instanceUrl) {
      locationSysId = await getLocationSysId(instanceUrl, authHeader, locationName);
    }

    // Build network name
    const networkName = `Altus - ${record.facility} Network`;

    // Build description
    let description = `${record.brand} network segment`;
    if (record.shortCode) {
      description += ` (${record.shortCode})`;
    }

    // Build comments with DNS info
    const commentParts = [];
    if (record.primaryDNS) {
      commentParts.push(`Primary DNS: ${record.primaryDNS}`);
    }
    if (record.secondaryDNS) {
      commentParts.push(`Secondary DNS: ${record.secondaryDNS}`);
    }
    if (record.firewall) {
      commentParts.push(`Firewall Type: ${record.firewall}`);
    }
    if (record.rdo) {
      commentParts.push(`RDO: ${record.rdo}`);
    }

    const comments = commentParts.join(' | ');

    enriched.push({
      index: i + 1,
      status: 'NEW',
      name: networkName,
      sys_id: 'NEW',
      ip_address: address,
      subnet: mask,
      cidr_full: record.cidr,
      location_name: locationName,
      location_sys_id: locationSysId,
      dns_domain: record.suffix || '',
      dns_primary: record.primaryDNS || '',
      dns_secondary: record.secondaryDNS || '',
      company: 'Altus Community Healthcare',
      company_sys_id: 'c3eec28c931c9a1049d9764efaba10f3', // Altus Customer Account
      short_description: description,
      comments: comments,
      brand: record.brand,
      short_code: record.shortCode,
    });

    console.log(`${i + 1}. ${networkName}`);
    console.log(`   CIDR: ${record.cidr}`);
    console.log(`   Location: ${locationName} (sys_id: ${locationSysId})`);
    console.log(`   DNS Domain: ${record.suffix || '(none)'}`);
    console.log('');
  }

  // Write enriched CSV
  const outputDir = path.join(process.cwd(), 'backup', 'network-import');
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, 'network-cidrs-template.csv');

  const headers = [
    'index',
    'status',
    'name',
    'sys_id',
    'ip_address',
    'subnet',
    'cidr_full',
    'location_name',
    'location_sys_id',
    'dns_domain',
    'dns_primary',
    'dns_secondary',
    'company',
    'company_sys_id',
    'short_description',
    'comments',
    'brand',
    'short_code',
  ];

  const csvLines = [headers.join(',')];

  for (const network of enriched) {
    const row = headers.map(header => {
      const value = network[header as keyof EnrichedNetwork];
      const stringValue = String(value || '');

      // Escape commas and quotes
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }

      return stringValue;
    });

    csvLines.push(row.join(','));
  }

  fs.writeFileSync(outputPath, csvLines.join('\n'), 'utf-8');

  console.log('─'.repeat(70));
  console.log('✅ ENRICHMENT COMPLETE');
  console.log('─'.repeat(70));
  console.log('');
  console.log(`Total Networks: ${enriched.length}`);
  console.log(`Output File: ${outputPath}`);
  console.log('');

  // Summary stats
  const withLocations = enriched.filter(n => n.location_sys_id !== 'TODO:LOOKUP').length;
  const withDNS = enriched.filter(n => n.dns_primary).length;
  const withFirewall = enriched.filter(n => n.comments.includes('Firewall')).length;

  console.log('Statistics:');
  console.log(`  ✅ Locations mapped: ${withLocations}/${enriched.length}`);
  console.log(`  ✅ With DNS servers: ${withDNS}/${enriched.length}`);
  console.log(`  ✅ With firewall info: ${withFirewall}/${enriched.length}`);
  console.log('');

  if (withLocations < enriched.length) {
    console.log('⚠️  Some locations need manual sys_id lookup');
    console.log('   Edit the CSV file and replace "TODO:LOOKUP" with correct sys_ids');
    console.log('');
  }

  console.log('Next Steps:');
  console.log('  1. Review the generated template CSV');
  console.log('  2. Verify location mappings are correct');
  console.log('  3. Run import script to create networks in ServiceNow');
  console.log('');
}

enrichNetworkCIDRs()
  .catch(console.error)
  .finally(() => process.exit(0));
