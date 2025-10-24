# Testing Guide

Comprehensive testing procedures for the AI SDK Slackbot application.

## Table of Contents

- [Overview](#overview)
- [Test Environment Setup](#test-environment-setup)
- [Test Suites](#test-suites)
- [Running Tests](#running-tests)
- [Test Coverage](#test-coverage)
- [Troubleshooting](#troubleshooting)

## Overview

The testing strategy covers:

- **Unit Tests**: Individual component testing (Vitest)
- **Integration Tests**: Component interaction testing
- **End-to-End Tests**: Complete workflow validation
- **Manual Testing**: Real Slack workspace testing

### Test Case: SCS0047868

All end-to-end tests use **SCS0047868** as the primary test case number. This ensures consistency across test runs and allows validation against real ServiceNow data when configured.

## Test Environment Setup

### 1. Environment Variables

Create a `.env.local` file for testing (never commit this file):

```bash
# Core Services
SLACK_BOT_TOKEN=xoxb-test-bot-token
SLACK_SIGNING_SECRET=test-signing-secret

# AI Models
AI_GATEWAY_API_KEY=vck_your-gateway-api-key
AI_GATEWAY_DEFAULT_MODEL=zai/glm-4.6
OPENAI_API_KEY=your-openai-api-key
OPENAI_FALLBACK_MODEL=gpt-5-mini

# ServiceNow (Required for ServiceNow tests)
SERVICENOW_URL=https://your-instance.service-now.com
SERVICENOW_USERNAME=your-username
SERVICENOW_PASSWORD=your-password
# Or use token auth:
# SERVICENOW_API_TOKEN=your-api-token

# Azure Search (Required for vector similarity tests)
AZURE_SEARCH_ENDPOINT=https://your-search.search.windows.net
AZURE_SEARCH_KEY=your-search-key
AZURE_SEARCH_INDEX_NAME=case-intelligence-prod
CASE_EMBEDDING_MODEL=text-embedding-3-small

# Database (Required for persistence tests)
DATABASE_URL=postgresql://user:password@host/db?sslmode=require

# Relay Gateway
RELAY_WEBHOOK_SECRET=test-webhook-secret
```

### 2. Load Environment for Testing

**IMPORTANT**: Use the correct method to load environment variables:

```bash
# Correct method for tsx/ts-node scripts
set -a && source .env.local && set +a && npx tsx script.ts

# Alternative using environment prefix
env $(cat .env.local | xargs) npx tsx script.ts
```

**Do NOT rely on** `dotenv.config()` alone for tsx scripts - it may not work consistently.

### 3. Install Dependencies

```bash
npm install
# or
pnpm install
```

## Test Suites

### 1. Unit/Integration Tests (Vitest)

**Location**: `*.test.ts` files throughout codebase

**Run**:
```bash
npm test
# or
pnpm test
```

**Coverage**:
- Slack event handlers (`/api/events`)
- Model provider configuration
- Tool calling logic
- Context management

### 2. End-to-End Test Suites

#### E2E Test: Passive Monitoring
**File**: `scripts/tests/e2e-passive-monitoring.ts`

**Coverage**:
- Case number extraction (regex validation)
- Context creation and tracking
- Rolling 20-message window
- Resolution detection
- Multiple cases in same thread
- Context summary generation
- Database persistence

**Run**:
```bash
set -a && source .env.local && set +a && npx tsx scripts/tests/e2e-passive-monitoring.ts
```

**Expected Output**:
```
============================================================
END-TO-END TEST: PASSIVE CASE MONITORING
============================================================

[Step 1] Test case number extraction from various message formats
✅ Extract from: "Working on SCS0047868 - VPN issue"
✅ Extract from: "Cases SCS0047868 and SCS0048417 need attention"
...
Test passed: Case Number Extraction

Total:   8
Passed:  8
Failed:  0
Skipped: 0

✅ All tests passed! 🎉
```

#### E2E Test: KB Generation Workflow
**File**: `scripts/tests/e2e-kb-generation.ts`

**Coverage**:
- Resolution summary generation
- Quality assessment (all 3 paths: high/needs input/insufficient)
- KB article generation
- Interactive gathering questions
- Gathering loop with re-assessment
- Duplicate detection
- Approval workflow
- Confidence scoring
- Workflow state persistence
- Timeout handling

**Run**:
```bash
set -a && source .env.local && set +a && npx tsx scripts/tests/e2e-kb-generation.ts
```

#### E2E Test: Azure AI Search
**File**: `scripts/tests/e2e-azure-search.ts`

**Coverage**:
- Azure Search configuration validation
- Embedding generation (text-embedding-3-small, 1536 dimensions)
- Basic vector similarity search
- Filtered search (category, subcategory)
- Duplicate detection (threshold >0.85)
- Search result ranking
- Multi-vector search (problem + solution)
- Index schema validation
- Performance and limits
- Error handling (no results)
- Context-aware search

**Run**:
```bash
set -a && source .env.local && set +a && npx tsx scripts/tests/e2e-azure-search.ts
```

**Note**: Requires Azure Search configuration. Tests will skip if not configured.

#### E2E Test: ServiceNow Integration
**File**: `scripts/tests/e2e-servicenow.ts`

**Coverage**:
- Configuration validation
- Case lookup (SCS0047868)
- Journal/work notes retrieval
- Display value extraction
- Knowledge base search
- Error handling (case not found)
- Authentication methods (basic + token)
- URL fallback (SERVICENOW_URL vs SERVICENOW_INSTANCE_URL)
- Custom table configuration
- Complete case data validation

**Run**:
```bash
set -a && source .env.local && set +a && npx tsx scripts/tests/e2e-servicenow.ts
```

**Note**: Requires ServiceNow configuration. Tests will fail if not configured.

#### E2E Test: Resolution Summary Generation
**File**: `scripts/tests/e2e-resolution-summary.ts`

**Coverage**:
- Rich context summary (ServiceNow + conversation + journal)
- Minimal context summary (conversation only)
- Slack markdown formatting validation
- Conciseness validation (≤140 chars per bullet)
- Empty conversation handling
- Summary generation performance (<10s)
- Fallback behavior when API keys missing

**Run**:
```bash
set -a && source .env.local && set +a && npx tsx scripts/tests/e2e-resolution-summary.ts
```

**Expected Output**:
```
✅ Test passed: Rich Context Summary (ServiceNow + Conversation)
✅ Test passed: Minimal Context Summary (Conversation Only)
✅ Test passed: Slack Markdown Formatting
✅ Test passed: Conciseness Validation (≤140 chars)
✅ Test passed: Empty Conversation Handling
✅ Test passed: Summary Generation Performance

Total:   6
Passed:  6
Failed:  0
```

#### E2E Test: Interactive KB Assistant
**File**: `scripts/tests/e2e-interactive-assistant.ts`

**Coverage**:
- Questions for unclear problem
- Questions for missing solution steps
- Questions for missing root cause
- Question quality (open-ended vs yes/no)
- Context-aware questions (reference conversation)
- Question limit enforcement (max 5)
- High quality edge case (no questions needed)
- Question generation performance (<10s)

**Run**:
```bash
set -a && source .env.local && set +a && npx tsx scripts/tests/e2e-interactive-assistant.ts
```

**Expected Output**:
```
✅ Test passed: Questions for Unclear Problem
✅ Test passed: Questions for Missing Solution Steps
✅ Test passed: Questions for Missing Root Cause
✅ Test passed: Question Quality (Open-Ended)
✅ Test passed: Context-Aware Questions
✅ Test passed: Question Limit (Max 5)
✅ Test passed: High Quality (No Questions)
✅ Test passed: Question Generation Performance

Total:   8
Passed:  8
Failed:  0
```

#### E2E Test: Full Workflow Integration
**File**: `scripts/tests/e2e-full-workflow.ts`

**Coverage**:
- Complete workflow using SCS0047868
- Passive case detection
- ServiceNow enrichment
- Similar cases search (REAL Azure AI Search)
- Context tracking
- Resolution summary (REAL AI generation)
- Quality assessment (REAL AI scoring)
- KB generation (REAL AI article creation)
- Duplicate detection
- Approval workflow
- State persistence
- Alternative paths (needs input, insufficient)

**Run**:
```bash
set -a && source .env.local && set +a && npx tsx scripts/tests/e2e-full-workflow.ts
```

This is the **comprehensive integration test** that validates the entire system with REAL AI services.

### 3. Smoke Tests

**File**: `scripts/test-smoke.ts`

Quick validation with canned responses (no external API calls):

```bash
npm run smoke
```

## Running Tests

### Run All Tests

```bash
# Unit/integration tests
npm test

# All end-to-end tests
set -a && source .env.local && set +a && \
  npx tsx scripts/tests/e2e-passive-monitoring.ts && \
  npx tsx scripts/tests/e2e-kb-generation.ts && \
  npx tsx scripts/tests/e2e-azure-search.ts && \
  npx tsx scripts/tests/e2e-servicenow.ts && \
  npx tsx scripts/tests/e2e-resolution-summary.ts && \
  npx tsx scripts/tests/e2e-interactive-assistant.ts && \
  npx tsx scripts/tests/e2e-full-workflow.ts
```

### Run Individual Test Suites

```bash
# Passive monitoring only
set -a && source .env.local && set +a && npx tsx scripts/tests/e2e-passive-monitoring.ts

# KB generation only
set -a && source .env.local && set +a && npx tsx scripts/tests/e2e-kb-generation.ts

# Azure Search only
set -a && source .env.local && set +a && npx tsx scripts/tests/e2e-azure-search.ts

# ServiceNow only
set -a && source .env.local && set +a && npx tsx scripts/tests/e2e-servicenow.ts

# Resolution summary generation
set -a && source .env.local && set +a && npx tsx scripts/tests/e2e-resolution-summary.ts

# Interactive KB assistant
set -a && source .env.local && set +a && npx tsx scripts/tests/e2e-interactive-assistant.ts

# Full workflow
set -a && source .env.local && set +a && npx tsx scripts/tests/e2e-full-workflow.ts
```

### Create Test Runner Script

For convenience, create `scripts/run-all-tests.sh`:

```bash
#!/bin/bash

echo "Loading environment..."
set -a
source .env.local
set +a

echo "Running passive monitoring tests..."
npx tsx scripts/tests/e2e-passive-monitoring.ts || exit 1

echo "Running KB generation tests..."
npx tsx scripts/tests/e2e-kb-generation.ts || exit 1

echo "Running Azure Search tests..."
npx tsx scripts/tests/e2e-azure-search.ts || exit 1

echo "Running ServiceNow tests..."
npx tsx scripts/tests/e2e-servicenow.ts || exit 1

echo "Running resolution summary tests..."
npx tsx scripts/tests/e2e-resolution-summary.ts || exit 1

echo "Running interactive assistant tests..."
npx tsx scripts/tests/e2e-interactive-assistant.ts || exit 1

echo "Running full workflow tests..."
npx tsx scripts/tests/e2e-full-workflow.ts || exit 1

echo "All tests passed! 🎉"
```

Make it executable:
```bash
chmod +x scripts/run-all-tests.sh
./scripts/run-all-tests.sh
```

## Test Coverage

### What's Tested

#### ✅ Core Functionality
- Slack event handling (mentions, DMs, messages)
- AI model selection (Gateway → OpenAI fallback)
- Tool calling (weather, web search, ServiceNow, Azure Search)
- Context management (rolling window, persistence)

#### ✅ Passive Monitoring
- Case number detection (regex: `/\b[A-Z]{3}\d{7}\b/g`)
- Context tracking per case/thread
- Resolution keyword detection
- Multiple cases in same thread

#### ✅ Multi-Stage KB Generation
- **Stage 1**: Resolution summary (AI-powered)
- **Stage 2**: Quality assessment (0-100 score, 3 paths)
- **Stage 3a**: High quality path (≥80) - KB generation
- **Stage 3b**: Needs input path (50-79) - Interactive Q&A
- **Stage 3c**: Insufficient path (<50) - Request case notes

#### ✅ Vector Search
- Embedding generation (text-embedding-3-small)
- kNN similarity search
- Duplicate detection (threshold >0.85)
- Filtered and context-aware search

#### ✅ ServiceNow Integration
- Case/incident lookup
- Journal entry retrieval
- Knowledge base search
- Display value extraction
- Auth methods (basic + token)

#### ✅ Workflow State Management
- PostgreSQL persistence
- State transitions (ASSESSING → GATHERING → GENERATING → PENDING_APPROVAL → APPROVED/REJECTED)
- Timeout handling (24h for Q&A)
- Cleanup jobs

### What's NOT Tested (Manual Validation Required)

#### ⚠️ Real Slack Interactions
- Actual Slack message posting
- Reaction handling (✅/❌)
- Thread creation
- Channel permissions

#### ⚠️ Real AI Model Responses
- GLM-4.6 model outputs
- Tool calling decisions
- Quality assessment scoring
- KB generation quality

#### ⚠️ Production Deployments
- Azure Container Apps deployment
- Production database migrations
- Production API keys and secrets

## Troubleshooting

### Common Issues

#### 1. Environment Variables Not Loading

**Problem**: Tests fail with "not configured" errors despite having .env.local

**Solution**:
```bash
# Use correct loading method
set -a && source .env.local && set +a && npx tsx script.ts

# Verify variables are loaded
set -a && source .env.local && set +a && env | grep SERVICENOW
```

#### 2. ServiceNow Tests Failing

**Problem**: "ServiceNow not configured" or 401 errors

**Solution**:
- Verify URL: Use `SERVICENOW_URL` or `SERVICENOW_INSTANCE_URL`
- Check auth: Ensure username/password OR api_token is set
- Test connection:
  ```bash
  curl -u "username:password" "https://your-instance.service-now.com/api/now/table/sn_customerservice_case?sysparm_limit=1"
  ```

#### 3. Azure Search Tests Skipping

**Problem**: All Azure Search tests show "Skipped - Azure Search not configured"

**Solution**:
- Verify all 4 required variables:
  ```bash
  echo $AZURE_SEARCH_ENDPOINT
  echo $AZURE_SEARCH_KEY
  echo $AZURE_SEARCH_INDEX_NAME
  echo $OPENAI_API_KEY
  ```

#### 4. AI Gateway Empty Responses

**Problem**: Model returns empty text with finishReason: "tool-calls"

**Solution**:
- Verify AI SDK version: `npm list ai` should show 5.0.26
- Check `stopWhen: stepCountIs(10)` is used (not `maxSteps: 10`)
- Ensure no hardcoded `baseURL` in Gateway provider

#### 5. TypeScript Build Hangs

**Problem**: `pnpm run build` never completes

**Solution**:
- Use `tsx` directly for testing (build not required for runtime)
- Check for circular imports
- Run with timeout: `timeout 30 npx tsc --noEmit`

### Debug Mode

Enable verbose logging:

```bash
# Add to .env.local
DEBUG=true
LOG_LEVEL=debug

# Then run tests
set -a && source .env.local && set +a && npx tsx scripts/tests/e2e-full-workflow.ts
```

### Test Data Cleanup

Reset test data between runs:

```bash
# Clear test contexts (if using in-memory storage)
# Restart the process

# Clear database test data (if using PostgreSQL)
psql $DATABASE_URL -c "DELETE FROM kb_workflow WHERE case_number LIKE 'SCS%TEST%';"
```

## Manual Testing Checklist

Before deploying to production:

### 1. Slack Integration
- [ ] Bot responds to @mentions
- [ ] Bot responds to DMs
- [ ] Threaded conversations work
- [ ] Reactions trigger actions (✅/❌)

### 2. Passive Monitoring
- [ ] Case numbers detected in channels
- [ ] Intelligent assistant posts threaded reply
- [ ] Similar cases shown
- [ ] Resolution detected

### 3. KB Generation
- [ ] Resolution summary posted
- [ ] Quality assessment runs
- [ ] High quality → KB generated
- [ ] Needs input → Questions asked
- [ ] Insufficient → Case notes requested
- [ ] Approval reactions work

### 4. External Services
- [ ] ServiceNow case lookup works
- [ ] Azure Search finds similar cases
- [ ] AI Gateway responds (GLM-4.6)
- [ ] OpenAI fallback works

### 5. Database
- [ ] Workflow states persist
- [ ] Bot restart doesn't lose data
- [ ] Cleanup jobs run

## CI/CD Integration

Add to GitHub Actions (`.github/workflows/test.yml`):

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Run unit tests
        run: npm test

      - name: Run smoke tests
        run: npm run smoke

      # E2E tests require secrets - only run on main branch
      - name: Run E2E tests
        if: github.ref == 'refs/heads/main'
        env:
          SERVICENOW_URL: ${{ secrets.SERVICENOW_URL }}
          SERVICENOW_USERNAME: ${{ secrets.SERVICENOW_USERNAME }}
          SERVICENOW_PASSWORD: ${{ secrets.SERVICENOW_PASSWORD }}
          AZURE_SEARCH_ENDPOINT: ${{ secrets.AZURE_SEARCH_ENDPOINT }}
          AZURE_SEARCH_KEY: ${{ secrets.AZURE_SEARCH_KEY }}
          AZURE_SEARCH_INDEX_NAME: ${{ secrets.AZURE_SEARCH_INDEX_NAME }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          npx tsx scripts/tests/e2e-passive-monitoring.ts
          npx tsx scripts/tests/e2e-kb-generation.ts
          npx tsx scripts/tests/e2e-full-workflow.ts
```

## Test Metrics

Track test execution:

```bash
# Run with timing
time npx tsx scripts/tests/e2e-full-workflow.ts

# Expected timings:
# - Passive monitoring: ~5-10s
# - KB generation: ~10-15s
# - Azure Search: ~5-10s
# - ServiceNow: ~5-10s
# - Full workflow: ~20-30s
```

## Contributing Tests

When adding new features:

1. **Add unit tests** for new functions
2. **Update e2e tests** to cover new workflow paths
3. **Update this TESTING.md** with new test procedures
4. **Ensure all tests pass** before submitting PR

### Test Writing Guidelines

- Use descriptive test names: `testCaseNumberExtraction()`
- Use assertion helpers: `assertEqual()`, `assertDefined()`, `assertMinLength()`
- Print progress: `printStep()`, `printSuccess()`, `printError()`
- Handle optional config: Skip tests when services not configured
- Mock external services when possible
- Use SCS0047868 for consistency

## Support

If tests are failing:

1. Check [Troubleshooting](#troubleshooting) section
2. Verify environment variables are loaded correctly
3. Review test output for specific error messages
4. Check [ARCHITECTURE.md](./ARCHITECTURE.md) for system overview
5. Open an issue at: https://github.com/nicoalbanese/ai-sdk-slackbot/issues
