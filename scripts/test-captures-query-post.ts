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

async function main() {
  const token = await getToken();
  const now = Date.now();
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

  console.log("Testing POST /v1/captures/query...\n");

  const url = `${BASE_URL}/v1/captures/query`;
  const payload = {
    orgId: ORG_ID,
    from: sevenDaysAgo,
    to: now
  };

  console.log(`URL: ${url}`);
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

    console.log(`Status: ${response.status} ${response.statusText}\n`);

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ SUCCESS!`);
      console.log(`Response keys: ${Object.keys(data).join(', ')}`);
      console.log(`\nFull Response:`);
      console.log(JSON.stringify(data, null, 2).substring(0, 2000));

      // Count captures
      const captures = data.data || data.captures || data.items || [];
      const captureCount = Array.isArray(captures) ? captures.length : 0;
      console.log(`\n\n${"=".repeat(60)}`);
      console.log(`Total Captures Found: ${captureCount}`);
      console.log("=".repeat(60));

      if (captureCount > 0 && Array.isArray(captures)) {
        console.log("\nFirst 5 Captures:");
        captures.slice(0, 5).forEach((capture: any, idx: number) => {
          console.log(`\n${idx + 1}. Capture ID: ${capture.id || capture.captureId || 'N/A'}`);
          console.log(`   Task ID: ${capture.taskId || 'N/A'}`);
          console.log(`   Download URL: ${capture.downloadUrl ? 'Available ✅' : 'N/A'}`);
          console.log(`   Duration: ${capture.duration || capture.durationMs || 'N/A'}`);
        });
      }

    } else {
      const text = await response.text();
      console.log(`❌ Error Response:`);
      console.log(text.substring(0, 1000));
    }
  } catch (error: any) {
    console.error(`❌ Exception: ${error.message}`);
  }
}

main().catch(console.error);
