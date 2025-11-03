import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

async function testKey() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  console.log('Testing Anthropic API with raw fetch...');
  console.log('API Key first 25 chars:', apiKey?.substring(0, 25));
  console.log('API Key length:', apiKey?.length);
  console.log('API Key last 10 chars:', apiKey?.substring((apiKey?.length || 0) - 10));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey || '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 10,
      messages: [{role: 'user', content: 'Hi'}]
    })
  });

  console.log('Status:', response.status, response.statusText);

  if (!response.ok) {
    const text = await response.text();
    console.error('❌ API call failed:');
    console.error(text);
    process.exit(1);
  }

  const data = await response.json();
  console.log('✅ Anthropic API working!');
  console.log('Response:', JSON.stringify(data, null, 2).substring(0, 300));
}

testKey().catch(err => {
  console.error('❌ Test failed:');
  console.error(err);
  process.exit(1);
});
