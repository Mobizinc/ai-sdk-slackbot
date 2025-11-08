/**
 * Extract Standard Changes for ServiceNow Platform Updates (Refactored)
 *
 * This script uses the reusable ServiceNow client infrastructure to:
 * - Query "Standard Change for ServiceNow Platform Updates" records
 * - Extract complete change data including related records
 * - Save in individual JSON files for offline replay
 *
 * ENVIRONMENT VARIABLES:
 * - SERVICENOW_URL: ServiceNow instance URL
 * - SERVICENOW_USERNAME: API username
 * - SERVICENOW_PASSWORD: API password
 *
 * USAGE:
 * pnpm run extract:standard-changes
 */

import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ServiceNowHttpClient } from '../lib/infrastructure/servicenow/client/http-client';
import { ServiceNowTableAPIClient } from '../lib/infrastructure/servicenow/client/table-api-client';
import { ChangeRepository, type ChangeRequest } from '../lib/infrastructure/servicenow/repositories/change-repository.impl';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

interface ExtractionOptions {
  maxChanges?: number; // Maximum changes to extract (default: 100)
  shortDescription?: string; // Filter by short description
  outputDir?: string; // Custom output directory
}

/**
 * Extract value from ServiceNow display_value format
 */
function extractValue<T = string>(field: any): T {
  if (typeof field === 'object' && field !== null) {
    if ('display_value' in field) {
      return field.display_value as T;
    }
    if ('value' in field) {
      return field.value as T;
    }
  }
  return field as T;
}

/**
 * Main extraction function
 */
