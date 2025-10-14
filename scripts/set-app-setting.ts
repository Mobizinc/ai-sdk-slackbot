import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
  const [key, value] = process.argv.slice(2);

  if (!key || !value) {
    console.error("Usage: pnpm set:app-setting <key> <value>");
    process.exit(1);
  }

  const { setAppSetting } = await import("../lib/services/app-settings");

  await setAppSetting(key, value);

  console.log(`✅ Saved setting ${key} -> ${value}`);
}

main().catch((error) => {
  console.error("❌ Failed to set app setting", error);
  process.exit(1);
});
