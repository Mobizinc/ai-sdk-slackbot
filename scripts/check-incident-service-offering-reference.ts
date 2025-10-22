/**
 * Check Reference Qualifier on incident.service_offering Field
 *
 * This will show us what filter is applied when looking up Service Offerings from an Incident
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

const instanceUrl = 'https://mobiz.service-now.com';
const username = process.env.SERVICENOW_USERNAME;
const password = process.env.SERVICENOW_PASSWORD;

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

async function checkIncidentServiceOfferingReference() {
  console.log('🔍 Checking incident.service_offering Reference Qualifier');
  console.log('='.repeat(80));
  console.log('');

  // Query dictionary entry for incident.service_offering
  const dictionaryUrl = `${instanceUrl}/api/now/table/sys_dictionary?sysparm_query=name=incident^element=service_offering&sysparm_fields=element,column_label,reference,ref_qual,ref_auto_completer,ref_qual_condition&sysparm_display_value=all`;

  try {
    const dictResp = await fetch(dictionaryUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    });

    const dictData = await dictResp.json();

    console.log('Dictionary Entry for incident.service_offering:');
    console.log(JSON.stringify(dictData.result, null, 2));
    console.log('');

    if (dictData.result && dictData.result.length > 0) {
      const entry = dictData.result[0];

      console.log('Key Configuration:');
      console.log(`  Field: ${entry.element?.display_value || entry.element}`);
      console.log(`  Label: ${entry.column_label?.display_value || entry.column_label}`);
      console.log(`  Reference Table: ${entry.reference?.display_value || entry.reference}`);
      console.log(`  Reference Qualifier: ${entry.ref_qual?.display_value || entry.ref_qual || '(none)'}`);
      console.log(`  Ref Auto Completer: ${entry.ref_auto_completer?.display_value || entry.ref_auto_completer || '(none)'}`);
      console.log(`  Ref Qual Condition: ${entry.ref_qual_condition?.display_value || entry.ref_qual_condition || '(none)'}`);
      console.log('');

      // If there's a reference qualifier, explain it
      const refQual = entry.ref_qual?.value || entry.ref_qual;
      if (refQual) {
        console.log('Reference Qualifier (Filter Applied):');
        console.log(`  ${refQual}`);
        console.log('');
        console.log('This means Service Offerings must match this condition to appear in the lookup.');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }

  // Also check if there are any UI policies or client scripts affecting this field
  console.log('─'.repeat(80));
  console.log('Checking for UI Policies affecting service_offering field...');
  console.log('');

  const uiPolicyUrl = `${instanceUrl}/api/now/table/sys_ui_policy?sysparm_query=table=incident^active=true&sysparm_fields=short_description,conditions,sys_id&sysparm_display_value=all&sysparm_limit=10`;

  try {
    const uiResp = await fetch(uiPolicyUrl, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    });

    const uiData = await uiResp.json();

    if (uiData.result && uiData.result.length > 0) {
      console.log('Active UI Policies on Incident table:');
      uiData.result.forEach((policy: any) => {
        console.log(`  - ${policy.short_description?.display_value || policy.short_description}`);
        console.log(`    Conditions: ${policy.conditions?.display_value || policy.conditions || '(always)'}`);
      });
    } else {
      console.log('  (No UI policies found)');
    }
  } catch (error) {
    console.error('❌ Error checking UI policies:', error);
  }
}

checkIncidentServiceOfferingReference().catch(console.error);
