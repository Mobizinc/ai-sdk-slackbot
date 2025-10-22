/**
 * Fix Service Offering Portfolio Status
 *
 * Updates portfolio_status from "pipeline" to "production" or "chartered"
 * so Service Offerings appear in Incident form lookups.
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function fixPortfolioStatus() {
  console.log('🔧 Fixing Service Offering Portfolio Status (PROD)');
  console.log('='.repeat(80));
  console.log('');

  const offeringNames = [
    'Infrastructure and Cloud Management',
    'Network Management',
    'Cybersecurity Management',
    'Helpdesk and Endpoint Support - 24/7',
    'Helpdesk and Endpoint - Standard',
    'Application Administration',
  ];

  let updated = 0;

  for (const name of offeringNames) {
    // Query
    const queryUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_query=name=${encodeURIComponent(name)}&sysparm_fields=sys_id,name,portfolio_status&sysparm_display_value=all&sysparm_limit=1`;

    const queryResp = await fetch(queryUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    });

    const queryData = await queryResp.json();

    if (!queryData.result || queryData.result.length === 0) {
      console.log(`❌ "${name}" not found`);
      continue;
    }

    const offering = queryData.result[0];
    const sys_id = offering.sys_id?.value || offering.sys_id;
    const currentStatus = offering.portfolio_status?.display_value || offering.portfolio_status;

    console.log(`"${name}"`);
    console.log(`  Current portfolio_status: ${currentStatus}`);

    if (currentStatus === 'Production' || currentStatus === 'Chartered') {
      console.log('  ✅ Already in production state');
      continue;
    }

    // Update to "chartered" (typical active state for service portfolios)
    // Other possible values: "production", "chartered", "pipeline", "retired"
    const updateUrl = `${instanceUrl}/api/now/table/service_offering/${sys_id}`;
    const updateResp = await fetch(updateUrl, {
      method: 'PATCH',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolio_status: 'chartered', // Chartered = Active/Approved in Portfolio Management
      }),
    });

    if (!updateResp.ok) {
      const errorText = await updateResp.text();
      console.log(`  ❌ Failed: ${updateResp.status}`);
      console.log(`     ${errorText}`);
      continue;
    }

    const updateData = await updateResp.json();
    const newStatus = updateData.result.portfolio_status?.display_value || updateData.result.portfolio_status;

    console.log(`  ✅ Updated to: ${newStatus}`);
    updated++;
  }

  console.log('');
  console.log(`✅ Updated ${updated} Service Offerings to Chartered (active) status`);
  console.log('');
  console.log('Service Offerings should now appear in Incident form Service offering lookups.');
}

fixPortfolioStatus().catch(console.error);
