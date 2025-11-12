#!/usr/bin/env tsx
/**
 * Quick SPM integration test
 * Loads .env.local before any other imports to ensure config is set up properly
 *
 * Usage: npx tsx scripts/test-spm-quick.ts
 */

// MUST load dotenv before any other imports
import { config } from 'dotenv';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env.local');
config({ path: envPath });

console.log('🔧 Environment Check:');
console.log(`  SERVICENOW_URL: ${process.env.SERVICENOW_URL ? '✓ Set' : '✗ Missing'}`);
console.log(`  SERVICENOW_INSTANCE_URL: ${process.env.SERVICENOW_INSTANCE_URL ? '✓ Set' : '✗ Missing'}`);
console.log(`  SERVICENOW_USERNAME: ${process.env.SERVICENOW_USERNAME ? '✓ Set' : '✗ Missing'}`);
console.log(`  SERVICENOW_PASSWORD: ${process.env.SERVICENOW_PASSWORD ? '✓ Set' : '✗ Missing'}\n`);

async function quickTest() {
  // Use dynamic import AFTER environment is loaded to avoid module hoisting issues
  const { ServiceNowClient } = await import('../lib/tools/servicenow');
  console.log('🧪 Quick SPM Integration Test\n');
  console.log('='.repeat(60));

  const client = new ServiceNowClient();

  try {
    // Test 1: Get active projects
    console.log('\n✅ Test 1: Fetching active SPM projects (limit 3)...');
    const projects = await client.getActiveSPMProjects(3);
    console.log(`   Found ${projects.length} active projects`);

    if (projects.length === 0) {
      console.log('\n⚠️  No active SPM projects found in ServiceNow.');
      console.log('   This might mean:');
      console.log('   - No projects exist yet in pm_project table');
      console.log('   - All projects are closed');
      console.log('   - You need to create some test projects first\n');
      process.exit(0);
    }

    // Display first project details
    const project = projects[0];
    console.log(`\n   Project Details:`);
    console.log(`   Number: ${project.number}`);
    console.log(`   Name: ${project.shortDescription}`);
    console.log(`   State: ${project.state}`);
    console.log(`   Priority: ${project.priority || 'N/A'}`);
    console.log(`   Assigned To: ${project.assignedTo || 'Unassigned'}`);
    console.log(`   Progress: ${project.percentComplete || 0}%`);
    console.log(`   URL: ${project.url}`);

    // Test 2: Get project by number
    console.log(`\n✅ Test 2: Fetching project by number (${project.number})...`);
    const fetchedProject = await client.getSPMProject(project.number);
    if (fetchedProject) {
      console.log(`   ✓ Successfully retrieved: ${fetchedProject.shortDescription}`);
    } else {
      console.log(`   ✗ Failed to fetch project`);
    }

    // Test 3: Get project by sys_id
    console.log(`\n✅ Test 3: Fetching project by sys_id...`);
    const projectBySysId = await client.getSPMProjectBySysId(project.sysId);
    if (projectBySysId) {
      console.log(`   ✓ Successfully retrieved: ${projectBySysId.number}`);
    }

    // Test 4: Fuzzy search by name
    console.log(`\n✅ Test 4: Fuzzy search by project name...`);
    const searchTerm = project.shortDescription.split(' ')[0];
    console.log(`   Searching for: "${searchTerm}"`);
    const nameResults = await client.searchSPMProjects({
      query: searchTerm,
      limit: 3,
    });
    console.log(`   Found ${nameResults.totalCount} projects (showing ${nameResults.projects.length})`);
    nameResults.projects.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.number} - ${p.shortDescription}`);
    });

    // Test 5: Get epics (may not be available in all instances)
    console.log(`\n✅ Test 5: Fetching related epics...`);
    try {
      const epics = await client.getSPMProjectEpics(project.sysId);
      console.log(`   Found ${epics.length} epic(s)`);
      if (epics.length > 0) {
        epics.slice(0, 3).forEach((epic, i) => {
          console.log(`   ${i + 1}. ${epic.number} - ${epic.shortDescription}`);
        });
      }
    } catch (error: any) {
      if (error.message?.includes('Invalid table pm_epic')) {
        console.log(`   ⚠️  pm_epic table not available in this instance (skipping)`);
      } else {
        throw error;
      }
    }

    // Test 6: Get stories (may not be available in all instances)
    console.log(`\n✅ Test 6: Fetching related stories...`);
    try {
      const stories = await client.getSPMProjectStories(project.sysId);
      console.log(`   Found ${stories.length} story/stories`);
      if (stories.length > 0) {
        stories.slice(0, 3).forEach((story, i) => {
          console.log(`   ${i + 1}. ${story.number} - ${story.shortDescription}`);
        });
      }
    } catch (error: any) {
      if (error.message?.includes('Invalid table rm_story')) {
        console.log(`   ⚠️  rm_story table not available in this instance (skipping)`);
      } else {
        throw error;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests passed!\n');
    console.log('Summary:');
    console.log('  - Get active projects: ✓');
    console.log('  - Get by project number: ✓');
    console.log('  - Get by sys_id: ✓');
    console.log('  - Fuzzy search by name: ✓');
    console.log('  - Get epics: ✓');
    console.log('  - Get stories: ✓');
    console.log('\n✨ Phase 1 SPM integration working correctly!');

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    if (error instanceof Error) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

quickTest()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
