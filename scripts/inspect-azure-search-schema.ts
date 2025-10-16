/**
 * Inspect Azure Search Index Schema
 * Shows all fields in the index and their types to identify date fields
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load env vars from parent directory's .env.local
const envPath = resolve(process.cwd(), '../ai-sdk-slackbot/.env.local');
config({ path: envPath });

async function inspectSchema() {
  const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
  const apiKey = process.env.AZURE_SEARCH_KEY;
  const indexName = process.env.AZURE_SEARCH_INDEX_NAME || 'case-intelligence-prod';

  if (!endpoint || !apiKey) {
    console.error('❌ AZURE_SEARCH_ENDPOINT or AZURE_SEARCH_KEY not configured');
    process.exit(1);
  }

  console.log('🔍 Inspecting Azure Search Index Schema');
  console.log('═══════════════════════════════════════\n');
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Index: ${indexName}\n`);

  try {
    // Step 1: Get index schema
    console.log('📋 Step 1: Fetching index schema...\n');

    const schemaUrl = `${endpoint}/indexes/${indexName}?api-version=2024-07-01`;
    const schemaResponse = await fetch(schemaUrl, {
      headers: {
        'api-key': apiKey,
      },
    });

    if (!schemaResponse.ok) {
      throw new Error(`Schema fetch failed: ${schemaResponse.status} ${schemaResponse.statusText}`);
    }

    const schema = await schemaResponse.json();

    console.log('✅ Schema fetched successfully\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 INDEX FIELDS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Categorize fields
    const dateFields: any[] = [];
    const textFields: any[] = [];
    const vectorFields: any[] = [];
    const otherFields: any[] = [];

    schema.fields.forEach((field: any) => {
      const fieldInfo = {
        name: field.name,
        type: field.type,
        searchable: field.searchable,
        filterable: field.filterable,
        sortable: field.sortable,
        facetable: field.facetable,
      };

      // Categorize by type and name
      if (field.type === 'Edm.DateTimeOffset' ||
          field.name.toLowerCase().includes('date') ||
          field.name.toLowerCase().includes('time') ||
          field.name.toLowerCase().includes('created') ||
          field.name.toLowerCase().includes('opened') ||
          field.name.toLowerCase().includes('updated')) {
        dateFields.push(fieldInfo);
      } else if (field.type.startsWith('Collection(Edm.Single)')) {
        vectorFields.push(fieldInfo);
      } else if (field.type === 'Edm.String') {
        textFields.push(fieldInfo);
      } else {
        otherFields.push(fieldInfo);
      }
    });

    // Display date fields (most important)
    if (dateFields.length > 0) {
      console.log('🗓️  DATE/TIME FIELDS (', dateFields.length, '):\n');
      dateFields.forEach((field) => {
        console.log(`   ✅ ${field.name}`);
        console.log(`      Type: ${field.type}`);
        console.log(`      Filterable: ${field.filterable ? '✅ YES' : '❌ NO'}`);
        console.log(`      Sortable: ${field.sortable ? '✅ YES' : '❌ NO'}`);
        console.log('');
      });
    } else {
      console.log('❌ NO DATE/TIME FIELDS FOUND\n');
    }

    // Display vector fields
    if (vectorFields.length > 0) {
      console.log('🧮 VECTOR FIELDS (', vectorFields.length, '):\n');
      vectorFields.forEach((field) => {
        console.log(`   ${field.name} (${field.type})`);
      });
      console.log('');
    }

    // Display text fields (condensed)
    console.log('📝 TEXT FIELDS (', textFields.length, '):\n');
    textFields.slice(0, 10).forEach((field) => {
      console.log(`   ${field.name}${field.searchable ? ' (searchable)' : ''}`);
    });
    if (textFields.length > 10) {
      console.log(`   ... and ${textFields.length - 10} more\n`);
    } else {
      console.log('');
    }

    // Display other fields
    if (otherFields.length > 0) {
      console.log('🔧 OTHER FIELDS (', otherFields.length, '):\n');
      otherFields.forEach((field) => {
        console.log(`   ${field.name} (${field.type})`);
      });
      console.log('');
    }

    // Step 2: Fetch a sample document
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📄 SAMPLE DOCUMENT');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Fetching sample document...\n');

    const searchUrl = `${endpoint}/indexes/${indexName}/docs/search?api-version=2024-07-01`;
    const sampleResponse = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        search: '*',
        top: 1,
        select: schema.fields.map((f: any) => f.name).join(','),
      }),
    });

    if (!sampleResponse.ok) {
      throw new Error(`Sample fetch failed: ${sampleResponse.status}`);
    }

    const sampleData = await sampleResponse.json();

    if (sampleData.value && sampleData.value.length > 0) {
      const sampleDoc = sampleData.value[0];

      console.log('Sample document fields:\n');
      Object.keys(sampleDoc).forEach((key) => {
        if (key === '@search.score') return;

        let value = sampleDoc[key];

        // Format value for display
        if (Array.isArray(value)) {
          value = `[${value.length} items]`;
        } else if (typeof value === 'string' && value.length > 80) {
          value = value.substring(0, 80) + '...';
        }

        console.log(`   ${key}: ${value}`);
      });
    } else {
      console.log('⚠️  No documents found in index');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 RECOMMENDATIONS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (dateFields.length > 0) {
      console.log('✅ Date fields found! You can use date filtering.\n');
      console.log('Update azure-search-client.ts to use:');
      dateFields.forEach((field) => {
        if (field.filterable) {
          console.log(`   - "${field.name}" for filtering`);
        }
      });
      console.log('');
    } else {
      console.log('❌ No date fields found in index.\n');
      console.log('Options:');
      console.log('   1. Re-index with date fields (recommended)');
      console.log('   2. Use client-side sorting by case_number (newer = higher)');
      console.log('   3. Remove date filtering requirement\n');
    }

  } catch (error) {
    console.error('❌ Inspection failed:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

inspectSchema();
