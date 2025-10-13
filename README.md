# AI SDK Slackbot

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fnicoalbanese%2Fai-sdk-slackbot&env=SLACK_BOT_TOKEN,SLACK_SIGNING_SECRET,OPENAI_API_KEY,EXA_API_KEY&envDescription=API%20keys%20needed%20for%20application&envLink=https%3A%2F%2Fgithub.com%2Fnicoalbanese%2Fai-sdk-slackbot%3Ftab%3Dreadme-ov-file%234-set-environment-variables&project-name=ai-sdk-slackbot)

An AI-powered chatbot for Slack powered by the [AI SDK by Vercel](https://sdk.vercel.ai/docs).

## Features

- Integrates with [Slack's API](https://api.slack.com) for easy Slack communication
- Use any LLM with the AI SDK ([easily switch between providers](https://sdk.vercel.ai/providers/ai-sdk-providers))
- Works both with app mentions and as an assistant in direct messages
- Maintains conversation context within both threads and direct messages
- **Passive Case Number Monitoring**: Automatically detects case numbers (e.g., SCS0048402) in channel conversations and tracks context for knowledge base generation
- **CMDB Reconciliation**: Automatically links Configuration Items (CIs) from ServiceNow to cases and creates child tasks for missing CIs, turning entity extraction into actionable CMDB data governance
- Built-in tools for enhanced capabilities:
  - Real-time weather lookup
  - Web search (powered by [Exa](https://exa.ai))
  - ServiceNow incident, case, and knowledge-base lookups (when configured)
  - Similar cases search using Azure AI Search vector store (when configured)
  - Entity extraction and CMDB reconciliation (when configured)
- Easily extensible architecture to add custom tools (e.g., knowledge search)
- **Inbound Relay Gateway**: Authenticated `/api/relay` endpoint lets upstream agents and services deliver Slack messages without creating their own Slack apps

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ installed
- Slack workspace with admin privileges
- [OpenAI API key](https://platform.openai.com/api-keys)
- [Exa API key](https://exa.ai) (for web search functionality)
- Azure AI Search service (optional, for similar cases search)
- ServiceNow instance with CMDB access (optional, for CMDB reconciliation)
- A server or hosting platform (e.g., [Vercel](https://vercel.com)) to deploy the bot

## Setup

### 1. Install Dependencies

```bash
npm install
# or
pnpm install
```

### 2. Create a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) and click "Create New App"
2. Choose "From scratch" and give your app a name
3. Select your workspace

### 3. Configure Slack App Settings

- Go to "Basic Information"
   - Under "App Credentials", note down your "Signing Secret". This will be an environment variable `SLACK_SIGNING_SECRET`
- Go to "App Home"
  - Under Show Tabs -> Messages Tab, Enable "Allow users to send Slash commands and messages from the messages tab"
- Go to "OAuth & Permissions"
   - Add the following [Bot Token Scopes](https://api.slack.com/scopes):
      - `app_mentions:read`
      - `assistant:write`
      - `assistant:read`
      - `chat:write`
      - `im:history`
      - `im:read`
      - `im:write`
      - `channels:history`
      - `groups:history`
      - `mpim:history`
      - `users:read.email`
   - Install the app to your workspace and note down the "Bot User OAuth Token" for the environment variable `SLACK_BOT_TOKEN`

- Go to "Event Subscriptions"
   - Enable Events
   - Set the Request URL to either
      - your deployment URL: (e.g. `https://your-app.vercel.app/api/events`)
      - or, for local development, use the tunnel URL from the [Local Development](./README.md#local-development) section below
   - Under "Subscribe to bot events", add:
      - `app_mention`
      - `assistant_thread_started`
      - `assistant_thread_context_changed`
      - `message:im`
      - `message.channels` (for passive case number monitoring)
      - `message.groups` (optional, for private channel monitoring)
      - `reaction_added` (for KB article approval workflow)
   - Save Changes

> Remember to include `/api/events` in the Request URL.

You may need to refresh Slack with CMD+R or CTRL+R to pick up certain changes, such as enabling the chat tab

### 4. Set Environment Variables

Create a `.env` file in the root of your project with the following:

```
# Slack Credentials
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret

# AI Model Configuration (Primary: AI Gateway with GLM-4.6, Fallback: OpenAI)
# AI Gateway (Z.ai GLM-4.6 - 200K context, faster, cheaper)
AI_GATEWAY_API_KEY=vck_your-gateway-api-key
AI_GATEWAY_DEFAULT_MODEL=zai/glm-4.6

# OpenAI (Fallback + Embeddings for vector search)
OPENAI_API_KEY=your-openai-api-key
OPENAI_FALLBACK_MODEL=gpt-5-mini

# Exa API Key (for web search functionality)
EXA_API_KEY=your-exa-api-key

# Azure Search Configuration (optional, for case intelligence / similar cases search)
AZURE_SEARCH_ENDPOINT=https://your-search-service.search.windows.net
AZURE_SEARCH_KEY=your-azure-search-api-key
AZURE_SEARCH_INDEX_NAME=case-intelligence-prod
CASE_EMBEDDING_MODEL=text-embedding-3-small

# ServiceNow (optional - for case lookups and KB integration)
SERVICENOW_URL=https://your-instance.service-now.com
# Or use SERVICENOW_INSTANCE_URL (both work, URL takes precedence)
# SERVICENOW_INSTANCE_URL=https://your-instance.service-now.com

# Authentication: Either username/password or API token
SERVICENOW_USERNAME=your-servicenow-username
SERVICENOW_PASSWORD=your-servicenow-password
# Or
# SERVICENOW_API_TOKEN=your-servicenow-api-token

# Optional overrides (defaults shown)
# SERVICENOW_CASE_TABLE=sn_customerservice_case
# SERVICENOW_CASE_JOURNAL_NAME=x_mobit_serv_case_service_case

# Relay Gateway
RELAY_WEBHOOK_SECRET=shared-hmac-secret

# Knowledge Workflow Tuning (optional)
KB_GATHERING_TIMEOUT_HOURS=24
KB_GATHERING_MAX_ATTEMPTS=5
ASSISTANT_MIN_DESCRIPTION_LENGTH=10
ASSISTANT_SIMILAR_CASES_TOP_K=3
KB_SIMILAR_CASES_TOP_K=3

# Database (optional, for persisting context and KB generation state)
DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=require

# CMDB Reconciliation (optional)
CMDB_RECONCILIATION_ENABLED=false
CMDB_RECONCILIATION_CONFIDENCE_THRESHOLD=0.7
CMDB_RECONCILIATION_CACHE_RESULTS=true
CMDB_RECONCILIATION_ASSIGNMENT_GROUP="CMDB Administrators"
CMDB_RECONCILIATION_SLACK_CHANNEL="cmdb-alerts"
```

Replace the placeholder values with your actual tokens.

### 5. Database Setup (Optional)

The bot can persist conversation context and KB generation state to Neon Postgres. This ensures data survives bot restarts and enables historical analytics.

**To set up Neon database:**

1. Create a Neon project at https://neon.tech
2. Copy the connection string and set it as `DATABASE_URL` in your environment
3. Generate and run migrations:

```bash
# Generate migration files from schema
npm run db:generate

# Push schema directly to database (development)
npm run db:push

# Or run migrations (production)
npm run db:migrate
```

**Database features:**
- ✅ Context survives bot restarts
- ✅ KB gathering workflows resume after deployments
- ✅ Historical conversation tracking
- ✅ Graceful degradation (works without database)

## Local Development

Use the [Vercel CLI](https://vercel.com/docs/cli) and [untun](https://github.com/unjs/untun) to test out this project locally:

```sh
pnpm i -g vercel
pnpm vercel dev --listen 3000 --yes
```

```sh
npx untun@latest tunnel http://localhost:3000
```

Make sure to modify the [subscription URL](./README.md/#enable-slack-events) to the `untun` URL.

> Note: you may encounter issues locally with `waitUntil`. This is being investigated.

## Testing

- `npm test` – runs the Vitest integration suite with mocked Slack/OpenAI/ServiceNow services. The primary test exercises the `/api/events` handler end-to-end for a direct-message flow.
- `npm run smoke` – executes a lightweight CLI smoke test that calls `generateResponse` with canned ServiceNow responses (no external network calls).
- Optional live validation: to hit real services, export `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `OPENAI_API_KEY`, and the `SERVICENOW_*` credentials for a non-production workspace, then invoke the webhook manually (e.g. via `curl`). Keep this out of the default test run so CI stays offline.

### Observability & Testing

- The assistant manager logs context fallbacks (`missing_scope`) so you can verify Slack permissions during development.
- ServiceNow tool calls emit structured errors in the function logs; verify credentials before enabling in production.
- Add integration tests (or manual scripts) that replay `assistant_thread_started`, `assistant_thread_context_changed`, and `message.im` payloads to validate the new event flow before deployment.

## Production Deployment

### Deploying to Vercel

1. Push your code to a GitHub repository

2. Deploy to [Vercel](https://vercel.com):

   - Go to vercel.com
   - Create New Project
   - Import your GitHub repository

3. Add your environment variables in the Vercel project settings:

   - `SLACK_BOT_TOKEN`
   - `SLACK_SIGNING_SECRET`
   - `OPENAI_API_KEY`
   - `EXA_API_KEY`

4. After deployment, Vercel will provide you with a production URL

5. Update your Slack App configuration:
   - Go to your [Slack App settings](https://api.slack.com/apps)
   - Select your app

   - Go to "Event Subscriptions"
      - Enable Events
      - Set the Request URL to: `https://your-app.vercel.app/api/events`
   - Save Changes

## Usage

The bot will respond to:

1. Direct messages - Send a DM to your bot
2. Mentions - Mention your bot in a channel using `@YourBotName`

The bot maintains context within both threads and direct messages, so it can follow along with the conversation.

### Available Tools

1. **Weather Tool**: The bot can fetch real-time weather information for any location.

   - Example: "What's the weather like in London right now?"

2. **Web Search**: The bot can search the web for up-to-date information using [Exa](https://exa.ai).
   - Example: "Search for the latest news about AI technology"
   - You can also specify a domain: "Search for the latest sports news on bbc.com"

3. **ServiceNow Toolkit (optional)**: When ServiceNow credentials are configured, the assistant can look up incidents and cases, pull recent work notes/comments, search the knowledge base, and validate configuration items directly from Slack.
   - Example: "Show the latest updates for case SCS0048402"
   - Example: "Search ServiceNow knowledge base for multi-factor authentication"
   - Example: "Check ServiceNow CMDB for ALTUSHOUHOSP or 172.99.109.10"

4. **Context Update Proposals**: When the CMDB is missing a verified asset, the assistant can draft a structured update for steward approval. Approved updates append to the `business_contexts` table and keep Altus metadata fresh.
   - Example: "Propose context update for ALTUSHOUHOSP with IP 172.99.109.10 and owner Network Ops"

5. **Similar Cases Search (optional)**: When Azure AI Search is configured, the assistant can find similar historical cases using vector similarity search.
   - Example: "Find similar cases to this VPN authentication issue"
   - Example: "Search for cases similar to error code 0x80070035"
   - Example: "Show me similar cases for client XYZ with network connectivity problems"

6. **Passive Case Monitoring & Multi-Stage KB Generation**: The bot automatically watches for case numbers and creates knowledge base articles through an intelligent, quality-aware workflow.

   **Passive Monitoring:**
   - **Detection**: Automatically detects case numbers (e.g., `SCS0048402`) in channel messages
   - **Intelligent Assistance**: Posts threaded reply with case details, similar historical cases, and business context
   - **Context Tracking**: Maintains rolling 20-message window per case, persisted to PostgreSQL
   - **Resolution Detection**: Identifies keywords ("fixed", "resolved", "working", "closed", "done")
   - No @mention needed - works passively in the background

   **Multi-Stage KB Generation Workflow:**

   1. **Resolution Summary** (AI-powered)
      - Concise summary of what was resolved posted to thread
      - Non-blocking, continues to quality assessment

   2. **Quality Assessment** (AI-powered decision engine)
      - Analyzes conversation completeness: problem clarity, solution detail, steps documented, root cause
      - Scores 0-100 with three decision paths:
        - **Score ≥80** (High Quality): Direct to KB generation
        - **Score 50-79** (Needs Input): Interactive Q&A to gather missing information
        - **Score <50** (Insufficient): Requests case notes update in ServiceNow

   3a. **High Quality Path** (Score ≥80)
      - **Duplicate Detection**: Searches existing KBs via vector similarity (>85% = duplicate)
      - **KB Generation**: Creates structured article with AI (title, problem, environment, solution, root cause, tags)
      - **Confidence Scoring**: 0-100% based on conversation quality
      - **Approval Workflow**: Posts draft, react with ✅ to approve or ❌ to reject
      - **Auto-publish**: [Future] Creates KB in ServiceNow on approval

   3b. **Interactive Gathering Path** (Score 50-79)
      - **Contextual Questions**: AI generates 3-5 specific questions to fill knowledge gaps
      - **User Interaction**: Waits for responses (24h timeout, max 5 attempts)
      - **Re-assessment**: Quality re-evaluated after each response
      - **Adaptive**: Jumps to high-quality path when score improves to ≥80

   3c. **Insufficient Path** (Score <50)
      - **Case Notes Request**: Asks user to update ServiceNow case notes
      - **Manual Follow-up**: Requires intervention before KB creation

   **KB Article Structure:**
   - Title (50-80 chars), Problem Statement, Environment (systems/versions)
   - Step-by-Step Solution (markdown formatted), Root Cause Analysis
   - Related Cases (auto-extracted), Tags (auto-generated for search)
   - Conversation Summary (full context preserved)
   - Confidence scoring (🟢 High ≥75%, 🟡 Medium ≥50%, 🟠 Low <50%)

   **State Persistence:**
   - All workflow states persisted to PostgreSQL (survives bot restarts)
   - Background cleanup jobs handle timeouts (configurable hours for Q&A, expired approvals)

### Scheduled Cleanup

- Configure a Vercel Cron Job to call `GET /api/cron/cleanup-workflows` (or `POST`) on your preferred cadence.
- The endpoint runs the same `cleanupTimedOutGathering` logic that previously lived in an in-process timer, ensuring stale gathering sessions are closed even on serverless platforms.
- Environment variable `KB_GATHERING_TIMEOUT_HOURS` controls when conversations are considered abandoned.

### Extending with New Tools

The chatbot is built with an extensible architecture using the [AI SDK's tool system](https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling). You can easily add new tools such as:

- Knowledge base search
- Database queries
- Custom API integrations
- Company documentation search

To add a new tool, extend the `tools` object in `lib/generate-response.ts` following the existing pattern.

You can also disable any of the existing tools by removing the tool in the `lib/ai.ts` file.

## Inbound Relay API

Expose this project as the single Slack gateway for other agents and services via the `/api/relay` endpoint. External systems post JSON payloads, the gateway signs and validates requests with an HMAC header, and the bot forwards the message to Slack while preserving per-thread context.

### Authentication

- Set `RELAY_WEBHOOK_SECRET` in every environment. Requests must include:
  - `x-relay-signature`: `v1=<hex digest>` where the digest is `HMAC_SHA256(secret, "v1:{timestamp}:{body}")`
  - `x-relay-timestamp`: Unix seconds. Requests outside a ±5 minute window are rejected.
- Rotate the secret by updating the environment variable and redeploying. Downstream agents should refresh at the same time.

### Request Payload

```json
{
  "target": {
    "channel": "C12345",         // Slack channel ID; optional if user supplied
    "user": "U67890",            // Slack user ID to open a DM
                                  // or supply target.email to resolve slack user ID
    "thread_ts": "1728237000.000100", // Existing thread timestamp (optional)
    "reply_broadcast": false      // Optional, when posting in public threads
  },
  "message": {
    "text": "Hello from the triage agent", // Trimmed automatically
    "blocks": [ /* Optional Slack Block Kit blocks */ ],
    "attachments": [ /* Optional Slack attachments */ ],
    "unfurl_links": false,
    "unfurl_media": false
  },
  "source": "triage-agent",       // Optional label recorded in Slack message metadata
  "metadata": {
    "correlationId": "case-123",
    "eventType": "triage.update",
    "payload": { "priority": "high" }
  }
}
```

- Provide at least one of `target.channel`, `target.user`, or `target.email`.
- Supply `message.text` (non-empty) or `message.blocks`.
- When only `target.user` or `target.email` is provided, the gateway opens a DM and uses the resolved channel ID automatically.
- `metadata` is mapped to Slack message metadata (visible in message details) for traceability.

### Example `curl`

```bash
BODY='{"target":{"channel":"C12345"},"message":{"text":"Hello"},"source":"inventory-agent"}'
TS=$(date +%s)
SIG=$(printf "v1:%s:%s" "$TS" "$BODY" | \
  openssl dgst -sha256 -hmac "$RELAY_WEBHOOK_SECRET" | \
  sed 's/^.*= //')

curl -X POST https://your-app.vercel.app/api/relay \
  -H "content-type: application/json" \
  -H "x-relay-timestamp: $TS" \
  -H "x-relay-signature: v1=$SIG" \
  -d "$BODY"
```

Expected response:

```json
{
  "ok": true,
  "channel": "C12345",
  "ts": "1728238123.000200",
  "thread_ts": "1728238123.000200"
}
```

### Upstream Agent Onboarding

- Issue each agent a copy of the shared secret out-of-band or proxy requests through your service mesh that injects the header.
- Maintain a registry (spreadsheet, config file, or secrets manager) noting which agent uses which channel/thread.
- Optionally wrap this endpoint with a lightweight API gateway to enforce per-agent rate limits before hitting Slack rate caps.
- Record `correlationId` values from upstream jobs so you can trace Slack replies back to originating tickets or workflows.

### Failure Handling

- `401` – Signature missing/invalid or replay window exceeded.
- `400` – Malformed JSON or payload validation errors (see `details` in response body).
- `404` – DM target could not be opened (user removed or no mutual workspace access).
- `502` – Slack API rejected the message or timed out; upstream callers should retry with backoff and respect Slack rate limits.

## License

MIT
