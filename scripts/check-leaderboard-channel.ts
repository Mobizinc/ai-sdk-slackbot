import * as dotenv from 'dotenv';
import { getAppSetting } from '../lib/services/app-settings';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const value = await getAppSetting('mobizLeaderboardChannel');
  console.log('✅ mobizLeaderboardChannel in database:', value ?? '(not set)');
}

main().catch(console.error);
