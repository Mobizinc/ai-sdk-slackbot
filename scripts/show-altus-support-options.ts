/**
 * Show Altus Support Group and Managed By Options
 *
 * Displays filtered support groups for Altus and potential managed_by users
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

async function showAltusOptions() {
  console.log('📋 Altus Support Group and Managed By Options');
  console.log('='.repeat(70));
  console.log('');

  // Read support groups
  const groupsPath = path.join(
    process.cwd(),
    'backup',
    'servicenow-reference-data',
    'support_groups.json'
  );

  if (!fs.existsSync(groupsPath)) {
    console.error('❌ Support groups not found. Run extract-servicenow-reference-data.ts first');
    process.exit(1);
  }

  const groupsData = JSON.parse(fs.readFileSync(groupsPath, 'utf-8'));

  // Filter for Altus-related groups
  const altusGroups = groupsData.filter((g: any) => {
    const name = g.name?.display_value || g.name?.value || '';
    const company = g.company?.display_value || '';
    const domain = g.sys_domain?.display_value || '';

    return name.toLowerCase().includes('altus') ||
           company.includes('Altus') ||
           domain.includes('Altus');
  });

  // Filter for general IT/Network/Infrastructure groups
  const itGroups = groupsData.filter((g: any) => {
    const name = (g.name?.display_value || g.name?.value || '').toLowerCase();
    const active = g.active?.display_value === 'true' || g.active?.value === 'true';
    const type = g.type?.display_value || '';

    return active &&
           type === 'assignment_group' &&
           (name.includes('it ') ||
            name.includes('network') ||
            name.includes('infrastructure') ||
            name.includes('support') ||
            name.includes('technical'));
  });

  // Show Altus-specific groups
  console.log('🏢 ALTUS-SPECIFIC SUPPORT GROUPS:');
  console.log('─'.repeat(70));
  console.log('');

  if (altusGroups.length > 0) {
    for (const group of altusGroups) {
      const name = group.name?.display_value || group.name?.value;
      const sysId = group.sys_id?.value;
      const manager = group.manager?.display_value || 'None';
      const active = group.active?.display_value;

      console.log(`  ${name}`);
      console.log(`    sys_id: ${sysId}`);
      console.log(`    Manager: ${manager}`);
      console.log(`    Active: ${active}`);
      console.log('');
    }
  } else {
    console.log('  ⚠️  No Altus-specific support groups found');
    console.log('');
  }

  // Show general IT groups (top 10)
  console.log('─'.repeat(70));
  console.log('🔧 GENERAL IT/NETWORK SUPPORT GROUPS (Active):');
  console.log('─'.repeat(70));
  console.log('');

  for (const group of itGroups.slice(0, 15)) {
    const name = group.name?.display_value || group.name?.value;
    const sysId = group.sys_id?.value;
    const company = group.company?.display_value || 'Global';
    const manager = group.manager?.display_value || 'None';

    console.log(`  ${name}`);
    console.log(`    sys_id: ${sysId}`);
    console.log(`    Company: ${company}`);
    console.log(`    Manager: ${manager}`);
    console.log('');
  }

  // Show recommendations
  console.log('─'.repeat(70));
  console.log('💡 RECOMMENDATIONS:');
  console.log('─'.repeat(70));
  console.log('');

  console.log('For support_group field:');
  if (altusGroups.length > 0) {
    console.log('  ✅ Use one of the Altus-specific groups listed above');
    console.log(`     Example: "${altusGroups[0].name?.display_value || altusGroups[0].name?.value}"`);
  } else {
    console.log('  ⚠️  Create a new Altus support group, or use a general IT group');
    console.log('  💡 Suggested name: "Altus - IT Support" or "Altus - Network Team"');
  }
  console.log('');

  console.log('For managed_by field:');
  console.log('  Options:');
  console.log('  1. User sys_id (reference to sys_user table)');
  console.log('  2. Support group manager (if exists)');
  console.log('  3. Leave blank (will default to support group)');
  console.log('');
  console.log('  💡 Common approach: Use the manager from the support group');
  if (altusGroups.length > 0 && altusGroups[0].manager?.value) {
    console.log(`     Example sys_id: ${altusGroups[0].manager?.value}`);
  }
  console.log('');

  // Summary
  console.log('─'.repeat(70));
  console.log('📝 QUICK REFERENCE:');
  console.log('─'.repeat(70));
  console.log('');
  console.log('To fill in the template CSV:');
  console.log('');
  console.log('support_group:');
  if (altusGroups.length > 0) {
    console.log(`  - Name: ${altusGroups[0].name?.display_value || altusGroups[0].name?.value}`);
    console.log(`  - sys_id: ${altusGroups[0].sys_id?.value}`);
  } else {
    console.log('  - (Need to create or choose from general IT groups)');
  }
  console.log('');
  console.log('managed_by:');
  if (altusGroups.length > 0 && altusGroups[0].manager?.value) {
    console.log(`  - Manager: ${altusGroups[0].manager?.display_value}`);
    console.log(`  - sys_id: ${altusGroups[0].manager?.value}`);
  } else {
    console.log('  - (Can be left empty or filled with IT manager sys_id)');
  }
  console.log('');
}

showAltusOptions()
  .catch(console.error)
  .finally(() => process.exit(0));
