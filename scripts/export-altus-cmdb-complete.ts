/**
 * Export All Altus CMDB Data (READ-ONLY)
 *
 * Comprehensive backup of all Altus-related records from DEV and PROD
 * Exports to both JSON (full detail) and CSV (Excel-friendly) formats
 *
 * Exports:
 * - Service Catalog (Business Services, Service Offerings, Application Services)
 * - Configuration Items (Servers, Network Devices, Workstations)
 * - Relationships (svc_ci_assoc, parent/child)
 * - Customer Account
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
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

interface ExportResult {
  environment: string;
  table: string;
  count: number;
  records: any[];
}

// Tables to export
const TABLES_TO_EXPORT = [
  // Service Catalog
  { table: 'cmdb_ci_service_business', name: 'business_services' },
  { table: 'service_offering', name: 'service_offerings' },
  { table: 'cmdb_ci_service_discovered', name: 'application_services' },
  { table: 'cmdb_ci_service', name: 'generic_services' },

  // Network
  { table: 'cmdb_ci_netgear', name: 'network_devices' },
  { table: 'cmdb_ci_firewall', name: 'firewalls' },
  { table: 'cmdb_ci_router', name: 'routers' },
  { table: 'cmdb_ci_lb', name: 'load_balancers' },

  // Compute
  { table: 'cmdb_ci_server', name: 'servers' },
  { table: 'cmdb_ci_win_server', name: 'windows_servers' },
  { table: 'cmdb_ci_linux_server', name: 'linux_servers' },
  { table: 'cmdb_ci_computer', name: 'computers' },
  { table: 'cmdb_ci_vm', name: 'virtual_machines' },

  // Storage
  { table: 'cmdb_ci_storage_device', name: 'storage_devices' },
  { table: 'cmdb_ci_file_share', name: 'file_shares' },

  // Applications
  { table: 'cmdb_ci_database', name: 'databases' },
  { table: 'cmdb_ci_app_server', name: 'app_servers' },
  { table: 'cmdb_ci_web_server', name: 'web_servers' },

  // Relationships
  { table: 'svc_ci_assoc', name: 'service_dependencies' },

  // Customer
  { table: 'customer_account', name: 'customer_account', specificQuery: 'number=ACCT0010145' },

  // Generic CIs (catch-all)
  { table: 'cmdb_ci', name: 'generic_cis' },
];

function flattenObject(obj: any, prefix = ''): any {
  const flattened: any = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}_${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Handle ServiceNow reference fields
      if (value.hasOwnProperty('display_value') && value.hasOwnProperty('value')) {
        flattened[newKey] = value.display_value || value.value || '';
        flattened[`${newKey}_sys_id`] = value.value || '';
      } else {
        // Recursively flatten nested objects
        Object.assign(flattened, flattenObject(value, newKey));
      }
    } else if (Array.isArray(value)) {
      flattened[newKey] = JSON.stringify(value);
    } else {
      flattened[newKey] = value;
    }
  }

  return flattened;
}

function convertToCSV(records: any[]): string {
  if (records.length === 0) return '';

  // Flatten all records
  const flatRecords = records.map(r => flattenObject(r));

  // Get all unique keys
  const allKeys = new Set<string>();
  flatRecords.forEach(record => {
    Object.keys(record).forEach(key => allKeys.add(key));
  });

  const headers = Array.from(allKeys);

  // CSV header
  const csvLines = [headers.join(',')];

  // CSV rows
  for (const record of flatRecords) {
    const row = headers.map(header => {
      const value = record[header];
      if (value === null || value === undefined) return '';

      // Escape quotes and wrap in quotes if contains comma or quote
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
    csvLines.push(row.join(','));
  }

  return csvLines.join('\n');
}

async function queryTable(
  instanceUrl: string,
  authHeader: string,
  table: string,
  specificQuery?: string
): Promise<any[]> {
  try {
    const query = specificQuery
      ? encodeURIComponent(specificQuery)
      : encodeURIComponent('nameLIKEAltus^ORhostnameLIKEAltus^ORdns_nameLIKEAltus^ORshort_descriptionLIKEAltus');

    const queryUrl = `${instanceUrl}/api/now/table/${table}?sysparm_query=${query}&sysparm_display_value=all&sysparm_limit=1000`;

    const response = await fetch(queryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // Table might not exist or query failed
      return [];
    }

    const data = await response.json();
    return data.result || [];
  } catch (error) {
    console.error(`  ⚠️  Error querying ${table}:`, error);
    return [];
  }
}

async function exportEnvironment(
  environment: string,
  instanceUrl: string,
  username: string,
  password: string,
  outputDir: string
): Promise<ExportResult[]> {
  console.log(`📦 Exporting ${environment}: ${instanceUrl}`);
  console.log('─'.repeat(70));

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const results: ExportResult[] = [];

  // Create environment directory
  const envDir = path.join(outputDir, environment.toLowerCase());
  fs.mkdirSync(envDir, { recursive: true });

  for (const tableConfig of TABLES_TO_EXPORT) {
    const records = await queryTable(
      instanceUrl,
      authHeader,
      tableConfig.table,
      tableConfig.specificQuery
    );

    if (records.length > 0) {
      console.log(`  ${tableConfig.name}: ${records.length} record(s)`);

      // Save JSON
      const jsonPath = path.join(envDir, `${tableConfig.name}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(records, null, 2));

      // Save CSV
      const csvPath = path.join(envDir, `${tableConfig.name}.csv`);
      const csv = convertToCSV(records);
      fs.writeFileSync(csvPath, csv);

      results.push({
        environment,
        table: tableConfig.table,
        count: records.length,
        records,
      });
    }
  }

  console.log('');
  return results;
}

async function exportAltusCMDB() {
  console.log('📦 Export All Altus CMDB Data');
  console.log('='.repeat(70));
  console.log('');

  // Create output directory with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const outputDir = path.join(process.cwd(), 'backup', `altus-export-${timestamp}`);
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`Output Directory: ${outputDir}`);
  console.log('');

  // Get credentials for both environments
  const prodUrl = process.env.SERVICENOW_URL;
  const prodUsername = process.env.SERVICENOW_USERNAME;
  const prodPassword = process.env.SERVICENOW_PASSWORD;

  const devUrl = process.env.DEV_SERVICENOW_URL;
  const devUsername = process.env.DEV_SERVICENOW_USERNAME;
  const devPassword = process.env.DEV_SERVICENOW_PASSWORD;

  const allResults: ExportResult[] = [];

  try {
    // Export DEV
    if (devUrl && devUsername && devPassword) {
      const devResults = await exportEnvironment('DEV', devUrl, devUsername, devPassword, outputDir);
      allResults.push(...devResults);
    } else {
      console.log('⚠️  DEV credentials not configured, skipping DEV export');
      console.log('');
    }

    // Export PROD
    if (prodUrl && prodUsername && prodPassword) {
      const prodResults = await exportEnvironment('PRODUCTION', prodUrl, prodUsername, prodPassword, outputDir);
      allResults.push(...prodResults);
    } else {
      console.log('⚠️  PROD credentials not configured, skipping PROD export');
      console.log('');
    }

    if (allResults.length === 0) {
      console.error('❌ No environments configured or no data found');
      process.exit(1);
    }

    // ========================================
    // Summary Report
    // ========================================
    console.log('─'.repeat(70));
    console.log('📊 EXPORT SUMMARY');
    console.log('─'.repeat(70));
    console.log('');

    // Group by environment
    const devResults = allResults.filter(r => r.environment === 'DEV');
    const prodResults = allResults.filter(r => r.environment === 'PRODUCTION');

    if (devResults.length > 0) {
      const devTotal = devResults.reduce((sum, r) => sum + r.count, 0);
      console.log(`DEV: ${devTotal} total records across ${devResults.length} tables`);
      for (const result of devResults) {
        const tableName = TABLES_TO_EXPORT.find(t => t.table === result.table)?.name || result.table;
        console.log(`  - ${tableName}: ${result.count}`);
      }
      console.log('');
    }

    if (prodResults.length > 0) {
      const prodTotal = prodResults.reduce((sum, r) => sum + r.count, 0);
      console.log(`PRODUCTION: ${prodTotal} total records across ${prodResults.length} tables`);
      for (const result of prodResults) {
        const tableName = TABLES_TO_EXPORT.find(t => t.table === result.table)?.name || result.table;
        console.log(`  - ${tableName}: ${result.count}`);
      }
      console.log('');
    }

    const grandTotal = allResults.reduce((sum, r) => sum + r.count, 0);
    console.log(`Grand Total: ${grandTotal} records exported`);
    console.log('');

    // ========================================
    // Files Created
    // ========================================
    console.log('─'.repeat(70));
    console.log('📁 FILES CREATED');
    console.log('─'.repeat(70));
    console.log('');

    console.log(`Location: ${outputDir}`);
    console.log('');

    if (devResults.length > 0) {
      console.log('DEV Files:');
      console.log(`  ${path.join(outputDir, 'dev')}/`);
      for (const result of devResults) {
        const tableName = TABLES_TO_EXPORT.find(t => t.table === result.table)?.name || result.table;
        console.log(`    - ${tableName}.json (${result.count} records)`);
        console.log(`    - ${tableName}.csv`);
      }
      console.log('');
    }

    if (prodResults.length > 0) {
      console.log('PRODUCTION Files:');
      console.log(`  ${path.join(outputDir, 'production')}/`);
      for (const result of prodResults) {
        const tableName = TABLES_TO_EXPORT.find(t => t.table === result.table)?.name || result.table;
        console.log(`    - ${tableName}.json (${result.count} records)`);
        console.log(`    - ${tableName}.csv`);
      }
      console.log('');
    }

    // Create summary file
    const summaryPath = path.join(outputDir, 'export-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      environments: allResults.map(r => r.environment).filter((v, i, a) => a.indexOf(v) === i),
      totalRecords: grandTotal,
      results: allResults.map(r => ({
        environment: r.environment,
        table: r.table,
        count: r.count,
      })),
    }, null, 2));

    console.log('─'.repeat(70));
    console.log('✅ Export Complete!');
    console.log('');
    console.log('Next Steps:');
    console.log('  1. Review the CSV files in Excel');
    console.log(`  2. Open: ${outputDir}`);
    console.log('  3. Analyze what needs to be kept vs cleaned up');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Export failed:');
    console.error(error);
    process.exit(1);
  }
}

exportAltusCMDB()
  .catch(console.error)
  .finally(() => process.exit(0));
