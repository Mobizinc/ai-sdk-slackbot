import * as dotenv from 'dotenv';
import { setAppSetting, getAppSetting } from '../lib/services/app-settings';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  // Get the value we stored with camelCase key
  const oldValue = await getAppSetting('mobizLeaderboardChannel');
  console.log('Old key (mobizLeaderboardChannel):', oldValue);

  // Store it with the correct snake_case key
  await setAppSetting('mobiz_leaderboard_channel', 'C027ZM8M0KE');
  console.log('✅ Set mobiz_leaderboard_channel = C027ZM8M0KE');

  // Verify
  const newValue = await getAppSetting('mobiz_leaderboard_channel');
  console.log('✅ Verified mobiz_leaderboard_channel:', newValue);
}

main().catch(console.error);
