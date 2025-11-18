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

  console.log("Testing POST /v1/captures/query with JSON body...\n");

  const url = `${BASE_URL}/v1/captures/query`;

  // Parameters in request body as JSON
  const requestBody = {
    orgId: ORG_ID,
    from: sevenDaysAgo,
    to: now
  };

  console.log(`URL: ${url}`);
  console.log(`Request Body: ${JSON.stringify(requestBody, null, 2)}\n`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`Status: ${response.status} ${response.statusText}\n`);

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ SUCCESS!`);
      console.log(`Response keys: ${Object.keys(data).join(', ')}`);
      console.log(`\nFull Response:`);
      console.log(JSON.stringify(data, null, 2).substring(0, 3000));

      // Analyze captures
      const captures = data.data || [];
      console.log(`\n\n${"=".repeat(70)}`);
      console.log(`📊 CAPTURES FOUND: ${captures.length}`);
      console.log("=".repeat(70));

      if (captures.length > 0) {
        console.log("\nFirst 5 Captures:");
        captures.slice(0, 5).forEach((capture: any, idx: number) => {
          console.log(`\n${idx + 1}. Capture ID: ${capture.captureId || 'N/A'}`);
          console.log(`   Task ID: ${capture.taskId || 'N/A'}`);
          console.log(`   Duration: ${capture.duration ? `${capture.duration}s` : 'N/A'}`);
          console.log(`   Media Type: ${capture.mediaType || 'N/A'}`);
          console.log(`   Download URL: ${capture.downloadUrl ? '✅ Available' : '❌ Not Available'}`);
          console.log(`   Start Time: ${capture.startTime ? new Date(capture.startTime).toISOString() : 'N/A'}`);
          if (capture.downloadUrl) {
            console.log(`   URL (first 100 chars): ${capture.downloadUrl.substring(0, 100)}...`);
          }
        });

        // Count recordings with download URLs
        const withDownloadUrls = captures.filter((c: any) => c.downloadUrl).length;
        console.log(`\n\n📥 Recordings with download URLs: ${withDownloadUrls}/${captures.length}`);

        if (withDownloadUrls > 0) {
          console.log("\n🎉 VALIDATION SUCCESSFUL!");
          console.log("✅ Call recordings are accessible");
          console.log("✅ Download URLs are available");
          console.log("✅ Captures API is working correctly");
        }
      } else {
        console.log("\n⚠️  No recordings found in the last 7 days");
        console.log("Possible reasons:");
        console.log("- No calls were recorded during this period");
        console.log("- Recording retention expired (typically 24-48 hours)");
        console.log("- Recording not enabled on queues");
      }

    } else {
      const text = await response.text();
      console.log(`❌ Error Response:`);
      console.log(text);

      if (response.status === 403) {
        console.log("\n⚠️  403 Forbidden - Missing OAuth scopes or admin permissions");
        console.log("Required: Administrator profile + cjp:config_read scope");
        console.log("\nCurrent OAuth scopes from webex.env.local:");
        console.log("- cjp:config_read ✅");
        console.log("- spark-admin:people_read");
        console.log("\nNote: User must have Administrator profile (not just Premium Agent)");
      } else if (response.status === 400) {
        console.log("\n⚠️  400 Bad Request - Check parameter format");
      }
    }
  } catch (error: any) {
    console.error(`❌ Exception: ${error.message}`);
  }
}

main().catch(console.error);
