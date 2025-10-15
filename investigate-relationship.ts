/**
 * Investigate case-to-incident relationship
 * Fetch both SCS0048851 and INC0167587 to understand the relationship structure
 */
import { serviceNowClient } from './lib/tools/servicenow';

async function investigate() {
  console.log('\n━━━ Investigating Case-to-Incident Relationship ━━━\n');

  try {
    // Fetch the case
    console.log('1. Fetching Case SCS0048851...');
    const caseRecord = await serviceNowClient.getCase('SCS0048851');

    if (!caseRecord) {
      console.error('❌ Case SCS0048851 not found');
      return;
    }

    console.log('✅ Case found:');
    console.log(`   Number: ${caseRecord.number}`);
    console.log(`   Sys ID: ${caseRecord.sys_id}`);
    console.log(`   Short Description: ${caseRecord.short_description}`);

    // Fetch the incident
    console.log('\n2. Fetching Incident INC0167587...');
    const incident = await serviceNowClient.getIncident('INC0167587');

    if (!incident) {
      console.error('❌ Incident INC0167587 not found');
      return;
    }

    console.log('✅ Incident found:');
    console.log(`   Number: ${incident.number}`);
    console.log(`   Sys ID: ${incident.sys_id}`);
    console.log(`   Short Description: ${incident.short_description}`);

    // Now let's make raw API calls to get ALL fields including relationship fields
    console.log('\n3. Fetching FULL case record (all fields)...');
    const fullCaseUrl = `https://mobizinc.service-now.com/api/now/table/sn_customerservice_case/${caseRecord.sys_id}?sysparm_display_value=all&sysparm_exclude_reference_link=true`;
    console.log(`   URL: ${fullCaseUrl}`);

    console.log('\n4. Fetching FULL incident record (all fields)...');
    const fullIncidentUrl = `https://mobizinc.service-now.com/api/now/table/incident/${incident.sys_id}?sysparm_display_value=all&sysparm_exclude_reference_link=true`;
    console.log(`   URL: ${fullIncidentUrl}`);

    // Check for task_relations (this is likely where Related Records tab gets data)
    console.log('\n5. Checking task_relations table...');
    console.log('   This table stores relationships between task-based records');
    console.log('   Query: parent=case_sys_id OR child=case_sys_id OR parent=incident_sys_id OR child=incident_sys_id');

    console.log('\n━━━ Manual Investigation Steps ━━━');
    console.log('\nIn ServiceNow UI:');
    console.log('1. Open Case SCS0048851');
    console.log('2. Go to Related Records tab > Incident section');
    console.log('3. Right-click on the incident link → "Show - sys_id"');
    console.log('4. Check what fields are populated on that list');
    console.log('\nOR run this in ServiceNow Scripts - Background:');
    console.log(`
var caseGr = new GlideRecord('sn_customerservice_case');
caseGr.addQuery('number', 'SCS0048851');
caseGr.query();
if (caseGr.next()) {
    gs.info('Case sys_id: ' + caseGr.sys_id);

    // Check for parent field
    gs.info('parent: ' + caseGr.parent);
    gs.info('parent_incident: ' + caseGr.parent_incident);

    // Check task_relations
    var relGr = new GlideRecord('task_relations');
    relGr.addQuery('parent', caseGr.sys_id);
    relGr.query();
    while (relGr.next()) {
        gs.info('Relation found: ' + relGr.child.number + ' (type: ' + relGr.type + ')');
    }
}
    `);

    console.log('\n━━━ Expected Relationship Patterns ━━━\n');
    console.log('Pattern A: Direct Reference Field');
    console.log('  - Case has field pointing to Incident (e.g., parent_incident)');
    console.log('  - Incident has field pointing to Case (e.g., originated_from)');
    console.log('');
    console.log('Pattern B: task_relations Table (Most Common for "Related Records")');
    console.log('  - Separate table: task_relations');
    console.log('  - Fields: parent (case sys_id), child (incident sys_id), type');
    console.log('  - This is likely what "Related Records" tab uses');
    console.log('');
    console.log('Pattern C: Parent-Child on Incident Table');
    console.log('  - incident.parent = case sys_id');
    console.log('  - This is what we currently set (line 524)');

  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
  }
}

investigate();
