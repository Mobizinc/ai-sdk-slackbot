import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

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

  console.log("Extracting orgId from access token...\n");

  // Extract orgId from token (last segment after underscore)
  const parts = token.split('_');
  const tokenOrgId = parts[parts.length - 1];

  console.log(`Token parts count: ${parts.length}`);
  console.log(`Extracted orgId from token: ${tokenOrgId}`);
  console.log(`Configured orgId in .env.local: ${process.env.WEBEX_CC_ORG_ID}`);

  if (tokenOrgId === process.env.WEBEX_CC_ORG_ID) {
    console.log("\n✅ Org IDs match!");
  } else {
    console.log("\n⚠️  Org IDs DON'T MATCH!");
    console.log("This could be the issue with Captures API access.");
  }

  // Show first 50 chars of token for debugging
  console.log(`\nToken (first 50 chars): ${token.substring(0, 50)}...`);
  console.log(`Token length: ${token.length} characters`);
}

main().catch(console.error);
