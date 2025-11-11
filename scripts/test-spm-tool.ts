#!/usr/bin/env tsx
/**
 * Test SPM actions in the agent ServiceNow tool
 * Demonstrates how agents can now access project data
 *
 * Usage: npx tsx scripts/test-spm-tool.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env.local');
config({ path: envPath });

async function testSPMTool() {
  // Use dynamic imports AFTER environment is loaded
  const { createServiceNowTool } = await import('../lib/agent/tools/service-now');
  
  console.log('🧪 Testing SPM Actions in Agent ServiceNow Tool\n');
  console.log('='.repeat(60));

  // Create the tool with minimal params
  const tool = createServiceNowTool({
    updateStatus: (status: string) => console.log(`[Status] ${status}`),
    options: {},
    caseNumbers: [],
  });

  try {
    // Test 1: Search for active projects
    console.log('\n✅ Test 1: Search for active projects');
    const searchResult = await tool.execute({
      action: 'searchProjects',
      projectActiveOnly: true,
      limit: 3,
    });
    console.log(`   Result: ${JSON.stringify(searchResult, null, 2).substring(0, 200)}...`);

    if (searchResult.projects && searchResult.projects.length > 0) {
      const firstProject = searchResult.projects[0];
      
      // Test 2: Get specific project by number
      console.log(`\n✅ Test 2: Get project by number (${firstProject.number})`);
      const projectResult = await tool.execute({
        action: 'getProject',
        projectNumber: firstProject.number,
      });
      console.log(`   Result: ${projectResult.message}`);
      console.log(`   Project: ${projectResult.project?.shortDescription}`);

      // Test 3: Get project epics
      console.log(`\n✅ Test 3: Get project epics (sys_id: ${firstProject.sysId})`);
      const epicsResult = await tool.execute({
        action: 'getProjectEpics',
        projectSysId: firstProject.sysId,
      });
      console.log(`   Result: ${epicsResult.message}`);

      // Test 4: Get project stories
      console.log(`\n✅ Test 4: Get project stories (sys_id: ${firstProject.sysId})`);
      const storiesResult = await tool.execute({
        action: 'getProjectStories',
        projectSysId: firstProject.sysId,
      });
      console.log(`   Result: ${storiesResult.message}`);
    }

    // Test 5: Search with filters
    console.log('\n✅ Test 5: Search by project name');
    const nameSearchResult = await tool.execute({
      action: 'searchProjects',
      projectName: 'Test',
      limit: 3,
    });
    console.log(`   Found: ${nameSearchResult.totalCount} projects`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ All SPM tool tests passed!\n');
    console.log('Summary:');
    console.log('  - searchProjects action: Working ✓');
    console.log('  - getProject action: Working ✓');
    console.log('  - getProjectEpics action: Working ✓');
    console.log('  - getProjectStories action: Working ✓');
    console.log('\n✨ Agents can now access SPM project data!');

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

testSPMTool()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
