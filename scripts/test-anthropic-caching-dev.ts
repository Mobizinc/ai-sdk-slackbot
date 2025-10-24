/**
 * Test Anthropic Caching on Vercel Dev Deployment
 * Fetches a real case from ServiceNow DEV and sends it to the Vercel dev webhook
 * to validate Anthropic API integration with prompt caching
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createHmac } from 'crypto';

// Load env vars from parent directory's .env.local
const envPath = resolve(process.cwd(), '../ai-sdk-slackbot/.env.local');
config({ path: envPath });

console.log(`📁 Loading environment from: ${envPath}\n`);

// CRITICAL: Set DEV ServiceNow instance credentials
if (!process.env.SERVICENOW_INSTANCE_URL && process.env.DEV_SERVICENOW_URL) {
  process.env.SERVICENOW_INSTANCE_URL = process.env.DEV_SERVICENOW_URL;
  process.env.SERVICENOW_USERNAME = process.env.DEV_SERVICENOW_USERNAME;
  process.env.SERVICENOW_PASSWORD = process.env.DEV_SERVICENOW_PASSWORD;
  process.env.SERVICENOW_CASE_TABLE = process.env.DEV_SERVICENOW_CASE_TABLE;
  console.log(`🔧 Using ServiceNow DEV instance: ${process.env.DEV_SERVICENOW_URL}`);
}

const WEBHOOK_URL = 'https://ai-sdk-slackbot-im4mfgyf9-mobiz.vercel.app/api/servicenow-webhook';

async function testAnthropicCaching(caseNumber: string) {
  // Import ServiceNow client dynamically after env vars are set
  const { serviceNowClient } = await import('../lib/tools/servicenow');

  console.log('🧪 Testing Anthropic Caching on Vercel Dev Deployment');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`Case Number: ${caseNumber}`);
  console.log(`Source: ServiceNow DEV (${process.env.DEV_SERVICENOW_URL})`);
  console.log(`Webhook URL: ${WEBHOOK_URL}\n`);

  // Step 1: Fetch case from ServiceNow DEV
  console.log('📋 Step 1: Fetching case from ServiceNow DEV...');

  let caseData;
  try {
    caseData = await serviceNowClient.getCase(caseNumber);

    if (!caseData) {
      console.error(`❌ Case ${caseNumber} not found in ServiceNow DEV`);
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
    company: getString(caseData.company),
    account: getString(caseData.account),
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

  // Step 4: Send webhook to Vercel dev deployment
  console.log('\n🚀 Step 4: Sending webhook to Vercel dev deployment...');
  console.log(`   URL: ${WEBHOOK_URL}`);

  const startTime = Date.now();

  try {
    const response = await fetch(WEBHOOK_URL, {
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

    // Handle async processing (202 Accepted)
    if (response.status === 202) {
      console.log('\n⏳ Webhook accepted - processing asynchronously (QStash queue)\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📋 ASYNC PROCESSING');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log(`Case: ${webhookPayload.case_number}`);
      console.log(`Status: Queued for processing`);
      console.log(`Queue: QStash async worker\n`);

      console.log('📊 To view results:');
      console.log(`   1. Check ServiceNow DEV case ${caseNumber} for work note (30-60s)`);
      console.log('   2. Check Vercel logs for cache metrics:');
      console.log('      https://vercel.com/mobiz/ai-sdk-slackbot/logs');
      console.log('   3. Look for log entries with cache metrics:');
      console.log('      - "Cache write: XXX tokens"');
      console.log('      - "Cache read: XXX tokens"');
      console.log('      - "Hit rate: XX.X%"\n');

      console.log('💡 Run this command again in 60 seconds to test cache hits!\n');
      console.log('✅ TEST COMPLETE (async mode)\n');
      return;
    }

    console.log('\n✅ Webhook processed successfully!\n');

    // Handle sync processing (200 OK)
    if (!responseData.classification) {
      console.error('❌ No classification data in response');
      console.error('   Response:', JSON.stringify(responseData, null, 2));
      process.exit(1);
    }

    // Display results
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 CLASSIFICATION RESULTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`Case: ${responseData.case_number}`);
    console.log(`Workflow: ${responseData.workflow_id || 'default'}`);
    console.log(`Cached: ${responseData.cached ? 'YES' : 'NO'}${responseData.cache_reason ? ' (' + responseData.cache_reason + ')' : ''}`);
    console.log(`Processing Time: ${Math.round(responseData.processing_time_ms)}ms\n`);

    const classification = responseData.classification;
    console.log(`Category: ${classification.category}`);
    if (classification.subcategory) {
      console.log(`Subcategory: ${classification.subcategory}`);
    }

    // NEW: Show incident/problem category if dual categorization
    if (classification.incident_category) {
      console.log(`Incident Category: ${classification.incident_category}`);
      if (classification.incident_subcategory) {
        console.log(`Incident Subcategory: ${classification.incident_subcategory}`);
      }
    }

    console.log(`Confidence: ${Math.round((classification.confidence_score || 0) * 100)}%`);
    console.log(`Urgency: ${classification.urgency_level || 'Not assessed'}\n`);

    // NEW: Display Anthropic cache metrics
    if (classification.cache_creation_input_tokens !== undefined ||
        classification.cache_read_input_tokens !== undefined) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎯 ANTHROPIC CACHE METRICS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      const inputTokens = classification.token_usage_input || 0;
      const outputTokens = classification.token_usage_output || 0;
      const cacheWriteTokens = classification.cache_creation_input_tokens || 0;
      const cacheReadTokens = classification.cache_read_input_tokens || 0;
      const cacheHitRate = classification.cache_hit_rate || 0;

      console.log(`Model: ${classification.model_used || 'unknown'}`);
      console.log(`Provider: ${classification.llm_provider || 'unknown'}\n`);

      console.log(`Input Tokens: ${inputTokens.toLocaleString()}`);
      console.log(`Output Tokens: ${outputTokens.toLocaleString()}`);
      console.log(`Total Tokens: ${(inputTokens + outputTokens).toLocaleString()}\n`);

      console.log(`Cache Write: ${cacheWriteTokens.toLocaleString()} tokens`);
      console.log(`Cache Read: ${cacheReadTokens.toLocaleString()} tokens`);
      console.log(`Cache Hit Rate: ${cacheHitRate.toFixed(1)}%\n`);

      // Calculate cost comparison
      const PRICING = {
        input: 3.00,         // $3.00 per million tokens
        output: 15.00,       // $15.00 per million tokens
        cache_write: 3.75,   // $3.75 per million tokens (25% premium)
        cache_read: 0.30,    // $0.30 per million tokens (90% savings)
      };

      // Cost WITHOUT caching (all input at normal rate)
      const totalInputTokens = inputTokens + cacheReadTokens;
      const costWithoutCaching = (
        (totalInputTokens / 1_000_000) * PRICING.input +
        (outputTokens / 1_000_000) * PRICING.output
      );

      // Cost WITH caching
      const costWithCaching = (
        (inputTokens / 1_000_000) * PRICING.input +
        (cacheWriteTokens / 1_000_000) * PRICING.cache_write +
        (cacheReadTokens / 1_000_000) * PRICING.cache_read +
        (outputTokens / 1_000_000) * PRICING.output
      );

      const savings = costWithoutCaching - costWithCaching;
      const savingsPercent = costWithoutCaching > 0
        ? ((savings / costWithoutCaching) * 100)
        : 0;

      console.log('💰 COST ANALYSIS:');
      console.log(`   Without caching: $${costWithoutCaching.toFixed(4)}`);
      console.log(`   With caching:    $${costWithCaching.toFixed(4)}`);
      console.log(`   Savings:         $${savings.toFixed(4)} (${savingsPercent.toFixed(1)}%)\n`);

      // Cache effectiveness assessment
      if (cacheHitRate >= 75) {
        console.log('✅ Excellent cache performance! 75%+ hit rate');
      } else if (cacheHitRate >= 50) {
        console.log('✅ Good cache performance. 50%+ hit rate');
      } else if (cacheHitRate > 0) {
        console.log('⚠️  Low cache hit rate. May be first request or similar cases changed.');
      } else if (cacheWriteTokens > 0) {
        console.log('📝 Cache write request (first request for this prompt)');
        console.log('   Next request should show high cache hit rate.');
      }
    } else {
      console.log('\n⚠️  NO CACHE METRICS FOUND');
      console.log('   This request may not be using Anthropic API with caching.');
      console.log(`   Provider: ${classification.llm_provider || 'unknown'}\n`);
    }

    // Standard output
    if (classification.quick_summary) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📝 SUMMARY');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log(classification.quick_summary + '\n');
    }

    if (classification.immediate_next_steps?.length) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔧 NEXT STEPS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      classification.immediate_next_steps.forEach((step: string, i: number) => {
        console.log(`${i + 1}. ${step}\n`);
      });
    }

    // Similar cases
    if (responseData.similar_cases?.length) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📚 SIMILAR CASES (${responseData.similar_cases.length} found)`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      responseData.similar_cases.slice(0, 5).forEach((sc: any, i: number) => {
        const label = sc.same_client ? '[Same Client]' :
                     sc.client_name ? `[${sc.client_name}]` : '[Different Client]';
        console.log(`${i + 1}. ${sc.case_number} ${label}`);
        console.log(`   Similarity: ${(sc.similarity_score || 0).toFixed(2)}`);
        console.log(`   ${(sc.short_description || sc.description || '').substring(0, 80)}...\n`);
      });
    }

    // Record type suggestion
    if (classification.record_type_suggestion) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎫 RECORD TYPE SUGGESTION');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      const suggestion = classification.record_type_suggestion;
      console.log(`Type: ${suggestion.type}`);
      if (suggestion.type === 'Incident') {
        console.log(`Major Incident: ${suggestion.is_major_incident ? 'YES' : 'NO'}`);
      }
      console.log(`Reasoning: ${suggestion.reasoning}\n`);

      // Show if incident/problem was created
      if (responseData.incident_created) {
        console.log(`✅ Incident Created: ${responseData.incident_number}`);
        if (responseData.incident_url) {
          console.log(`   URL: ${responseData.incident_url}`);
        }
      }
      if (responseData.problem_created) {
        console.log(`✅ Problem Created: ${responseData.problem_number}`);
        if (responseData.problem_url) {
          console.log(`   URL: ${responseData.problem_url}`);
        }
      }
      console.log('');
    }

    // Entities
    if (responseData.entities_discovered > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🔍 ENTITIES DISCOVERED (${responseData.entities_discovered})`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      const entities = classification.technical_entities;
      if (entities) {
        if (entities.ip_addresses?.length) {
          console.log(`IP Addresses: ${entities.ip_addresses.join(', ')}`);
        }
        if (entities.systems?.length) {
          console.log(`Systems: ${entities.systems.join(', ')}`);
        }
        if (entities.users?.length) {
          console.log(`Users: ${entities.users.join(', ')}`);
        }
        if (entities.software?.length) {
          console.log(`Software: ${entities.software.join(', ')}`);
        }
        if (entities.error_codes?.length) {
          console.log(`Error Codes: ${entities.error_codes.join(', ')}`);
        }
      }
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`ServiceNow Updated: ${responseData.servicenow_updated ? '✅ YES' : '❌ NO'}`);
    if (responseData.update_error) {
      console.log(`Update Error: ${responseData.update_error}`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('✅ TEST COMPLETE');
    console.log(`   Check ServiceNow DEV case ${caseNumber} for work note\n`);

  } catch (error) {
    console.error('\n❌ Webhook request failed:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Get case number from command line or use default
const caseNumber = process.argv[2] || 'SCS0048813';

console.log('💡 TIP: Run this command twice to see cache hit improvement!\n');
console.log('   First run:  Cache write (0% hit rate, higher cost)');
console.log('   Second run: Cache read (75%+ hit rate, 70% cost savings)\n');

testAnthropicCaching(caseNumber);
