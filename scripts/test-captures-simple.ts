import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const BASE_URL = "https://api.wxcc-us1.cisco.com";
const ORG_ID = process.env.WEBEX_CC_ORG_ID;

// Get OAuth token
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

async function main() {
  const token = await getToken();

  // Test 1: Query by time range (last 7 days)
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const url = new URL(`${BASE_URL}/v1/captures`);
  url.searchParams.set("orgId", ORG_ID!);
  url.searchParams.set("from", String(sevenDaysAgo.getTime()));
  url.searchParams.set("to", String(now.getTime()));

  console.log("Testing Captures API with time range...");
  console.log(`URL: ${url.toString()}\n`);

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
    });

    console.log(`Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`\n✅ SUCCESS!`);
      console.log(`Response keys: ${Object.keys(data).join(', ')}`);
      console.log(`Data: ${JSON.stringify(data, null, 2).substring(0, 1000)}`);

      // Count captures
      const captures = data.data || data.captures || data.items || [];
      console.log(`\nTotal captures found: ${Array.isArray(captures) ? captures.length : 0}`);
    } else {
      const text = await response.text();
      console.log(`\n❌ Error Response:`);
      console.log(text);
    }
  } catch (error: any) {
    console.error(`\n❌ Exception: ${error.message}`);
  }
}

main().catch(console.error);
