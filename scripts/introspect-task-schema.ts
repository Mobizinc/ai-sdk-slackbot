import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const BASE_URL = "https://api.wxcc-us1.cisco.com";

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

  // Introspection query for task field details
  const introspectionQuery = {
    query: `
      {
        __type(name: "Query") {
          fields {
            name
            args {
              name
              type {
                name
                kind
                ofType {
                  name
                }
              }
            }
            type {
              name
              kind
              fields {
                name
                type {
                  name
                  kind
                }
              }
            }
          }
        }
      }
    `
  };

  console.log("Introspecting GraphQL schema...\n");

  const response = await fetch(`${BASE_URL}/search`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(introspectionQuery)
  });

  if (response.ok) {
    const data = await response.json();
    console.log("Full Schema:");
    console.log(JSON.stringify(data, null, 2));
  } else {
    const text = await response.text();
    console.log(`Error: ${text}`);
  }
}

main().catch(console.error);
