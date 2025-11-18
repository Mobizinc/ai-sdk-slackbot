import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const WEBEX_BASE = "https://webexapis.com";
const ORG_ID = process.env.WEBEX_CC_ORG_ID;
const TEST_TASK_ID = "b3707701-9723-472b-9ca5-943655da98ca";

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

async function testEndpoint(path: string, params: Record<string, string>) {
  const token = await getToken();
  const url = new URL(`${WEBEX_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  console.log(`\nTesting: ${url.toString()}`);

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });

    console.log(`  Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`  ✅ SUCCESS!`);
      console.log(`  Response keys: ${Object.keys(data).join(', ')}`);
      console.log(`  Data: ${JSON.stringify(data).substring(0, 500)}`);
      return true;
    } else {
      const text = await response.text();
      console.log(`  Response: ${text.substring(0, 300)}`);
    }
  } catch (error: any) {
    console.log(`  ❌ Exception: ${error.message}`);
  }

  return false;
}

async function main() {
  console.log("Testing Webex API (webexapis.com) for Captures...\n");

  const testCases = [
    // Try Webex general API
    { path: "/v1/contactCenter/captureManagement/captures", params: { taskId: TEST_TASK_ID, orgId: ORG_ID! } },
    { path: "/v1/contactCenter/captures", params: { taskId: TEST_TASK_ID, orgId: ORG_ID! } },
    { path: "/v1/recordings", params: { orgId: ORG_ID! } },

    // Try without orgId
    { path: "/v1/contactCenter/captureManagement/captures", params: { taskId: TEST_TASK_ID } },
  ];

  for (const testCase of testCases) {
    const success = await testEndpoint(testCase.path, testCase.params);
    if (success) {
      console.log("\n🎉 Found working endpoint!");
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log("\n\nNote: Captures API might require:");
  console.log("1. Different OAuth scopes (recording-specific permissions)");
  console.log("2. Recordings to be explicitly requested during call (captureRequested flag)");
  console.log("3. Access via webhooks (capture:available event notifications)");
}

main().catch(console.error);
