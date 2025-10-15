/**
 * Test webhook authentication methods
 */

const WEBHOOK_SECRET = '1ecbd5b55928136d040bf39a01d985472db697f8279d79d365d00e30c4fcd758';

// Test payload
const testPayload = {
  case_number: "SCS0048189",
  sys_id: "75673a399320361093733ec47aba1089",
  short_description: "test"
};

const payloadString = JSON.stringify(testPayload);

// Simulate the validateRequest function
function validateRequest(url: string, headers: Record<string, string>, payload: string): boolean {
  if (!WEBHOOK_SECRET) {
    console.warn('[Webhook] No SERVICENOW_WEBHOOK_SECRET configured, allowing request');
    return true;
  }

  // Method 1: Simple API key in header (x-api-key)
  const apiKeyHeader = headers['x-api-key'] || headers['x-functions-key'];
  if (apiKeyHeader === WEBHOOK_SECRET) {
    console.info('[Webhook] ✅ Authenticated via API key (header)');
    return true;
  }

  // Method 2: Simple API key in query param (?code=xxx)
  const urlObj = new URL(url);
  const apiKeyQuery = urlObj.searchParams.get('code');
  if (apiKeyQuery === WEBHOOK_SECRET) {
    console.info('[Webhook] ✅ Authenticated via API key (query param)');
    return true;
  }

  // Method 3: HMAC signature
  const signature = headers['x-servicenow-signature'] || headers['signature'] || '';
  if (signature) {
    const { createHmac } = require('crypto');
    const hexSignature = createHmac('sha256', WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');
    const base64Signature = createHmac('sha256', WEBHOOK_SECRET)
      .update(payload)
      .digest('base64');

    if (signature === hexSignature || signature === base64Signature) {
      console.info('[Webhook] ✅ Authenticated via HMAC signature');
      return true;
    }
  }

  // All authentication methods failed
  return false;
}

console.log('\n━━━ Webhook Authentication Test ━━━\n');

// Test 1: Query parameter (?code=xxx) - Azure Functions style
console.log('Test 1: Query Parameter Authentication (?code=xxx)');
console.log('─'.repeat(60));
const url1 = `https://example.com/api/servicenow-webhook?code=${WEBHOOK_SECRET}`;
const result1 = validateRequest(url1, {}, payloadString);
console.log(`Result: ${result1 ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 2: Header authentication (x-api-key)
console.log('Test 2: Header Authentication (x-api-key)');
console.log('─'.repeat(60));
const url2 = 'https://example.com/api/servicenow-webhook';
const headers2 = { 'x-api-key': WEBHOOK_SECRET };
const result2 = validateRequest(url2, headers2, payloadString);
console.log(`Result: ${result2 ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 3: HMAC signature (base64)
console.log('Test 3: HMAC Signature Authentication (base64)');
console.log('─'.repeat(60));
const { createHmac } = require('crypto');
const signature = createHmac('sha256', WEBHOOK_SECRET)
  .update(payloadString)
  .digest('base64');
const url3 = 'https://example.com/api/servicenow-webhook';
const headers3 = { 'x-servicenow-signature': signature };
const result3 = validateRequest(url3, headers3, payloadString);
console.log(`Result: ${result3 ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 4: Invalid authentication
console.log('Test 4: Invalid Authentication (should fail)');
console.log('─'.repeat(60));
const url4 = 'https://example.com/api/servicenow-webhook';
const headers4 = { 'x-api-key': 'wrong-key' };
const result4 = validateRequest(url4, headers4, payloadString);
console.log(`Result: ${!result4 ? '✅ PASS (correctly rejected)' : '❌ FAIL'}\n`);

// Summary
console.log('━━━ Test Summary ━━━');
console.log(`Query parameter (?code=xxx): ${result1 ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Header (x-api-key):           ${result2 ? '✅ PASS' : '❌ FAIL'}`);
console.log(`HMAC signature (base64):      ${result3 ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Invalid auth rejection:       ${!result4 ? '✅ PASS' : '❌ FAIL'}`);

const allPassed = result1 && result2 && result3 && !result4;
console.log(`\nOverall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
