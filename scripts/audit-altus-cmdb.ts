/**
 * Altus Health CMDB Audit Script (READ-ONLY)
 *
 * Inventories all Altus Health-related CMDB records to identify:
 * - What exists in the CMDB
 * - What's configured correctly vs incorrectly
 * - What needs to be cleaned up
 *
 * This script is READ-ONLY and makes no modifications.
 *
 * ENVIRONMENT VARIABLES:
 * - SERVICENOW_URL or DEV_SERVICENOW_URL: Instance URL
 * - SERVICENOW_USERNAME or DEV_SERVICENOW_USERNAME: API username
 * - SERVICENOW_PASSWORD or DEV_SERVICENOW_PASSWORD: API password
 *
 * Target: Any environment (DEV or PROD)
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

interface AuditResult {
  table: string;
  count: number;
  records: any[];
  issues?: string[];
}

async function auditAltusCMDB() {
  console.log('🔍 Altus Health CMDB Audit - READ-ONLY');
  console.log('='.repeat(70));
  console.log('');

  // Get credentials (support both PROD and DEV env vars)
  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured in .env.local');
    console.log('\nRequired variables (use either PROD or DEV prefix):');
    console.log('  - SERVICENOW_URL or DEV_SERVICENOW_URL');
    console.log('  - SERVICENOW_USERNAME or DEV_SERVICENOW_USERNAME');
    console.log('  - SERVICENOW_PASSWORD or DEV_SERVICENOW_PASSWORD');
    process.exit(1);
  }

  const environment = process.env.SERVICENOW_URL ? 'PRODUCTION' : 'DEV';

  console.log('Configuration:');
  console.log(`  Environment: ${environment}`);
  console.log(`  URL: ${instanceUrl}`);
  console.log(`  Username: ${username}`);
  console.log('');

  if (environment === 'PRODUCTION') {
    console.log('⚠️  WARNING: Auditing PRODUCTION environment');
    console.log('');
  }

  // Create auth header
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const auditResults: AuditResult[] = [];

  try {
    // ========================================
    // 1. Customer Account
    // ========================================
    console.log('1. Customer Account');
    console.log('─'.repeat(70));

    const customerQueryUrl = `${instanceUrl}/api/now/table/customer_account?sysparm_query=${encodeURIComponent('nameLIKEAltus^ORnumberLIKEACCT')}&sysparm_display_value=all`;

    const customerResponse = await fetch(customerQueryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!customerResponse.ok) {
      throw new Error(`Failed to query customer_account: ${customerResponse.status}`);
    }

    const customerData = await customerResponse.json();
    const customers = customerData.result || [];

    console.log(`Found ${customers.length} customer account(s)`);
    console.log('');

    for (const customer of customers) {
      const name = typeof customer.name === 'object' ? customer.name.display_value : customer.name;
      const number = typeof customer.number === 'object' ? customer.number.display_value : customer.number;
      const sysId = typeof customer.sys_id === 'object' ? customer.sys_id.value : customer.sys_id;

      console.log(`  Name: ${name}`);
      console.log(`  Number: ${number}`);
      console.log(`  sys_id: ${sysId}`);
      console.log('');
    }

    auditResults.push({
      table: 'customer_account',
      count: customers.length,
      records: customers,
    });

    // ========================================
    // 2. Business Services
    // ========================================
    console.log('2. Business Services');
    console.log('─'.repeat(70));

    const bsQueryUrl = `${instanceUrl}/api/now/table/cmdb_ci_service_business?sysparm_query=${encodeURIComponent('nameLIKEManaged Support')}&sysparm_display_value=all`;

    const bsResponse = await fetch(bsQueryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!bsResponse.ok) {
      throw new Error(`Failed to query cmdb_ci_service_business: ${bsResponse.status}`);
    }

    const bsData = await bsResponse.json();
    const businessServices = bsData.result || [];

    console.log(`Found ${businessServices.length} business service(s)`);
    console.log('');

    for (const bs of businessServices) {
      const name = typeof bs.name === 'object' ? bs.name.display_value : bs.name;
      const sysId = typeof bs.sys_id === 'object' ? bs.sys_id.value : bs.sys_id;

      console.log(`  Name: ${name}`);
      console.log(`  sys_id: ${sysId}`);
      console.log('');
    }

    auditResults.push({
      table: 'cmdb_ci_service_business',
      count: businessServices.length,
      records: businessServices,
    });

    // ========================================
    // 3. Service Offerings
    // ========================================
    console.log('3. Service Offerings');
    console.log('─'.repeat(70));

    const soQueryUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_display_value=all&sysparm_limit=100`;

    const soResponse = await fetch(soQueryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!soResponse.ok) {
      throw new Error(`Failed to query service_offering: ${soResponse.status}`);
    }

    const soData = await soResponse.json();
    const serviceOfferings = soData.result || [];

    console.log(`Found ${serviceOfferings.length} service offering(s)`);
    console.log('');

    for (const so of serviceOfferings) {
      const name = typeof so.name === 'object' ? so.name.display_value : so.name;
      const sysId = typeof so.sys_id === 'object' ? so.sys_id.value : so.sys_id;
      const parent = typeof so.parent === 'object' ? so.parent.display_value : so.parent;

      console.log(`  Name: ${name}`);
      console.log(`  sys_id: ${sysId}`);
      console.log(`  Parent: ${parent || 'None'}`);
      console.log('');
    }

    auditResults.push({
      table: 'service_offering',
      count: serviceOfferings.length,
      records: serviceOfferings,
    });

    // ========================================
    // 4. Application Services (correct table)
    // ========================================
    console.log('4. Application Services (cmdb_ci_service_discovered)');
    console.log('─'.repeat(70));

    const asQueryUrl = `${instanceUrl}/api/now/table/cmdb_ci_service_discovered?sysparm_query=${encodeURIComponent('nameLIKEAltus')}&sysparm_display_value=all&sysparm_limit=100`;

    const asResponse = await fetch(asQueryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!asResponse.ok) {
      throw new Error(`Failed to query cmdb_ci_service_discovered: ${asResponse.status}`);
    }

    const asData = await asResponse.json();
    const applicationServices = asData.result || [];

    console.log(`Found ${applicationServices.length} application service(s)`);
    console.log('');

    const asIssues: string[] = [];

    for (const as of applicationServices) {
      const name = typeof as.name === 'object' ? as.name.display_value : as.name;
      const sysId = typeof as.sys_id === 'object' ? as.sys_id.value : as.sys_id;
      const parent = typeof as.parent === 'object' ? as.parent.display_value : as.parent;
      const company = typeof as.company === 'object' ? as.company.display_value : as.company;
      const opStatus = typeof as.operational_status === 'object' ? as.operational_status.display_value : as.operational_status;

      console.log(`  Name: ${name}`);
      console.log(`  sys_id: ${sysId}`);
      console.log(`  Parent: ${parent || '⚠️  MISSING'}`);
      console.log(`  Company: ${company || '⚠️  MISSING'}`);
      console.log(`  Operational Status: ${opStatus || 'Unknown'}`);

      // Check for issues
      if (!parent) {
        asIssues.push(`${name}: Missing parent Service Offering`);
      }
      if (!company) {
        asIssues.push(`${name}: Missing company (customer account)`);
      }

      console.log('');
    }

    auditResults.push({
      table: 'cmdb_ci_service_discovered',
      count: applicationServices.length,
      records: applicationServices,
      issues: asIssues,
    });

    // ========================================
    // 5. Generic Services (wrong table - potential cleanup candidates)
    // ========================================
    console.log('5. Generic Services (cmdb_ci_service) - WRONG TABLE');
    console.log('─'.repeat(70));

    const gsQueryUrl = `${instanceUrl}/api/now/table/cmdb_ci_service?sysparm_query=${encodeURIComponent('nameLIKEAltus')}&sysparm_display_value=all&sysparm_limit=100`;

    const gsResponse = await fetch(gsQueryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!gsResponse.ok) {
      throw new Error(`Failed to query cmdb_ci_service: ${gsResponse.status}`);
    }

    const gsData = await gsResponse.json();
    const genericServices = gsData.result || [];

    console.log(`Found ${genericServices.length} generic service(s) - SHOULD BE 0`);
    console.log('');

    const gsIssues: string[] = [];

    if (genericServices.length > 0) {
      console.log('⚠️  WARNING: Found Altus services in wrong table!');
      console.log('These should be in cmdb_ci_service_discovered, not cmdb_ci_service');
      console.log('');

      for (const gs of genericServices) {
        const name = typeof gs.name === 'object' ? gs.name.display_value : gs.name;
        const sysId = typeof gs.sys_id === 'object' ? gs.sys_id.value : gs.sys_id;

        console.log(`  Name: ${name}`);
        console.log(`  sys_id: ${sysId}`);
        console.log(`  ⚠️  NEEDS CLEANUP - Wrong table`);
        console.log('');

        gsIssues.push(`${name}: In wrong table (cmdb_ci_service instead of cmdb_ci_service_discovered)`);
      }
    } else {
      console.log('✅ No services found in wrong table');
      console.log('');
    }

    auditResults.push({
      table: 'cmdb_ci_service (wrong table)',
      count: genericServices.length,
      records: genericServices,
      issues: gsIssues,
    });

    // ========================================
    // 6. Many-to-Many Relationships (svc_ci_assoc)
    // ========================================
    console.log('6. Service Dependencies (svc_ci_assoc)');
    console.log('─'.repeat(70));

    // Query for any svc_ci_assoc relationships involving Altus services
    const assocQueryUrl = `${instanceUrl}/api/now/table/svc_ci_assoc?sysparm_display_value=all&sysparm_limit=100`;

    const assocResponse = await fetch(assocQueryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!assocResponse.ok) {
      throw new Error(`Failed to query svc_ci_assoc: ${assocResponse.status}`);
    }

    const assocData = await assocResponse.json();
    const associations = (assocData.result || []).filter((assoc: any) => {
      const parent = typeof assoc.parent === 'object' ? assoc.parent.display_value : '';
      const child = typeof assoc.child === 'object' ? assoc.child.display_value : '';
      return parent.includes('Altus') || child.includes('Altus') || parent.includes('Helpdesk') || child.includes('Endpoint');
    });

    console.log(`Found ${associations.length} service dependency/ies`);
    console.log('');

    for (const assoc of associations) {
      const parent = typeof assoc.parent === 'object' ? assoc.parent.display_value : assoc.parent;
      const child = typeof assoc.child === 'object' ? assoc.child.display_value : assoc.child;
      const sysId = typeof assoc.sys_id === 'object' ? assoc.sys_id.value : assoc.sys_id;

      console.log(`  Parent: ${parent}`);
      console.log(`  Child: ${child}`);
      console.log(`  sys_id: ${sysId}`);
      console.log('');
    }

    auditResults.push({
      table: 'svc_ci_assoc',
      count: associations.length,
      records: associations,
    });

    // ========================================
    // Summary Report
    // ========================================
    console.log('─'.repeat(70));
    console.log('📊 AUDIT SUMMARY');
    console.log('─'.repeat(70));
    console.log('');

    for (const result of auditResults) {
      console.log(`${result.table}: ${result.count} record(s)`);
      if (result.issues && result.issues.length > 0) {
        console.log(`  ⚠️  ${result.issues.length} issue(s) found`);
      }
    }

    console.log('');
    console.log('─'.repeat(70));
    console.log('🔍 ISSUES FOUND');
    console.log('─'.repeat(70));
    console.log('');

    let totalIssues = 0;
    for (const result of auditResults) {
      if (result.issues && result.issues.length > 0) {
        console.log(`${result.table}:`);
        for (const issue of result.issues) {
          console.log(`  ❌ ${issue}`);
          totalIssues++;
        }
        console.log('');
      }
    }

    if (totalIssues === 0) {
      console.log('✅ No issues found! CMDB is clean.');
    } else {
      console.log(`Total Issues: ${totalIssues}`);
    }

    console.log('');
    console.log('─'.repeat(70));
    console.log('💡 RECOMMENDATIONS');
    console.log('─'.repeat(70));
    console.log('');

    if (genericServices.length > 0) {
      console.log('1. ⚠️  Delete services from cmdb_ci_service table (wrong table)');
      console.log('   These should be recreated in cmdb_ci_service_discovered');
      console.log('');
    }

    const asWithIssues = applicationServices.filter((as: any) => {
      const parent = typeof as.parent === 'object' ? as.parent.value : as.parent;
      const company = typeof as.company === 'object' ? as.company.value : as.company;
      return !parent || !company;
    });

    if (asWithIssues.length > 0) {
      console.log('2. ⚠️  Fix Application Services with missing parent or company');
      console.log(`   ${asWithIssues.length} service(s) need updates`);
      console.log('');
    }

    if (totalIssues === 0 && genericServices.length === 0) {
      console.log('✅ CMDB looks good! Ready for production deployment.');
    } else {
      console.log('⚠️  Cleanup recommended before running setup scripts.');
      console.log('   Consider creating a cleanup script or manually fixing issues.');
    }

    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Audit failed:');
    console.error(error);
    process.exit(1);
  }
}

auditAltusCMDB()
  .catch(console.error)
  .finally(() => process.exit(0));
