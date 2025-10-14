/**
 * Configure Client Catalog Redirect Settings
 *
 * Usage:
 *   npx tsx scripts/configure-client-catalog-redirect.ts <client_sys_id> <client_name> [options]
 *
 * Example:
 *   npx tsx scripts/configure-client-catalog-redirect.ts \
 *     "abc123xyz789" \
 *     "Acme Corporation" \
 *     --enabled=true \
 *     --confidence=0.5 \
 *     --auto-close=false
 */

import * as dotenv from "dotenv";
import { getClientSettingsRepository } from '../lib/db/repositories/client-settings-repository';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

interface ConfigOptions {
  clientId: string;
  clientName: string;
  enabled?: boolean;
  confidenceThreshold?: number;
  autoClose?: boolean;
  supportContact?: string;
}

async function configureClient(options: ConfigOptions) {
  const repo = getClientSettingsRepository();

  console.log('🔧 Configuring catalog redirect for client...');
  console.log(`   Client ID: ${options.clientId}`);
  console.log(`   Client Name: ${options.clientName}`);
  console.log('');

  try {
    // Check if client already exists
    const existing = await repo.getClientSettings(options.clientId);

    if (existing) {
      console.log(`ℹ️  Client settings already exist. Updating...`);
      console.log(`   Current settings:`);
      console.log(`     - Enabled: ${existing.catalogRedirectEnabled}`);
      console.log(`     - Confidence Threshold: ${existing.catalogRedirectConfidenceThreshold}`);
      console.log(`     - Auto-close: ${existing.catalogRedirectAutoClose}`);
      console.log('');
    }

    // Prepare settings
    const settings = {
      clientId: options.clientId,
      clientName: options.clientName,
      catalogRedirectEnabled: options.enabled ?? true,
      catalogRedirectConfidenceThreshold: options.confidenceThreshold ?? 0.5,
      catalogRedirectAutoClose: options.autoClose ?? false,
      supportContactInfo: options.supportContact || process.env.SUPPORT_CONTACT_INFO || 'IT Support at support@company.com',
      customCatalogMappings: existing?.customCatalogMappings || [],
      features: existing?.features || {},
      notes: existing?.notes,
      createdBy: existing?.createdBy,
      updatedBy: 'configure-client-catalog-redirect.ts',
    };

    // Upsert settings
    const result = await repo.upsertClientSettings(settings);

    console.log('✅ Client configured successfully!');
    console.log('');
    console.log('   Final settings:');
    console.log(`     - Client ID: ${result.clientId}`);
    console.log(`     - Client Name: ${result.clientName}`);
    console.log(`     - Catalog Redirect Enabled: ${result.catalogRedirectEnabled ? '✅ YES' : '❌ NO'}`);
    console.log(`     - Confidence Threshold: ${result.catalogRedirectConfidenceThreshold} (${Math.round(result.catalogRedirectConfidenceThreshold * 100)}%)`);
    console.log(`     - Auto-close Cases: ${result.catalogRedirectAutoClose ? '✅ YES' : '❌ NO (work notes only)'}`);
    console.log(`     - Support Contact: ${result.supportContactInfo}`);
    console.log(`     - Created: ${result.createdAt.toISOString()}`);
    console.log(`     - Updated: ${result.updatedAt.toISOString()}`);
    console.log('');
    console.log('ℹ️  Next steps:');
    console.log('   1. Verify the ServiceNow webhook is configured with enableCatalogRedirect: true');
    console.log('   2. Submit a test case with HR keywords (e.g., "onboarding", "new hire")');
    console.log('   3. Check the case for a work note with catalog item links');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to configure client:', error);
    process.exit(1);
  }
}

// Parse command line arguments
function parseArgs(): ConfigOptions {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: npx tsx scripts/configure-client-catalog-redirect.ts <client_sys_id> <client_name> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --enabled=<true|false>        Enable/disable catalog redirect (default: true)');
    console.error('  --confidence=<0.0-1.0>        Confidence threshold (default: 0.5)');
    console.error('  --auto-close=<true|false>     Auto-close cases vs work notes only (default: false)');
    console.error('  --support-contact=<string>    Support contact info for messages');
    console.error('');
    console.error('Example:');
    console.error('  npx tsx scripts/configure-client-catalog-redirect.ts \\');
    console.error('    "abc123xyz789" \\');
    console.error('    "Acme Corporation" \\');
    console.error('    --enabled=true \\');
    console.error('    --confidence=0.5 \\');
    console.error('    --auto-close=false');
    process.exit(1);
  }

  const clientId = args[0];
  const clientName = args[1];
  const options: ConfigOptions = { clientId, clientName };

  // Parse optional flags
  for (let i = 2; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--enabled=')) {
      options.enabled = arg.split('=')[1] === 'true';
    } else if (arg.startsWith('--confidence=')) {
      options.confidenceThreshold = parseFloat(arg.split('=')[1]);
    } else if (arg.startsWith('--auto-close=')) {
      options.autoClose = arg.split('=')[1] === 'true';
    } else if (arg.startsWith('--support-contact=')) {
      options.supportContact = arg.split('=')[1];
    }
  }

  return options;
}

// Run the configuration
const options = parseArgs();
configureClient(options);
