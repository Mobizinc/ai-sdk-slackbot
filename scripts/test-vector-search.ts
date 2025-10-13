/**
 * Test Vector Search vs Keyword Search
 * Compares results from both search methods
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createAzureSearchClient } from '../lib/services/azure-search-client';

async function testVectorSearch() {
  console.log('🔍 Testing Vector Search vs Keyword Search');
  console.log('==========================================\n');

  const searchClient = createAzureSearchClient();

  if (!searchClient) {
    console.error('❌ Azure Search not configured');
    process.exit(1);
  }

  const testQueries = [
    'timeclock not working',
    'scanner malfunction',
    'internet connectivity issue',
    'password reset needed',
    'email not sending',
  ];

  for (const query of testQueries) {
    console.log(`\n📝 Query: "${query}"`);
    console.log('─'.repeat(60));

    try {
      const results = await searchClient.searchSimilarCases(query, {
        topK: 3,
        crossClient: true,
      });

      if (results.length === 0) {
        console.log('   No results found');
        continue;
      }

      console.log(`   Found ${results.length} similar cases:\n`);

      results.forEach((result, i) => {
        const clientLabel = result.same_client
          ? '[Your Organization]'
          : result.client_name
          ? `[${result.client_name}]`
          : '[Different Client]';

        console.log(`   ${i + 1}. ${result.case_number} ${clientLabel}`);
        console.log(`      ${result.short_description?.substring(0, 60)}...`);
        console.log(`      Score: ${result.similarity_score.toFixed(4)}`);
        console.log(`      Category: ${result.category || 'N/A'}`);
      });
    } catch (error) {
      console.error(`   ❌ Error:`, error instanceof Error ? error.message : error);
    }
  }

  console.log('\n✅ Vector search test complete');
}

testVectorSearch();
