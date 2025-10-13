/**
 * Check Azure AI Search Index Schema
 * Verifies if the index has vector fields (embeddings) or just text fields
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local explicitly
config({ path: resolve(process.cwd(), '.env.local') });

async function checkIndexSchema() {
  const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
  const apiKey = process.env.AZURE_SEARCH_KEY;
  const indexName = process.env.AZURE_SEARCH_INDEX_NAME || 'case-intelligence-prod';

  if (!endpoint || !apiKey) {
    console.error('❌ Azure Search not configured');
    process.exit(1);
  }

  try {
    // Get index definition
    const indexUrl = `${endpoint}/indexes/${indexName}?api-version=2024-07-01`;

    const response = await fetch(indexUrl, {
      headers: {
        'api-key': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get index: ${response.status} ${response.statusText}`);
    }

    const indexDef = await response.json();

    console.log('🔍 Azure AI Search Index Analysis');
    console.log('================================\n');
    console.log(`Index Name: ${indexDef.name}`);
    console.log(`Fields: ${indexDef.fields.length} total\n`);

    // Check for vector fields
    const vectorFields = indexDef.fields.filter((f: any) =>
      f.type === 'Collection(Edm.Single)' || f.dimensions
    );

    console.log('📊 Field Analysis:\n');

    // Categorize fields
    const textFields = indexDef.fields.filter((f: any) =>
      f.type === 'Edm.String' && f.searchable
    );
    const filterableFields = indexDef.fields.filter((f: any) => f.filterable);

    console.log(`Text/Searchable Fields (${textFields.length}):`);
    textFields.slice(0, 10).forEach((f: any) => {
      console.log(`  - ${f.name} (${f.type})`);
    });
    if (textFields.length > 10) {
      console.log(`  ... and ${textFields.length - 10} more`);
    }

    console.log(`\nVector Fields (${vectorFields.length}):`);
    if (vectorFields.length > 0) {
      vectorFields.forEach((f: any) => {
        console.log(`  - ${f.name}`);
        console.log(`    Type: ${f.type}`);
        console.log(`    Dimensions: ${f.dimensions || 'N/A'}`);
        console.log(`    Vector Search Profile: ${f.vectorSearchProfile || 'N/A'}`);
      });
    } else {
      console.log('  ❌ NO VECTOR FIELDS FOUND');
      console.log('  → Index uses KEYWORD SEARCH ONLY (BM25)');
    }

    console.log(`\nFilterable Fields (${filterableFields.length}):`);
    filterableFields.slice(0, 10).forEach((f: any) => {
      console.log(`  - ${f.name} (${f.type})`);
    });

    // Check for vector search configuration
    console.log('\n🔧 Vector Search Configuration:\n');
    if (indexDef.vectorSearch) {
      console.log('✅ Vector Search Enabled');
      console.log(`   Profiles: ${indexDef.vectorSearch.profiles?.length || 0}`);
      console.log(`   Algorithms: ${indexDef.vectorSearch.algorithms?.length || 0}`);

      if (indexDef.vectorSearch.profiles) {
        indexDef.vectorSearch.profiles.forEach((p: any) => {
          console.log(`   - Profile: ${p.name}`);
          console.log(`     Algorithm: ${p.algorithmConfigurationName}`);
        });
      }
    } else {
      console.log('❌ Vector Search NOT Configured');
    }

    // Check for semantic search
    console.log('\n🧠 Semantic Search Configuration:\n');
    if (indexDef.semanticSearch) {
      console.log('✅ Semantic Search Enabled');
      console.log(`   Configurations: ${indexDef.semanticSearch.configurations?.length || 0}`);
    } else {
      console.log('❌ Semantic Search NOT Configured');
    }

    // Recommendation
    console.log('\n💡 Recommendation:\n');
    if (vectorFields.length > 0) {
      console.log('✅ Use VECTOR SEARCH (embeddings available)');
      console.log('   - More accurate semantic matching');
      console.log('   - Better cross-client pattern recognition');
      console.log('   - Update azure-search-client.ts to use vector search');
    } else {
      console.log('⚠️  Use KEYWORD SEARCH (no embeddings available)');
      console.log('   - Current BM25 implementation is correct');
      console.log('   - To enable vector search:');
      console.log('     1. Generate embeddings for all cases');
      console.log('     2. Add vector field to index');
      console.log('     3. Re-index documents with embeddings');
    }

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

checkIndexSchema();
