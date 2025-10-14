import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

function parseArgs() {
  const args = process.argv.slice(2);
  const options: { channelId?: string; days?: number } = {};

  for (const arg of args) {
    if (arg.startsWith("--days=")) {
      const value = Number(arg.replace("--days=", ""));
      if (!Number.isNaN(value) && value > 0) {
        options.days = value;
      }
    } else if (!options.channelId) {
      options.channelId = arg;
    }
  }

  return options as { channelId: string; days?: number };
}

async function main() {
  const { channelId: cliChannelId, days } = parseArgs();
  const { getAppSettingWithFallback, APP_SETTING_KEYS } = await import(
    "../lib/services/app-settings"
  );
  const { postCaseLeaderboard } = await import("../lib/services/case-leaderboard");

  const channelId = cliChannelId
    ?? (await getAppSettingWithFallback(
      APP_SETTING_KEYS.leaderboardChannel,
      process.env.MOBIZ_LEADERBOARD_CHANNEL ?? process.env.CASE_QUEUE_CHANNEL_ID ?? null,
    ))
    ?? (() => {
      throw new Error(
        "Missing channel ID. Pass as argument or set mobiz_leaderboard_channel app setting.",
      );
    })();

  await postCaseLeaderboard({
    channelId,
    days,
  });

  console.log(
    `✅ Posted Mobiz leaderboard to ${channelId} (lookback: ${
      days ?? 7
    } day${(days ?? 7) === 1 ? "" : "s"})`,
  );
}

main().catch((error) => {
  console.error("❌ Failed to post leaderboard", error);
  process.exit(1);
});
