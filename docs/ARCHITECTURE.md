# System Architecture

## Overview

The AI SDK Slackbot is a **passive monitoring and intelligent assistance system** that automatically detects support cases in Slack conversations, provides contextual assistance, and generates knowledge base articles using AI-powered quality assessment.

**Key Capabilities:**
- 🔍 Passive case number detection in Slack channels
- 🤖 AI-powered intelligent assistance with similar case lookup
- 📊 Multi-stage KB generation with quality assessment
- 💬 Interactive information gathering via Q&A
- ✅ Human-in-the-loop approval workflow
- 🔎 Vector similarity search using Azure AI Search
- 💾 Persistent context across restarts (PostgreSQL)

---

## System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        SLACK WORKSPACE                          │
│  Users post messages mentioning case numbers (SCS0048417)       │
└────────────────────┬────────────────────────────────────────────┘
                     │ Slack Events API
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API GATEWAY (Vercel)                         │
│  /api/events   - Slack event webhook                            │
│  /api/relay    - Inbound relay for upstream agents              │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                   EVENT ROUTER                                  │
│  api/events.ts                                                  │
│  • app_mention          → App Mention Handler                   │
│  • message (channels)   → Passive Message Handler               │
│  • message (DM)         → Assistant Manager                     │
│  • reaction_added       → KB Approval Manager & Context Updates │
└─────┬───────────────────────────────────────────────────────────┘
      │
      ├─────────────────────────────────────────────────────────┐
      │                                                         │
      ▼                                                         ▼
┌──────────────────────┐                        ┌──────────────────────┐
│  PASSIVE MONITORING  │                        │   DIRECT MESSAGES    │
│  handle-passive-     │                        │   assistant-         │
│  messages.ts         │                        │   manager.ts         │
└──────┬───────────────┘                        └──────────────────────┘
       │
       ├─► Case Number Detection (regex: [A-Z]{3}\d{7})
       │
       ├─► Context Manager (lib/context-manager.ts)
       │   • Track conversations per case+thread
       │   • Rolling 20-message window
       │   • Resolution keyword detection
       │   • Persist to PostgreSQL
       │
       ├─► Intelligent Assistance (first detection)
       │   │
       │   ├─► ServiceNow Integration (lib/tools/servicenow.ts)
       │   │   • Fetch case details
       │   │   • Get journal entries
       │   │
       │   ├─► Azure AI Search (lib/services/azure-search.ts)
       │   │   • Vector similarity search
       │   │   • Find similar historical cases
       │   │
       │   ├─► Business Context (lib/services/business-context-service.ts)
       │   │   • Match company/vendor from channel
       │   │   • Enrich LLM prompts
       │   │
       │   └─► Post threaded reply with context
       │
       └─► Resolution Detection (keywords: fixed, resolved, closed, done)
           │
           └─► Multi-Stage KB Generation Workflow ▼


## Multi-Stage KB Generation Workflow

### Stage 1: Resolution Summary
**File**: `lib/services/case-resolution-summary.ts`

```
Input: Case context + ServiceNow details
  ↓
AI Model: resolution-summary (GLM-4.6)
  ↓
Output: Concise summary posted to thread
  ↓
Continue to Stage 2 (non-blocking)
```

---

### Stage 2: Quality Assessment
**File**: `lib/services/case-quality-analyzer.ts`

**Purpose**: Determine if we have enough information to create a useful KB article

```typescript
interface QualityAssessment {
  decision: "high_quality" | "needs_input" | "insufficient";
  score: 0-100;
  problemClarity: "clear" | "vague" | "missing";
  solutionClarity: "clear" | "vague" | "missing";
  stepsDocumented: boolean;
  rootCauseIdentified: boolean;
  missingInfo: string[];  // What's missing
  reasoning: string;      // Why this score
}
```

**AI Prompt Analysis**:
- Conversation completeness
- Problem description clarity
- Solution documentation
- Step-by-step instructions
- Root cause identification

**Decision Thresholds**:
- **Score ≥80**: High quality → Direct to KB generation
- **Score 50-79**: Needs input → Interactive gathering
- **Score <50**: Insufficient → Request case notes update

---

### Stage 3a: High Quality Path (Score ≥80)

