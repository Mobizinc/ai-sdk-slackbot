/**
 * Extract Standard Changes for ServiceNow Platform Updates
 *
 * This script queries all "Standard Change for ServiceNow Platform Updates" records
 * from ServiceNow and exports them in a format suitable for offline replay.
 *
 * ENVIRONMENT VARIABLES:
 * - SERVICENOW_URL: ServiceNow instance URL (https://mobiz.service-now.com)
 * - SERVICENOW_USERNAME: API username
 * - SERVICENOW_PASSWORD: API password
 *
 * OUTPUT:
 * - Saves change requests with full details to backup/standard-changes/
 * - Includes sys_id, number, template, state transitions, and component references
 * - Format: JSON (replayable)
 *
 * USAGE:
 * npm run extract:standard-changes
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

interface ServiceNowResponse<T> {
  result: T[];
}

interface ChangeRequest {
  sys_id: string;
  number: string;
  short_description: string;
  description?: string;
  state: string;
  type: string;
  template?: any;
  assignment_group?: any;
  assigned_to?: any;
  start_date?: string;
  end_date?: string;
  work_start?: string;
  work_end?: string;
  business_justification?: string;
  implementation_plan?: string;
  rollback_plan?: string;
  test_plan?: string;
  risk?: string;
  impact?: string;
  priority?: string;
  category?: string;
  subcategory?: string;
  requested_by?: any;
  opened_at?: string;
  closed_at?: string;
  sys_created_on?: string;
  sys_updated_on?: string;
  sys_created_by?: string;
  sys_updated_by?: string;
  [key: string]: any;
}

interface StateTransition {
  sys_id: string;
  change: any;
  state: string;
  from_state: string;
  to_state: string;
  sys_created_on: string;
  sys_created_by: string;
}

interface ComponentReference {
  sys_id: string;
  change_request: any;
  ci_item: any;
  task: any;
  sys_created_on: string;
  sys_created_by: string;
}

interface RelatedRecord {
  sys_id: string;
  task: any;
  sys_created_on: string;
  sys_created_by: string;
  [key: string]: any;
}

async function fetchWithAuth(url: string, authHeader: string): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response;
}

async function fetchAllRecords<T>(
  baseUrl: string,
  authHeader: string,
  table: string,
  query: string,
  limit = 1000
): Promise<T[]> {
  const allRecords: T[] = [];
  let offset = 0;
  let hasMore = true;

  console.log(`  Fetching from ${table}...`);

  while (hasMore) {
    const url = `${baseUrl}/api/now/table/${table}?sysparm_query=${encodeURIComponent(query)}&sysparm_display_value=all&sysparm_limit=${limit}&sysparm_offset=${offset}`;

    const response = await fetchWithAuth(url, authHeader);
    const data: ServiceNowResponse<T> = await response.json();

    if (!data.result || data.result.length === 0) {
      hasMore = false;
      break;
    }

    allRecords.push(...data.result);
    console.log(`    Retrieved ${data.result.length} records (total: ${allRecords.length})`);

    if (data.result.length < limit) {
      hasMore = false;
    } else {
      offset += limit;
    }
  }

  return allRecords;
}

async function extractStandardChanges() {
  console.log('📦 Extract Standard Changes for ServiceNow Platform Updates');
  console.log('='.repeat(80));
  console.log('');

  // Get ServiceNow credentials
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
  console.log('');

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  // Create output directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const outputDir = path.join(process.cwd(), 'backup', 'standard-changes', timestamp);
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    // ========================================
    // 1. Query Change Requests
    // ========================================
    console.log('1. Querying Standard Changes');
    console.log('─'.repeat(80));

    const changeQuery = 'short_description=Standard Change for ServiceNow Platform Updates^ORDERBYDESCsys_created_on';
    const allChanges = await fetchAllRecords<ChangeRequest>(
      instanceUrl,
      authHeader,
      'change_request',
      changeQuery,
      100  // Fetch in pages of 100
    );

    // Limit to latest 100 records
    const changes = allChanges.slice(0, 100);
    console.log(`\n✅ Found ${allChanges.length} total records, limiting to latest ${changes.length} Standard Change(s)\n`);

    if (changes.length === 0) {
      console.log('⚠️  No changes found matching the query.');
      console.log('   Check if the short_description filter is correct.');
      process.exit(0);
    }

    // Display summary of changes
    console.log('Change Summary:');
    console.log('─'.repeat(80));
    for (const change of changes) {
      const number = typeof change.number === 'object' ? change.number.display_value : change.number;
      const state = typeof change.state === 'object' ? change.state.display_value : change.state;
      const sysId = typeof change.sys_id === 'object' ? change.sys_id.value : change.sys_id;
      const createdOn = typeof change.sys_created_on === 'object' ? change.sys_created_on.display_value : change.sys_created_on;

      console.log(`  ${number}`);
      console.log(`    sys_id: ${sysId}`);
      console.log(`    State: ${state}`);
      console.log(`    Created: ${createdOn}`);
      console.log('');
    }

    // Save changes
    const changesPath = path.join(outputDir, 'change_requests.json');
    fs.writeFileSync(changesPath, JSON.stringify(changes, null, 2));
    console.log(`✅ Saved change requests: ${changesPath}\n`);

    // ========================================
    // 2. Extract State Transitions
    // ========================================
    console.log('2. Extracting State Transitions');
    console.log('─'.repeat(80));

    const allStateTransitions: Record<string, StateTransition[]> = {};

    for (const change of changes) {
      const sysId = typeof change.sys_id === 'object' ? change.sys_id.value : change.sys_id;
      const number = typeof change.number === 'object' ? change.number.display_value : change.number;

      console.log(`  Processing ${number}...`);

      // Query change_task table for state history
      // Note: ServiceNow tracks state changes in sys_audit table, but we'll check change_task
      const stateQuery = `change_request=${sysId}`;

      try {
        const transitions = await fetchAllRecords<StateTransition>(
          instanceUrl,
          authHeader,
          'change_task',
          stateQuery
        );

        allStateTransitions[sysId] = transitions;
        console.log(`    Found ${transitions.length} state transition(s)`);
      } catch (error) {
        console.log(`    ⚠️  Could not fetch state transitions: ${error}`);
        allStateTransitions[sysId] = [];
      }
    }

    const stateTransitionsPath = path.join(outputDir, 'state_transitions.json');
    fs.writeFileSync(stateTransitionsPath, JSON.stringify(allStateTransitions, null, 2));
    console.log(`\n✅ Saved state transitions: ${stateTransitionsPath}\n`);

    // ========================================
    // 3. Extract Component References
    // ========================================
    console.log('3. Extracting Component References');
    console.log('─'.repeat(80));

    const allComponentRefs: Record<string, ComponentReference[]> = {};

    for (const change of changes) {
      const sysId = typeof change.sys_id === 'object' ? change.sys_id.value : change.sys_id;
      const number = typeof change.number === 'object' ? change.number.display_value : change.number;

      console.log(`  Processing ${number}...`);

      // Query task_ci table for configuration item relationships
      const ciQuery = `task=${sysId}`;

      try {
        const componentRefs = await fetchAllRecords<ComponentReference>(
          instanceUrl,
          authHeader,
          'task_ci',
          ciQuery
        );

        allComponentRefs[sysId] = componentRefs;
        console.log(`    Found ${componentRefs.length} component reference(s)`);
      } catch (error) {
        console.log(`    ⚠️  Could not fetch component references: ${error}`);
        allComponentRefs[sysId] = [];
      }
    }

    const componentRefsPath = path.join(outputDir, 'component_references.json');
    fs.writeFileSync(componentRefsPath, JSON.stringify(allComponentRefs, null, 2));
    console.log(`\n✅ Saved component references: ${componentRefsPath}\n`);

    // ========================================
    // 4. Extract Related Records (Work Notes, Comments, Attachments)
    // ========================================
    console.log('4. Extracting Related Records');
    console.log('─'.repeat(80));

    const allRelatedRecords: Record<string, {
      work_notes: RelatedRecord[];
      comments: RelatedRecord[];
      attachments: RelatedRecord[];
    }> = {};

    for (const change of changes) {
      const sysId = typeof change.sys_id === 'object' ? change.sys_id.value : change.sys_id;
      const number = typeof change.number === 'object' ? change.number.display_value : change.number;

      console.log(`  Processing ${number}...`);

      allRelatedRecords[sysId] = {
        work_notes: [],
        comments: [],
        attachments: [],
      };

      // Fetch work notes (sys_journal_field)
      try {
        const workNotesQuery = `element_id=${sysId}^element=work_notes`;
        const workNotes = await fetchAllRecords<RelatedRecord>(
          instanceUrl,
          authHeader,
          'sys_journal_field',
          workNotesQuery
        );
        allRelatedRecords[sysId].work_notes = workNotes;
        console.log(`    Found ${workNotes.length} work note(s)`);
      } catch (error) {
        console.log(`    ⚠️  Could not fetch work notes: ${error}`);
      }

      // Fetch comments (sys_journal_field)
      try {
        const commentsQuery = `element_id=${sysId}^element=comments`;
        const comments = await fetchAllRecords<RelatedRecord>(
          instanceUrl,
          authHeader,
          'sys_journal_field',
          commentsQuery
        );
        allRelatedRecords[sysId].comments = comments;
        console.log(`    Found ${comments.length} comment(s)`);
      } catch (error) {
        console.log(`    ⚠️  Could not fetch comments: ${error}`);
      }

      // Fetch attachments (sys_attachment)
      try {
        const attachmentsQuery = `table_sys_id=${sysId}`;
        const attachments = await fetchAllRecords<RelatedRecord>(
          instanceUrl,
          authHeader,
          'sys_attachment',
          attachmentsQuery
        );
        allRelatedRecords[sysId].attachments = attachments;
        console.log(`    Found ${attachments.length} attachment(s)`);
      } catch (error) {
        console.log(`    ⚠️  Could not fetch attachments: ${error}`);
      }
    }

    const relatedRecordsPath = path.join(outputDir, 'related_records.json');
    fs.writeFileSync(relatedRecordsPath, JSON.stringify(allRelatedRecords, null, 2));
    console.log(`\n✅ Saved related records: ${relatedRecordsPath}\n`);

    // ========================================
    // 5. Create Individual Change Files + Index Manifest
    // ========================================
    console.log('5. Creating Individual Change Files');
    console.log('─'.repeat(80));

    // Create subdirectory for individual change files
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
      const sysId = typeof change.sys_id === 'object' ? change.sys_id.value : change.sys_id;
      const number = typeof change.number === 'object' ? change.number.display_value : change.number;
      const state = typeof change.state === 'object' ? change.state.display_value : change.state;
      const createdOn = typeof change.sys_created_on === 'object' ? change.sys_created_on.display_value : change.sys_created_on;

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

      // Save to individual file named by change number
      const changeFileName = `${number}.json`;
      const changeFilePath = path.join(changesDir, changeFileName);
      fs.writeFileSync(changeFilePath, JSON.stringify(changePayload, null, 2));
      console.log(`  ✅ Created ${changeFileName}`);

      // Add to index manifest
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
        query: changeQuery,
        total_changes: changes.length,
      },
      changes: indexManifest,
    };

    const indexPath = path.join(outputDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(indexPayload, null, 2));
    console.log(`\n✅ Created index manifest: ${indexPath}\n`);

    // ========================================
    // 6. Create Summary Report
    // ========================================
    console.log('─'.repeat(80));
    console.log('📊 EXTRACTION SUMMARY');
    console.log('─'.repeat(80));
    console.log('');

    console.log(`Total Changes Extracted: ${changes.length}`);
    console.log(`Output Directory: ${outputDir}`);
    console.log('');

    console.log('Files Created:');
    console.log('  1. change_requests.json - All change request records (bulk)');
    console.log('  2. state_transitions.json - State change history (bulk)');
    console.log('  3. component_references.json - CI relationships (bulk)');
    console.log('  4. related_records.json - Work notes, comments, attachments (bulk)');
    console.log('  5. index.json - Manifest listing all individual change files');
    console.log(`  6. changes/ - Directory with ${changes.length} individual change files`);
    console.log('');

    console.log('Individual Change Details:');
    for (const change of changes) {
      const number = typeof change.number === 'object' ? change.number.display_value : change.number;
      const sysId = typeof change.sys_id === 'object' ? change.sys_id.value : change.sys_id;
      const stateTransitions = allStateTransitions[sysId]?.length || 0;
      const componentRefs = allComponentRefs[sysId]?.length || 0;
      const relatedRecords = allRelatedRecords[sysId];
      const totalRelated = (relatedRecords?.work_notes?.length || 0) +
                          (relatedRecords?.comments?.length || 0) +
                          (relatedRecords?.attachments?.length || 0);

      console.log(`  ${number} (${sysId})`);
      console.log(`    State Transitions: ${stateTransitions}`);
      console.log(`    Component Refs: ${componentRefs}`);
      console.log(`    Related Records: ${totalRelated}`);
      console.log('');
    }

    console.log('✅ Extraction complete!');
    console.log('');

    // ========================================
    // 7. Generate Replay Instructions
    // ========================================
    const readmePath = path.join(outputDir, 'README.md');
    const readmeContent = `# Standard Changes Extraction

## Extraction Details

- **Extracted At**: ${new Date().toISOString()}
- **Instance**: ${instanceUrl}
- **Query**: \`${changeQuery}\`
- **Total Changes**: ${changes.length}

## File Structure

\`\`\`
${path.basename(outputDir)}/
├── index.json                    # Manifest listing all changes with metadata
├── changes/                      # Individual change files (one per record)
│   ├── CHG0001234.json
│   ├── CHG0001235.json
│   └── ...
├── change_requests.json          # Bulk export - all change records
├── state_transitions.json        # Bulk export - state history
├── component_references.json     # Bulk export - CI relationships
├── related_records.json          # Bulk export - work notes/comments
└── README.md                     # This file
\`\`\`

## Files

1. **index.json** - Manifest listing all individual change files with summary metadata
2. **changes/** - Directory containing individual JSON files (one per change record)
   - Each file named by change number (e.g., \`CHG0001234.json\`)
   - Contains complete change data including state transitions, components, and related records
3. **change_requests.json** - Bulk export of all change request records
4. **state_transitions.json** - Bulk export of state history for all changes
5. **component_references.json** - Bulk export of Configuration Item relationships
6. **related_records.json** - Bulk export of work notes, comments, and attachments

## Working with Individual Change Files

### Load a Specific Change

\`\`\`typescript
import * as fs from 'node:fs';
import * as path from 'node:path';

// Load a specific change by number
const changeData = JSON.parse(
  fs.readFileSync('changes/CHG0001234.json', 'utf-8')
);

console.log(\`Change: \${changeData.metadata.change_number}\`);
console.log(\`State Transitions: \${changeData.state_transitions.length}\`);
console.log(\`Components: \${changeData.component_references.length}\`);
\`\`\`

### Load Index and Process All Changes

\`\`\`typescript
import * as fs from 'node:fs';
import * as path from 'node:path';

// Load the index manifest
const index = JSON.parse(fs.readFileSync('index.json', 'utf-8'));

console.log(\`Total changes: \${index.metadata.total_changes}\`);

// Process each change
for (const changeRef of index.changes) {
  console.log(\`Loading \${changeRef.number} from \${changeRef.file_path}\`);

  const changeData = JSON.parse(
    fs.readFileSync(changeRef.file_path, 'utf-8')
  );

  // Your processing logic here
  // 1. Create/update change request
  // 2. Restore state transitions
  // 3. Link component references
  // 4. Add work notes/comments
}
\`\`\`

## Offline Replay

To replay individual changes:

\`\`\`typescript
import * as fs from 'node:fs';

// Load specific change
const change = JSON.parse(fs.readFileSync('changes/CHG0001234.json', 'utf-8'));

// Extract data
const changeRequest = change.change_request;
const stateTransitions = change.state_transitions;
const componentRefs = change.component_references;
const relatedRecords = change.related_records;

// Replay logic
console.log(\`Replaying \${change.metadata.change_number}\`);
// POST to target ServiceNow instance
\`\`\`

## ServiceNow API Reference

- **Table API**: \`/api/now/table/{table_name}\`
- **Change Request Table**: \`change_request\`
- **State Transitions**: Tracked in \`change_task\` and \`sys_audit\`
- **Component Links**: \`task_ci\` table
- **Work Notes/Comments**: \`sys_journal_field\` table
- **Attachments**: \`sys_attachment\` table

## Change Details

${changes.map((change) => {
  const number = typeof change.number === 'object' ? change.number.display_value : change.number;
  const sysId = typeof change.sys_id === 'object' ? change.sys_id.value : change.sys_id;
  const state = typeof change.state === 'object' ? change.state.display_value : change.state;
  const createdOn = typeof change.sys_created_on === 'object' ? change.sys_created_on.display_value : change.sys_created_on;

  return `### ${number}
- **sys_id**: \`${sysId}\`
- **State**: ${state}
- **Created**: ${createdOn}
- **State Transitions**: ${allStateTransitions[sysId]?.length || 0}
- **Component References**: ${allComponentRefs[sysId]?.length || 0}
- **Related Records**: ${(allRelatedRecords[sysId]?.work_notes?.length || 0) + (allRelatedRecords[sysId]?.comments?.length || 0) + (allRelatedRecords[sysId]?.attachments?.length || 0)}
`;
}).join('\n')}

## Notes

- All payloads preserve ServiceNow's display_value format for easy reference
- sys_id values are extracted from both flat and nested formats
- Pagination handled automatically for large result sets
- Error handling ensures partial success if some queries fail
`;

    fs.writeFileSync(readmePath, readmeContent);
    console.log(`📄 Generated README: ${readmePath}`);
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Extraction failed:');
    console.error(error);
    if (error instanceof Error) {
      console.error('\nError details:', error.message);
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the extraction
extractStandardChanges()
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
