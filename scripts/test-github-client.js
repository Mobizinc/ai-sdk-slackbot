#!/usr/bin/env node

/**
 * Simple test to verify GitHub client can be imported and initialized
 * This tests the @octokit/rest CommonJS compatibility fix
 */

console.log('🧪 Testing GitHub client module...\n');

try {
  // Test 1: Import the module
  console.log('✓ Step 1: Importing GitHub client module...');
  const { getGitHubClient } = require('../dist/lib/integrations/github/client.js');
  console.log('  ✅ Module imported successfully\n');

  // Test 2: Check Octokit is available
  console.log('✓ Step 2: Verifying Octokit dependency...');
  const { Octokit } = require('@octokit/rest');
  console.log('  ✅ @octokit/rest v21.x loaded correctly\n');

  // Test 3: Try to initialize client (will fail without credentials, but proves it's callable)
  console.log('✓ Step 3: Testing client initialization...');
  getGitHubClient().then(() => {
    console.log('  ✅ Client initialized successfully\n');
    console.log('🎉 All tests passed! GitHub client is working correctly.\n');
    process.exit(0);
  }).catch((err) => {
    // Expected to fail if credentials aren't configured
    if (err.message.includes('GitHub App configuration')) {
      console.log('  ⚠️  Client callable but needs credentials (expected)\n');
      console.log('🎉 Module test passed! The ERR_REQUIRE_ESM error is fixed.\n');
      console.log('💡 Note: To fully test, configure GitHub App credentials in environment variables.\n');
      process.exit(0);
    } else {
      throw err;
    }
  });

} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error('\nFull error:', error);
  process.exit(1);
}
