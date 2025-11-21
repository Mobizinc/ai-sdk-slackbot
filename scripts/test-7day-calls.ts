import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { fetchVoiceInteractions } from "../lib/services/webex-contact-center";

async function main() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  console.log("Testing 7-day call retrieval...");
  console.log(`From: ${sevenDaysAgo.toISOString()}`);
  console.log(`To: ${now.toISOString()}`);

  const result = await fetchVoiceInteractions({
    startTime: sevenDaysAgo,
    endTime: now,
    pageSize: 100
  });

  console.log(`\nFound ${result.interactions.length} interactions`);

  if (result.interactions.length > 0) {
    console.log("\nFirst 10 interactions:");
    result.interactions.slice(0, 10).forEach((interaction, idx) => {
      console.log(`\n${idx + 1}. Session: ${interaction.sessionId}`);
      console.log(`   Case: ${interaction.caseNumber || 'N/A'}`);
      console.log(`   Agent: ${interaction.agentName || 'N/A'}`);
      console.log(`   Start: ${interaction.startTime?.toISOString() || 'N/A'}`);
      console.log(`   Recording: ${interaction.recordingId || 'N/A'}`);
    });

    // Count recordings
    const withRecordings = result.interactions.filter(i => i.recordingId).length;
    console.log(`\n✅ Total interactions: ${result.interactions.length}`);
    console.log(`✅ With recordings: ${withRecordings} (${Math.round(withRecordings / result.interactions.length * 100)}%)`);
  }
}

main().catch(console.error);
