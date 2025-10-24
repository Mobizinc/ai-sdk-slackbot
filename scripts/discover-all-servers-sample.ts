/**
 * Discover ALL Servers Sample (Broad Discovery)
 *
 * Queries all server tables WITHOUT company filters to understand:
 * - What servers exist in ServiceNow CMDB
 * - Naming patterns used
 * - Company associations
 * - Potential linking opportunities
 *
 * USAGE:
 *   npx tsx scripts/discover-all-servers-sample.ts
 *
 * ENVIRONMENT VARIABLES:
 * - SERVICENOW_URL or DEV_SERVICENOW_URL: Instance URL
 * - SERVICENOW_USERNAME or DEV_SERVICENOW_USERNAME: API username
 * - SERVICENOW_PASSWORD or DEV_SERVICENOW_PASSWORD: API password
 *
 * OUTPUT:
 * - Console analysis report
 * - CSV: backup/server-analysis/all-servers-sample.csv
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });
dotenv.config();

interface ServerRecord {
  server_name: string;
  server_sys_id: string;
  server_class: string;
  company_name: string;
  company_sys_id: string;
  location_name: string;
  location_sys_id: string;
  ip_address: string;
  used_for_service: string;
  used_for_sys_id: string;
  install_status: string;
  operational_status: string;
  virtual: string;
  host_name: string;
  sys_created_on: string;
  sys_updated_on: string;
  short_description: string;
}

// Known Altus locations from firewall deployment
const ALTUS_LOCATIONS = [
  'Dallas', 'Mueller', 'Pearland', 'Baytown', 'Arboretum', 'Waxahachie',
  'Beaumont', 'Lumberton', 'Corporate Office', 'Kingwood', 'AMA South',
  'Orange', 'Riverside', 'AMA North', 'Fort Worth', 'AMA West',
  'Lake Jackson', 'Pasadena', 'South Lamar', 'Crosby', 'Porter',
  'Livingston', 'Brownsville', 'Lubbock', 'Pflugerville', 'Harlingen',
  'Tyler', 'Anderson Mill', 'Port Arthur'
];

async function discoverAllServers() {
  console.log('🔍 Discover ALL Servers Sample');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    process.exit(1);
  }

  const environment = process.env.SERVICENOW_URL ? 'PRODUCTION' : 'DEV';
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  console.log(`Environment: ${environment}`);
  console.log(`URL: ${instanceUrl}`);
  console.log('');
  console.log('⚠️  Querying ALL servers (no company filter)');
  console.log('   This will take a few moments...');
  console.log('');

  const serverTables = [
    { table: 'cmdb_ci_server', description: 'Base Servers', limit: 200 },
    { table: 'cmdb_ci_win_server', description: 'Windows Servers', limit: 200 },
    { table: 'cmdb_ci_linux_server', description: 'Linux Servers', limit: 200 },
    { table: 'cmdb_ci_esx_server', description: 'ESXi Hosts', limit: 50 },
    { table: 'cmdb_ci_vm_instance', description: 'Virtual Machines', limit: 200 },
  ];

  const allServers: ServerRecord[] = [];
  let totalServerCount = 0;

  try {
    for (const serverTable of serverTables) {
      console.log(`Querying ${serverTable.description}...`);

      const fields = 'sys_id,name,sys_class_name,company,location,ip_address,used_for,install_status,operational_status,virtual,host_name,sys_created_on,sys_updated_on,short_description';
      const url = `${instanceUrl}/api/now/table/${serverTable.table}?sysparm_display_value=all&sysparm_fields=${fields}&sysparm_limit=${serverTable.limit}`;

      try {
        const response = await fetch(url, {
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          console.log(`  ⚠️  Table not accessible`);
          continue;
        }

        const data = await response.json();
        const servers = data.result || [];

        console.log(`  ✅ Retrieved ${servers.length} server(s) (limit: ${serverTable.limit})`);

        for (const server of servers) {
          allServers.push({
            server_name: server.name?.display_value || server.name || '',
            server_sys_id: server.sys_id?.value || server.sys_id || '',
            server_class: server.sys_class_name?.display_value || server.sys_class_name || '',
            company_name: server.company?.display_value || '',
            company_sys_id: server.company?.value || '',
            location_name: server.location?.display_value || '',
            location_sys_id: server.location?.value || '',
            ip_address: server.ip_address?.display_value || server.ip_address || '',
            used_for_service: server.used_for?.display_value || '',
            used_for_sys_id: server.used_for?.value || '',
            install_status: server.install_status?.display_value || server.install_status || '',
            operational_status: server.operational_status?.display_value || server.operational_status || '',
            virtual: server.virtual === 'true' || server.virtual === true ? 'true' : 'false',
            host_name: server.host_name?.display_value || server.host_name || '',
            sys_created_on: server.sys_created_on?.display_value || server.sys_created_on || '',
            sys_updated_on: server.sys_updated_on?.display_value || server.sys_updated_on || '',
            short_description: server.short_description?.display_value || server.short_description || '',
          });
          totalServerCount++;
        }
      } catch (error) {
        console.log(`  ❌ Query error: ${error}`);
      }
    }

    console.log('');
    console.log('─'.repeat(70));
    console.log('📊 Discovery Summary');
    console.log('─'.repeat(70));
    console.log('');
    console.log(`Total Servers Retrieved: ${totalServerCount}`);
    console.log('');

    if (totalServerCount === 0) {
      console.log('⚠️  No servers found in any table.');
      console.log('   This could mean:');
      console.log('   - Server tables are empty');
      console.log('   - Servers are in different CI tables');
      console.log('   - Access permissions issue');
      process.exit(0);
    }

    // ========================================
    // Analysis 1: Company Distribution
    // ========================================
    console.log('Analysis 1: Company Distribution');
    console.log('─'.repeat(70));

    const companyCounts = new Map<string, number>();
    const companyServers = new Map<string, ServerRecord[]>();

    for (const server of allServers) {
      const companyKey = server.company_name || '(No Company)';
      companyCounts.set(companyKey, (companyCounts.get(companyKey) || 0) + 1);

      if (!companyServers.has(companyKey)) {
        companyServers.set(companyKey, []);
      }
      companyServers.get(companyKey)!.push(server);
    }

    const sortedCompanies = Array.from(companyCounts.entries())
      .sort((a, b) => b[1] - a[1]);

    console.log(`\nTop 20 Companies by Server Count:`);
    for (let i = 0; i < Math.min(20, sortedCompanies.length); i++) {
      const [company, count] = sortedCompanies[i];
      console.log(`  ${i + 1}. ${company}: ${count} servers`);
    }

    // Check for Altus specifically
    const altusCompanies = sortedCompanies.filter(([company]) =>
      company.toLowerCase().includes('altus') ||
      company.toLowerCase().includes('neighbors') ||
      company.toLowerCase().includes('exceptional')
    );

    console.log('');
    if (altusCompanies.length > 0) {
      console.log('✅ Found Altus-related companies:');
      for (const [company, count] of altusCompanies) {
        console.log(`  - ${company}: ${count} servers`);
      }
    } else {
      console.log('⚠️  No companies with "Altus", "Neighbors", or "Exceptional" in name');
    }

    console.log('');

    // ========================================
    // Analysis 2: Naming Patterns
    // ========================================
    console.log('Analysis 2: Naming Patterns');
    console.log('─'.repeat(70));

    const patterns = {
      hasDash: 0,
      hasUnderscore: 0,
      hasDot: 0,
      allUppercase: 0,
      allLowercase: 0,
      hasNumbers: 0,
      fqdn: 0,
    };

    const prefixes = new Map<string, number>();

    for (const server of allServers) {
      const name = server.server_name;

      if (name.includes('-')) patterns.hasDash++;
      if (name.includes('_')) patterns.hasUnderscore++;
      if (name.includes('.')) {
        patterns.hasDot++;
        if (name.split('.').length >= 2) patterns.fqdn++;
      }
      if (name === name.toUpperCase() && /[A-Z]/.test(name)) patterns.allUppercase++;
      if (name === name.toLowerCase() && /[a-z]/.test(name)) patterns.allLowercase++;
      if (/\d/.test(name)) patterns.hasNumbers++;

      // Extract prefix (first 3-5 chars)
      const prefix = name.substring(0, Math.min(5, name.length)).toUpperCase();
      prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1);
    }

    console.log(`\nPattern Analysis (${totalServerCount} servers):`);
    console.log(`  - Contains dash (-): ${patterns.hasDash} (${Math.round(patterns.hasDash / totalServerCount * 100)}%)`);
    console.log(`  - Contains underscore (_): ${patterns.hasUnderscore} (${Math.round(patterns.hasUnderscore / totalServerCount * 100)}%)`);
    console.log(`  - Contains dot (.): ${patterns.hasDot} (${Math.round(patterns.hasDot / totalServerCount * 100)}%)`);
    console.log(`  - FQDN format: ${patterns.fqdn} (${Math.round(patterns.fqdn / totalServerCount * 100)}%)`);
    console.log(`  - All UPPERCASE: ${patterns.allUppercase} (${Math.round(patterns.allUppercase / totalServerCount * 100)}%)`);
    console.log(`  - All lowercase: ${patterns.allLowercase} (${Math.round(patterns.allLowercase / totalServerCount * 100)}%)`);
    console.log(`  - Contains numbers: ${patterns.hasNumbers} (${Math.round(patterns.hasNumbers / totalServerCount * 100)}%)`);

    console.log(`\nTop 10 Name Prefixes:`);
    const sortedPrefixes = Array.from(prefixes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    for (const [prefix, count] of sortedPrefixes) {
      console.log(`  - ${prefix}*: ${count} servers`);
    }

    console.log('');

    // ========================================
    // Analysis 3: Location Cross-Reference
    // ========================================
    console.log('Analysis 3: Location Cross-Reference (Altus Locations)');
    console.log('─'.repeat(70));

    const serversAtAltusLocations: ServerRecord[] = [];

    for (const server of allServers) {
      if (ALTUS_LOCATIONS.some(loc => server.location_name.includes(loc))) {
        serversAtAltusLocations.push(server);
      }
    }

    console.log(`\n✅ Found ${serversAtAltusLocations.length} server(s) at Altus firewall locations`);

    if (serversAtAltusLocations.length > 0) {
      console.log('');
      console.log('Servers at Altus Locations (first 10):');
      for (const server of serversAtAltusLocations.slice(0, 10)) {
        console.log(`  ${server.server_name}`);
        console.log(`    Location: ${server.location_name}`);
        console.log(`    Company: ${server.company_name || '(No Company)'}`);
        console.log(`    Service: ${server.used_for_service || '(Not linked)'}`);
        console.log('');
      }

      if (serversAtAltusLocations.length > 10) {
        console.log(`  ... and ${serversAtAltusLocations.length - 10} more`);
        console.log('');
      }

      // Company breakdown for servers at Altus locations
      const altusLocationCompanies = new Map<string, number>();
      for (const server of serversAtAltusLocations) {
        const company = server.company_name || '(No Company)';
        altusLocationCompanies.set(company, (altusLocationCompanies.get(company) || 0) + 1);
      }

      console.log('Company Breakdown for Servers at Altus Locations:');
      for (const [company, count] of Array.from(altusLocationCompanies.entries()).sort((a, b) => b[1] - a[1])) {
        console.log(`  - ${company}: ${count} servers`);
      }
    } else {
      console.log('⚠️  No servers found at known Altus locations');
      console.log('   This suggests:');
      console.log('   - Servers use different location names');
      console.log('   - Location field is not populated');
      console.log('   - Servers not yet in CMDB');
    }

    console.log('');

    // ========================================
    // Analysis 4: Service Linkage
    // ========================================
    console.log('Analysis 4: Service Linkage Analysis');
    console.log('─'.repeat(70));

    const serversWithService = allServers.filter(s => s.used_for_service);
    const serversWithoutService = allServers.filter(s => !s.used_for_service);

    console.log(`\nServers WITH service linkage: ${serversWithService.length} (${Math.round(serversWithService.length / totalServerCount * 100)}%)`);
    console.log(`Servers WITHOUT service linkage: ${serversWithoutService.length} (${Math.round(serversWithoutService.length / totalServerCount * 100)}%)`);

    console.log('');

    // ========================================
    // Export to CSV
    // ========================================
    console.log('Exporting to CSV...');

    const outputDir = path.join(process.cwd(), 'backup', 'server-analysis');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const csvPath = path.join(outputDir, 'all-servers-sample.csv');

    const headers = Object.keys(allServers[0]);
    const csvHeader = headers.join(',');

    const csvRows = allServers.map(server => {
      return headers.map(header => {
        const value = String(server[header as keyof ServerRecord] || '');
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',');
    });

    const csvContent = [csvHeader, ...csvRows].join('\n');
    fs.writeFileSync(csvPath, csvContent);

    console.log(`✅ Exported to: ${csvPath}`);
    console.log('');

    // ========================================
    // Summary & Next Steps
    // ========================================
    console.log('─'.repeat(70));
    console.log('✅ Discovery Complete!');
    console.log('─'.repeat(70));
    console.log('');
    console.log('Key Findings:');
    console.log(`  - Total servers sampled: ${totalServerCount}`);
    console.log(`  - Companies with servers: ${companyCounts.size}`);
    console.log(`  - Servers at Altus locations: ${serversAtAltusLocations.length}`);
    console.log(`  - Servers without company: ${companyCounts.get('(No Company)') || 0}`);
    console.log(`  - Servers without service link: ${serversWithoutService.length}`);
    console.log('');
    console.log('Next Steps:');
    console.log('  1. Review CSV file for detailed analysis');
    console.log('  2. Investigate servers at Altus locations');
    console.log('  3. Determine correct company associations');
    console.log('  4. Create server linking strategy');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Discovery failed:');
    console.error(error);
    process.exit(1);
  }
}

discoverAllServers()
  .catch(console.error)
  .finally(() => process.exit(0));
