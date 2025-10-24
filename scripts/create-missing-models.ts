/**
 * Create Missing Model Records in cmdb_model Table
 */

import * as dotenv from 'dotenv';
import { Buffer } from 'node:buffer';

dotenv.config({ path: '.env.local' });

interface ModelToCreate {
  name: string;
  display_name: string;
  model_number: string;
  manufacturer: string;
}

async function createMissingModels() {
  console.log('📝 Creating Missing Model Records');
  console.log('='.repeat(70));
  console.log('');

  const instanceUrl = process.env.SERVICENOW_URL;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;

  if (!instanceUrl || !username || !password) {
    console.error('❌ PROD credentials not configured');
    process.exit(1);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const modelsToCreate: ModelToCreate[] = [
    // Fortinet models
    {
      name: 'FortiGate-100D',
      display_name: 'Fortinet FortiGate-100D',
      model_number: 'FortiGate-100D',
      manufacturer: 'Fortinet',
    },
    {
      name: 'FortiGate-60D',
      display_name: 'Fortinet FortiGate-60D',
      model_number: 'FortiGate-60D',
      manufacturer: 'Fortinet',
    },
    {
      name: 'FortiGate-FG-120G',
      display_name: 'Fortinet FortiGate FG-120G',
      model_number: 'FG-120G',
      manufacturer: 'Fortinet',
    },
    // Sonicwall models
    {
      name: 'NSA 2650',
      display_name: 'SonicWall NSA 2650',
      model_number: 'NSA 2650',
      manufacturer: 'SonicWall',
    },
    {
      name: 'TZ 350',
      display_name: 'SonicWall TZ 350',
      model_number: 'TZ 350',
      manufacturer: 'SonicWall',
    },
    {
      name: 'TZ 400',
      display_name: 'SonicWall TZ 400',
      model_number: 'TZ 400',
      manufacturer: 'SonicWall',
    },
  ];

  const createdModels: Record<string, string> = {};

  for (const model of modelsToCreate) {
    console.log(`Creating ${model.display_name}...`);

    try {
      const url = `${instanceUrl}/api/now/table/cmdb_model`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(model),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`  ❌ Failed: ${response.status} - ${errorText.substring(0, 200)}`);
        continue;
      }

      const data = await response.json();
      const sysId = data.result.sys_id;

      console.log(`  ✅ Created: ${sysId}`);
      createdModels[model.model_number] = sysId;
    } catch (error) {
      console.log(`  ❌ Error: ${error}`);
    }
  }

  console.log('');
  console.log('─'.repeat(70));
  console.log('CREATED MODELS');
  console.log('─'.repeat(70));
  console.log('');

  for (const [modelNumber, sysId] of Object.entries(createdModels)) {
    console.log(`  ${modelNumber}: ${sysId}`);
  }

  console.log('');
  console.log(`✅ Created ${Object.keys(createdModels).length}/${modelsToCreate.length} models`);
}

createMissingModels()
  .catch(console.error)
  .finally(() => process.exit(0));
