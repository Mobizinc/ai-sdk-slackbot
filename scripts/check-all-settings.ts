import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { getAppSetting } from '../lib/services/app-settings';

async function main() {
  console.log('Checking database settings:');
  const camelCase = await getAppSetting('mobizLeaderboardChannel');
  const snake_case = await getAppSetting('mobiz_leaderboard_channel');
  
  console.log('mobizLeaderboardChannel (camelCase):', camelCase ?? '(not set)');
  console.log('mobiz_leaderboard_channel (snake_case):', snake_case ?? '(not set)');
}

main().catch(console.error);
