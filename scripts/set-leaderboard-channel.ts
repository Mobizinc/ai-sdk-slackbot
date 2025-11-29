import * as dotenv from 'dotenv';
import { setAppSetting } from '../lib/services/app-settings';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  console.log('Setting mobizLeaderboardChannel to C027ZM8M0KE...');
  await setAppSetting('mobizLeaderboardChannel', 'C027ZM8M0KE');
  console.log('✅ Leaderboard channel configured successfully!');
}

main().catch(console.error);
