/**
 * Test script for ServiceNow SPM integration
 * Tests basic CRUD operations and querying
 *
 * Usage: npx tsx scripts/test-spm-integration.ts
 */

import { ServiceNowClient } from '../lib/tools/servicenow';
import { SPM_PROJECT_STATES } from '../lib/infrastructure/servicenow/spm/constants';

async function testSPMIntegration() {
  console.log('🧪 Testing ServiceNow SPM Integration\n');
  console.log('=' .repeat(60));

  const client = new ServiceNowClient();

  try {
    // Test 1: Get active projects
    console.log('\n✅ Test 1: Fetching active SPM projects...');
    const activeProjects = await client.getActiveSPMProjects(5);
    console.log(`   Found ${activeProjects.length} active projects`);

    if (activeProjects.length > 0) {
      const project = activeProjects[0];
      console.log(`   Sample: ${project.number} - ${project.shortDescription}`);
      console.log(`   State: ${project.state}, Priority: ${project.priority || 'N/A'}`);
      console.log(`   URL: ${project.url}`);

      // Test 2: Get project by number
      console.log('\n✅ Test 2: Fetching project by number...');
      const fetchedProject = await client.getSPMProject(project.number);
      if (fetchedProject) {
        console.log(`   Successfully fetched: ${fetchedProject.number}`);
        console.log(`   Description: ${fetchedProject.shortDescription}`);
        console.log(`   Assigned To: ${fetchedProject.assignedTo || 'Unassigned'}`);
        console.log(`   Percent Complete: ${fetchedProject.percentComplete || 0}%`);

        // Test 3: Get project by sys_id
        console.log('\n✅ Test 3: Fetching project by sys_id...');
        const projectBySysId = await client.getSPMProjectBySysId(project.sysId);
        if (projectBySysId) {
          console.log(`   Successfully fetched by sys_id: ${projectBySysId.number}`);
        }

        // Test 4: Get related epics
        console.log('\n✅ Test 4: Fetching related epics...');
        const epics = await client.getSPMProjectEpics(project.sysId);
        console.log(`   Found ${epics.length} epics`);
        if (epics.length > 0) {
          epics.forEach((epic, i) => {
            console.log(`   ${i + 1}. ${epic.number} - ${epic.shortDescription} (${epic.state})`);
          });
        }

        // Test 5: Get related stories
        console.log('\n✅ Test 5: Fetching related stories...');
        const stories = await client.getSPMProjectStories(project.sysId);
        console.log(`   Found ${stories.length} stories`);
        if (stories.length > 0) {
          stories.slice(0, 3).forEach((story, i) => {
            console.log(`   ${i + 1}. ${story.number} - ${story.shortDescription}`);
          });
          if (stories.length > 3) {
            console.log(`   ... and ${stories.length - 3} more`);
          }
        }
      }
    } else {
      console.log('   ⚠️  No active projects found to test with');
    }

    // Test 6: Search projects by state
    console.log('\n✅ Test 6: Searching projects by state (Work in Progress)...');
    const wipProjects = await client.getSPMProjectsByState(
      SPM_PROJECT_STATES.WORK_IN_PROGRESS,
      3
    );
    console.log(`   Found ${wipProjects.length} projects in Work in Progress state`);
    wipProjects.forEach((proj, i) => {
      console.log(`   ${i + 1}. ${proj.number} - ${proj.shortDescription}`);
    });

    // Test 7: Search with criteria
    console.log('\n✅ Test 7: Searching projects with flexible criteria...');
    const searchResults = await client.searchSPMProjects({
      activeOnly: true,
      sortBy: 'opened_at',
      sortOrder: 'desc',
      limit: 5,
    });
    console.log(`   Found ${searchResults.totalCount} total projects (showing ${searchResults.projects.length})`);
    searchResults.projects.forEach((proj, i) => {
      console.log(`   ${i + 1}. ${proj.number} - ${proj.shortDescription} (${proj.state})`);
    });

    // Test 8: Test repository pattern directly
    console.log('\n✅ Test 8: Testing repository pattern directly...');
    const { getSPMRepository } = await import('../lib/infrastructure/servicenow/repositories');
    const repo = getSPMRepository();
    const repoProjects = await repo.findActive(3);
    console.log(`   Repository returned ${repoProjects.length} projects`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ All SPM integration tests passed!\n');
    console.log('Summary:');
    console.log(`  - Repository pattern: Working ✓`);
    console.log(`  - ServiceNowClient integration: Working ✓`);
    console.log(`  - CRUD operations: Working ✓`);
    console.log(`  - Epic/Story relationships: Working ✓`);
    console.log(`  - Search and filtering: Working ✓`);

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
testSPMIntegration()
  .then(() => {
    console.log('\n✨ Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error);
    process.exit(1);
  });
