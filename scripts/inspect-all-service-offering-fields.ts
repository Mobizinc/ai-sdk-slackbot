/**
 * Inspect ALL Field Values on Service Offerings
 *
 * Fetches complete records for all 6 Service Offerings to identify
 * what field values might be causing them to not show in lookups.
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function inspectAllServiceOfferings() {
  console.log('🔍 Inspecting All Service Offering Field Values (PROD)');
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

  for (const name of offeringNames) {
    console.log(`Service Offering: "${name}"`);
    console.log('─'.repeat(80));

    // Fetch with ALL fields and display values
    const url = `${instanceUrl}/api/now/table/service_offering?sysparm_query=name=${encodeURIComponent(name)}&sysparm_display_value=all&sysparm_limit=1`;

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`  ❌ Error: ${response.status}`);
        console.log('');
        continue;
      }

      const data = await response.json();

      if (!data.result || data.result.length === 0) {
        console.log('  ❌ NOT FOUND');
        console.log('');
        continue;
      }

      const offering = data.result[0];

      // Key fields that might affect lookups
      const keyFields = [
        'sys_id',
        'name',
        'service_status',
        'install_status',
        'operational_status',
        'used_for',
        'consumer_type',
        'parent',
        'vendor',
        'version',
        'lifecycle',
        'u_lifecycle',
        'state',
        'active',
        'u_active',
        'sys_class_name',
      ];

      console.log('Key Fields:');
      keyFields.forEach(field => {
        const value = offering[field];
        if (value !== undefined && value !== null && value !== '') {
          if (typeof value === 'object') {
            console.log(`  ${field}: ${value.display_value || value.value || JSON.stringify(value)}`);
          } else {
            console.log(`  ${field}: ${value}`);
          }
        } else {
          console.log(`  ${field}: (not set)`);
        }
      });

      console.log('');
      console.log('All Fields (JSON):');
      console.log(JSON.stringify(offering, null, 2));
      console.log('');
      console.log('');

    } catch (error) {
      console.error(`  ❌ Error fetching: ${error}`);
      console.log('');
    }
  }
}

inspectAllServiceOfferings().catch(console.error);
