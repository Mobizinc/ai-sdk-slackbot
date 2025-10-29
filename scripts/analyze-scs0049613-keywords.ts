/**
 * Detailed Keyword Analysis for SCS0049613
 * Shows which keywords matched and why it was misclassified
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { getHRRequestDetector } from '../lib/services/hr-request-detector';

async function analyzeKeywords() {
  console.log('🔬 DETAILED KEYWORD ANALYSIS: SCS0049613');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  const shortDescription = 'URGENT MATTER: Company Email Setup for Express Employees';
  const description = `Good Morning IT,

I am submitting this request for company email addresses for all Express ER employees.

As of Monday, October 27, 2025, all Express ER email accounts will be deactivated, and employees will require @altushealthsystem.com addresses to ensure uninterrupted communication and system access.

The attached list includes each employee's name, title, and location. Please prioritize this request and confirm once the setup has been completed.

Let me know immediately if any additional information is needed to expedite the process.`;

  const fullText = `${shortDescription} ${description}`.toLowerCase();

  console.log('📝 Case Text (normalized):');
  console.log('───────────────────────────────────────────────────────────────────');
  console.log(fullText);
  console.log('');

  const detector = getHRRequestDetector();

  // Get all mapping stats
  const stats = detector.getStats();
  console.log('📊 HR Request Detector Stats:');
  console.log(`  Total Mappings:  ${stats.totalMappings}`);
  console.log(`  Total Keywords:  ${stats.totalKeywords}`);
  console.log(`  Request Types:   ${stats.requestTypes.join(', ')}`);
  console.log('');

  // Test each request type individually
  const requestTypes = ['onboarding', 'termination', 'offboarding', 'new_account', 'account_modification', 'transfer'] as const;

  console.log('🔍 Keyword Match Analysis by Request Type:');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  interface MatchInfo {
    type: string;
    keywords: string[];
    matchCount: number;
    confidence: number;
  }

  const matches: MatchInfo[] = [];

  // Get default mappings to check keywords
  const newAccountKeywords = ['new account', 'create account', 'account creation', 'setup account', 'add user', 'provision user', 'user provisioning', 'grant access'];
  const offboardingKeywords = ['offboarding', 'offboard', 'deactivate user', 'deactivate account', 'deactivate', 'disable user', 'disable account', 'remove access', 'revoke access'];
  const terminationKeywords = ['termination', 'terminate', 'terminated', 'employee leaving', 'user leaving', 'last day', 'final day', 'resignation', 'resigned', 'quit', 'quitting', 'fired', 'employee'];
  const onboardingKeywords = ['onboarding', 'onboard', 'new hire', 'new employee', 'new user', 'starting employee', 'employee starting', 'hire starting', 'first day', 'new team member'];

  const allKeywordSets = {
    new_account: newAccountKeywords,
    offboarding: offboardingKeywords,
    termination: terminationKeywords,
    onboarding: onboardingKeywords,
  };

  for (const [type, keywords] of Object.entries(allKeywordSets)) {
    const matched: string[] = [];

    for (const keyword of keywords) {
      if (fullText.includes(keyword.toLowerCase())) {
        matched.push(keyword);
      }
    }

    if (matched.length > 0) {
      console.log(`\n${type.toUpperCase()}:`);
      console.log(`  Matched Keywords (${matched.length}/${keywords.length}):`);
      matched.forEach((kw, i) => {
        console.log(`    ${i + 1}. "${kw}"`);
      });
    } else {
      console.log(`\n${type.toUpperCase()}: ❌ No matches`);
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  // Run full detection
  const result = detector.detectHRRequest({
    shortDescription,
    description,
  });

  console.log('🤖 Final Detection Result:');
  console.log(`  Detected Type:    ${result.requestType}`);
  console.log(`  Confidence:       ${(result.confidence * 100).toFixed(2)}%`);
  console.log(`  Is HR Request:    ${result.isHRRequest ? 'Yes' : 'No'}`);
  console.log(`  Matched Keywords: ${result.matchedKeywords.join(', ')}`);
  console.log('');

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🔎 ROOT CAUSE ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  console.log('WHY IT DETECTED AS "OFFBOARDING":');
  console.log('  • The word "deactivate" appears in the description');
  console.log('  • "deactivate" is a keyword for the offboarding type');
  console.log('  • However, the context is "Express ER email accounts will be deactivated"');
  console.log('  • This refers to OLD accounts being deactivated, NOT the request');
  console.log('');

  console.log('WHY IT SHOULD BE "NEW_ACCOUNT":');
  console.log('  • Subject line says "Company Email Setup"');
  console.log('  • Description says "request for company email addresses"');
  console.log('  • Says "employees will require @altushealthsystem.com addresses"');
  console.log('  • This is clearly requesting NEW email account creation');
  console.log('');

  console.log('DETECTION FAILURE:');
  console.log('  • "email setup" is NOT in new_account keywords');
  console.log('  • "email addresses" is NOT in new_account keywords');
  console.log('  • "company email" is NOT in new_account keywords');
  console.log('  • The detector matched on "deactivate" which is WRONG CONTEXT');
  console.log('');

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('💡 RECOMMENDATIONS TO FIX');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  console.log('1. ADD EMAIL-RELATED KEYWORDS TO new_account TYPE:');
  console.log('   • "email setup"');
  console.log('   • "email account"');
  console.log('   • "company email"');
  console.log('   • "email addresses"');
  console.log('   • "mailbox"');
  console.log('   • "outlook account"');
  console.log('   • "exchange account"');
  console.log('   • "@domain.com" (domain email pattern)');
  console.log('');

  console.log('2. IMPROVE CONTEXT AWARENESS:');
  console.log('   • "deactivate" appears with "will be deactivated" (future tense, old system)');
  console.log('   • Need to distinguish between deactivating OLD accounts vs requesting NEW ones');
  console.log('   • Consider keyword combinations: "will require" + "addresses" = new account');
  console.log('');

  console.log('3. INCREASE PRIORITY FOR MULTI-WORD MATCHES:');
  console.log('   • "email setup" should score higher than single word "deactivate"');
  console.log('   • Subject line keywords should have higher weight');
  console.log('');

  console.log('4. FOR ALTUS SPECIFICALLY:');
  console.log('   • Create custom catalog mapping with email-related keywords');
  console.log('   • Store in database: client_settings.customCatalogMappings');
  console.log('   • Tailor to Altus submission patterns');
  console.log('');

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  // Test with improved keywords
  console.log('🧪 SIMULATION: If email keywords were added to new_account');
  console.log('───────────────────────────────────────────────────────────────────');
  console.log('');

  const emailKeywords = ['email setup', 'email account', 'company email', 'email addresses', 'mailbox'];
  const matchedEmailKw: string[] = [];

  for (const kw of emailKeywords) {
    if (fullText.includes(kw.toLowerCase())) {
      matchedEmailKw.push(kw);
    }
  }

  console.log(`Would match ${matchedEmailKw.length} email-related keywords:`);
  matchedEmailKw.forEach((kw, i) => {
    console.log(`  ${i + 1}. "${kw}"`);
  });
  console.log('');

  console.log('Expected Result:');
  console.log('  • Detected Type: new_account (instead of offboarding)');
  console.log('  • Confidence: ~65-75% (higher due to multiple specific matches)');
  console.log('  • Would trigger catalog redirect if feature was enabled');
  console.log('');

  console.log('═══════════════════════════════════════════════════════════════════');
}

analyzeKeywords();
