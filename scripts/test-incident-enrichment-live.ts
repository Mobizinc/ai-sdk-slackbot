/**
 * Test Incident Enrichment Against Real Incident
 * Tests the enrichment flow with INC0168085
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Set SERVICENOW_INSTANCE_URL from SERVICENOW_URL if not set
if (!process.env.SERVICENOW_INSTANCE_URL && process.env.SERVICENOW_URL) {
  process.env.SERVICENOW_INSTANCE_URL = process.env.SERVICENOW_URL;
}

import { serviceNowClient } from '../lib/tools/servicenow';
import { getIncidentNoteAnalyzerService } from '../lib/services/incident-note-analyzer';
import { getCIMatchingService } from '../lib/services/ci-matching-service';

async function testEnrichment() {
  console.log('🧪 Testing Incident Enrichment Against INC0168085');
  console.log('='.repeat(70));
  console.log('');

  const incidentNumber = 'INC0168085';

  try {
    // Step 1: Fetch incident
    console.log('📥 Step 1: Fetching incident from ServiceNow...');
    const incident = await serviceNowClient.getIncident(incidentNumber);

    if (!incident) {
      console.error('❌ Incident not found');
      process.exit(1);
    }

    console.log(`✅ Found: ${incident.number}`);
    console.log(`   Description: ${incident.short_description?.substring(0, 100)}...`);
    console.log('');

    // Step 2: Fetch work notes
    console.log('📥 Step 2: Fetching work notes...');
    const workNotes = await serviceNowClient.getIncidentWorkNotes(incident.sys_id, { limit: 10 });
    console.log(`✅ Found ${workNotes.length} work notes`);
    console.log('');

    // Step 3: Run LLM analysis
    console.log('🤖 Step 3: Running LLM analysis (Haiku 4.5)...');
    const noteAnalyzer = getIncidentNoteAnalyzerService();
    const analysisResult = await noteAnalyzer.analyzeNotes(
      incidentNumber,
      incident.short_description || "",
      workNotes
        .filter(note => note.value)
        .map(note => ({
          value: note.value || "",
          sys_created_on: note.sys_created_on,
          sys_created_by: note.sys_created_by,
        })),
      "claude-haiku-4-5"
    );

    console.log('✅ Analysis complete');
    console.log('');
    console.log('📊 RESULTS:');
    console.log('─'.repeat(70));
    console.log(`Summary: ${analysisResult.summary}`);
    console.log(`Confidence: ${(analysisResult.confidence * 100).toFixed(1)}%`);
    console.log(`Intent: ${analysisResult.intent?.issue_type || 'unknown'}`);
    console.log(`Intent Reasoning: ${analysisResult.intent?.reasoning || 'N/A'}`);
    console.log('');
    console.log('Extracted Entities:');
    console.log(`  IPs: ${analysisResult.entities.ip_addresses?.length || 0} - ${JSON.stringify(analysisResult.entities.ip_addresses || [])}`);
    console.log(`  Hostnames: ${analysisResult.entities.hostnames?.length || 0} - ${JSON.stringify(analysisResult.entities.hostnames || [])}`);
    console.log(`  Systems: ${analysisResult.entities.system_names?.length || 0} - ${JSON.stringify(analysisResult.entities.system_names || [])}`);
    console.log(`  Account Numbers: ${analysisResult.entities.account_numbers?.length || 0} - ${JSON.stringify(analysisResult.entities.account_numbers || [])}`);
    console.log('');
    console.log(`Tokens Used: ${analysisResult.tokenUsage?.total || 0} (Input: ${analysisResult.tokenUsage?.input}, Output: ${analysisResult.tokenUsage?.output})`);
    console.log('');

    // Step 4: CI Matching
    console.log('🔍 Step 4: Matching CIs in CMDB...');
    const ciMatcher = getCIMatchingService();
    const matchingResult = await ciMatcher.matchEntities(analysisResult.entities);

    console.log(`✅ Found ${matchingResult.matches.length} potential matches`);
    console.log(`   High confidence (≥70%): ${matchingResult.highConfidenceMatches.length}`);
    console.log(`   Low confidence (<70%): ${matchingResult.lowConfidenceMatches.length}`);
    console.log('');

    if (matchingResult.matches.length > 0) {
      console.log('Top Matches:');
      matchingResult.matches.slice(0, 5).forEach((match, i) => {
        console.log(`  ${i + 1}. ${match.name} (${match.class}) - ${match.confidence}% confidence`);
        console.log(`     Reason: ${match.match_reason}`);
      });
    } else {
      console.log('No CI matches found.');
    }
    console.log('');

    // Step 5: Recommendation
    console.log('💡 Step 5: Enrichment Recommendation:');
    console.log('─'.repeat(70));

    if (analysisResult.intent?.issue_type === 'external_dependency') {
      console.log('✋ SKIP CI MATCHING');
      console.log('   This is an external dependency issue (ISP/carrier)');
      console.log('   No CI linking needed');
    } else if (matchingResult.highConfidenceMatches.length > 0) {
      const topMatch = matchingResult.highConfidenceMatches[0];
      console.log('✅ AUTO-LINK CI');
      console.log(`   Would link: ${topMatch.name}`);
      console.log(`   Confidence: ${topMatch.confidence}%`);
      console.log(`   Class: ${topMatch.class}`);
    } else if (matchingResult.lowConfidenceMatches.length > 0) {
      console.log('❓ REQUEST CLARIFICATION');
      console.log(`   Would send Slack message with ${matchingResult.lowConfidenceMatches.length} options`);
    } else {
      console.log('📝 ADD NOTE ONLY');
      console.log('   No CI matches - would add enrichment note without CI link');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testEnrichment()
  .catch(console.error)
  .finally(() => process.exit(0));
