/**
 * Test Deployed ServiceNow Webhook
 * Fetches a real case from ServiceNow and sends it to the deployed webhook endpoint
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createHmac } from 'crypto';

// Load env vars FIRST
config({ path: resolve(process.cwd(), '.env.local') });

// CRITICAL: Set SERVICENOW_INSTANCE_URL before importing ServiceNow client
// The client reads this at module load time
if (!process.env.SERVICENOW_INSTANCE_URL && process.env.SERVICENOW_URL) {
  process.env.SERVICENOW_INSTANCE_URL = process.env.SERVICENOW_URL;
}

async function testDeployedWebhook(caseNumber: string) {
  // Import ServiceNow client dynamically after env vars are set
  const { serviceNowClient } = await import('../lib/tools/servicenow');
  console.log('🧪 Testing Deployed ServiceNow Webhook');
  console.log('======================================\n');
  console.log(`Case Number: ${caseNumber}`);
  console.log(`Webhook URL: https://slack.mobiz.solutions/api/servicenow-webhook\n`);

  // Step 1: Fetch case from ServiceNow
  console.log('📋 Step 1: Fetching case from ServiceNow...');

  let caseData;
  try {
    caseData = await serviceNowClient.getCase(caseNumber);

    if (!caseData) {
      console.error(`❌ Case ${caseNumber} not found in ServiceNow`);
      process.exit(1);
    }

    console.log(`✅ Case fetched: ${caseData.number}`);
    console.log(`   Description: ${caseData.short_description?.substring(0, 60)}...`);
    console.log(`   State: ${caseData.state || 'Unknown'}`);
    console.log(`   Priority: ${caseData.priority || 'Unknown'}`);
    console.log(`   Assignment Group: ${caseData.assignment_group || 'Unassigned'}`);
  } catch (error) {
    console.error('❌ Failed to fetch case:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Step 2: Build webhook payload
  console.log('\n📝 Step 2: Building webhook payload...');

  // Helper to extract string value (handles ServiceNow object/string fields)
  function getString(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value.display_value) return value.display_value;
    if (typeof value === 'object' && value.value) return value.value;
    return String(value);
  }

  // Helper to convert ServiceNow datetime to ISO 8601
  function toISODateTime(value: any): string | undefined {
    const str = getString(value);
    if (!str) return undefined;

    // ServiceNow format: "2025-10-09 14:23:45" → ISO: "2025-10-09T14:23:45Z"
    if (str.includes(' ') && !str.includes('T')) {
      return str.replace(' ', 'T') + 'Z';
    }

    // Already in ISO format
    if (str.includes('T')) {
      return str.endsWith('Z') ? str : str + 'Z';
    }

    return undefined;
  }

  const webhookPayload: any = {
    case_number: getString(caseData.number),
    sys_id: getString(caseData.sys_id),
    short_description: getString(caseData.short_description),
    description: getString(caseData.description),
    priority: getString(caseData.priority),
    state: getString(caseData.state),
    category: getString(caseData.category),
    subcategory: getString(caseData.subcategory),
    assignment_group: getString(caseData.assignment_group),
  };

  // Add opened_at only if valid
  const openedAt = toISODateTime(caseData.opened_at);
  if (openedAt) {
    webhookPayload.opened_at = openedAt;
  }

  console.log('✅ Payload built');
  console.log(`   Fields: ${Object.keys(webhookPayload).length}`);
  console.log(`   Case Number: ${webhookPayload.case_number}`);
  console.log(`   Description: ${webhookPayload.short_description.substring(0, 50)}...`);

  // Step 3: Generate HMAC signature
  console.log('\n🔐 Step 3: Generating HMAC signature...');

  const webhookSecret = process.env.SERVICENOW_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('❌ SERVICENOW_WEBHOOK_SECRET not configured');
    process.exit(1);
  }

  const payloadJson = JSON.stringify(webhookPayload);
  const signature = createHmac('sha256', webhookSecret)
    .update(payloadJson)
    .digest('hex');

  console.log('✅ Signature generated');
  console.log(`   Algorithm: HMAC-SHA256`);
  console.log(`   Signature: ${signature.substring(0, 16)}...`);

  // Step 4: Send webhook to deployed endpoint
  console.log('\n🚀 Step 4: Sending webhook to deployed endpoint...');
  console.log('   URL: https://slack.mobiz.solutions/api/servicenow-webhook');

  const startTime = Date.now();

  try {
    const response = await fetch('https://slack.mobiz.solutions/api/servicenow-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-servicenow-signature': signature,
      },
      body: payloadJson,
    });

    const responseTime = Date.now() - startTime;
    const responseData = await response.json();

    console.log(`\n📊 Response received (${responseTime}ms):`);
    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      console.error('❌ Webhook failed');
      console.error('   Response:', JSON.stringify(responseData, null, 2));
      process.exit(1);
    }

    console.log('\n✅ Webhook processed successfully!\n');

    // Display results
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 CLASSIFICATION RESULTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`Case: ${responseData.case_number}`);
    console.log(`Workflow: ${responseData.workflow_id}`);
    console.log(`Cached: ${responseData.cached ? 'YES' : 'NO'}${responseData.cache_reason ? ' (' + responseData.cache_reason + ')' : ''}`);
    console.log(`Processing Time: ${Math.round(responseData.processing_time_ms)}ms\n`);

    const classification = responseData.classification;
    console.log(`Category: ${classification.category}`);
    if (classification.subcategory) {
      console.log(`Subcategory: ${classification.subcategory}`);
    }
    console.log(`Confidence: ${Math.round((classification.confidence_score || 0) * 100)}%`);
    console.log(`Urgency: ${classification.urgency_level || 'Not assessed'}\n`);

    if (classification.quick_summary) {
      console.log(`Summary: ${classification.quick_summary}\n`);
    }

    if (classification.immediate_next_steps?.length) {
      console.log('Next Steps:');
      classification.immediate_next_steps.slice(0, 3).forEach((step: string, i: number) => {
        console.log(`  ${i + 1}. ${step.substring(0, 80)}...`);
      });
      console.log('');
    }

    // Similar cases
    if (responseData.similar_cases?.length) {
      console.log(`Similar Cases Found: ${responseData.similar_cases.length}`);
      responseData.similar_cases.slice(0, 3).forEach((sc: any, i: number) => {
        const label = sc.same_client ? '[Your Org]' :
                     sc.client_name ? `[${sc.client_name}]` : '[Other]';
        console.log(`  ${i + 1}. ${sc.case_number} ${label} - Score: ${sc.similarity_score?.toFixed(2)}`);
      });
      console.log('');
    }

    // Entities
    if (responseData.entities_discovered > 0) {
      console.log(`Entities Discovered: ${responseData.entities_discovered}`);
      const entities = classification.technical_entities;
      if (entities) {
        if (entities.ip_addresses?.length) console.log(`  IPs: ${entities.ip_addresses.join(', ')}`);
        if (entities.systems?.length) console.log(`  Systems: ${entities.systems.join(', ')}`);
        if (entities.users?.length) console.log(`  Users: ${entities.users.join(', ')}`);
      }
      console.log('');
    }

    console.log(`ServiceNow Updated: ${responseData.servicenow_updated ? '✅ YES' : '❌ NO'}`);
    if (responseData.update_error) {
      console.log(`Update Error: ${responseData.update_error}`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ TEST COMPLETE - Check ServiceNow case for work note');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ Webhook request failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const caseNumber = process.argv[2] || 'SCS0048813';
testDeployedWebhook(caseNumber);