```
State: ASSESSING → GENERATING
  ↓
Duplicate Detection (Azure Search)
  ├─ Similarity >85% → Post "Similar KB exists" → ABANDONED
  └─ Similarity ≤85% → Continue
      ↓
KB Article Generation (GLM-4.6)
  ↓
Article Structure:
  {
    title: string (50-80 chars)
    problem: string (symptoms, impact)
    environment: string (systems, versions)
    solution: string (step-by-step markdown)
    rootCause?: string (why it happened)
    relatedCases: string[] (extracted)
    tags: string[] (for search)
    conversationSummary: string
  }
  ↓
Confidence Scoring (0-100%)
  • Conversation length: 30 pts
  • Solution detail: 25 pts
  • Environment info: 15 pts
  • Root cause: 15 pts
  • Tag quality: 15 pts
  ↓
State: GENERATING → PENDING_APPROVAL
  ↓
Post to Slack with approval reactions
  "React with ✅ to publish or ❌ to skip"
  ↓
Wait for reaction (24h timeout)
  ├─ ✅ → APPROVED → [TODO: Create in ServiceNow KB]
  └─ ❌ → REJECTED → Cleanup
```

---

### Stage 3b: Needs Input Path (Score 50-79)

```
State: ASSESSING → GATHERING
  ↓
Generate Contextual Questions (GLM-4.6)
  Input: missingInfo array from assessment
  Output: 3-5 specific questions
  ↓
Post questions to Slack thread
  ↓
Wait for user response (24h timeout, max 5 attempts)
  ↓
User responds → Add to userResponses[]
  ↓
Re-assess Quality (with new info)
  ├─ Score ≥80? → Jump to Stage 3a
  ├─ Attempts < 5? → Ask follow-up questions
  └─ Attempts ≥5? → ABANDONED
```

**Interactive Q&A Example**:
```
❓ Missing Information for SCS0048417

To create a complete KB article, I need:

1. **Resolution Steps**: What specific actions fixed the issue?
2. **Error Message**: Was there a specific error code or message?
3. **Root Cause**: Why did this problem occur?

Please provide details, and I'll generate the KB article.
```

---

### Stage 3c: Insufficient Path (Score <50)

```
State: ASSESSING → AWAITING_NOTES
  ↓
Post message: "Please update case notes in ServiceNow"
  ↓
[FUTURE] Background job checks in 24h
  ↓
Currently: Manual intervention required
```

---

## Data Storage Architecture

### PostgreSQL Schema (Drizzle ORM)

#### **Table: case_contexts**
Primary Key: `(case_number, thread_ts)`

```typescript
{
  caseNumber: string;           // "SCS0048417"
  threadTs: string;             // Slack thread timestamp
  channelId: string;            // "C12345"
  channelName?: string;         // "altus-support"
  channelTopic?: string;        // "Altus Health Support"
  channelPurpose?: string;      // "IT support channel"
  isResolved: boolean;          // Resolution detected?
  resolvedAt?: Date;
  detectedAt: Date;             // First detection time
  lastUpdated: Date;            // Last message added
  notified: boolean;            // KB workflow triggered?
  hasPostedAssistance: boolean; // Intelligent msg posted?
}
```

**Indexes**:
- `idx_resolved` on `(isResolved, notified)` - Find cases ready for KB generation
- `idx_case_number` on `case_number` - Lookup by case
- `idx_last_updated` on `last_updated` - Cleanup old contexts

---

#### **Table: case_messages**
Auto-increment ID, linked to contexts via `(case_number, thread_ts)`

```typescript
{
  id: serial;
  caseNumber: string;
  threadTs: string;
  userId: string;              // Slack user ID
  messageText: string;
  messageTimestamp: string;    // Slack message ts
  createdAt: Date;
}
```

**Rolling Window**: Max 20 messages per case (enforced in application layer)

---

#### **Table: kb_generation_states**
Primary Key: `(case_number, thread_ts)`

```typescript
{
  caseNumber: string;
  threadTs: string;
  channelId: string;
  state: string;               // KBState enum value
  attemptCount: number;        // Q&A attempt counter
  userResponses: string[];     // Collected answers (JSONB)
  assessmentScore?: number;    // 0-100
  missingInfo: string[];       // What's missing (JSONB)
  startedAt: Date;
  lastUpdated: Date;
}
```

**States**:
```typescript
enum KBState {
  ASSESSING = "assessing",
  GATHERING = "gathering",
  GENERATING = "generating",
  PENDING_APPROVAL = "pending_approval",
  APPROVED = "approved",
  REJECTED = "rejected",
  AWAITING_NOTES = "awaiting_notes",
  ABANDONED = "abandoned"
}
```

---

#### **Table: business_contexts**
Stores company/vendor/platform information for LLM context enrichment