async function extractStandardChanges(options: ExtractionOptions = {}) {
  console.log('📦 Extract Standard Changes for ServiceNow Platform Updates');
  console.log('='.repeat(80));
  console.log('');

  // ========================================
  // 1. Initialize ServiceNow Client
  // ========================================
  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ ServiceNow credentials not configured');
    console.log('\nRequired environment variables:');
    console.log('  - SERVICENOW_URL (e.g., https://mobiz.service-now.com)');
    console.log('  - SERVICENOW_USERNAME');
    console.log('  - SERVICENOW_PASSWORD');
    console.log('\nSet these in .env.local');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  Instance: ${instanceUrl}`);
  console.log(`  Username: ${username}`);
  console.log(`  Max Changes: ${options.maxChanges ?? 100}`);
  console.log('');

  // Initialize clients
  const httpClient = new ServiceNowHttpClient({
    instanceUrl,
    username,
    password,
    defaultTimeout: 60000, // 60 seconds
    maxRetries: 3,
  });

  const tableClient = new ServiceNowTableAPIClient(httpClient);
  const changeRepo = new ChangeRepository(tableClient);

  // ========================================
  // 2. Query Standard Changes
  // ========================================
  console.log('1. Querying Standard Changes');
  console.log('─'.repeat(80));

  const shortDescription = options.shortDescription ?? 'Standard Change for ServiceNow Platform Updates';
  const maxChanges = options.maxChanges ?? 100;

  const changes = await changeRepo.fetchStandardChanges(shortDescription, {
    maxRecords: maxChanges,
    sysparm_display_value: 'all',
    onProgress: (fetched, total) => {
      console.log(`  Fetched ${fetched}${total ? `/${total}` : ''} changes...`);
    },
  });

  console.log(`\n✅ Found ${changes.length} Standard Change(s)\n`);

  if (changes.length === 0) {
    console.log('⚠️  No changes found matching the query.');
    process.exit(0);
  }

  // Create output directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const outputDir = options.outputDir ?? path.join(process.cwd(), 'backup', 'standard-changes', timestamp);
  fs.mkdirSync(outputDir, { recursive: true });

  // Display summary
  console.log('Change Summary:');
  console.log('─'.repeat(80));
  for (const change of changes.slice(0, 10)) {
    const number = extractValue(change.number);
    const state = extractValue(change.state);
    const sysId = extractValue(change.sys_id);
    const createdOn = extractValue(change.sys_created_on);

    console.log(`  ${number}`);
    console.log(`    sys_id: ${sysId}`);
    console.log(`    State: ${state}`);
    console.log(`    Created: ${createdOn}`);
    console.log('');
  }

  if (changes.length > 10) {
    console.log(`  ... and ${changes.length - 10} more\n`);
  }

  // Save bulk export
  const changesPath = path.join(outputDir, 'change_requests.json');
  fs.writeFileSync(changesPath, JSON.stringify(changes, null, 2));
  console.log(`✅ Saved change requests: ${changesPath}\n`);

  // ========================================
  // 3. Extract Related Records
  // ========================================
  console.log('2. Extracting Related Records');
  console.log('─'.repeat(80));

  const allStateTransitions: Record<string, any[]> = {};
  const allComponentRefs: Record<string, any[]> = {};
  const allRelatedRecords: Record<string, any> = {};

  // Process each change
  for (const change of changes) {
    const sysId = extractValue(change.sys_id);
    const number = extractValue(change.number);

    console.log(`  Processing ${number}...`);

    try {
      // Fetch all related data in parallel
      const [stateTransitions, componentRefs, workNotes, comments, attachments] = await Promise.all([
        changeRepo.fetchStateTransitions(sysId),
        changeRepo.fetchComponentReferences(sysId),
        changeRepo.fetchWorkNotes(sysId),
        changeRepo.fetchComments(sysId),
        changeRepo.fetchAttachments(sysId),
      ]);

      // Store results
      allStateTransitions[sysId] = stateTransitions;
      allComponentRefs[sysId] = componentRefs;
      allRelatedRecords[sysId] = {
        work_notes: workNotes,
        comments,
        attachments,
      };

      const totalRelated = workNotes.length + comments.length + attachments.length;
      console.log(`    ✓ State transitions: ${stateTransitions.length}, Components: ${componentRefs.length}, Related: ${totalRelated}`);
    } catch (error) {
      console.error(`    ✗ Error: ${error instanceof Error ? error.message : String(error)}`);
      // Continue with empty data
      allStateTransitions[sysId] = [];
      allComponentRefs[sysId] = [];
      allRelatedRecords[sysId] = { work_notes: [], comments: [], attachments: [] };
    }
  }

  // Save bulk exports
  const stateTransitionsPath = path.join(outputDir, 'state_transitions.json');
  fs.writeFileSync(stateTransitionsPath, JSON.stringify(allStateTransitions, null, 2));
  console.log(`\n✅ Saved state transitions: ${stateTransitionsPath}`);

  const componentRefsPath = path.join(outputDir, 'component_references.json');
  fs.writeFileSync(componentRefsPath, JSON.stringify(allComponentRefs, null, 2));
  console.log(`✅ Saved component references: ${componentRefsPath}`);

  const relatedRecordsPath = path.join(outputDir, 'related_records.json');
  fs.writeFileSync(relatedRecordsPath, JSON.stringify(allRelatedRecords, null, 2));
  console.log(`✅ Saved related records: ${relatedRecordsPath}\n`);

  // ========================================
  // 4. Create Individual Change Files
  // ========================================
  console.log('3. Creating Individual Change Files');
  console.log('─'.repeat(80));

  const changesDir = path.join(outputDir, 'changes');
  fs.mkdirSync(changesDir, { recursive: true });

  const indexManifest: Array<{
    number: string;
    sys_id: string;
    file_path: string;
    state: string;
    created_on: string;
    state_transitions_count: number;
    component_references_count: number;
    related_records_count: number;
  }> = [];

  for (const change of changes) {
    const sysId = extractValue(change.sys_id);
    const number = extractValue(change.number);
    const state = extractValue(change.state);
    const createdOn = extractValue(change.sys_created_on);

    // Create individual change payload
    const changePayload = {
      metadata: {
        extracted_at: new Date().toISOString(),
        instance_url: instanceUrl,
        change_number: number,
        change_sys_id: sysId,
      },
      change_request: change,
      state_transitions: allStateTransitions[sysId] || [],
      component_references: allComponentRefs[sysId] || [],
      related_records: allRelatedRecords[sysId] || {
        work_notes: [],
        comments: [],
        attachments: [],
      },
    };

    // Save to individual file
    const changeFileName = `${number}.json`;
    const changeFilePath = path.join(changesDir, changeFileName);
    fs.writeFileSync(changeFilePath, JSON.stringify(changePayload, null, 2));
    console.log(`  ✅ Created ${changeFileName}`);

    // Add to index
    const relatedRecords = allRelatedRecords[sysId];
    const relatedCount = (relatedRecords?.work_notes?.length || 0) +
                        (relatedRecords?.comments?.length || 0) +
                        (relatedRecords?.attachments?.length || 0);

    indexManifest.push({
      number,
      sys_id: sysId,
      file_path: `changes/${changeFileName}`,
      state,
      created_on: createdOn,
      state_transitions_count: allStateTransitions[sysId]?.length || 0,
      component_references_count: allComponentRefs[sysId]?.length || 0,
      related_records_count: relatedCount,
    });
  }

  // Save index manifest
  const indexPayload = {
    metadata: {
      extracted_at: new Date().toISOString(),
      instance_url: instanceUrl,
      query: `short_description=${shortDescription}^ORDERBYDESCsys_created_on`,
      total_changes: changes.length,
    },
    changes: indexManifest,
  };

  const indexPath = path.join(outputDir, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(indexPayload, null, 2));
  console.log(`\n✅ Created index manifest: ${indexPath}\n`);

  // ========================================
  // 5. Summary
  // ========================================
  console.log('─'.repeat(80));
  console.log('📊 EXTRACTION SUMMARY');
  console.log('─'.repeat(80));
  console.log('');
  console.log(`Total Changes Extracted: ${changes.length}`);
  console.log(`Output Directory: ${outputDir}`);
  console.log('');
  console.log('✅ Extraction complete!');
  console.log('');
}

// Run the extraction
extractStandardChanges({
  maxChanges: 100,
  shortDescription: 'Standard Change for ServiceNow Platform Updates',
})
  .catch((error) => {
    console.error('');
    console.error('❌ Extraction failed:');
    console.error(error);
    if (error instanceof Error) {
      console.error('\nError details:', error.message);
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  });
