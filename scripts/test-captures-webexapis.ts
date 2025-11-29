import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const WEBEX_BASE = "https://webexapis.com";
const ORG_ID = process.env.WEBEX_CC_ORG_ID;
const TEST_TASK_ID = "b3707701-9723-472b-9ca5-943655da98ca";

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

async function testEndpoint(path: string, params: Record<string, string>, description: string) {
  const token = await getToken();
  const url = new URL(`${WEBEX_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  console.log(`\n${description}`);
  console.log(`URL: ${url.toString()}`);

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
    });

    console.log(`Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ SUCCESS!`);
      console.log(`Response: ${JSON.stringify(data, null, 2).substring(0, 1000)}`);
      return true;
    } else if (response.status === 403) {
      console.log(`⚠️  403 Forbidden - May need different OAuth scopes`);
    } else {
      const text = await response.text();
      console.log(`Response: ${text.substring(0, 300)}`);
    }
  } catch (error: any) {
    console.error(`❌ ${error.message}`);
  }

  return false;
}

async function main() {
  console.log("Testing Webex general API (webexapis.com) for Captures...\n");

  const now = Date.now();
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

  const tests = [
    {
      path: "/v1/contactCenter/captures",
      params: { orgId: ORG_ID!, taskId: TEST_TASK_ID },
      description: "Test: /v1/contactCenter/captures"
    },
    {
      path: "/v1/captures",
      params: { orgId: ORG_ID!, from: String(sevenDaysAgo), to: String(now) },
      description: "Test: /v1/captures (time range)"
    },
    {
      path: "/v1/captures",
      params: { orgId: ORG_ID!, taskId: TEST_TASK_ID },
      description: "Test: /v1/captures (taskId)"
    },
    {
      path: "/v1/contactCenter/captureManagement/captures",
      params: { orgId: ORG_ID!, taskId: TEST_TASK_ID },
      description: "Test: /v1/contactCenter/captureManagement/captures"
    }
  ];

  for (const test of tests) {
    const success = await testEndpoint(test.path, test.params, test.description);
    if (success) {
      console.log("\n🎉 Found working endpoint!");
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log("\n\n📝 CONCLUSION:");
  console.log("If all endpoints return 404, the Captures API may:");
  console.log("1. Not be enabled/available for this organization");
  console.log("2. Require a different API product/license");
  console.log("3. Only work with specific OAuth scopes we don't have");
  console.log("4. Be behind a feature flag or beta program");
  console.log("\nRecommendation: Contact Webex support to verify Captures API access");
}

main().catch(console.error);
