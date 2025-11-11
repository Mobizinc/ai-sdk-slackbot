#!/usr/bin/env tsx
/**
 * Check what SPM tables exist in ServiceNow instance
 */

import { config } from 'dotenv';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env.local');
config({ path: envPath });

async function checkTables() {
  const { ServiceNowClient } = await import('../lib/tools/servicenow');
  
  console.log('🔍 Checking SPM Table Availability\n');
  console.log('='.repeat(60));
  
  const client = new ServiceNowClient();
  const tablesToCheck = [
    'pm_project',
    'pm_epic', 
    'rm_story',
    'pm_task',
    'pm_m2m_project_task',
    'pm_project_task',
  ];
  
  for (const tableName of tablesToCheck) {
    try {
      console.log(`\n✅ Checking table: ${tableName}`);
      // Try to fetch 1 record with a limit
      const response = await client['httpClient'].request({
        method: 'GET',
        endpoint: `/api/now/table/${tableName}?sysparm_limit=1`,
      });
      console.log(`   ✓ Table exists (found ${response.result?.length || 0} records)`);
    } catch (error: any) {
      if (error.message?.includes('Invalid table') || error.statusCode === 400) {
        console.log(`   ✗ Table does not exist`);
      } else {
        console.log(`   ? Error checking table: ${error.message}`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
}

checkTables()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
