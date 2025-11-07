/**
 * Test ServiceNow webhook signature with your actual secret and payload
 *
 * Usage:
 *   SERVICENOW_WEBHOOK_SECRET="your-secret" \
 *   npx tsx test-servicenow-signature.ts \
 *     '{"case_number":"CS0001234","sys_id":"55fe003e06c02ae2ec4b553d38396dab"}' \
 *     'signature-from-servicenow'
 */
import { createHmac } from 'crypto';

const secret = process.env.SERVICENOW_WEBHOOK_SECRET;
const payload = process.argv[2];
const receivedSignature = process.argv[3];

if (!secret) {
  console.error('❌ Error: SERVICENOW_WEBHOOK_SECRET environment variable not set');
  console.log('\nUsage:');
  console.log('  SERVICENOW_WEBHOOK_SECRET="your-secret" \\');
  console.log('  npx tsx test-servicenow-signature.ts \\');
  console.log('    \'{"case_number":"CS0001234"}\' \\');
  console.log('    \'received-signature\'');
  process.exit(1);
}

if (!payload) {
  console.error('❌ Error: Payload argument required');
  console.log('\nUsage:');
  console.log('  SERVICENOW_WEBHOOK_SECRET="your-secret" \\');
  console.log('  npx tsx test-servicenow-signature.ts \\');
  console.log('    \'{"case_number":"CS0001234"}\' \\');
  console.log('    \'received-signature\'');
  process.exit(1);
}

console.log('\n━━━ ServiceNow Webhook Signature Test ━━━\n');
console.log(`Secret: ${secret.substring(0, 10)}...${secret.substring(secret.length - 4)} (${secret.length} chars)`);
console.log(`Payload: ${payload.substring(0, 80)}${payload.length > 80 ? '...' : ''}`);
console.log(`Payload length: ${payload.length} bytes\n`);

// Generate expected signatures
const hexSignature = createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

const base64Signature = createHmac('sha256', secret)
  .update(payload)
  .digest('base64');

console.log('Expected Signatures:');
console.log('─'.repeat(70));
console.log(`Hex:    ${hexSignature}`);
console.log(`Base64: ${base64Signature}\n`);

if (receivedSignature) {
  console.log('Received Signature:');
  console.log('─'.repeat(70));
  console.log(`${receivedSignature}\n`);

  const isHexMatch = receivedSignature === hexSignature;
  const isBase64Match = receivedSignature === base64Signature;

  console.log('Validation Result:');
  console.log('─'.repeat(70));

  if (isHexMatch) {
    console.log('✅ VALID - Signature matches (hex format)');
  } else if (isBase64Match) {
    console.log('✅ VALID - Signature matches (base64 format)');
  } else {
    console.log('❌ INVALID - Signature does not match either format');
    console.log('\nPossible issues:');
    console.log('  • Wrong webhook secret');
    console.log('  • Payload was modified/normalized (whitespace, encoding)');
    console.log('  • ServiceNow using different HMAC algorithm');
    console.log('  • Signature was truncated or corrupted');
  }
} else {
  console.log('💡 No signature provided for validation');
  console.log('   Use these signatures to configure ServiceNow Business Rule\n');
}
