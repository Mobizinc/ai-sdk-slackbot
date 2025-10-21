/**
 * Company Structure Discovery Tool
 *
 * Reusable tool to discover multi-company client structures in ServiceNow.
 * Useful for clients with multiple entities (subsidiaries, affiliated companies, etc.)
 *
 * USAGE:
 *   npx tsx scripts/discover-company-structure.ts "Altus"
 *   npx tsx scripts/discover-company-structure.ts "Neighbors"
 *
 * ENVIRONMENT VARIABLES:
 * - SERVICENOW_URL or DEV_SERVICENOW_URL: Instance URL
 * - SERVICENOW_USERNAME or DEV_SERVICENOW_USERNAME: API username
 * - SERVICENOW_PASSWORD or DEV_SERVICENOW_PASSWORD: API password
 *
 * OUTPUT:
 * - Console report
 * - JSON file: backup/company-analysis/{pattern}-company-structure.json
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

interface Company {
  sys_id: string;
  name: string;
  parent_sys_id: string | null;
  parent_name: string | null;
  customer: boolean;
  vendor: boolean;
  manufacturer: boolean;
  sys_created_on: string;
  sys_updated_on: string;
}

interface CustomerAccount {
  sys_id: string;
  number: string;
  name: string;
  company_sys_id: string;
}

interface CompanyStructure {
  searchPattern: string;
  timestamp: string;
  environment: string;
  primaryCompany: Company | null;
  relatedCompanies: Company[];
  accounts: CustomerAccount[];
  totalCompanies: number;
  summary: {
    customers: number;
    vendors: number;
    withAccounts: number;
    withoutAccounts: number;
  };
}

async function discoverCompanyStructure(searchPattern: string) {
  console.log('🔍 Company Structure Discovery Tool');
  console.log('='.repeat(70));
  console.log('');

  if (!searchPattern) {
    console.error('❌ Usage: npx tsx scripts/discover-company-structure.ts "SearchPattern"');
    console.log('');
    console.log('Examples:');
    console.log('  npx tsx scripts/discover-company-structure.ts "Altus"');
    console.log('  npx tsx scripts/discover-company-structure.ts "Neighbors"');
    process.exit(1);
  }

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

  console.log(`Search Pattern: "${searchPattern}"`);
  console.log(`Environment: ${environment}`);
  console.log(`URL: ${instanceUrl}`);
  console.log('');

  try {
    // ========================================
    // Phase 1: Query Companies
    // ========================================
    console.log('Phase 1: Querying Companies');
    console.log('─'.repeat(70));

    const companyQuery = encodeURIComponent(`nameLIKE${searchPattern}`);
    const companyUrl = `${instanceUrl}/api/now/table/core_company?sysparm_query=${companyQuery}&sysparm_display_value=all&sysparm_limit=100&sysparm_fields=sys_id,name,parent,customer,vendor,manufacturer,sys_created_on,sys_updated_on`;

    const companyResponse = await fetch(companyUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!companyResponse.ok) {
      throw new Error(`Failed to query companies: ${companyResponse.status}`);
    }

    const companyData = await companyResponse.json();
    const rawCompanies = companyData.result || [];

    console.log(`✅ Found ${rawCompanies.length} companies matching "${searchPattern}"`);
    console.log('');

    if (rawCompanies.length === 0) {
      console.log('⚠️  No companies found. Try a different search pattern.');
      process.exit(0);
    }

    // Parse companies
    const companies: Company[] = rawCompanies.map((c: any) => ({
      sys_id: c.sys_id?.value || c.sys_id,
      name: c.name?.display_value || c.name,
      parent_sys_id: c.parent?.value || null,
      parent_name: c.parent?.display_value || null,
      customer: c.customer === 'true' || c.customer === true,
      vendor: c.vendor === 'true' || c.vendor === true,
      manufacturer: c.manufacturer === 'true' || c.manufacturer === true,
      sys_created_on: c.sys_created_on?.display_value || c.sys_created_on || '',
      sys_updated_on: c.sys_updated_on?.display_value || c.sys_updated_on || '',
    }));

    // Display companies
    console.log('Companies Found:');
    for (const company of companies) {
      const flags = [];
      if (company.customer) flags.push('CUSTOMER');
      if (company.vendor) flags.push('VENDOR');
      if (company.manufacturer) flags.push('MANUFACTURER');

      console.log(`  ${company.name}`);
      console.log(`    sys_id: ${company.sys_id}`);
      if (company.parent_name) {
        console.log(`    parent: ${company.parent_name}`);
      }
      console.log(`    flags: ${flags.join(', ') || 'None'}`);
      console.log('');
    }

    // ========================================
    // Phase 2: Query Customer Accounts
    // ========================================
    console.log('Phase 2: Querying Customer Accounts');
    console.log('─'.repeat(70));

    const companySysIds = companies.map(c => c.sys_id);
    const accounts: CustomerAccount[] = [];

    for (const companySysId of companySysIds) {
      const accountQuery = encodeURIComponent(`account=${companySysId}`);
      const accountUrl = `${instanceUrl}/api/now/table/customer_account?sysparm_query=${accountQuery}&sysparm_display_value=all&sysparm_fields=sys_id,number,name,account`;

      const accountResponse = await fetch(accountUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (accountResponse.ok) {
        const accountData = await accountResponse.json();
        const rawAccounts = accountData.result || [];

        for (const acc of rawAccounts) {
          accounts.push({
            sys_id: acc.sys_id?.value || acc.sys_id,
            number: acc.number?.display_value || acc.number,
            name: acc.name?.display_value || acc.name,
            company_sys_id: companySysId,
          });
        }
      }
    }

    console.log(`✅ Found ${accounts.length} customer account(s)`);
    console.log('');

    if (accounts.length > 0) {
      console.log('Customer Accounts:');
      for (const account of accounts) {
        const company = companies.find(c => c.sys_id === account.company_sys_id);
        console.log(`  ${account.number} - ${account.name}`);
        console.log(`    Company: ${company?.name}`);
        console.log(`    sys_id: ${account.sys_id}`);
        console.log('');
      }
    } else {
      console.log('⚠️  No customer accounts found for these companies');
      console.log('');
    }

    // ========================================
    // Phase 3: Analysis & Summary
    // ========================================
    console.log('─'.repeat(70));
    console.log('📊 Analysis Summary');
    console.log('─'.repeat(70));
    console.log('');

    const primaryCompany = companies[0] || null;
    const relatedCompanies = companies.slice(1);

    const summary = {
      customers: companies.filter(c => c.customer).length,
      vendors: companies.filter(c => c.vendor).length,
      withAccounts: new Set(accounts.map(a => a.company_sys_id)).size,
      withoutAccounts: companies.length - new Set(accounts.map(a => a.company_sys_id)).size,
    };

    console.log(`Total Companies: ${companies.length}`);
    console.log(`  - Customers: ${summary.customers}`);
    console.log(`  - Vendors: ${summary.vendors}`);
    console.log(`  - With Accounts: ${summary.withAccounts}`);
    console.log(`  - Without Accounts: ${summary.withoutAccounts}`);
    console.log('');

    console.log('Company Relationships:');
    const topLevel = companies.filter(c => !c.parent_sys_id);
    const children = companies.filter(c => c.parent_sys_id);

    console.log(`  Top-Level: ${topLevel.length}`);
    for (const company of topLevel) {
      console.log(`    - ${company.name}`);
    }
    console.log('');

    if (children.length > 0) {
      console.log(`  Children/Subsidiaries: ${children.length}`);
      for (const company of children) {
        console.log(`    - ${company.name} (parent: ${company.parent_name})`);
      }
      console.log('');
    }

    // ========================================
    // Phase 4: Export Results
    // ========================================
    console.log('Phase 4: Exporting Results');
    console.log('─'.repeat(70));

    const structure: CompanyStructure = {
      searchPattern,
      timestamp: new Date().toISOString(),
      environment,
      primaryCompany,
      relatedCompanies,
      accounts,
      totalCompanies: companies.length,
      summary,
    };

    // Create output directory
    const outputDir = path.join(process.cwd(), 'backup', 'company-analysis');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write JSON file
    const sanitizedPattern = searchPattern.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const outputPath = path.join(outputDir, `${sanitizedPattern}-company-structure.json`);
    fs.writeFileSync(outputPath, JSON.stringify(structure, null, 2));

    console.log(`✅ Exported company structure to: ${outputPath}`);
    console.log('');

    // ========================================
    // Next Steps
    // ========================================
    console.log('─'.repeat(70));
    console.log('✅ Company Discovery Complete!');
    console.log('─'.repeat(70));
    console.log('');
    console.log('Next Steps:');
    console.log('  1. Review the JSON export for completeness');
    console.log('  2. Run server inventory extraction:');
    console.log(`     npx tsx scripts/extract-company-server-inventory.ts ${outputPath}`);
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Discovery failed:');
    console.error(error);
    process.exit(1);
  }
}

// Get search pattern from command line
const searchPattern = process.argv[2];

discoverCompanyStructure(searchPattern)
  .catch(console.error)
  .finally(() => process.exit(0));
