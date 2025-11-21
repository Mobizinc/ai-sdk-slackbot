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

  // GraphQL query for captures/recordings
  const graphqlQuery = {
    query: `
      query GetCaptures($from: Long!, $to: Long!) {
        captures(
          from: $from
          to: $to
          orgId: "${ORG_ID}"
        ) {
          id
          taskId
          status
          duration
          downloadUrl
          createdTime
        }
      }
    `,
    variables: {
      from: sevenDaysAgo,
      to: now
    }
  };

  console.log("Testing GraphQL /search endpoint for captures...\n");

  try {
    const url = `${BASE_URL}/search`;
    console.log(`URL: ${url}`);
    console.log(`Query: ${JSON.stringify(graphqlQuery, null, 2).substring(0, 300)}\n`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(graphqlQuery)
    });

    console.log(`Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`\n✅ GraphQL SUCCESS!`);
      console.log(`Response: ${JSON.stringify(data, null, 2).substring(0, 1000)}`);
    } else {
      const text = await response.text();
      console.log(`\n❌ Error Response:`);
      console.log(text.substring(0, 500));
    }
  } catch (error: any) {
    console.error(`\n❌ Exception: ${error.message}`);
  }

  // Also try /v1/search
  try {
    const url = `${BASE_URL}/v1/search`;
    console.log(`\n\nTrying: ${url}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(graphqlQuery)
    });

    console.log(`Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`\n✅ SUCCESS with /v1/search!`);
      console.log(`Response: ${JSON.stringify(data, null, 2).substring(0, 1000)}`);
    }
  } catch (error: any) {
    console.error(`❌ ${error.message}`);
  }
}

main().catch(console.error);
