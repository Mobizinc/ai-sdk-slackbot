/**
 * Server Inventory Extraction Tool
 *
 * Extracts complete server inventory for a company group from ServiceNow CMDB.
 * Queries multiple server tables and exports comprehensive metadata to CSV.
 *
 * USAGE:
 *   npx tsx scripts/extract-company-server-inventory.ts backup/company-analysis/altus-company-structure.json
 *
 * ENVIRONMENT VARIABLES:
 * - SERVICENOW_URL or DEV_SERVICENOW_URL: Instance URL
 * - SERVICENOW_USERNAME or DEV_SERVICENOW_USERNAME: API username
 * - SERVICENOW_PASSWORD or DEV_SERVICENOW_PASSWORD: API password
 *
 * OUTPUT:
 * - CSV file: backup/company-analysis/{pattern}-server-inventory.csv
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

interface ServerRecord {
  company_name: string;
  company_sys_id: string;
  server_name: string;
  server_sys_id: string;
  server_class: string;
  os_type: string;
  location: string;
  location_sys_id: string;
  ip_address: string;
  used_for: string;
  used_for_sys_id: string;
  install_status: string;
  operational_status: string;
  discovery_source: string;
  last_discovered: string;
  serial_number: string;
  asset_tag: string;
  manufacturer: string;
  model: string;
  virtual: string;
  host_name: string;
  dns_domain: string;
  cpu_count: string;
  ram_mb: string;
  disk_space_gb: string;
  sys_created_on: string;
  sys_updated_on: string;
  short_description: string;
  comments: string;
}

async function extractServerInventory(companyStructureFile: string) {
  console.log('📋 Server Inventory Extraction Tool');
  console.log('='.repeat(70));
  console.log('');

  if (!companyStructureFile || !fs.existsSync(companyStructureFile)) {
    console.error('❌ Usage: npx tsx scripts/extract-company-server-inventory.ts <company-structure.json>');
    console.log('');
    console.log('Example:');
    console.log('  npx tsx scripts/extract-company-server-inventory.ts backup/company-analysis/altus-company-structure.json');
    process.exit(1);
  }

  // Read company structure
  const companyStructure = JSON.parse(fs.readFileSync(companyStructureFile, 'utf-8'));
  const companies = [
    ...(companyStructure.primaryCompany ? [companyStructure.primaryCompany] : []),
    ...companyStructure.relatedCompanies,
  ];

  console.log(`Company Structure File: ${companyStructureFile}`);
  console.log(`Companies to Query: ${companies.length}`);
  for (const company of companies) {
    console.log(`  - ${company.name} (${company.sys_id})`);
  }
  console.log('');

  // Get credentials
  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured in .env.local');
    process.exit(1);
  }

  const environment = process.env.SERVICENOW_URL ? 'PRODUCTION' : 'DEV';
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  console.log(`Environment: ${environment}`);
  console.log(`URL: ${instanceUrl}`);
  console.log('');

  try {
    // Server tables to query
    const serverTables = [
      { table: 'cmdb_ci_server', description: 'Base Servers' },
      { table: 'cmdb_ci_win_server', description: 'Windows Servers' },
      { table: 'cmdb_ci_linux_server', description: 'Linux Servers' },
      { table: 'cmdb_ci_esx_server', description: 'ESXi Hosts' },
      { table: 'cmdb_ci_vm_instance', description: 'Virtual Machines' },
    ];

    const allServers: ServerRecord[] = [];
    let totalServerCount = 0;

    // Query each server table for each company
    for (const company of companies) {
      console.log(`Querying servers for: ${company.name}`);
      console.log('─'.repeat(70));

      for (const serverTable of serverTables) {
        const query = encodeURIComponent(`company=${company.sys_id}`);
        const fields = 'sys_id,name,sys_class_name,os,location,ip_address,used_for,install_status,operational_status,discovery_source,last_discovered,serial_number,asset_tag,manufacturer,model_id,virtual,host_name,dns_domain,cpu_count,ram,disk_space,sys_created_on,sys_updated_on,short_description,comments';
        const url = `${instanceUrl}/api/now/table/${serverTable.table}?sysparm_query=${query}&sysparm_display_value=all&sysparm_fields=${fields}&sysparm_limit=1000`;

        try {
          const response = await fetch(url, {
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            console.log(`  ⚠️  ${serverTable.description}: Table not accessible or doesn't exist`);
            continue;
          }

          const data = await response.json();
          const servers = data.result || [];

          if (servers.length > 0) {
            console.log(`  ✅ ${serverTable.description}: Found ${servers.length} server(s)`);

            // Parse and add to collection
            for (const server of servers) {
              allServers.push({
                company_name: company.name,
                company_sys_id: company.sys_id,
                server_name: server.name?.display_value || server.name || '',
                server_sys_id: server.sys_id?.value || server.sys_id || '',
                server_class: server.sys_class_name?.display_value || server.sys_class_name || '',
                os_type: server.os?.display_value || server.os || '',
                location: server.location?.display_value || '',
                location_sys_id: server.location?.value || '',
                ip_address: server.ip_address?.display_value || server.ip_address || '',
                used_for: server.used_for?.display_value || '',
                used_for_sys_id: server.used_for?.value || '',
                install_status: server.install_status?.display_value || server.install_status || '',
                operational_status: server.operational_status?.display_value || server.operational_status || '',
                discovery_source: server.discovery_source?.display_value || server.discovery_source || '',
                last_discovered: server.last_discovered?.display_value || server.last_discovered || '',
                serial_number: server.serial_number?.display_value || server.serial_number || '',
                asset_tag: server.asset_tag?.display_value || server.asset_tag || '',
                manufacturer: server.manufacturer?.display_value || '',
                model: server.model_id?.display_value || '',
                virtual: server.virtual === 'true' || server.virtual === true ? 'true' : 'false',
                host_name: server.host_name?.display_value || server.host_name || '',
                dns_domain: server.dns_domain?.display_value || server.dns_domain || '',
                cpu_count: server.cpu_count?.display_value || server.cpu_count || '',
                ram_mb: server.ram?.display_value || server.ram || '',
                disk_space_gb: server.disk_space?.display_value || server.disk_space || '',
                sys_created_on: server.sys_created_on?.display_value || server.sys_created_on || '',
                sys_updated_on: server.sys_updated_on?.display_value || server.sys_updated_on || '',
                short_description: server.short_description?.display_value || server.short_description || '',
                comments: server.comments?.display_value || server.comments || '',
              });
              totalServerCount++;
            }
          } else {
            console.log(`  ⏭️  ${serverTable.description}: No servers found`);
          }
        } catch (error) {
          console.log(`  ❌ ${serverTable.description}: Query error - ${error}`);
        }
      }

      console.log('');
    }

    // Summary
    console.log('─'.repeat(70));
    console.log('📊 Extraction Summary');
    console.log('─'.repeat(70));
    console.log('');
    console.log(`Total Servers Found: ${totalServerCount}`);
    console.log('');

    if (totalServerCount === 0) {
      console.log('⚠️  No servers found for any company.');
      console.log('   This could mean:');
      console.log('   - Servers are registered under different company records');
      console.log('   - Servers exist in different CMDB tables');
      console.log('   - Company sys_ids are incorrect');
      process.exit(0);
    }

    // Export to CSV
    console.log('Exporting to CSV...');
    console.log('');

    const outputDir = path.dirname(companyStructureFile);
    const baseName = path.basename(companyStructureFile, '.json');
    const csvPath = path.join(outputDir, `${baseName.replace('-company-structure', '')}-server-inventory.csv`);

    // Generate CSV header
    const headers = Object.keys(allServers[0]);
    const csvHeader = headers.join(',');

    // Generate CSV rows
    const csvRows = allServers.map(server => {
      return headers.map(header => {
        const value = server[header as keyof ServerRecord] || '';
        // Escape commas and quotes in CSV
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',');
    });

    const csvContent = [csvHeader, ...csvRows].join('\n');
    fs.writeFileSync(csvPath, csvContent);

    console.log(`✅ Server inventory exported to: ${csvPath}`);
    console.log('');

    // Breakdown by company
    console.log('Breakdown by Company:');
    const companyCounts = new Map<string, number>();
    for (const server of allServers) {
      const count = companyCounts.get(server.company_name) || 0;
      companyCounts.set(server.company_name, count + 1);
    }

    for (const [companyName, count] of companyCounts.entries()) {
      console.log(`  - ${companyName}: ${count} servers`);
    }
    console.log('');

    // Breakdown by server class
    console.log('Breakdown by Server Class:');
    const classCounts = new Map<string, number>();
    for (const server of allServers) {
      const serverClass = server.server_class || 'Unknown';
      const count = classCounts.get(serverClass) || 0;
      classCounts.set(serverClass, count + 1);
    }

    for (const [serverClass, count] of classCounts.entries()) {
      console.log(`  - ${serverClass}: ${count} servers`);
    }
    console.log('');

    // Next steps
    console.log('─'.repeat(70));
    console.log('✅ Server Extraction Complete!');
    console.log('─'.repeat(70));
    console.log('');
    console.log('Next Steps:');
    console.log('  1. Review the CSV file for completeness');
    console.log('  2. Run data quality analysis:');
    console.log(`     npx tsx scripts/analyze-server-data-quality.ts ${csvPath}`);
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Extraction failed:');
    console.error(error);
    process.exit(1);
  }
}

// Get company structure file from command line
const companyStructureFile = process.argv[2];

extractServerInventory(companyStructureFile)
  .catch(console.error)
  .finally(() => process.exit(0));
