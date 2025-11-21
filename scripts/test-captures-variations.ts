import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const BASE_URL = "https://api.wxcc-us1.cisco.com";
const ORG_ID = process.env.WEBEX_CC_ORG_ID;

async function getToken() {
  const response = await fetch("https://webexapis.com/v1/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.WEBEX_CC_CLIENT_ID!,
      client_secret: process.env.WEBEX_CC_CLIENT_SECRET!,
      refresh_token: process.env.WEBEX_CC_REFRESH_TOKEN!,
    }),
  });
  const data: any = await response.json();
  return data.access_token;
}

async function testVariation(params: Record<string, string>, description: string) {
  const token = await getToken();
  const url = new URL(`${BASE_URL}/v1/captures`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  console.log(`\n${description}`);
  console.log(`URL: ${url.toString()}`);

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });

    console.log(`Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ SUCCESS! Keys: ${Object.keys(data).join(', ')}`);
      return true;
    } else if (response.status === 400) {
      const text = await response.text();
      console.log(`⚠️  Bad Request (might be close!): ${text.substring(0, 200)}`);
    }
  } catch (error: any) {
    console.error(`❌ ${error.message}`);
  }

  return false;
}

async function main() {
  const now = Date.now();
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

  console.log("Testing Captures API parameter variations...\n");

  const variations = [
    // Different capitalization
    { orgid: ORG_ID!, from: String(sevenDaysAgo), to: String(now) },
    { orgId: ORG_ID!, from: String(sevenDaysAgo), to: String(now) },

    // Without time range, just orgId
    { orgId: ORG_ID! },
    { orgid: ORG_ID! },

    // Singular vs plural
    { organizationId: ORG_ID!, from: String(sevenDaysAgo), to: String(now) },
  ];

  const descriptions = [
    "Lowercase orgid with time range",
    "CamelCase orgId with time range",
    "Just orgId (camelCase)",
    "Just orgid (lowercase)",
    "organizationId with time range",
  ];

  for (let i = 0; i < variations.length; i++) {
    const success = await testVariation(variations[i], descriptions[i]);
    if (success) {
      console.log("\n🎉 Found working parameters!");
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log("\n\nNote: If all variations fail with 404, the Captures API might:");
  console.log("- Not be enabled for this organization");
  console.log("- Require admin-level permissions");
  console.log("- Use a completely different URL structure");
  console.log("- Only be accessible via GraphQL /search endpoint");
}

main().catch(console.error);
