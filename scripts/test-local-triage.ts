/**
 * Test Local Triage with ALL Fixes
 * Shows ACTUAL output, not predictions
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

if (!process.env.SERVICENOW_INSTANCE_URL && process.env.SERVICENOW_URL) {
  process.env.SERVICENOW_INSTANCE_URL = process.env.SERVICENOW_URL;
}

async function testLocalTriage() {
  const { serviceNowClient } = await import('../lib/tools/servicenow');
  const { getCaseTriageService } = await import('../lib/services/case-triage');

  console.log('🧪 Testing LOCAL Classification with ALL Fixes');
  console.log('==============================================\n');

  // Fetch real case
  const caseNumber = process.argv[2] || 'SCS0048813';
  const caseData = await serviceNowClient.getCase(caseNumber);
  if (!caseData) {
    console.log(`❌ Case ${caseNumber} not found`);
    return;
  }

  console.log('Case:', caseData.number);
  console.log('Description:', caseData.short_description?.substring(0, 60));
  console.log('\n⏳ Running local triage (this will take 20-40 seconds)...\n');

  const webhookPayload: any = {
    case_number: caseData.number,
    sys_id: caseData.sys_id,
    short_description: caseData.short_description || '',
    description: caseData.description || '',
    priority: caseData.priority || '',
    state: caseData.state || '',
    category: caseData.category || '',
    assignment_group: caseData.assignment_group || '',
  };

  const triageService = getCaseTriageService();
  const result = await triageService.triageCase(webhookPayload, {
    enableCaching: false, // Force fresh classification
    enableSimilarCases: true,
    enableKBArticles: true,
    enableBusinessContext: true,
    enableWorkflowRouting: true,
    writeToServiceNow: false, // Don't write during local test
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 ACTUAL LOCAL TEST RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Category:', result.classification.category);
  console.log('Subcategory:', result.classification.subcategory || 'None');
  console.log('Confidence:', Math.round((result.classification.confidence_score || 0) * 100) + '%');
  console.log('Urgency:', result.classification.urgency_level);
  console.log('');

  if (result.classification.quick_summary) {
    console.log('━━━ SUMMARY ━━━');
    console.log(result.classification.quick_summary);
    console.log('');
  }

  if (result.classification.immediate_next_steps) {
    console.log('━━━ NEXT STEPS ━━━');
    result.classification.immediate_next_steps.forEach((step, i) => {
      console.log(`${i + 1}. ${step}`);
    });
    console.log('');
  }

  console.log(`━━━ SIMILAR CASES (${result.similarCases.length}) ━━━`);
  result.similarCases.forEach((sc, i) => {
    const label = sc.same_client
      ? '[Your Organization]'
      : sc.client_name
      ? `[${sc.client_name}]`
      : '[Different Client]';
    console.log(`${i + 1}. ${sc.case_number} ${label} - Score: ${sc.similarity_score?.toFixed(4) || 'N/A'}`);
    console.log(`   ${sc.short_description || 'N/A'}`);
  });
  console.log('');

  console.log(`━━━ KB ARTICLES (${result.kbArticles.length}) ━━━`);
  result.kbArticles.forEach((kb, i) => {
    console.log(`${i + 1}. ${kb.kb_number || 'N/A'} - ${kb.title || 'N/A'}`);
  });
  console.log('');

  if (result.classification.technical_entities) {
    const entities = result.classification.technical_entities;
    console.log('━━━ ENTITIES DISCOVERED ━━━');
    if (entities.systems?.length) console.log(`Systems: ${entities.systems.join(', ')}`);
    if (entities.users?.length) console.log(`Users: ${entities.users.join(', ')}`);
    if (entities.ip_addresses?.length) console.log(`IPs: ${entities.ip_addresses.join(', ')}`);
    console.log('');
  }

  console.log(`Processing Time: ${result.processingTimeMs}ms`);
  console.log(`Entities Discovered: ${result.entitiesDiscovered}`);
}

testLocalTriage().catch(console.error);
