/**
 * STEP 2: ServiceNow Application Services Setup Script (ADMIN-ONLY)
 * Creates 24 Application Services for Altus Health + CI Relationships
 *
 * This script is idempotent - safe to run multiple times.
 * It creates records only if they don't already exist.
 *
 * PREREQUISITES:
 * - Run Step 1: setup-service-portfolio.ts first
 * - Customer account must exist in ServiceNow
 *
 * ENVIRONMENT VARIABLES:
 * - CUSTOMER_ACCOUNT_NUMBER: Account number (default: ACCT0010145 for Altus)
 * - SERVICENOW_URL or DEV_SERVICENOW_URL: Instance URL
 * - SERVICENOW_USERNAME or DEV_SERVICENOW_USERNAME: API username
 * - SERVICENOW_PASSWORD or DEV_SERVICENOW_PASSWORD: API password
 *
 * Application Services Structure:
 * - Parent: Service Offering "Application Administration" (18 services)
 *   1. Altus Health - NextGen Production
 *   2. Altus Health - Novarad Production
 *   3. Altus Health - Epowerdocs (EPD) Production
 *   4. Altus Health - TSheet Account
 *   5. Altus Health - Qgenda Account
 *   6. Altus Health - Paylocity Account
 *   7. Altus Health - Availity Account
 *   8. Altus Health - GlobalPay Account
 *   9. Altus Health - Gorev Production
 *   10. Altus Health - Imagine Production
 *   11. Altus Health - Medicus Production
 *   12. Altus Health - One Source Account
 *   13. Altus Health - OnePACS Production
 *   14. Altus Health - TruBridge Production
 *   15. Altus Health - ViaTrack Production
 *   16. Altus Health - VizTech Production
 *   17. Altus Health - WayStar Account
 *   18. Altus Health - Magdou Health (PACS) Production
 *
 * - Parent: Service Offering "Infrastructure and Cloud Management" (5 services)
 *   19. Altus Health - O365 Production
 *   20. Altus Health - Azure Environment
 *   21. Altus Health - Corporate Fileshares
 *   22. Altus Health - Endpoint Management Platform
 *   23. Altus Health - Active Directory
 *
 * - Parent: Service Offering "Network Management" (1 service)
 *   24. Altus Health - Vonage UCaaS
 *
 * Target: Any environment (DEV or PROD)
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
  {
    name: 'Altus Health - GlobalPay Account',
    parentOffering: 'Application Administration',
    description: 'Managed SaaS - GlobalPay payment processing account',
    serviceType: 'Managed SaaS',
  },
  {
    name: 'Altus Health - Gorev Production',
    parentOffering: 'Application Administration',
    description: 'Dedicated Instance - Gorev application stack for Altus Health',
    serviceType: 'Dedicated Instance',
  },
  {
    name: 'Altus Health - Imagine Production',
    parentOffering: 'Application Administration',
    description: 'Dedicated Instance - Imagine application stack for Altus Health',
    serviceType: 'Dedicated Instance',
  },
  {
    name: 'Altus Health - Medicus Production',
    parentOffering: 'Application Administration',
    description: 'Dedicated Instance - Medicus application stack for Altus Health',
    serviceType: 'Dedicated Instance',
  },
  {
    name: 'Altus Health - One Source Account',
    parentOffering: 'Application Administration',
    description: 'Managed SaaS - One Source account',
    serviceType: 'Managed SaaS',
  },
  {
    name: 'Altus Health - OnePACS Production',
    parentOffering: 'Application Administration',
    description: 'Dedicated Instance - OnePACS medical imaging system for Altus Health',
    serviceType: 'Dedicated Instance',
  },
  {
    name: 'Altus Health - TruBridge Production',
    parentOffering: 'Application Administration',
    description: 'Dedicated Instance - TruBridge application stack for Altus Health',
    serviceType: 'Dedicated Instance',
  },
  {
    name: 'Altus Health - ViaTrack Production',
    parentOffering: 'Application Administration',
    description: 'Dedicated Instance - ViaTrack application stack for Altus Health',
    serviceType: 'Dedicated Instance',
  },
  {
    name: 'Altus Health - VizTech Production',
    parentOffering: 'Application Administration',
    description: 'Dedicated Instance - VizTech application stack for Altus Health',
    serviceType: 'Dedicated Instance',
  },
  {
    name: 'Altus Health - WayStar Account',
    parentOffering: 'Application Administration',
    description: 'Managed SaaS - WayStar revenue cycle management account',
    serviceType: 'Managed SaaS',
  },
  {
    name: 'Altus Health - Magdou Health (PACS) Production',
    parentOffering: 'Application Administration',
    description: 'Dedicated Instance - Magdou Health PACS medical imaging system',
    serviceType: 'Dedicated Instance',
  },

  // Infrastructure and Cloud Management (5 services)
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
  {
    name: 'Altus Health - Endpoint Management Platform',
    parentOffering: 'Infrastructure and Cloud Management',
    description: 'Dedicated Instance - Endpoint management platform (Intune)',
    serviceType: 'Dedicated Instance',
  },
  {
    name: 'Altus Health - Active Directory',
    parentOffering: 'Infrastructure and Cloud Management',
    description: 'Dedicated Instance - Active Directory and Azure AD infrastructure',
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
  console.log('🏗️  STEP 2: Altus Health Application Services Setup');
  console.log('='.repeat(70));
  console.log('');

  // Get credentials (support both PROD and DEV env vars)
  const instanceUrl = process.env.SERVICENOW_URL || process.env.DEV_SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME || process.env.DEV_SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD || process.env.DEV_SERVICENOW_PASSWORD;
  const customerAccountNumber = process.env.CUSTOMER_ACCOUNT_NUMBER || 'ACCT0010145';

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured in .env.local');
    console.log('\nRequired variables (use either PROD or DEV prefix):');
    console.log('  - SERVICENOW_URL or DEV_SERVICENOW_URL');
    console.log('  - SERVICENOW_USERNAME or DEV_SERVICENOW_USERNAME');
    console.log('  - SERVICENOW_PASSWORD or DEV_SERVICENOW_PASSWORD');
    console.log('\nOptional:');
    console.log('  - CUSTOMER_ACCOUNT_NUMBER (default: ACCT0010145)');
    process.exit(1);
  }

  const environment = process.env.SERVICENOW_URL ? 'PRODUCTION' : 'DEV';

  console.log('Configuration:');
  console.log(`  Environment: ${environment}`);
  console.log(`  URL: ${instanceUrl}`);
  console.log(`  Username: ${username}`);
  console.log(`  Customer Account: ${customerAccountNumber}`);
  console.log('');

  // Create auth header
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  try {
    // ========================================
    // Phase 0: Query Customer Account
    // ========================================
    console.log('Phase 0: Lookup Customer Account');
    console.log('─'.repeat(70));

    const customerQueryUrl = `${instanceUrl}/api/now/table/customer_account?sysparm_query=${encodeURIComponent(`number=${customerAccountNumber}`)}&sysparm_limit=1`;

    const customerResponse = await fetch(customerQueryUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!customerResponse.ok) {
      throw new Error(`Failed to query customer account: ${customerResponse.status}`);
    }

    const customerData = await customerResponse.json();

    if (!customerData.result || customerData.result.length === 0) {
      console.error(`❌ Customer Account "${customerAccountNumber}" not found`);
      console.error('   Please ensure the customer account exists in ServiceNow');
      process.exit(1);
    }

    const customerSysId = customerData.result[0].sys_id;
    const customerName = customerData.result[0].name;
    console.log(`✅ Found: "${customerName}"`);
    console.log(`   Number: ${customerAccountNumber}`);
    console.log(`   sys_id: ${customerSysId}`);
    console.log('');

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
      const queryUrl = `${instanceUrl}/api/now/table/service_offering?sysparm_query=${encodeURIComponent(`name=${offeringName}`)}&sysparm_limit=1`;

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
    let ciRelCreatedCount = 0;
    let ciRelFoundCount = 0;

    for (const appService of applicationServices) {
      // Add delay between operations to help auto-numbering settle
      if (createdCount > 0) {
        console.log('   Waiting 2 seconds for numbering system...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Check if Application Service exists
      const queryUrl = `${instanceUrl}/api/now/table/cmdb_ci_service_discovered?sysparm_query=${encodeURIComponent(`name=${appService.name}`)}&sysparm_limit=1`;

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
        const parentSysId = offeringSysIds.get(appService.parentOffering);
        console.log(`✅ Found: "${appService.name}"`);
        console.log(`   sys_id: ${sysId}`);
        console.log(`   type: ${appService.serviceType}`);

        // Check if CI relationship exists
        if (parentSysId) {
          const ciRelCheckUrl = `${instanceUrl}/api/now/table/cmdb_rel_ci?sysparm_query=${encodeURIComponent(`parent=${parentSysId}^child=${sysId}`)}&sysparm_limit=1`;
          const ciRelCheckResponse = await fetch(ciRelCheckUrl, {
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
            },
          });

          if (ciRelCheckResponse.ok) {
            const ciRelCheckData = await ciRelCheckResponse.json();
            if (ciRelCheckData.result && ciRelCheckData.result.length > 0) {
              ciRelFoundCount++;
            } else {
              // Create missing CI relationship
              const ciRelPayload = {
                parent: parentSysId,
                child: sysId,
                type: 'Contains::Contained by',
              };

              const ciRelCreateResponse = await fetch(`${instanceUrl}/api/now/table/cmdb_rel_ci`, {
                method: 'POST',
                headers: {
                  'Authorization': authHeader,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(ciRelPayload),
              });

              if (ciRelCreateResponse.ok) {
                ciRelCreatedCount++;
                console.log(`   ✨ Created CI Relationship`);
              }
            }
          }
        }
      } else {
        // Create new Application Service
        const parentSysId = offeringSysIds.get(appService.parentOffering);
        if (!parentSysId) {
          throw new Error(`Parent offering sys_id not found for: ${appService.parentOffering}`);
        }

        const createUrl = `${instanceUrl}/api/now/table/cmdb_ci_service_discovered`;
        const payload = {
          name: appService.name,
          short_description: appService.description,
          parent: parentSysId, // Link to Service Offering
          operational_status: '1', // Set to Operational
          company: customerSysId, // Link to Customer Account (Altus - who owns/uses the service)
          vendor: '2d6a47c7870011100fadcbb6dabb35fb', // Mobiz IT (who provides/manages the service)
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

        // Create CI relationship for newly created Application Service
        const ciRelPayload = {
          parent: parentSysId,
          child: createData.result.sys_id,
          type: 'Contains::Contained by',
        };

        const ciRelCreateResponse = await fetch(`${instanceUrl}/api/now/table/cmdb_rel_ci`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(ciRelPayload),
        });

        if (ciRelCreateResponse.ok) {
          ciRelCreatedCount++;
          console.log(`   ✨ Created CI Relationship`);
        } else {
          console.log(`   ⚠️  Failed to create CI relationship`);
        }
      }
    }

    console.log('');
    console.log('─'.repeat(70));
    console.log('📊 Summary:');
    console.log(`   Application Services: ${applicationServices.length} total`);
    console.log(`     - Found existing: ${foundCount}`);
    console.log(`     - Created new: ${createdCount}`);
    console.log(`   CI Relationships: ${ciRelFoundCount + ciRelCreatedCount} total`);
    console.log(`     - Found existing: ${ciRelFoundCount}`);
    console.log(`     - Created new: ${ciRelCreatedCount}`);
    console.log('');
    console.log('   By Service Offering:');
    console.log('     - Application Administration: 18 services');
    console.log('     - Infrastructure and Cloud Management: 5 services');
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
