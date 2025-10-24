/**
 * Diagnostic Script: Fetch Problem Record from ServiceNow
 *
 * This script fetches PRB0040116 to analyze:
 * 1. The "first_reported_by" field structure (manually populated with CS0023764)
 * 2. The "parent" field (should link to Case)
 * 3. All other fields to identify what's missing
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function diagnoseProblem() {
  console.log('🔍 Diagnostic: Fetching Problem PRB0040116 from ServiceNow DEV\n');
  console.log('='.repeat(70));
  console.log('');

  // Get DEV credentials
  const devUrl = process.env.DEV_SERVICENOW_URL;
  const devUsername = process.env.DEV_SERVICENOW_USERNAME;
  const devPassword = process.env.DEV_SERVICENOW_PASSWORD;

  if (!devUrl || !devUsername || !devPassword) {
    console.error('❌ DEV ServiceNow credentials not configured in .env.local');
    process.exit(1);
  }

  // Create auth header
  const authHeader = `Basic ${Buffer.from(`${devUsername}:${devPassword}`).toString('base64')}`;

  try {
    // Problem sys_id from test output
    const problemSysId = '1b02021283643a1068537cdfeeaad3f5';

    console.log('Fetching Problem record with all fields...');
    console.log('─'.repeat(70));

    // Fetch with display_value=all to see both sys_id and display values
    const problemUrl = `${devUrl}/api/now/table/problem/${problemSysId}?sysparm_display_value=all`;

    const problemResponse = await fetch(problemUrl, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!problemResponse.ok) {
      throw new Error(`Failed to fetch problem: ${problemResponse.status}\n${await problemResponse.text()}`);
    }

    const problemData = await problemResponse.json();
    const problem = problemData.result;

    console.log('\n📋 FULL PROBLEM RECORD (JSON):');
    console.log('='.repeat(70));
    console.log(JSON.stringify(problem, null, 2));
    console.log('');

    // Extract and analyze key fields
    console.log('\n🔑 KEY FIELDS ANALYSIS:');
    console.log('='.repeat(70));
    console.log('');

    // Helper to extract value
    const getValue = (field: any): { value: string | null; display: string | null } => {
      if (!field) return { value: null, display: null };
      if (typeof field === 'string') return { value: field, display: field };
      if (typeof field === 'object') {
        return {
          value: field.value || null,
          display: field.display_value || null,
        };
      }
      return { value: String(field), display: String(field) };
    };

    // Analyze critical fields
    const fields = {
      number: getValue(problem.number),
      parent: getValue(problem.parent),
      first_reported_by: getValue(problem.first_reported_by),
      company: getValue(problem.company),
      account: getValue(problem.account),
      contact: getValue(problem.contact),
      opened_by: getValue(problem.opened_by),
      assignment_group: getValue(problem.assignment_group),
      assigned_to: getValue(problem.assigned_to),
      caller_id: getValue(problem.caller_id),
    };

    console.log('Problem Number:');
    console.log(`  Value: ${fields.number.value || 'null'}`);
    console.log(`  Display: ${fields.number.display || 'null'}`);
    console.log('');

    console.log('Parent (Case Link):');
    console.log(`  Value (sys_id): ${fields.parent.value || 'null'}`);
    console.log(`  Display: ${fields.parent.display || 'null'}`);
    console.log(`  ${fields.parent.value ? '✅ POPULATED' : '❌ MISSING'}`);
    console.log('');

    console.log('First Reported By (manually set to CS0023764):');
    console.log(`  Value (sys_id): ${fields.first_reported_by.value || 'null'}`);
    console.log(`  Display: ${fields.first_reported_by.display || 'null'}`);
    console.log(`  ${fields.first_reported_by.value ? '✅ POPULATED' : '❌ MISSING'}`);
    console.log('');

    console.log('Company:');
    console.log(`  Value: ${fields.company.value || 'null'}`);
    console.log(`  Display: ${fields.company.display || 'null'}`);
    console.log(`  ${fields.company.value ? '✅ POPULATED' : '❌ MISSING'}`);
    console.log('');

    console.log('Account:');
    console.log(`  Value: ${fields.account.value || 'null'}`);
    console.log(`  Display: ${fields.account.display || 'null'}`);
    console.log(`  ${fields.account.value ? '✅ POPULATED' : '⚠️  OPTIONAL'}`);
    console.log('');

    console.log('Contact:');
    console.log(`  Value: ${fields.contact.value || 'null'}`);
    console.log(`  Display: ${fields.contact.display || 'null'}`);
    console.log(`  ${fields.contact.value ? '✅ POPULATED' : '❌ MISSING'}`);
    console.log('');

    console.log('Opened By:');
    console.log(`  Value: ${fields.opened_by.value || 'null'}`);
    console.log(`  Display: ${fields.opened_by.display || 'null'}`);
    console.log(`  ${fields.opened_by.value ? '✅ POPULATED' : '❌ MISSING'}`);
    console.log('');

    console.log('Assignment Group:');
    console.log(`  Value: ${fields.assignment_group.value || 'null'}`);
    console.log(`  Display: ${fields.assignment_group.display || 'null'}`);
    console.log(`  ${fields.assignment_group.value ? '✅ POPULATED' : '⚠️  OPTIONAL'}`);
    console.log('');

    console.log('Assigned To:');
    console.log(`  Value: ${fields.assigned_to.value || 'null'}`);
    console.log(`  Display: ${fields.assigned_to.display || 'null'}`);
    console.log(`  ${fields.assigned_to.value ? '✅ POPULATED' : '⚠️  OPTIONAL'}`);
    console.log('');

    console.log('Caller ID:');
    console.log(`  Value: ${fields.caller_id.value || 'null'}`);
    console.log(`  Display: ${fields.caller_id.display || 'null'}`);
    console.log(`  ${fields.caller_id.value ? '✅ POPULATED' : '⚠️  OPTIONAL'}`);
    console.log('');

    // Summary
    console.log('\n📊 SUMMARY:');
    console.log('='.repeat(70));
    console.log('');

    if (fields.first_reported_by.value) {
      console.log('✅ first_reported_by field EXISTS and is POPULATED');
      console.log(`   Field name: "first_reported_by"`);
      console.log(`   Sys ID: ${fields.first_reported_by.value}`);
      console.log(`   Display: ${fields.first_reported_by.display}`);
    } else {
      console.log('❌ first_reported_by field is MISSING or NULL');
      console.log('   This field may have a different name');
    }
    console.log('');

    if (fields.parent.value) {
      console.log('✅ parent field (Case link) EXISTS and is POPULATED');
      console.log(`   Sys ID: ${fields.parent.value}`);
      console.log(`   Display: ${fields.parent.display}`);
    } else {
      console.log('❌ parent field (Case link) is MISSING or NULL');
      console.log('   The bidirectional link is broken!');
    }
    console.log('');

    console.log('✅ Diagnostic complete!');

  } catch (error) {
    console.error('');
    console.error('❌ Diagnostic failed:');
    console.error(error);
    process.exit(1);
  }
}

diagnoseProblem()
  .catch(console.error)
  .finally(() => process.exit(0));
