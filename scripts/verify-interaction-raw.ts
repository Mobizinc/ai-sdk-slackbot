/**
 * Verify the raw interaction data without display_value conversion
 */

const SERVICENOW_URL = process.env.SERVICENOW_URL;
const SERVICENOW_USERNAME = process.env.SERVICENOW_USERNAME;
const SERVICENOW_PASSWORD = process.env.SERVICENOW_PASSWORD;

const INTERACTION_SYS_ID = '14e8136cc3347610ad36b9ff050131df';  // IMS0001459

if (!SERVICENOW_URL || !SERVICENOW_USERNAME || !SERVICENOW_PASSWORD) {
  console.error('Missing ServiceNow credentials');
  process.exit(1);
}

async function verifyInteraction() {
  const auth = Buffer.from(`${SERVICENOW_USERNAME}:${SERVICENOW_PASSWORD}`).toString('base64');

  const response = await fetch(
    `${SERVICENOW_URL}/api/now/table/interaction/${INTERACTION_SYS_ID}`,
    {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    console.error('Failed to fetch interaction');
    process.exit(1);
  }

  const data = await response.json();
  const record = data.result;

  console.log('=== RAW INTERACTION DATA ===\n');
  console.log('Critical Fields:');
  console.log(`  type: "${record.type}"`);
  console.log(`  direction: "${record.direction}"`);
  console.log(`  state: "${record.state}"`);
  console.log(`  caller_phone_number: "${record.caller_phone_number}"`);
  console.log(`  opened_at: "${record.opened_at}"`);
  console.log(`  closed_at: "${record.closed_at}"`);
  console.log(`  duration: "${record.duration}"`);
  console.log('');

  console.log('Linking Fields:');
  console.log(`  context_table: "${record.context_table}"`);
  console.log(`  context_document: "${record.context_document}"`);
  console.log(`  channel_metadata_table: "${record.channel_metadata_table}"`);
  console.log(`  channel_metadata_document: "${record.channel_metadata_document}"`);
  console.log('');

  console.log('Metadata:');
  console.log(`  short_description: "${record.short_description}"`);
  console.log(`  work_notes (length): ${record.work_notes?.length || 0}`);
  console.log('');

  console.log('Full JSON:');
  console.log(JSON.stringify(record, null, 2));
}

verifyInteraction().catch(console.error);
