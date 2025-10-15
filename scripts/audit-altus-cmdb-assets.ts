/**
 * Audit Altus Health CMDB Assets (READ-ONLY)
 *
 * Comprehensive inventory of all Altus-related Configuration Items (CIs)
 * across both DEV and PROD environments to identify what exists in the CMDB.
 *
 * Queries multiple CMDB tables:
 * - Servers, Firewalls, Routers, Switches
 * - Storage devices, File shares
 * - Databases, Application servers
 * - Cloud resources
 * - Generic CIs
 *
 * This script is READ-ONLY and makes no modifications.
 *
 * ENVIRONMENT VARIABLES:
 * - SERVICENOW_URL: Production instance URL
 * - SERVICENOW_USERNAME: Production API username
 * - SERVICENOW_PASSWORD: Production API password
 * - DEV_SERVICENOW_URL: DEV instance URL
 * - DEV_SERVICENOW_USERNAME: DEV API username
 * - DEV_SERVICENOW_PASSWORD: DEV API password
 *
 * Target: Both DEV and PROD
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

interface CIRecord {
  name: string;
  sys_id: string;
  company?: string;
  operational_status?: string;
  [key: string]: any;
}

interface CITableResult {
  table: string;
  displayName: string;
  count: number;
  records: CIRecord[];
}

interface EnvironmentResults {
  environment: string;
  url: string;
  results: CITableResult[];
  totalCIs: number;
}

const CI_TABLES = [
  { table: 'cmdb_ci_server', displayName: 'Servers' },
  { table: 'cmdb_ci_win_server', displayName: 'Windows Servers' },
  { table: 'cmdb_ci_linux_server', displayName: 'Linux Servers' },
  { table: 'cmdb_ci_firewall', displayName: 'Firewalls' },
  { table: 'cmdb_ci_router', displayName: 'Routers' },
  { table: 'cmdb_ci_netgear', displayName: 'Switches/Network Gear' },
  { table: 'cmdb_ci_lb', displayName: 'Load Balancers' },
  { table: 'cmdb_ci_storage_device', displayName: 'Storage Devices' },
  { table: 'cmdb_ci_file_share', displayName: 'File Shares' },
  { table: 'cmdb_ci_database', displayName: 'Databases' },
  { table: 'cmdb_ci_app_server', displayName: 'Application Servers' },
  { table: 'cmdb_ci_web_server', displayName: 'Web Servers' },
  { table: 'cmdb_ci_cloud_service_account', displayName: 'Cloud Service Accounts' },
  { table: 'cmdb_ci_vm', displayName: 'Virtual Machines' },
  { table: 'cmdb_ci_vm_instance', displayName: 'VM Instances' },
  { table: 'cmdb_ci_computer', displayName: 'Computers' },
  { table: 'cmdb_ci', displayName: 'Generic CIs' },
];

async function queryCITable(
  instanceUrl: string,
  authHeader: string,
  table: string,
  displayName: string
): Promise<CITableResult> {
  // Query for records with "Altus" in name, hostname, or dns_name
  const query = encodeURIComponent(
    'nameLIKEAltus^ORhostnameLIKEAltus^ORdns_nameLIKEAltus^ORshort_descriptionLIKEAltus'
  );
  const queryUrl = `${instanceUrl}/api/now/table/${table}?sysparm_query=${query}&sysparm_display_value=all&sysparm_limit=100`;

  try {
    const response = await fetch(queryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // Table might not exist in this instance
      return {
        table,
        displayName,
        count: 0,
        records: [],
      };
    }

    const data = await response.json();
    const records = (data.result || []).map((record: any) => {
      const name = typeof record.name === 'object' ? record.name.display_value : record.name;
      const sysId = typeof record.sys_id === 'object' ? record.sys_id.value : record.sys_id;
      const company = typeof record.company === 'object' ? record.company.display_value : record.company;
      const opStatus = typeof record.operational_status === 'object'
        ? record.operational_status.display_value
        : record.operational_status;

      return {
        name: name || 'Unnamed',
        sys_id: sysId,
        company: company || 'None',
        operational_status: opStatus || 'Unknown',
        hostname: record.hostname?.display_value || record.hostname || '',
        dns_name: record.dns_name?.display_value || record.dns_name || '',
        ip_address: record.ip_address?.display_value || record.ip_address || '',
      };
    });

    return {
      table,
      displayName,
      count: records.length,
      records,
    };
  } catch (error) {
    return {
      table,
      displayName,
      count: 0,
      records: [],
    };
  }
}

async function auditEnvironment(
  environment: string,
  instanceUrl: string,
  username: string,
  password: string
): Promise<EnvironmentResults> {
  console.log(`🔍 Auditing ${environment}: ${instanceUrl}`);
  console.log('─'.repeat(70));

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const results: CITableResult[] = [];

  for (const ciTable of CI_TABLES) {
    const result = await queryCITable(instanceUrl, authHeader, ciTable.table, ciTable.displayName);
    results.push(result);

    if (result.count > 0) {
      console.log(`  ${ciTable.displayName}: ${result.count} record(s)`);
    }
  }

  const totalCIs = results.reduce((sum, r) => sum + r.count, 0);
  console.log(`  Total CIs: ${totalCIs}`);
  console.log('');

  return {
    environment,
    url: instanceUrl,
    results,
    totalCIs,
  };
}

async function auditAltusCMDBAssets() {
  console.log('🔍 Altus Health CMDB Assets Audit');
  console.log('='.repeat(70));
  console.log('');

  // Get credentials for both environments
  const prodUrl = process.env.SERVICENOW_URL;
  const prodUsername = process.env.SERVICENOW_USERNAME;
  const prodPassword = process.env.SERVICENOW_PASSWORD;

  const devUrl = process.env.DEV_SERVICENOW_URL;
  const devUsername = process.env.DEV_SERVICENOW_USERNAME;
  const devPassword = process.env.DEV_SERVICENOW_PASSWORD;

  const environments: EnvironmentResults[] = [];

  try {
    // Audit DEV
    if (devUrl && devUsername && devPassword) {
      const devResults = await auditEnvironment('DEV', devUrl, devUsername, devPassword);
      environments.push(devResults);
    } else {
      console.log('⚠️  DEV credentials not configured, skipping DEV');
      console.log('');
    }

    // Audit PROD
    if (prodUrl && prodUsername && prodPassword) {
      const prodResults = await auditEnvironment('PRODUCTION', prodUrl, prodUsername, prodPassword);
      environments.push(prodResults);
    } else {
      console.log('⚠️  PROD credentials not configured, skipping PROD');
      console.log('');
    }

    if (environments.length === 0) {
      console.error('❌ No environments configured');
      console.log('\nConfigure at least one environment:');
      console.log('DEV: DEV_SERVICENOW_URL, DEV_SERVICENOW_USERNAME, DEV_SERVICENOW_PASSWORD');
      console.log('PROD: SERVICENOW_URL, SERVICENOW_USERNAME, SERVICENOW_PASSWORD');
      process.exit(1);
    }

    // ========================================
    // Detailed Results by Environment
    // ========================================
    console.log('─'.repeat(70));
    console.log('📋 DETAILED RESULTS');
    console.log('─'.repeat(70));
    console.log('');

    for (const env of environments) {
      console.log(`${env.environment} - ${env.url}`);
      console.log('─'.repeat(70));

      const nonEmptyResults = env.results.filter(r => r.count > 0);

      if (nonEmptyResults.length === 0) {
        console.log('  ✅ No Altus CIs found (clean environment)');
        console.log('');
        continue;
      }

      for (const result of nonEmptyResults) {
        console.log(`  ${result.displayName} (${result.table}): ${result.count} record(s)`);
        console.log('');

        for (const record of result.records) {
          console.log(`    Name: ${record.name}`);
          console.log(`    sys_id: ${record.sys_id}`);
          if (record.hostname) console.log(`    Hostname: ${record.hostname}`);
          if (record.dns_name) console.log(`    DNS: ${record.dns_name}`);
          if (record.ip_address) console.log(`    IP: ${record.ip_address}`);
          console.log(`    Company: ${record.company}`);
          console.log(`    Status: ${record.operational_status}`);
          console.log('');
        }
      }
    }

    // ========================================
    // Summary Comparison
    // ========================================
    console.log('─'.repeat(70));
    console.log('📊 SUMMARY COMPARISON');
    console.log('─'.repeat(70));
    console.log('');

    if (environments.length === 2) {
      const dev = environments.find(e => e.environment === 'DEV');
      const prod = environments.find(e => e.environment === 'PRODUCTION');

      console.log('CI Type Comparison:');
      console.log('');
      console.log('  CI Type'.padEnd(40) + 'DEV'.padEnd(10) + 'PROD');
      console.log('  ' + '─'.repeat(60));

      for (const ciTable of CI_TABLES) {
        const devCount = dev?.results.find(r => r.table === ciTable.table)?.count || 0;
        const prodCount = prod?.results.find(r => r.table === ciTable.table)?.count || 0;

        if (devCount > 0 || prodCount > 0) {
          console.log(
            `  ${ciTable.displayName.padEnd(40)}${devCount.toString().padEnd(10)}${prodCount}`
          );
        }
      }

      console.log('  ' + '─'.repeat(60));
      console.log(
        `  ${'TOTAL'.padEnd(40)}${dev?.totalCIs.toString().padEnd(10) || '0'}${prod?.totalCIs || 0}`
      );
      console.log('');
    } else {
      // Single environment summary
      for (const env of environments) {
        console.log(`${env.environment}: ${env.totalCIs} total CI(s)`);

        const nonEmpty = env.results.filter(r => r.count > 0);
        for (const result of nonEmpty) {
          console.log(`  - ${result.displayName}: ${result.count}`);
        }
        console.log('');
      }
    }

    // ========================================
    // Recommendations
    // ========================================
    console.log('─'.repeat(70));
    console.log('💡 RECOMMENDATIONS');
    console.log('─'.repeat(70));
    console.log('');

    const hasDevCIs = environments.find(e => e.environment === 'DEV')?.totalCIs || 0;
    const hasProdCIs = environments.find(e => e.environment === 'PRODUCTION')?.totalCIs || 0;

    if (hasDevCIs === 0 && hasProdCIs === 0) {
      console.log('✅ Clean slate! No Altus CIs exist in either environment.');
      console.log('   Ready to create Application Services without conflicts.');
    } else {
      if (hasDevCIs > 0) {
        console.log('⚠️  DEV has Altus CIs:');
        console.log('   - Review if these are test data or legitimate');
        console.log('   - Consider cleanup if they are incorrect');
        console.log('');
      }

      if (hasProdCIs > 0) {
        console.log('⚠️  PRODUCTION has Altus CIs:');
        console.log('   - These are likely legitimate infrastructure records');
        console.log('   - Application Services can coexist with these');
        console.log('   - Ensure they have correct company linkage');
        console.log('');
      }

      console.log('📝 Next Steps:');
      console.log('   1. Review each CI to determine if legitimate or garbage');
      console.log('   2. Update company field to link to Altus account (ACCT0010145)');
      console.log('   3. Create Application Services to manage these CIs');
      console.log('   4. Establish relationships between Services and CIs');
    }

    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Audit failed:');
    console.error(error);
    process.exit(1);
  }
}

auditAltusCMDBAssets()
  .catch(console.error)
  .finally(() => process.exit(0));