```typescript
{
  id: serial;
  entityName: string;          // "Altus Health System"
  entityType: string;          // "CLIENT" | "VENDOR" | "PLATFORM"
  industry?: string;           // "Healthcare"
  description?: string;
  aliases: string[];           // ["Altus", "AHS"] (JSONB)
  relatedEntities: string[];   // ["Epic", "PACS"] (JSONB)
  technologyPortfolio?: string;
  serviceDetails?: string;
  keyContacts: {name, role, email}[]; (JSONB)
  slackChannels: {name, channelId?, notes?}[]; (JSONB)
  cmdbIdentifiers: {ciName?, sysId?, ipAddresses?, ownerGroup?, documentation?}[]; (JSONB)
  contextStewards: {type, id?, name?, notes?}[]; (JSONB)
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

**Usage**: When case detected in #altus-support channel:
1. Match "altus" against `entityName` or `aliases`
2. Inject company context into AI prompts
3. Example: "This case is for Altus Health System, a healthcare client using Epic EMR and PACS systems..."

---

## Vector Search Integration

### Azure AI Search Architecture

**Service**: `lib/services/azure-search.ts`

```
┌─────────────────────────────────────────────────────────────┐
│ Slack Bot (Read-Only Consumer)                              │
│                                                              │
│  Query Text → OpenAI Embedding API                          │
│     ↓                                                        │
│  Vector (1536 dims) → Azure AI Search                       │
│     ↓                                                        │
│  kNN Search (cosine similarity)                              │
│     ↓                                                        │
│  Top K Results (with scores)                                 │
└─────────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────────┐
│ Azure AI Search Index: "case-intelligence-prod"             │
│                                                              │
│  Documents: Historical resolved cases                        │
│  Vector Field: "embedding" (text-embedding-3-small)          │
│  Filters: client_id, category, priority, quality_score      │
└─────────────────────────────────────────────────────────────┘
```

**Index Schema** (Expected):
```typescript
{
  id: string;                  // Unique identifier
  case_number: string;         // "SCS0048417"
  description: string;         // Full case description
  short_description: string;   // Brief summary
  embedding: number[];         // Vector (1536 dimensions)
  client_id: string;           // For multi-tenant filtering
  client_name: string;
  category: string;
  priority: string;
  quality_score: number;       // Data quality metric
  created_at: string;
  resolved_at: string;
}
```

**Search Algorithm**:
1. Generate embedding for query: `OpenAI.embeddings.create({ model: "text-embedding-3-small", input: query })`
2. Vector search: `searchClient.search("*", { vectorSearchOptions: { queries: [{ kind: "vector", vector, kNearestNeighborsCount: topK, fields: ["embedding"] }] } })`
3. Apply filters: `client_id eq 'xyz'`, `category eq 'Network'`
4. Return results with similarity scores (0-1)

**Use Cases**:
1. **Intelligent Assistance** - Show similar cases when case detected
2. **KB Duplicate Detection** - Check if issue already documented (>0.85 threshold)
3. **@Mention Queries** - Provide reference cases to LLM for context

**Important**: Bot does NOT write to or manage the index. Index population is handled by upstream ingestion pipeline.

---

## AI Model Configuration

### Model Provider Setup
**File**: `lib/model-provider.ts`

```typescript
// Primary: AI Gateway (Z.ai GLM-4.6)
// Fallback: OpenAI (gpt-5-mini)

const gatewayProvider = createGateway({ apiKey: AI_GATEWAY_API_KEY });
const baseModel = gatewayProvider
  ? gatewayProvider("zai/glm-4.6")
  : openai("gpt-5-mini");

export const modelProvider = customProvider({
  languageModels: {
    "chat-model": baseModel,              // @mention responses
    "kb-generator": baseModel,            // KB article creation
    "quality-analyzer": baseModel,        // Quality assessment
    "resolution-summary": baseModel,      // Resolution summaries
    "intelligent-assistant": baseModel,   // First detection messages
    "kb-assistant": baseModel             // Interactive Q&A
  }
});
```

**Configuration**:
```bash
# Primary (Z.ai via AI Gateway)
AI_GATEWAY_API_KEY=vck_...
AI_GATEWAY_DEFAULT_MODEL=zai/glm-4.6

# Fallback (OpenAI)
OPENAI_API_KEY=sk-...
OPENAI_FALLBACK_MODEL=gpt-5-mini
```

**AI SDK v5 Features**:
- Multi-step tool calling: `stopWhen: stepCountIs(10)`
- Tool result continuation: Model generates text response after tool execution
- Reasoning extraction: GLM-4.6 provides reasoning in responses

**Model Capabilities** (`lib/model-capabilities.ts`):
- gpt-5-mini: No `temperature` parameter (reasoning model)
- GLM-4.6: Supports all standard parameters
- Automatic sanitization before API calls

---

## State Machine Lifecycle

### KB Generation State Transitions

```
Case Resolved (keyword detected)
  ↓
