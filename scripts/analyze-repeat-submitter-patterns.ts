/**
 * Analyze case patterns from repeat submitters for keyword extraction
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/analyze-repeat-submitter-patterns.ts
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

import { serviceNowClient } from '../lib/tools/servicenow';

async function analyzeRepeatSubmitters() {
  console.log('🔍 Analyzing Repeat Submitter Patterns for Altus');
  console.log('');

  if (!serviceNowClient.isConfigured()) {
    console.error('❌ ServiceNow client is not properly configured');
    process.exit(1);
  }

  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 STEP 1: Get Submitter from Case SCS0048833');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const referenceCase = await serviceNowClient.getCase('SCS0048833');

    if (!referenceCase) {
      console.error('❌ Case SCS0048833 not found');
      process.exit(1);
    }

    const submitter1 = referenceCase.submitted_by || referenceCase.opened_by || referenceCase.caller_id;

    console.log('Reference Case Details:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`Case Number:        ${referenceCase.number}`);
    console.log(`Short Description:  ${referenceCase.short_description}`);
    console.log(`Submitted By:       ${submitter1}`);
    console.log(`Company:            ${referenceCase.company_name}`);
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👤 STEP 2: Find All Cases from This Submitter');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    if (!submitter1) {
      console.error('❌ Could not find submitter for reference case');
      process.exit(1);
    }

    // Search for cases by this submitter at Altus
    const submitter1Cases = await serviceNowClient.searchCustomerCases({
      companyName: 'Altus Community Healthcare',
      limit: 50,
    });

    // Filter to only cases from submitter1
    const submitter1Filtered = submitter1Cases.filter(c => {
      // We need to fetch full case details to check submitter
      return true; // Will filter in detail fetch
    });

    console.log(`Found ${submitter1Cases.length} total Altus cases`);
    console.log('Fetching details to find cases from first submitter...');
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👤 STEP 3: Find Cases from Brian Wallace');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Search for cases mentioning Brian Wallace
    const brianCases = await serviceNowClient.searchCustomerCases({
      companyName: 'Altus Community Healthcare',
      query: 'Brian Wallace',
      limit: 50,
    });

    console.log(`Found ${brianCases.length} cases mentioning "Brian Wallace"`);
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 STEP 4: Analyze HR-Related Cases');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Combine and fetch full details for top 20 cases
    const allCases = [...submitter1Cases, ...brianCases];
    const uniqueCases = new Map<string, any>();

    allCases.forEach(c => {
      if (!uniqueCases.has(c.sys_id)) {
        uniqueCases.set(c.sys_id, c);
      }
    });

    console.log(`Total unique cases to analyze: ${uniqueCases.size}`);
    console.log('Fetching full details for pattern analysis...');
    console.log('');

    // Fetch full details for each case
    const casesWithDetails: any[] = [];
    let count = 0;
    const maxCases = 30; // Limit to avoid too many API calls

    for (const [sysId, summary] of Array.from(uniqueCases.entries()).slice(0, maxCases)) {
      count++;
      console.log(`Fetching ${count}/${Math.min(maxCases, uniqueCases.size)}: ${summary.number}...`);

      const fullCase = await serviceNowClient.getCase(summary.number);
      if (fullCase) {
        casesWithDetails.push(fullCase);
      }
    }

    console.log('');
    console.log(`✅ Fetched ${casesWithDetails.length} cases with full details`);
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 STEP 5: Extract HR Request Patterns');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Categorize cases by HR request type based on keywords
    const patterns = {
      onboarding: [] as any[],
      termination: [] as any[],
      account_modification: [] as any[],
      new_account: [] as any[],
      access_request: [] as any[],
      other_hr: [] as any[],
      non_hr: [] as any[],
    };

    const onboardingKeywords = ['new hire', 'onboard', 'onboarding', 'start date', 'new employee', 'hire', 'hiring'];
    const terminationKeywords = ['termination', 'terminate', 'last day', 'leaving', 'offboard', 'offboarding', 'exit', 'resignation'];
    const accountModKeywords = ['modify', 'change access', 'update permissions', 'access change', 'permission change'];
    const newAccountKeywords = ['new account', 'create account', 'account creation', 'setup account', 'account setup'];
    const accessKeywords = ['access', 'permission', 'rights', 'privileges'];

    casesWithDetails.forEach(caseData => {
      const text = `${caseData.short_description || ''} ${caseData.description || ''}`.toLowerCase();

      let categorized = false;

      if (onboardingKeywords.some(kw => text.includes(kw))) {
        patterns.onboarding.push(caseData);
        categorized = true;
      }

      if (terminationKeywords.some(kw => text.includes(kw))) {
        patterns.termination.push(caseData);
        categorized = true;
      }

      if (accountModKeywords.some(kw => text.includes(kw))) {
        patterns.account_modification.push(caseData);
        categorized = true;
      }

      if (newAccountKeywords.some(kw => text.includes(kw))) {
        patterns.new_account.push(caseData);
        categorized = true;
      }

      if (!categorized && accessKeywords.some(kw => text.includes(kw))) {
        patterns.access_request.push(caseData);
        categorized = true;
      }

      // Check for other HR indicators
      const otherHRKeywords = ['employee', 'staff', 'user', 'hr', 'human resource'];
      if (!categorized && otherHRKeywords.some(kw => text.includes(kw))) {
        patterns.other_hr.push(caseData);
        categorized = true;
      }

      if (!categorized) {
        patterns.non_hr.push(caseData);
      }
    });

    console.log('Pattern Analysis Results:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`📥 Onboarding Cases:           ${patterns.onboarding.length}`);
    console.log(`📤 Termination Cases:          ${patterns.termination.length}`);
    console.log(`🔧 Account Modification:       ${patterns.account_modification.length}`);
    console.log(`➕ New Account:                ${patterns.new_account.length}`);
    console.log(`🔑 Access Request:             ${patterns.access_request.length}`);
    console.log(`👥 Other HR:                   ${patterns.other_hr.length}`);
    console.log(`📋 Non-HR:                     ${patterns.non_hr.length}`);
    console.log('');

    // Show examples from each category
    const categories = [
      { name: 'ONBOARDING', cases: patterns.onboarding, emoji: '📥' },
      { name: 'TERMINATION', cases: patterns.termination, emoji: '📤' },
      { name: 'ACCOUNT MODIFICATION', cases: patterns.account_modification, emoji: '🔧' },
      { name: 'NEW ACCOUNT', cases: patterns.new_account, emoji: '➕' },
      { name: 'ACCESS REQUEST', cases: patterns.access_request, emoji: '🔑' },
    ];

    for (const category of categories) {
      if (category.cases.length > 0) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`${category.emoji} ${category.name} (${category.cases.length} cases)`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');

        category.cases.slice(0, 5).forEach((caseData, i) => {
          console.log(`${i + 1}. ${caseData.number}: ${caseData.short_description}`);
          console.log(`   Submitted: ${caseData.opened_at || '(unknown)'}`);
          console.log(`   Submitter: ${caseData.submitted_by || caseData.opened_by || '(unknown)'}`);

          if (caseData.description) {
            const desc = caseData.description.substring(0, 200);
            console.log(`   Description: ${desc}${caseData.description.length > 200 ? '...' : ''}`);
          }
          console.log('');
        });

        if (category.cases.length > 5) {
          console.log(`   ... and ${category.cases.length - 5} more cases`);
          console.log('');
        }
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 KEYWORD EXTRACTION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Extract unique phrases from each category
    for (const category of categories) {
      if (category.cases.length === 0) continue;

      console.log(`${category.name}:`);
      console.log('─────────────────────────────────────────────────────');

      const phrases = new Map<string, number>();

      category.cases.forEach(caseData => {
        const text = `${caseData.short_description || ''} ${caseData.description || ''}`.toLowerCase();

        // Extract 2-3 word phrases
        const words = text.split(/\s+/);
        for (let i = 0; i < words.length - 1; i++) {
          // 2-word phrases
          const phrase2 = `${words[i]} ${words[i + 1]}`.replace(/[^a-z\s]/g, '').trim();
          if (phrase2.length > 5) {
            phrases.set(phrase2, (phrases.get(phrase2) || 0) + 1);
          }

          // 3-word phrases
          if (i < words.length - 2) {
            const phrase3 = `${words[i]} ${words[i + 1]} ${words[i + 2]}`.replace(/[^a-z\s]/g, '').trim();
            if (phrase3.length > 10) {
              phrases.set(phrase3, (phrases.get(phrase3) || 0) + 1);
            }
          }
        }
      });

      // Sort by frequency and show top 10
      const sortedPhrases = Array.from(phrases.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      sortedPhrases.forEach(([phrase, count]) => {
        if (count >= 2) { // Only show phrases that appear at least twice
          console.log(`  "${phrase}" (${count} times)`);
        }
      });

      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ ANALYSIS COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Summary:');
    console.log(`  Total Cases Analyzed:  ${casesWithDetails.length}`);
    console.log(`  HR Cases Found:        ${patterns.onboarding.length + patterns.termination.length + patterns.account_modification.length + patterns.new_account.length + patterns.access_request.length + patterns.other_hr.length}`);
    console.log(`  Non-HR Cases:          ${patterns.non_hr.length}`);
    console.log('');
    console.log('Next Steps:');
    console.log('  1. Review extracted keywords above');
    console.log('  2. Update HR Request Detector with these patterns');
    console.log('  3. Update custom catalog mappings with refined keywords');
    console.log('  4. Test with the analyzed cases');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error analyzing patterns:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

analyzeRepeatSubmitters();
