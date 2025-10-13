/**
 * Test Business Context Lookup
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

// Set SERVICENOW_INSTANCE_URL before importing
if (!process.env.SERVICENOW_INSTANCE_URL && process.env.SERVICENOW_URL) {
  process.env.SERVICENOW_INSTANCE_URL = process.env.SERVICENOW_URL;
}

async function testBusinessContext() {
  const { serviceNowClient } = await import('../lib/tools/servicenow');
  const { getBusinessContextService } = await import('../lib/services/business-context-service');

  // Fetch the case
  const caseData = await serviceNowClient.getCase('SCS0048813');
  if (!caseData) {
    console.log('❌ Case not found');
    return;
  }

  console.log('📋 Case Details:');
  console.log('  Number:', caseData.number);
  console.log('  Short Desc:', caseData.short_description?.substring(0, 50));
  console.log('  Company field:', caseData.company || 'Not set');
  console.log('');

  // Try to get business context
  const businessService = getBusinessContextService();

  // Try different company lookups
  const lookups = [
    caseData.company,
    'Neighbors',
    'Neighbors Emergency Center',
    'NEC'
  ].filter(Boolean);

  console.log('🔍 Testing business context lookups:\n');

  for (const lookup of lookups) {
    const context = await businessService.getContextForCompany(lookup as string);
    if (context) {
      console.log(`✅ Found context for: "${lookup}"`);
      console.log('   Entity Name:', context.entityName);
      console.log('   Type:', context.entityType);
      console.log('   Industry:', context.industry || 'N/A');
      console.log('   Technology:', context.technologyPortfolio?.substring(0, 60) + '...');
      console.log('');

      const promptText = businessService.toPromptText(context);
      console.log('━━━ Prompt Text (what goes to LLM) ━━━');
      console.log(promptText);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      break;
    } else {
      console.log(`❌ No context for: "${lookup}"`);
    }
  }
}

testBusinessContext();
