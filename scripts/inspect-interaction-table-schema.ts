/**
 * Inspect ServiceNow interaction table schema
 * Query the sys_dictionary table to get all field definitions for the interaction table
 */

const SERVICENOW_INSTANCE_URL = process.env.SERVICENOW_URL;
const SERVICENOW_USERNAME = process.env.SERVICENOW_USERNAME;
const SERVICENOW_PASSWORD = process.env.SERVICENOW_PASSWORD;

if (!SERVICENOW_INSTANCE_URL || !SERVICENOW_USERNAME || !SERVICENOW_PASSWORD) {
  console.error('Missing required environment variables');
  console.error('SERVICENOW_URL:', SERVICENOW_INSTANCE_URL);
  console.error('SERVICENOW_USERNAME:', SERVICENOW_USERNAME);
  console.error('SERVICENOW_PASSWORD:', SERVICENOW_PASSWORD ? '***' : 'missing');
  process.exit(1);
}

async function inspectInteractionTableSchema() {
  try {
    // Query the sys_dictionary table to get all fields for the interaction table
    const url = `${SERVICENOW_INSTANCE_URL}/api/now/table/sys_dictionary?sysparm_query=name=interaction^ORDERBYelement&sysparm_fields=element,column_label,internal_type,reference,max_length,mandatory,read_only,default_value,comments&sysparm_display_value=all&sysparm_limit=200`;

    const auth = Buffer.from(`${SERVICENOW_USERNAME}:${SERVICENOW_PASSWORD}`).toString('base64');

    console.log('Fetching interaction table schema from ServiceNow...\n');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ServiceNow API error: ${response.status} ${text}`);
    }

    const data = await response.json();

    console.log('=== INTERACTION TABLE SCHEMA ===\n');
    console.log(`Total fields found: ${data.result?.length || 0}\n`);

    if (data.result && Array.isArray(data.result)) {
      // Group by relevance
      const contactFields: any[] = [];
      const referenceFields: any[] = [];
      const standardFields: any[] = [];

      for (const field of data.result) {
        // Extract display_value or value from the response objects
        const element = String(field.element?.value || field.element || '');
        const label = String(field.column_label?.value || field.column_label || '');
        const type = String(field.internal_type?.value || field.internal_type || '');
        const reference = String(field.reference?.value || field.reference || '');
        const mandatory = String(field.mandatory?.value || field.mandatory || '');
        const comments = String(field.comments?.value || field.comments || '');

        // Create normalized field object
        const normalizedField = {
          element,
          label,
          type,
          reference,
          mandatory,
          comments,
          max_length: String(field.max_length?.value || field.max_length || ''),
          read_only: String(field.read_only?.value || field.read_only || ''),
          default_value: String(field.default_value?.value || field.default_value || ''),
        };

        // Categorize fields
        if (element.includes('contact') || element.includes('customer') || element.includes('opened_for') || element.includes('caller')) {
          contactFields.push(normalizedField);
        } else if (type === 'reference' || element.includes('parent')) {
          referenceFields.push(normalizedField);
        } else {
          standardFields.push(normalizedField);
        }
      }

      // Print contact/customer fields
      console.log('=== CONTACT/CUSTOMER RELATED FIELDS ===');
      for (const field of contactFields) {
        console.log(`Field: ${field.element}`);
        console.log(`  Label: ${field.label}`);
        console.log(`  Type: ${field.type}`);
        if (field.reference) {
          console.log(`  References: ${field.reference}`);
        }
        console.log(`  Mandatory: ${field.mandatory}`);
        if (field.comments) {
          console.log(`  Comments: ${field.comments}`);
        }
        console.log('');
      }

      // Print reference fields
      console.log('\n=== REFERENCE FIELDS (including parent) ===');
      for (const field of referenceFields) {
        console.log(`Field: ${field.element}`);
        console.log(`  Label: ${field.label}`);
        console.log(`  Type: ${field.type}`);
        if (field.reference) {
          console.log(`  References: ${field.reference}`);
        }
        console.log(`  Mandatory: ${field.mandatory}`);
        console.log('');
      }

      // Print all standard fields
      console.log('\n=== ALL STANDARD FIELDS ===');
      for (const field of standardFields) {
        console.log(`${field.element} (${field.label}) - Type: ${field.type}${field.reference ? ` -> ${field.reference}` : ''}`);
      }

      // Export normalized schema to JSON
      console.log('\n=== NORMALIZED SCHEMA (JSON) ===');
      const allFields = [...contactFields, ...referenceFields, ...standardFields];
      console.log(JSON.stringify(allFields, null, 2));
    }

  } catch (error) {
    console.error('Error inspecting interaction table schema:', error);
    throw error;
  }
}

inspectInteractionTableSchema().catch(console.error);