┌────────────────────┐
│    ASSESSING       │ ← Initial state
│  (Quality Check)   │
└─────────┬──────────┘
          │
    ┌─────┴──────────────────┬──────────────────┐
    │                        │                  │
Score ≥80              Score 50-79         Score <50
    │                        │                  │
    ▼                        ▼                  ▼
┌────────────┐      ┌─────────────────┐  ┌────────────────┐
│ GENERATING │      │   GATHERING     │  │ AWAITING_NOTES │
└─────┬──────┘      │  (Interactive)  │  └────────────────┘
      │             └────────┬────────┘
      │                      │
Duplicate?         User Response + Re-assess
      │                      │
  Yes │ No            ┌──────┴───────┬──────────┐
      │               │              │          │
      │          Score≥80      Attempt<5   Attempt≥5
      │               │              │          │
      ▼               ▼              ▼          ▼
┌────────────┐  ┌────────────┐  [Re-ask]  ┌────────────┐
│ ABANDONED  │  │ GENERATING │  [Loop]    │ ABANDONED  │
└────────────┘  └─────┬──────┘            └────────────┘
                      │
                      ▼
              ┌────────────────┐
              │ PENDING_APPROVAL│
              └────────┬────────┘
                       │
                 ┌─────┴─────┐
                 │           │
               ✅ Approve  ❌ Reject
                 │           │
                 ▼           ▼
          ┌──────────┐  ┌──────────┐
          │ APPROVED │  │ REJECTED │
          └──────────┘  └──────────┘
```

**Timeout Handling**:
- **GATHERING**: 24h timeout, checked hourly
- **PENDING_APPROVAL**: 24h timeout via in-memory cleanup

**Persistence**:
- All state transitions persisted to `kb_generation_states` table
- Survives bot restarts
- Cleanup jobs remove expired states

---

## API Endpoints

### `/api/events` (POST)
**Purpose**: Slack Events API webhook

**Event Types**:
- `app_mention` → Direct @mention responses
- `message` (channels) → Passive case monitoring
- `message` (im) → Direct message assistant
- `reaction_added` → KB approval workflow + context update approvals
- `assistant_thread_started` → Assistant mode
- `assistant_thread_context_changed` → Context updates

**Security**: Slack signature verification (`verifyRequest()`)

---

### `/api/relay` (POST)
**Purpose**: Inbound relay for upstream agents

**Authentication**: HMAC-SHA256 signature
```typescript
digest = HMAC_SHA256(secret, "v1:{timestamp}:{body}")
x-relay-signature: v1={digest}
x-relay-timestamp: {unix_seconds}
```

**Payload**:
```json
{
  "target": {
    "channel": "C12345",
    "user": "U67890",
    "thread_ts": "1728237000.000100"
  },
  "message": {
    "text": "Message from upstream agent",
    "blocks": [],
    "attachments": []
  },
  "source": "triage-agent",
  "metadata": {
    "correlationId": "case-123",
    "eventType": "triage.update"
  }
}
```

**Use Case**: Allows external systems to post to Slack without creating separate Slack apps

---

## Performance & Scalability

### Caching Strategy
- **In-Memory**: Active case contexts (Map-based)
- **Database**: Persistent storage, loaded on startup
- **TTL**: 72h for contexts, 24h for KB states

### Rate Limiting
- Slack API: 1 message/second per channel
- OpenAI Embeddings: Batched when possible
- AI Gateway: No explicit limits (Z.ai handles)

### Cost Optimization
- Quality analyzer uses efficient model (GLM-4.6 cheaper than GPT-4)
- Embeddings cached in Azure Search
- Duplicate detection prevents redundant KB generation

---

## Deployment Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Vercel Edge Function (Event Handler)                    │
│  • /api/events                                            │
│  • /api/relay                                             │
└────────────┬─────────────────────────────────────────────┘
             │
    ┌────────┼────────────┐
    │        │            │
    ▼        ▼            ▼
┌─────────┐ ┌──────────┐ ┌──────────────────┐
│  Slack  │ │ OpenAI   │ │ Azure AI Search  │
│   API   │ │   API    │ │  (Read-Only)     │
└─────────┘ └──────────┘ └──────────────────┘
    │
    ▼
┌─────────────────────┐
│ AI Gateway (Z.ai)   │
│ GLM-4.6 (200K ctx)  │
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│ Neon PostgreSQL     │
│ • Contexts          │
│ • Messages          │
│ • KB States         │
│ • Business Context  │
└─────────────────────┘
```

