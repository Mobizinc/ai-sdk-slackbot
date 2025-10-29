# Integration Tests

Integration tests that connect to real external services to validate the full stack.

## ServiceNow Integration Tests

### Setup

Set these environment variables before running:

```bash
# Required: ServiceNow instance
export SERVICENOW_INSTANCE_URL="https://your-dev-instance.service-now.com"

# Authentication (choose one):
# Option 1: Basic Auth
export SERVICENOW_USERNAME="your_username"
export SERVICENOW_PASSWORD="your_password"

# Option 2: Bearer Token
export SERVICENOW_API_TOKEN="your_api_token"

# Optional: Test with specific cases
export TEST_CASE_NUMBER="CS0001234"  # A real case number in your dev instance
export TEST_CASE_SYS_ID="abc123..."   # A real case sys_id
```

### Running Tests

```bash
# Run all integration tests
npm test -- tests/integration/

# Run only CaseRepository integration tests
npm test -- tests/integration/case-repository.integration.test.ts

# Run with verbose output
npm test -- tests/integration/ --reporter=verbose
```

### What Gets Tested

1. **Authentication & Connection**
   - Validates Basic and Bearer token auth
   - Verifies connection to ServiceNow

2. **CaseRepository Methods**
   - `findBySysId()` - Find by sys_id
   - `findByNumber()` - Find by case number
   - `search()` - Search with criteria

3. **Response Mapping**
   - Verifies ServiceNow API responses are correctly mapped to domain models
   - Ensures clean TypeScript types (no `{value, display_value}` leakage)

4. **Error Handling**
   - Tests handling of non-existent records
   - Validates timeout configuration

5. **Full Stack Integration**
   - End-to-end test: search → findById → findByNumber
   - Validates entire stack: HttpClient → Repository → Mappers

### Skipped Tests

If ServiceNow credentials are not configured, all tests will be skipped with a warning:

```
⚠️  Skipping integration tests: ServiceNow credentials not configured.
```

This is expected behavior in CI/CD or local development without credentials.

### Troubleshooting

**"ServiceNow credentials not configured"**
- Set `SERVICENOW_INSTANCE_URL` and auth credentials

**"Test timed out"**
- Check network connectivity to ServiceNow instance
- Verify instance URL is correct
- Default timeout is 30 seconds, may need adjustment for slow networks

**"Authentication failed"**
- Verify credentials are correct
- Check if account has API access permissions
- Try testing credentials with curl first
