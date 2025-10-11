#!/usr/bin/env node

// Deployment readiness verification script
const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying deployment readiness...\n');

let errors = [];
let warnings = [];

// Check critical files exist
const criticalFiles = [
  'dist/api/events.js',
  'dist/lib/background-tasks.js',
  'vercel.json',
  'package.json',
  '.gitignore'
];

console.log('📁 Checking critical files...');
for (const file of criticalFiles) {
  if (fs.existsSync(file)) {
    console.log(`  ✅ ${file}`);
  } else {
    errors.push(`Missing critical file: ${file}`);
    console.log(`  ❌ ${file} - MISSING`);
  }
}

// Check vercel.json configuration
console.log('\n⚙️  Checking Vercel configuration...');
try {
  const vercelConfig = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));

  if (vercelConfig.functions && vercelConfig.functions['api/events.ts']) {
    console.log('  ✅ Events function configured');
    if (vercelConfig.functions['api/events.ts'].maxDuration) {
      console.log(`  ✅ maxDuration set to ${vercelConfig.functions['api/events.ts'].maxDuration}s`);
    } else {
      warnings.push('maxDuration not set for events function');
      console.log('  ⚠️  maxDuration not set');
    }
  } else {
    errors.push('Events function not configured in vercel.json');
    console.log('  ❌ Events function not configured');
  }

  if (vercelConfig.outputDirectory === 'dist') {
    console.log('  ✅ Output directory correctly set to "dist"');
  } else {
    errors.push('Output directory not set to "dist" in vercel.json');
    console.log('  ❌ Output directory not correctly configured');
  }
} catch (e) {
  errors.push(`Failed to parse vercel.json: ${e.message}`);
  console.log(`  ❌ Failed to parse vercel.json`);
}

// Check environment variables documentation
console.log('\n🔐 Environment variables needed:');
const requiredEnvVars = [
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
  'SLACK_APP_ID',
  'AI_GATEWAY_URL',
  'OPENAI_API_KEY'
];

console.log('  The following environment variables must be set in Vercel:');
for (const envVar of requiredEnvVars) {
  console.log(`  • ${envVar}`);
}

// Check for Next.js remnants
console.log('\n🧹 Checking for Next.js remnants...');
const nextjsIndicators = [
  'next.config.js',
  'app/',
  'components/',
  'public/',
  '.next/'
];

let hasNextJs = false;
for (const indicator of nextjsIndicators) {
  if (fs.existsSync(indicator)) {
    hasNextJs = true;
    warnings.push(`Next.js remnant found: ${indicator}`);
    console.log(`  ⚠️  Found: ${indicator}`);
  }
}
if (!hasNextJs) {
  console.log('  ✅ No Next.js components found (clean Vercel Functions project)');
}

// Test CommonJS module loading
console.log('\n📦 Testing module loading...');
try {
  const events = require('../dist/api/events');
  if (typeof events.POST === 'function' && typeof events.GET === 'function') {
    console.log('  ✅ Events handler exports found (POST, GET)');
  } else {
    errors.push('Events handler missing required exports');
    console.log('  ❌ Events handler missing POST/GET exports');
  }
} catch (e) {
  // This might fail due to missing dependencies at runtime, but syntax should work
  if (e.code === 'MODULE_NOT_FOUND' && !e.message.includes('dist/api/events')) {
    console.log('  ✅ Events handler syntax valid (runtime dependencies may be missing locally)');
  } else {
    errors.push(`Failed to load events handler: ${e.message}`);
    console.log(`  ❌ Failed to load events handler`);
  }
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 DEPLOYMENT READINESS SUMMARY\n');

if (errors.length === 0) {
  console.log('✅ All critical checks passed!');
  console.log('   Your webhook is ready for deployment to Vercel.\n');

  if (warnings.length > 0) {
    console.log('⚠️  Warnings:');
    warnings.forEach(w => console.log(`   • ${w}`));
    console.log('');
  }

  console.log('📌 Next steps:');
  console.log('   1. Ensure all environment variables are set in Vercel dashboard');
  console.log('   2. Deploy with: git push (or vercel deploy)');
  console.log('   3. Test the webhook endpoint at: https://your-app.vercel.app/api/events');
  console.log('   4. Configure Slack app to point to your webhook URL');

  process.exit(0);
} else {
  console.log('❌ Deployment blocked due to errors:\n');
  errors.forEach(e => console.log(`   • ${e}`));
  console.log('\nPlease fix these issues before deploying.');
  process.exit(1);
}