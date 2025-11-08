# Testing Feedback Collection Feature

This guide explains how to test the feedback collection feature that allows users to submit feature requests which are converted into BRDs and GitHub issues.

## Overview

The feedback collection feature consists of three main components:
1. **BRD Generator** - Uses Claude to generate structured Business Requirements Documents
2. **GitHub Issue Service** - Creates GitHub issues from BRDs
3. **Feedback Collection Tool** - Integrates both services for end-to-end flow

## Testing Approaches

### 1. Unit Tests (Automated)

Run the comprehensive unit test suite:

```bash
# Run all feedback collection tests
pnpm test tests/services/brd-generator.test.ts \
           tests/services/github-issue-service.test.ts \
           tests/agent/tools/feedback-collection.test.ts

# Run with coverage
pnpm test --coverage

# Watch mode for development
pnpm test --watch
```

**Coverage:**
- 32 test cases across 3 test files
- Tests security, validation, error handling, and integration
- All tests use mocks - no real API calls

### 2. Integration Testing (Simulation)

Use the simulation script to test the actual integration:

#### Mock Mode (No API Calls)
```bash
npx tsx scripts/test-feedback-collection.ts --mock
```

Benefits:
- ✅ No API keys required
- ✅ Fast execution
- ✅ Validates code paths
- ✅ Safe for CI/CD

#### Real API Mode
```bash
# Set environment variables
export ANTHROPIC_API_KEY="your-anthropic-api-key"
export GITHUB_APP_ID="your-github-app-id"
export GITHUB_APP_PRIVATE_KEY="your-github-private-key"
export GITHUB_INSTALLATION_ID="your-installation-id"

# Run with real APIs
npx tsx scripts/test-feedback-collection.ts --real
```

Benefits:
- ✅ Tests actual API integration
- ✅ Validates API keys and configuration
- ✅ Creates real GitHub issues (in test repo)
- ⚠️ Uses API quota

#### Test Individual Components
```bash
# Test BRD generation only
npx tsx scripts/test-feedback-collection.ts --test-brd --real

# Test GitHub issue creation only
npx tsx scripts/test-feedback-collection.ts --test-github --real
```

### 3. Manual Testing in Slack

To test the feature in a live Slack environment:

1. **Deploy the bot** to your Slack workspace
2. **Start a conversation** with the bot
3. **Trigger feedback collection** by discussing a missing feature
4. **Verify the bot** creates a GitHub issue with a BRD

Example conversation:
```
User: I need better search functionality
Bot: What specific search capabilities do you need?
User: I want to filter by status and date ranges
Bot: [Bot should offer to create a feature request]
```

### 4. End-to-End Testing

Complete workflow test:

```bash
# 1. Run unit tests
pnpm test tests/services/brd-generator.test.ts \
           tests/services/github-issue-service.test.ts \
           tests/agent/tools/feedback-collection.test.ts

# 2. Run integration test in mock mode
npx tsx scripts/test-feedback-collection.ts --mock

# 3. Run integration test with real APIs (if configured)
npx tsx scripts/test-feedback-collection.ts --real

# 4. Deploy and test in Slack (manual)
```

## Test Data

The simulation script uses this test scenario:

**Feature Request:**
- **Description:** Advanced search functionality with filters and date ranges
- **Use Case:** Support agents need to quickly find specific cases
- **Current Limitation:** Current search only supports basic text search

**Expected Output:**
- Structured BRD with title, problem statement, user story, acceptance criteria
- GitHub issue created with formatted BRD content
- Issue URL returned for tracking

## Troubleshooting

### Tests Failing

**Mock tests failing:**
```bash
# Check syntax errors
pnpm build:api

# Run tests with verbose output
pnpm test -- --reporter=verbose
```

**Integration tests failing:**
```bash
# Verify API keys
echo $ANTHROPIC_API_KEY
echo $GITHUB_APP_ID

# Test individual components
npx tsx scripts/test-feedback-collection.ts --test-brd --real
```

### Common Issues

| Error | Solution |
|-------|----------|
| `Anthropic API key not configured` | Set `ANTHROPIC_API_KEY` environment variable |
| `GitHub App is not configured` | Set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_INSTALLATION_ID` |
| `Invalid GitHub repository format` | Check `GITHUB_FEEDBACK_REPO` is in `owner/repo` format |
| `Feature description exceeds maximum length` | Input fields limited to 1000 characters |
| `contains suspicious content` | Input failed prompt injection detection |

## Security Testing

The BRD generator includes security validations:

```bash
# Test prompt injection detection
npm test -- tests/services/brd-generator.test.ts -t "Prompt Injection"

# Test input sanitization
npm test -- tests/services/brd-generator.test.ts -t "Input Sanitization"
```

**Tested attack vectors:**
- Prompt injection patterns (5+ variations)
- Excessive input lengths (1000+ char limit)
- Malformed inputs (empty, whitespace-only)

## Performance Testing

Expected performance:
- BRD Generation: 2-5 seconds (Claude API)
- GitHub Issue Creation: 1-2 seconds (GitHub API)
- Total end-to-end: 3-7 seconds

## CI/CD Integration

Add to your CI pipeline:

```yaml
# .github/workflows/test.yml
- name: Run Feedback Collection Tests
  run: |
    pnpm test tests/services/brd-generator.test.ts \
              tests/services/github-issue-service.test.ts \
              tests/agent/tools/feedback-collection.test.ts

- name: Run Integration Test (Mock)
  run: npx tsx scripts/test-feedback-collection.ts --mock
```

## Coverage Goals

✅ **Achieved:**
- 32 test cases passing
- Services: 100% of critical paths
- Integration: End-to-end flow validated
- Security: All validation rules tested
- Error handling: All error paths tested

## Next Steps

1. ✅ Unit tests implemented (Phase 1 & 2)
2. ✅ Integration test script created
3. ⏳ Run in staging environment
4. ⏳ Deploy to production
5. ⏳ Monitor real usage metrics

## Related Documentation

- [BRD Generator Service](../lib/services/brd-generator.ts)
- [GitHub Issue Service](../lib/services/github-issue-service.ts)
- [Feedback Collection Tool](../lib/agent/tools/feedback-collection.ts)
- [Test Implementation](../tests/agent/tools/feedback-collection.test.ts)
