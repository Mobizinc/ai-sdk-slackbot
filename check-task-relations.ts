/**
 * Check task_relations table to see how case and incident are linked
 */

// Load environment variables
const SERVICENOW_INSTANCE_URL = process.env.SERVICENOW_INSTANCE_URL || process.env.SERVICENOW_URL;
const SERVICENOW_USERNAME = process.env.SERVICENOW_USERNAME;
const SERVICENOW_PASSWORD = process.env.SERVICENOW_PASSWORD;

if (!SERVICENOW_INSTANCE_URL || !SERVICENOW_USERNAME || !SERVICENOW_PASSWORD) {
  console.error('❌ ServiceNow credentials not configured');
  console.log('\nSet these environment variables:');
  console.log('  SERVICENOW_INSTANCE_URL=https://mobizinc.service-now.com');
  console.log('  SERVICENOW_USERNAME=your-username');
  console.log('  SERVICENOW_PASSWORD=your-password');
  process.exit(1);
}

async function checkRelations() {
  console.log('\n━━━ Checking task_relations for INC0167587 ━━━\n');

  const auth = Buffer.from(`${SERVICENOW_USERNAME}:${SERVICENOW_PASSWORD}`).toString('base64');

  // Query task_relations table for the incident
  const url = `${SERVICENOW_INSTANCE_URL}/api/now/table/task_relations?sysparm_query=child.number=INC0167587&sysparm_display_value=all&sysparm_fields=sys_id,parent,child,type,parent.number,child.number,parent.sys_class_name,child.sys_class_name`;

  console.log(`Querying: ${url}\n`);

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`❌ API Error (${response.status}):`, body);
      return;
    }

    const data = await response.json();

    if (!data.result || data.result.length === 0) {
      console.log('❌ No task_relations found for INC0167587');
      console.log('\nThis means:');
      console.log('  - The "Related Records" tab might be using a different mechanism');
      console.log('  - Or the relationship field is directly on the case/incident record');
      console.log('  - Or the relationship type/query is different');
      return;
    }

    console.log(`✅ Found ${data.result.length} relation(s):\n`);

    data.result.forEach((rel: any, index: number) => {
      console.log(`Relation ${index + 1}:`);
      console.log(`  Parent: ${rel['parent.number']} (${rel['parent.sys_class_name']})`);
      console.log(`  Child: ${rel['child.number']} (${rel['child.sys_class_name']})`);
      console.log(`  Type: ${rel.type}`);
      console.log(`  Parent sys_id: ${rel.parent.value}`);
      console.log(`  Child sys_id: ${rel.child.value}`);
      console.log('');
    });

    console.log('━━━ What We Need to Add to Code ━━━\n');
    console.log('After creating the incident, create a task_relations record:');
    console.log('');
    console.log('POST /api/now/table/task_relations');
    console.log('{');
    console.log(`  "parent": "<case_sys_id>",`);
    console.log(`  "child": "<incident_sys_id>",`);
    console.log(`  "type": "${data.result[0].type.value || data.result[0].type}"`);
    console.log('}');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkRelations();