**Environment Variables** (see `.env.example`):
- `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`
- `AI_GATEWAY_API_KEY` (Primary model)
- `OPENAI_API_KEY` (Fallback + embeddings)
- `AZURE_SEARCH_*` (Vector search)
- `SERVICENOW_*` (Case lookups)
- `DATABASE_URL` (Persistence)
- `RELAY_WEBHOOK_SECRET` (Relay auth)

---

## Security Considerations

### Authentication
- **Slack**: Request signature verification (HMAC-SHA256)
- **Relay**: Custom HMAC signature with timestamp validation (±5min window)
- **ServiceNow**: Basic auth or API token
- **Azure Search**: API key authentication

### Data Privacy
- No PII stored in vector search (only case descriptions)
- Database encrypted at rest (Neon default)
- Conversation context purged after 72h

### Rate Limiting
- Relay timestamp window prevents replay attacks
- Slack signature prevents spoofed requests

---

## Monitoring & Observability

### Logging
- Case detection: `[Passive Monitor] Detected case SCS0048417`
- Quality assessment: `[Quality Analyzer] Score: 85 (high_quality)`
- State transitions: `[KB State] SCS0048417: ASSESSING → GENERATING`
- Errors: Structured error logs with stack traces

### Metrics (Future)
- Cases detected per day
- KB articles generated per day
- Quality score distribution
- User interaction rate (Q&A responses)
- Approval/rejection rates

---

## Extension Points

### Adding New Tools
File: `lib/generate-response.ts`

```typescript
tools: {
  myCustomTool: tool({
    description: "Description for LLM",
    inputSchema: z.object({
      param: z.string()
    }),
    execute: async ({ param }) => {
      // Tool implementation
      return { result: "..." };
    }
  })
}
```

### Custom Business Context Sources
File: `lib/services/business-context-service.ts`

Extend `fetchBusinessContext()` to load from:
- External CRM APIs
- Configuration management databases
- Custom knowledge bases

### Alternative Vector Stores
File: `lib/services/azure-search.ts`

Interface-compatible implementations for:
- Pinecone
- Weaviate
- Qdrant
- Local FAISS

---

## Future Enhancements

### Planned Features
1. **ServiceNow KB Integration**: Auto-create KB articles on approval
2. **Background Re-assessment**: Check `AWAITING_NOTES` cases after 24h
3. **Analytics Dashboard**: Case detection trends, KB generation metrics
4. **Multi-language Support**: Detect conversation language, generate KB in same language
5. **Confidence-based Auto-approval**: High confidence (>95%) articles auto-approve
6. **Case Priority Routing**: High-priority cases trigger immediate escalation

### Architecture Improvements
1. **Event Sourcing**: Full audit trail of KB workflow
2. **Webhooks**: Notify external systems on KB approval
3. **GraphQL API**: Query case contexts and KB states
4. **Real-time Updates**: WebSocket for live workflow status

---

## Troubleshooting

### Common Issues

**1. "Azure Search not configured"**
- Check `AZURE_SEARCH_ENDPOINT`, `AZURE_SEARCH_KEY`, `AZURE_SEARCH_INDEX_NAME`
- Verify index exists and has `embedding` vector field
- Test with: `scripts/test-azure-search.ts`

**2. "ServiceNow integration not configured"**
- Check `SERVICENOW_URL` or `SERVICENOW_INSTANCE_URL`
- Verify credentials: `SERVICENOW_USERNAME` + `SERVICENOW_PASSWORD`
- Test with: `set -a && source .env.local && set +a && npx tsx scripts/test-tool-calling.ts`

**3. "AI Gateway authentication failed"**
- Verify `AI_GATEWAY_API_KEY` starts with `vck_`
- Check network access to Z.ai endpoints
- Fallback to OpenAI if gateway unavailable

**4. KB generation stuck in GATHERING**
- Check `kb_generation_states` table for state
- Verify Vercel Cron is calling `/api/cron/cleanup-workflows`
- Manual cleanup: `stateMachine.cleanupExpired()`
- Tune via `KB_GATHERING_TIMEOUT_HOURS`

**5. Database connection errors**
- Verify `DATABASE_URL` format: `postgresql://user:pass@host/db?sslmode=require`
- Check Neon project status
- Test connection: `npx drizzle-kit studio`

---

## References

- [AI SDK Documentation](https://ai-sdk.dev)
- [Slack Events API](https://api.slack.com/apis/connections/events-api)
- [Azure AI Search](https://learn.microsoft.com/en-us/azure/search/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Z.ai GLM-4.6](https://z.ai/)
