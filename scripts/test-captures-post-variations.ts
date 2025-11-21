import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const BASE_URL = "https://api.wxcc-us1.cisco.com";
const ORG_ID = process.env.WEBEX_CC_ORG_ID;
const TEST_TASK_IDS = [
  "b3707701-9723-472b-9ca5-943655da98ca",
  "431371ce-b98b-44ac-8e1b-0db1af5f3077"
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

async function testPayload(payload: any, description: string) {
  const token = await getToken();
  const url = `${BASE_URL}/v1/captures/query`;

  console.log(`\n${"=".repeat(60)}`);
  console.log(description);
  console.log("=".repeat(60));
  console.log(`Payload: ${JSON.stringify(payload, null, 2)}\n`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    console.log(`Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ SUCCESS!`);
      console.log(`Response: ${JSON.stringify(data, null, 2).substring(0, 1000)}`);
      return true;
    } else if (response.status === 400) {
      const text = await response.text();
      console.log(`⚠️  Bad Request: ${text.substring(0, 300)}`);
    } else {
      const text = await response.text();
      console.log(`❌ Error: ${text.substring(0, 300)}`);
    }
  } catch (error: any) {
    console.error(`❌ Exception: ${error.message}`);
  }

  return false;
}

async function main() {
  const now = Date.now();
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

  const variations = [
    // Try with taskIds array
    {
      orgId: ORG_ID,
      taskIds: TEST_TASK_IDS
    },

    // Try with taskId array (singular)
    {
      orgId: ORG_ID,
      taskId: TEST_TASK_IDS
    },

    // Try without orgId, just task IDs
    {
      taskIds: TEST_TASK_IDS
    },

    // Try with query object
    {
      query: {
        orgId: ORG_ID,
        from: sevenDaysAgo,
        to: now
      }
    },

    // Try with organizationId
    {
      organizationId: ORG_ID,
      from: sevenDaysAgo,
      to: now
    },

    // Try simple time range only
    {
      from: sevenDaysAgo,
      to: now
    }
  ];

  const descriptions = [
    "With orgId and taskIds array",
    "With orgId and taskId array (singular)",
    "Just taskIds (no orgId)",
    "Nested query object",
    "organizationId instead of orgId",
    "Just time range (from/to)"
  ];

  for (let i = 0; i < variations.length; i++) {
    const success = await testPayload(variations[i], descriptions[i]);
    if (success) {
      console.log("\n🎉 Found working payload structure!");
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

main().catch(console.error);
