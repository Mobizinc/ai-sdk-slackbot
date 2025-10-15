/**
 * ServiceNow Application Services Setup Script (ADMIN-ONLY)
 * Creates 11 Application Services for Altus Health in ServiceNow DEV environment
 *
 * This script is idempotent - safe to run multiple times.
 * It creates records only if they don't already exist.
 *
 * Application Services Structure:
 * - Parent: Service Offering "Application Administration" (7 services)
 *   1. Altus Health - NextGen Production
 *   2. Altus Health - Novarad Production
 *   3. Altus Health - Epowerdocs (EPD) Production
 *   4. Altus Health - TSheet Account
 *   5. Altus Health - Qgenda Account
 *   6. Altus Health - Paylocity Account
 *   7. Altus Health - Availity Account
 *
 * - Parent: Service Offering "Infrastructure and Cloud Management" (3 services)
 *   8. Altus Health - O365 Production
 *   9. Altus Health - Azure Environment
 *   10. Altus Health - Corporate Fileshares
 *
 * - Parent: Service Offering "Network Management" (1 service)
 *   11. Altus Health - Vonage UCaaS
 *
 * Target: DEV environment (mobizdev.service-now.com)
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

interface ApplicationServiceDefinition {
  name: string;
  parentOffering: string;
  description: string;
  serviceType: 'Dedicated Instance' | 'Managed SaaS';
}

const applicationServices: ApplicationServiceDefinition[] = [
  // Application Administration (7 services)
  {
    name: 'Altus Health - NextGen Production',
    parentOffering: 'Application Administration',
    description: 'Dedicated Instance - EMR stack for Altus Health',
    serviceType: 'Dedicated Instance',
  },
  {
    name: 'Altus Health - Novarad Production',
    parentOffering: 'Application Administration',
    description: 'Dedicated Instance - Medical imaging stack for Altus Health',
    serviceType: 'Dedicated Instance',
  },
  {
    name: 'Altus Health - Epowerdocs (EPD) Production',
    parentOffering: 'Application Administration',
    description: 'Dedicated Instance - EMR/document system for Altus Health',
    serviceType: 'Dedicated Instance',
  },
  {
    name: 'Altus Health - TSheet Account',
    parentOffering: 'Application Administration',
    description: 'Managed SaaS - TSheets time tracking account',
    serviceType: 'Managed SaaS',
  },
  {
    name: 'Altus Health - Qgenda Account',
    parentOffering: 'Application Administration',
    description: 'Managed SaaS - Qgenda scheduling account',
    serviceType: 'Managed SaaS',
  },
  {
    name: 'Altus Health - Paylocity Account',
    parentOffering: 'Application Administration',
    description: 'Managed SaaS - Paylocity HR/payroll account',
    serviceType: 'Managed SaaS',
  },
  {
    name: 'Altus Health - Availity Account',
    parentOffering: 'Application Administration',
    description: 'Managed SaaS - Availity clearinghouse account',
    serviceType: 'Managed SaaS',
  },

  // Infrastructure and Cloud Management (3 services)
  {
    name: 'Altus Health - O365 Production',
    parentOffering: 'Infrastructure and Cloud Management',
    description: 'Dedicated Instance - Microsoft 365 tenant for Altus Health',
    serviceType: 'Dedicated Instance',
  },
  {
    name: 'Altus Health - Azure Environment',
    parentOffering: 'Infrastructure and Cloud Management',
    description: 'Dedicated Instance - Azure subscription(s) with IaaS and PaaS components',
    serviceType: 'Dedicated Instance',
  },
  {
    name: 'Altus Health - Corporate Fileshares',
    parentOffering: 'Infrastructure and Cloud Management',
    description: 'Dedicated Instance - File server infrastructure for corporate data',
    serviceType: 'Dedicated Instance',
  },

  // Network Management (1 service)
  {
    name: 'Altus Health - Vonage UCaaS',
    parentOffering: 'Network Management',
    description: 'Managed SaaS - Vonage unified communications account',
    serviceType: 'Managed SaaS',
  },
];

async function setupAltusApplicationServices() {
  console.log('🏗️  Altus Health Application Services Setup - DEV');
  console.log('='.repeat(70));
  console.log('');

  // Get DEV credentials
  const devUrl = process.env.DEV_SERVICENOW_URL;
  const devUsername = process.env.DEV_SERVICENOW_USERNAME;
  const devPassword = process.env.DEV_SERVICENOW_PASSWORD;

  if (!devUrl || !devUsername || !devPassword) {
    console.error('❌ DEV ServiceNow credentials not configured in .env.local');
    console.log('\nRequired variables:');
    console.log('  - DEV_SERVICENOW_URL');
    console.log('  - DEV_SERVICENOW_USERNAME');
    console.log('  - DEV_SERVICENOW_PASSWORD');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  URL: ${devUrl}`);
  console.log(`  Username: ${devUsername}`);
  console.log('');

  // Create auth header
  const authHeader = `Basic ${Buffer.from(`${devUsername}:${devPassword}`).toString('base64')}`;

  try {
    // ========================================
    // Phase 1: Query Service Offerings to get sys_ids
    // ========================================
    console.log('Phase 1: Lookup Service Offerings');
    console.log('─'.repeat(70));

    const offeringNames = [
      'Application Administration',
      'Infrastructure and Cloud Management',
      'Network Management',
    ];

    const offeringSysIds: Map<string, string> = new Map();

    for (const offeringName of offeringNames) {
      const queryUrl = `${devUrl}/api/now/table/service_offering?sysparm_query=${encodeURIComponent(`name=${offeringName}`)}&sysparm_limit=1`;

      const response = await fetch(queryUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to query Service Offering "${offeringName}": ${response.status}`);
      }

      const data = await response.json();

      if (!data.result || data.result.length === 0) {
        console.error(`❌ Service Offering not found: "${offeringName}"`);
        console.error('   Run the setup script first: npx tsx scripts/setup-service-portfolio.ts');
        process.exit(1);
      }

      const sysId = data.result[0].sys_id;
      offeringSysIds.set(offeringName, sysId);
      console.log(`✅ Found: "${offeringName}"`);
      console.log(`   sys_id: ${sysId}`);
    }

    console.log('');

    // ========================================
    // Phase 2: Create Application Services
    // ========================================
    console.log('Phase 2: Create Application Services');
    console.log('─'.repeat(70));

    let createdCount = 0;
    let foundCount = 0;

    for (const appService of applicationServices) {
      // Add delay between operations to help auto-numbering settle
      if (createdCount > 0) {
        console.log('   Waiting 2 seconds for numbering system...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Check if Application Service exists
      const queryUrl = `${devUrl}/api/now/table/cmdb_ci_service_discovered?sysparm_query=${encodeURIComponent(`name=${appService.name}`)}&sysparm_limit=1`;

      const queryResponse = await fetch(queryUrl, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!queryResponse.ok) {
        throw new Error(`Failed to query Application Service: ${queryResponse.status}`);
      }

      const queryData = await queryResponse.json();

      if (queryData.result && queryData.result.length > 0) {
        // Application Service already exists
        foundCount++;
        const sysId = queryData.result[0].sys_id;
        console.log(`✅ Found: "${appService.name}"`);
        console.log(`   sys_id: ${sysId}`);
        console.log(`   type: ${appService.serviceType}`);
      } else {
        // Create new Application Service
        const parentSysId = offeringSysIds.get(appService.parentOffering);
        if (!parentSysId) {
          throw new Error(`Parent offering sys_id not found for: ${appService.parentOffering}`);
        }

        const createUrl = `${devUrl}/api/now/table/cmdb_ci_service_discovered`;
        const payload = {
          name: appService.name,
          short_description: appService.description,
          parent: parentSysId, // Link to Service Offering
          operational_status: '1', // Set to Operational
        };

        const createResponse = await fetch(createUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!createResponse.ok) {
          const errorText = await createResponse.text();
          throw new Error(`Failed to create Application Service: ${createResponse.status}\n${errorText}`);
        }

        const createData = await createResponse.json();
        createdCount++;
        console.log(`✨ Created: "${appService.name}"`);
        console.log(`   sys_id: ${createData.result.sys_id}`);
        console.log(`   parent: ${appService.parentOffering} (${parentSysId})`);
        console.log(`   type: ${appService.serviceType}`);
      }
    }

    console.log('');
    console.log('─'.repeat(70));
    console.log('📊 Summary:');
    console.log(`   Application Services: ${applicationServices.length} total`);
    console.log(`     - Found existing: ${foundCount}`);
    console.log(`     - Created new: ${createdCount}`);
    console.log('');
    console.log('   By Service Offering:');
    console.log('     - Application Administration: 7 services');
    console.log('     - Infrastructure and Cloud Management: 3 services');
    console.log('     - Network Management: 1 service');
    console.log('');
    console.log('✅ Altus Health Application Services setup complete!');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Setup failed:');
    console.error(error);
    process.exit(1);
  }
}

setupAltusApplicationServices()
  .catch(console.error)
  .finally(() => process.exit(0));
