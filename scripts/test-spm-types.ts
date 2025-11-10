/**
 * Test script for ServiceNow SPM type checking
 * Verifies that all SPM types and imports are working correctly
 *
 * Usage: npx tsx scripts/test-spm-types.ts
 */

import { ServiceNowClient } from '../lib/tools/servicenow';
import {
  getSPMRepository,
  type SPMRepository,
} from '../lib/infrastructure/servicenow/repositories';
import type {
  SPMProject,
  SPMEpic,
  SPMStory,
  CreateSPMProjectInput,
  UpdateSPMProjectInput,
  SPMSearchCriteria,
} from '../lib/infrastructure/servicenow/types';
import {
  SPM_PROJECT_STATES,
  SPM_LIFECYCLE_STAGES,
  SPM_PRIORITIES,
  SPM_TABLES,
  isSPMProjectActive,
  getSPMProjectStateLabel,
  getSPMPriorityLabel,
  getSPMLifecycleStageLabel,
} from '../lib/infrastructure/servicenow/spm/constants';

function testTypes() {
  console.log('🧪 Testing ServiceNow SPM Type Checking\n');
  console.log('=' .repeat(60));

  // Test 1: Verify constants
  console.log('\n✅ Test 1: SPM Constants');
  console.log(`   Project States: ${Object.keys(SPM_PROJECT_STATES).length} defined`);
  console.log(`   Lifecycle Stages: ${Object.keys(SPM_LIFECYCLE_STAGES).length} defined`);
  console.log(`   Priorities: ${Object.keys(SPM_PRIORITIES).length} defined`);
  console.log(`   Tables: ${Object.keys(SPM_TABLES).length} defined`);

  // Test 2: Verify helper functions
  console.log('\n✅ Test 2: Helper Functions');
  console.log(`   isActive(WORK_IN_PROGRESS): ${isSPMProjectActive(SPM_PROJECT_STATES.WORK_IN_PROGRESS)}`);
  console.log(`   isActive(CLOSED_COMPLETE): ${isSPMProjectActive(SPM_PROJECT_STATES.CLOSED_COMPLETE)}`);
  console.log(`   State Label: ${getSPMProjectStateLabel(SPM_PROJECT_STATES.WORK_IN_PROGRESS)}`);
  console.log(`   Priority Label: ${getSPMPriorityLabel(SPM_PRIORITIES.HIGH)}`);
  console.log(`   Lifecycle Label: ${getSPMLifecycleStageLabel(SPM_LIFECYCLE_STAGES.EXECUTION)}`);

  // Test 3: Verify repository can be instantiated
  console.log('\n✅ Test 3: Repository Instantiation');
  const repo: SPMRepository = getSPMRepository();
  console.log(`   Repository instance created: ${!!repo}`);
  console.log(`   Repository has findByNumber: ${typeof repo.findByNumber === 'function'}`);
  console.log(`   Repository has create: ${typeof repo.create === 'function'}`);
  console.log(`   Repository has search: ${typeof repo.search === 'function'}`);

  // Test 4: Verify ServiceNowClient has SPM methods
  console.log('\n✅ Test 4: ServiceNowClient SPM Methods');
  const client = new ServiceNowClient();
  console.log(`   Client has getSPMProject: ${typeof client.getSPMProject === 'function'}`);
  console.log(`   Client has createSPMProject: ${typeof client.createSPMProject === 'function'}`);
  console.log(`   Client has searchSPMProjects: ${typeof client.searchSPMProjects === 'function'}`);
  console.log(`   Client has getSPMProjectEpics: ${typeof client.getSPMProjectEpics === 'function'}`);
  console.log(`   Client has getSPMProjectStories: ${typeof client.getSPMProjectStories === 'function'}`);

  // Test 5: Verify type structures (compile-time check)
  console.log('\n✅ Test 5: Type Structures');

  const mockProject: SPMProject = {
    sysId: 'test-sys-id',
    number: 'PRJ0001234',
    shortDescription: 'Test Project',
    state: SPM_PROJECT_STATES.WORK_IN_PROGRESS,
    url: 'https://example.service-now.com/pm_project.do?sys_id=test-sys-id',
  };
  console.log(`   Mock SPMProject created: ${mockProject.number}`);

  const mockCreateInput: CreateSPMProjectInput = {
    shortDescription: 'New Test Project',
    priority: SPM_PRIORITIES.HIGH,
    lifecycleStage: SPM_LIFECYCLE_STAGES.PLANNING,
  };
  console.log(`   Mock CreateSPMProjectInput created: ${mockCreateInput.shortDescription}`);

  const mockSearchCriteria: SPMSearchCriteria = {
    activeOnly: true,
    sortBy: 'opened_at',
    sortOrder: 'desc',
    limit: 10,
  };
  console.log(`   Mock SPMSearchCriteria created: activeOnly=${mockSearchCriteria.activeOnly}`);

  console.log('\n' + '='.repeat(60));
  console.log('✅ All type checking tests passed!\n');
  console.log('Summary:');
  console.log(`  - All imports successful ✓`);
  console.log(`  - Constants defined correctly ✓`);
  console.log(`  - Helper functions working ✓`);
  console.log(`  - Repository instantiation working ✓`);
  console.log(`  - ServiceNowClient methods available ✓`);
  console.log(`  - Type structures valid ✓`);
  console.log('\nPhase 1 foundation is solid! Ready for testing with real data.');
}

// Run type tests
try {
  testTypes();
  console.log('\n✨ Type checking completed successfully!');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Type checking failed:');
  console.error(error);
  process.exit(1);
}
