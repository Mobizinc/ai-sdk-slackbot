/**
 * Direct Test of Incident Enrichment Logic
 * Bypasses config system, directly tests with incident description
 */

import { config as loadEnv } from "dotenv";

loadEnv();
loadEnv({ path: ".env.local", override: true });

import { getAnthropicClient } from '../lib/anthropic-provider';

async function testDirectEnrichment() {
  console.log('🧪 Direct Test: Incident Enrichment with Real Incident Text');
  console.log('='.repeat(70));
  console.log('');

  const incidentDescription = `Keep losing Internet connection, computer lagging. Scan images into GoRev/EPower images never load du to lot connection with server etc.... This is the main registration computer and it causes problems when trying to check a patient in. Having to rescan everything, sometimes having to reboot computer to get anything to work.`;

  console.log('📝 Incident Description:');
  console.log(incidentDescription);
  console.log('');

  const systemPrompt = `You are a technical entity extraction specialist for IT service management. Your task is to extract technical entities AND classify the issue type.

**1. EXTRACT ENTITIES:**
- IP Addresses (IPv4/IPv6)
- Hostnames (FQDNs, server names)
- Edge/Network Device Names (VeloCloud edges, routers, switches)
- Error Messages (error codes, stack traces)
- System Names (servers, services, applications)
- Account Numbers (ACCT + 7 digits, e.g., ACCT0242146)

**2. CLASSIFY ISSUE TYPE:**
- "internal_ci" - Problem with managed infrastructure (server down, firewall issue, application crash)
- "external_dependency" - ISP issue, carrier problem, external service outage, payment/billing
- "hybrid" - Both internal CI and external component involved
- "unknown" - Cannot determine from description

**EXTERNAL KEYWORDS:** ISP, internet provider, carrier, billing, payment, external service, cloud provider outage, VeloCloud orchestrator, third-party

Return JSON:
{
  "ip_addresses": [],
  "hostnames": [],
  "edge_names": [],
  "error_messages": [],
  "system_names": [],
  "account_numbers": [],
  "summary": "Brief 1-2 sentence summary",
  "confidence": 0.85,
  "intent": {
    "issue_type": "internal_ci",
    "confidence": 0.9,
    "reasoning": "Server crash mentioned",
    "external_providers": [{"type": "ISP", "name": "AT&T"}]
  }
}

Rules:
- Only extract explicitly mentioned entities
- Normalize IPs (remove ports/CIDR)
- Confidence 0-1.0 based on clarity
- If ISP/billing mentioned → external_dependency
- If managed CI mentioned → internal_ci`;

  console.log('🤖 Calling Claude Haiku 4.5...');
  const anthropic = getAnthropicClient();

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: "user", content: `Short Description: ${incidentDescription}` }],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type");
  }

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.log('Raw response:', content.text);
    throw new Error("Failed to extract JSON from response");
  }

  const result = JSON.parse(jsonMatch[0]);

  console.log('✅ Analysis Complete');
  console.log('');
  console.log('📊 RESULTS:');
  console.log('─'.repeat(70));
  console.log(`Summary: ${result.summary}`);
  console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  console.log(`Intent Type: ${result.intent?.issue_type || 'unknown'}`);
  console.log(`Intent Confidence: ${((result.intent?.confidence || 0) * 100).toFixed(1)}%`);
  console.log(`Intent Reasoning: ${result.intent?.reasoning || 'N/A'}`);
  console.log('');
  console.log('Extracted Entities:');
  console.log(`  IPs: ${result.ip_addresses?.length || 0} - ${JSON.stringify(result.ip_addresses || [])}`);
  console.log(`  Hostnames: ${result.hostnames?.length || 0} - ${JSON.stringify(result.hostnames || [])}`);
  console.log(`  Systems: ${result.system_names?.length || 0} - ${JSON.stringify(result.system_names || [])}`);
  console.log(`  Account Numbers: ${result.account_numbers?.length || 0}`);
  console.log('');
  console.log(`Tokens: ${response.usage.input_tokens + response.usage.output_tokens} (In: ${response.usage.input_tokens}, Out: ${response.usage.output_tokens})`);
  console.log('');

  console.log('💡 Enrichment Decision:');
  console.log('─'.repeat(70));

  if (result.intent?.issue_type === 'external_dependency') {
    console.log('✋ SKIP CI MATCHING - External dependency detected');
    console.log('   Would add note about external issue, no CI linking');
  } else if ((result.ip_addresses?.length || 0) + (result.hostnames?.length || 0) > 0) {
    console.log('🔍 WOULD QUERY CMDB');
    console.log(`   Search for ${result.ip_addresses?.length || 0} IPs, ${result.hostnames?.length || 0} hostnames`);
  } else if ((result.system_names?.length || 0) > 0) {
    console.log('🔍 WOULD QUERY CMDB BY NAME');
    console.log(`   Fuzzy search for: ${result.system_names?.slice(0, 3).join(', ')}`);
    console.log('   ⚠️  Likely LOW confidence or NO matches (too vague)');
  } else {
    console.log('📝 NO CI MATCHING POSSIBLE');
    console.log('   No technical identifiers found - would add note only');
  }
}

testDirectEnrichment()
  .catch(console.error)
  .finally(() => process.exit(0));
