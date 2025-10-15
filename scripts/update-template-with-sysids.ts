/**
 * Update Template with sys_ids
 *
 * Update the CSV template to mark 12 firewalls as EXISTS with their PROD sys_ids
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env.local' });

// Mapping of serial numbers to sys_ids
const sysIdMapping: Record<string, string> = {
  'FGT60FTK23050889': '26348a05c3226a10a01d5673e401312c',
  'FGT60FTK23051089': '39bd8866c3a662105bcb9df0150131bf',
  'FGT60FTK23051418': 'b1940645c3226a10a01d5673e40131c9',
  'FGT60FTK23055496': '5dc44a45c3226a10a01d5673e4013193',
  'FGT60FTK23054832': '91e48685c3226a10a01d5673e4013184',
  'FGT60FTK23057140': 'b2154685c3226a10a01d5673e40131b0',
  'FGT60FTK2209JZ6K': 'f3350ac5c3226a10a01d5673e40131e2',
  'FGT60FTK2209C5KG': '3b55cac5c3226a10a01d5673e401314e',
  'FGT60FTK2209C54S': '0b858ec5c3226a10a01d5673e4013175',
  'FGT60FTK2209C5NH': 'c8b58ec5c3226a10a01d5673e40131eb',
  'FGT60FTK23005728': '78d58249c3226a10a01d5673e4013159',
  'FGT60FTK2209C5AV': '99f5c249c3226a10a01d5673e4013163',
};

async function updateTemplateWithSysIds() {
  console.log('📝 Updating Template with sys_ids');
  console.log('='.repeat(70));
  console.log('');

  const templatePath = path.join(
    process.cwd(),
    'backup',
    'altus-export-2025-10-15',
    'firewall-enrichment-template-auto.csv'
  );

  if (!fs.existsSync(templatePath)) {
    console.error('❌ Template not found:', templatePath);
    process.exit(1);
  }

  console.log('Reading template:', templatePath);
  console.log('');

  const csvContent = fs.readFileSync(templatePath, 'utf-8');
  const lines = csvContent.split('\n');

  let updatedCount = 0;
  const updatedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (i === 0) {
      // Keep header as-is
      updatedLines.push(line);
      continue;
    }

    if (!line.trim()) {
      // Keep empty lines
      updatedLines.push(line);
      continue;
    }

    // Parse CSV line (simple parse - assumes no commas in quoted fields we care about)
    const parts = line.split(',');

    if (parts.length < 7) {
      // Invalid line, keep as-is
      updatedLines.push(line);
      continue;
    }

    const index = parts[0];
    const status = parts[1];
    const serialNumber = parts[6]; // serial_number is at index 6

    // Check if this serial number needs updating
    if (sysIdMapping[serialNumber]) {
      const sysId = sysIdMapping[serialNumber];

      // Update status from NEW to EXISTS
      // Update sys_id from NEW to actual sys_id
      if (status === 'NEW') {
        parts[1] = 'EXISTS';
        parts[3] = sysId;

        const updatedLine = parts.join(',');
        updatedLines.push(updatedLine);

        updatedCount++;
        console.log(`✅ Updated row ${index}: ${serialNumber}`);
        console.log(`   Status: NEW → EXISTS`);
        console.log(`   sys_id: NEW → ${sysId}`);
        console.log('');
      } else {
        // Already marked as EXISTS?
        updatedLines.push(line);
      }
    } else {
      // No update needed
      updatedLines.push(line);
    }
  }

  // Write updated CSV
  const updatedContent = updatedLines.join('\n');
  fs.writeFileSync(templatePath, updatedContent, 'utf-8');

  console.log('─'.repeat(70));
  console.log('✅ Template Updated Successfully');
  console.log('─'.repeat(70));
  console.log(`Updated ${updatedCount} firewalls`);
  console.log(`File: ${templatePath}`);
  console.log('');
  console.log('Changes:');
  console.log('  - Status: NEW → EXISTS');
  console.log('  - sys_id: NEW → actual PROD sys_id');
  console.log('  - Name: Kept as "Altus - Location" (standardized naming)');
  console.log('');
}

updateTemplateWithSysIds()
  .catch(console.error)
  .finally(() => process.exit(0));
