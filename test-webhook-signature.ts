/**
 * Test webhook signature validation with both hex and base64 formats
 */
import { createHmac } from 'crypto';

// Test configuration
const TEST_SECRET = 'test-webhook-secret';
const TEST_PAYLOAD = JSON.stringify({
  case_number: 'CS0001234',
  sys_id: '55fe003e06c02ae2ec4b553d38396dab',
  short_description: 'Test webhook signature validation',
  description: 'Testing both hex and base64 HMAC formats'
});

function validateSignature(payload: string, signature: string, secret: string): boolean {
  if (!secret) {
    console.warn('[Test] No webhook secret configured, skipping signature validation');
    return true;
  }

  // ServiceNow may send signatures in either hex or base64 format
  const hexSignature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const base64Signature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64');

  console.log(`[Test] Expected hex:    ${hexSignature}`);
  console.log(`[Test] Expected base64: ${base64Signature}`);
  console.log(`[Test] Received:        ${signature}`);

  const isHexMatch = signature === hexSignature;
  const isBase64Match = signature === base64Signature;

  if (isHexMatch) {
    console.log(`[Test] ✅ Signature matched (hex format)`);
  } else if (isBase64Match) {
    console.log(`[Test] ✅ Signature matched (base64 format)`);
  } else {
    console.log(`[Test] ❌ Signature did not match either format`);
  }

  return isHexMatch || isBase64Match;
}

// Generate both signature formats
const hexSignature = createHmac('sha256', TEST_SECRET)
  .update(TEST_PAYLOAD)
  .digest('hex');

const base64Signature = createHmac('sha256', TEST_SECRET)
  .update(TEST_PAYLOAD)
  .digest('base64');

console.log('\n━━━ Webhook Signature Validation Test ━━━\n');
console.log(`Secret: ${TEST_SECRET}`);
console.log(`Payload length: ${TEST_PAYLOAD.length} bytes\n`);

// Test 1: Hex format
console.log('Test 1: Hex-encoded signature');
console.log('─'.repeat(50));
const hexResult = validateSignature(TEST_PAYLOAD, hexSignature, TEST_SECRET);
console.log(`Result: ${hexResult ? 'PASS ✅' : 'FAIL ❌'}\n`);

// Test 2: Base64 format
console.log('Test 2: Base64-encoded signature');
console.log('─'.repeat(50));
const base64Result = validateSignature(TEST_PAYLOAD, base64Signature, TEST_SECRET);
console.log(`Result: ${base64Result ? 'PASS ✅' : 'FAIL ❌'}\n`);

// Test 3: Invalid signature
console.log('Test 3: Invalid signature (should fail)');
console.log('─'.repeat(50));
const invalidResult = validateSignature(TEST_PAYLOAD, 'invalid-signature-12345', TEST_SECRET);
console.log(`Result: ${!invalidResult ? 'PASS ✅ (correctly rejected)' : 'FAIL ❌'}\n`);

// Test 4: User-provided hash
console.log('Test 4: User-provided hash (55fe003e06c02ae2ec4b553d38396dab)');
console.log('─'.repeat(50));
const userHash = '55fe003e06c02ae2ec4b553d38396dab';
console.log(`Note: This appears to be a hex hash (64 chars)`);
console.log(`Testing if it matches our payload with TEST_SECRET...\n`);
const userHashResult = validateSignature(TEST_PAYLOAD, userHash, TEST_SECRET);
console.log(`Result: ${userHashResult ? 'PASS ✅' : 'FAIL ❌'}\n`);

// Summary
console.log('━━━ Test Summary ━━━');
console.log(`Hex format validation:    ${hexResult ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Base64 format validation: ${base64Result ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Invalid signature rejection: ${!invalidResult ? '✅ PASS' : '❌ FAIL'}`);
console.log(`User hash test: ${userHashResult ? '✅ PASS' : '❌ FAIL'}`);

const allPassed = hexResult && base64Result && !invalidResult;
console.log(`\nOverall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
