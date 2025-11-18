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

async function testQuery(query: any, description: string) {
  const token = await getToken();
  const url = `${BASE_URL}/search`;

  console.log(`\n${"=".repeat(60)}`);
  console.log(description);
  console.log("=".repeat(60));
  console.log(`Query:\n${JSON.stringify(query, null, 2).substring(0, 400)}\n`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(query)
    });

    console.log(`Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`\n✅ SUCCESS!`);
      console.log(`Response: ${JSON.stringify(data, null, 2).substring(0, 1500)}`);
      return true;
    } else {
      const text = await response.text();
      console.log(`\n❌ Error:`);
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

  // Test 1: Tasks query with recording fields
  const tasksQuery = {
    query: `
      query GetTasksWithRecordings($from: Long!, $to: Long!) {
        task(
          from: $from
          to: $to
          channelType: telephony
        ) {
          tasks {
            id
            taskId
            channelType
            status
            createdTime
            endedTime
            owner {
              name
            }
            queue {
              name
            }
            recording {
              recordingId
              downloadUrl
              status
            }
          }
        }
      }
    `,
    variables: {
      from: sevenDaysAgo,
      to: now
    }
  };

  // Test 2: Simpler schema exploration
  const schemaQuery = {
    query: `
      {
        __schema {
          queryType {
            fields {
              name
              description
            }
          }
        }
      }
    `
  };

  // Test 3: Try without recording field
  const simpleTasksQuery = {
    query: `
      query GetTasks($from: Long!, $to: Long!) {
        task(
          from: $from
          to: $to
          channelType: telephony
        ) {
          tasks {
            id
            taskId
            status
            createdTime
          }
        }
      }
    `,
    variables: {
      from: sevenDaysAgo,
      to: now
    }
  };

  // Run tests
  await testQuery(tasksQuery, "Test 1: Tasks with Recording Fields");
  await new Promise(r => setTimeout(r, 1000));

  await testQuery(simpleTasksQuery, "Test 2: Simple Tasks Query");
  await new Promise(r => setTimeout(r, 1000));

  await testQuery(schemaQuery, "Test 3: GraphQL Schema Introspection");
}

main().catch(console.error);
