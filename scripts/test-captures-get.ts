import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const BASE_URL = "https://api.wxcc-us1.cisco.com";
const ORG_ID = process.env.WEBEX_CC_ORG_ID;
const TEST_TASK_IDS = [
  "b3707701-9723-472b-9ca5-943655da98ca",
  "431371ce-b98b-44ac-8e1b-0db1af5f3077",
  "de0300b3-71a6-4cbd-b7e6-4d995d3a6985"
];

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

async function testGetCaptures(params: Record<string, string | string[]>, description: string) {
  const token = await getToken();
  const url = new URL(`${BASE_URL}/v1/captures`);

  // Handle array parameters
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(v => url.searchParams.append(key, v));
    } else {
      url.searchParams.set(key, value);
    }
  });

  console.log(`\n${"=".repeat(70)}`);
  console.log(description);
  console.log("=".repeat(70));
  console.log(`URL: ${url.toString()}\n`);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json"
      }
    });

    console.log(`Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`\n✅ SUCCESS!`);
      console.log(`Response keys: ${Object.keys(data).join(', ')}`);
      console.log(`\nData: ${JSON.stringify(data, null, 2).substring(0, 2000)}`);

      const captures = data.data || data.captures || data.items || [];
      console.log(`\n📊 Total captures: ${Array.isArray(captures) ? captures.length : 0}`);
      return true;
    } else {
      const text = await response.text();
      console.log(`\n${response.status >= 400 && response.status < 500 ? '⚠️' : '❌'} Error:`);
      console.log(text.substring(0, 400));
    }
  } catch (error: any) {
    console.error(`❌ Exception: ${error.message}`);
  }

  return false;
}

async function main() {
  const now = Date.now();
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

  console.log("Testing GET /v1/captures with various parameter combinations...\n");

  const testCases = [
    // Standard pattern based on official Webex API docs
    {
      params: { orgId: ORG_ID!, from: String(sevenDaysAgo), to: String(now) },
      description: "Test 1: orgId + from/to time range"
    },

    // With specific task IDs
    {
      params: { orgId: ORG_ID!, taskId: TEST_TASK_IDS },
      description: "Test 2: orgId + multiple taskId parameters"
    },

    // With single task ID
    {
      params: { orgId: ORG_ID!, taskId: TEST_TASK_IDS[0] },
      description: "Test 3: orgId + single taskId"
    },

    // Time range with page size
    {
      params: { orgId: ORG_ID!, from: String(sevenDaysAgo), to: String(now), pageSize: "100" },
      description: "Test 4: orgId + from/to + pageSize"
    },

    // With urlExpiration parameter
    {
      params: { orgId: ORG_ID!, taskId: TEST_TASK_IDS, urlExpiration: "3600" },
      description: "Test 5: orgId + taskIds + urlExpiration"
    },

    // Lowercase orgid
    {
      params: { orgid: ORG_ID!, from: String(sevenDaysAgo), to: String(now) },
      description: "Test 6: orgid (lowercase) + from/to"
    }
  ];

  for (const testCase of testCases) {
    const success = await testGetCaptures(testCase.params, testCase.description);
    if (success) {
      console.log("\n\n🎉 Found working API call!");
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

main().catch(console.error);
