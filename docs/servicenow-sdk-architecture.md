# ServiceNow SDK Architecture

## Overview

We've built a **reusable, production-grade ServiceNow SDK** following best practices and the repository pattern. This SDK provides a clean abstraction over the ServiceNow Table API with built-in retry logic, error handling, and pagination.

## Architecture Layers

```
┌─────────────────────────────────────────────────────┐
│                   Application Layer                  │
│         (Scripts, API Endpoints, Services)           │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│                Repository Layer                      │
│          (ChangeRepository, IncidentRepository)      │
│         High-level domain-specific operations        │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│              ServiceNow Table API Client             │
│    Generic CRUD operations, pagination, queries     │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│             ServiceNow HTTP Client                   │
│   Low-level HTTP, auth, retry, error handling       │
└─────────────────────────────────────────────────────┘
```

## Components

### 1. ServiceNow HTTP Client
**Location:** `lib/infrastructure/servicenow/client/http-client.ts`

**Features:**
- Basic & Bearer token authentication
- Automatic retry with exponential backoff
- Configurable timeouts
- Comprehensive error handling
- Request/response logging

**Usage:**
```typescript
const httpClient = new ServiceNowHttpClient({
  instanceUrl: 'https://instance.service-now.com',
  username: 'user',
  password: 'pass',
  defaultTimeout: 30000,
  maxRetries: 3,
});

// Make requests
const response = await httpClient.get('/api/now/table/change_request', {
  sysparm_limit: 10
});
```

### 2. ServiceNow Table API Client
**Location:** `lib/infrastructure/servicenow/client/table-api-client.ts`

**Features:**
- Generic CRUD operations for any table
- Automatic pagination handling
- Query builder utilities
- Type-safe with generics
- Progress callbacks

**Key Methods:**
- `fetchAll<T>(table, options)` - Fetch all records with pagination
- `fetchById<T>(table, sysId)` - Get single record
- `create<T>(table, data)` - Create record
- `update<T>(table, sysId, data)` - Update (PUT)
- `patch<T>(table, sysId, data)` - Partial update (PATCH)
- `delete(table, sysId)` - Delete record

**Usage:**
```typescript
const tableClient = new ServiceNowTableAPIClient(httpClient);

// Fetch all with pagination
const incidents = await tableClient.fetchAll('incident', {
  sysparm_query: 'state=1',
  maxRecords: 1000,
  pageSize: 100,
  onProgress: (fetched, total) => {
    console.log(`Fetched ${fetched}/${total}`);
  },
});

// Query builder
const query = ServiceNowTableAPIClient.buildQuery({
  state: 'Closed',
  priority: { operator: 'IN', values: ['1', '2'] },
});
```

### 3. Change Repository
**Location:** `lib/infrastructure/servicenow/repositories/change-repository.impl.ts`

**Features:**
- High-level operations for Change Requests
- Fetches related records (state transitions, CIs, work notes)
- Domain-specific methods
- Type-safe interfaces

**Key Methods:**
- `fetchChanges(query, options)` - Fetch changes with query
- `fetchChangeById(sysId)` - Get single change
- `fetchChangeByNumber(changeNumber)` - Get by CHG number
- `fetchStateTransitions(changeSysId)` - Get change tasks
- `fetchComponentReferences(changeSysId)` - Get linked CIs
- `fetchWorkNotes(changeSysId)` - Get work notes
- `fetchComments(changeSysId)` - Get comments
- `fetchAttachments(changeSysId)` - Get attachments
- `fetchCompleteChange(changeSysId)` - Get all related data
- `fetchStandardChanges(pattern, options)` - Get standard changes
- `createChange(data)` - Create new change
- `updateChange(sysId, data)` - Update change
- `addWorkNote(changeSysId, note)` - Add work note

**Usage:**
```typescript
const changeRepo = new ChangeRepository(tableClient);

// Fetch standard changes
const standardChanges = await changeRepo.fetchStandardChanges(
  'Standard Change for ServiceNow Platform Updates',
  { maxRecords: 100 }
);

// Get complete change with all related data
const complete = await changeRepo.fetchCompleteChange(sysId);
```

## Example: Extract Standard Changes (Refactored)

**Location:** `scripts/extract-standard-changes-refactored.ts`

**Before (manual implementation):**
```typescript
// Manual auth, pagination, error handling
async function fetchAllRecords<T>(baseUrl, authHeader, table, query, limit = 1000) {
  const allRecords: T[] = [];
  let offset = 0;
  let hasMore = true;
  // ... 50 lines of pagination logic
}
```

**After (using SDK):**
```typescript
const changeRepo = new ChangeRepository(tableClient);

// One line - handles pagination, retries, errors automatically
const changes = await changeRepo.fetchStandardChanges(shortDescription, {
  maxRecords: 100,
  onProgress: (fetched) => console.log(`Fetched ${fetched}...`),
});
```

**Benefits:**
- **90% less code** in application layer
- **Centralized** retry and error handling
- **Reusable** across all scripts and services
- **Type-safe** with TypeScript interfaces
- **Testable** with dependency injection

## Adding New Repositories

To add a new table/domain (e.g., Incidents, Problems):

1. **Create Repository Interface:**
```typescript
// lib/infrastructure/servicenow/repositories/incident-repository.interface.ts
export interface IncidentRepository {
  fetchIncidents(query?: string): Promise<Incident[]>;
  fetchIncidentById(sysId: string): Promise<Incident | null>;
  createIncident(data: Partial<Incident>): Promise<Incident>;
  // ... other domain-specific methods
}
```

2. **Create Repository Implementation:**
```typescript
// lib/infrastructure/servicenow/repositories/incident-repository.impl.ts
export class IncidentRepositoryImpl implements IncidentRepository {
  constructor(private readonly tableClient: ServiceNowTableAPIClient) {}

  async fetchIncidents(query?: string): Promise<Incident[]> {
    return this.tableClient.fetchAll('incident', {
      sysparm_query: query,
      sysparm_display_value: 'all',
    });
  }

  // ... implement other methods
}
```

3. **Use in Application:**
```typescript
const incidentRepo = new IncidentRepositoryImpl(tableClient);
const incidents = await incidentRepo.fetchIncidents('state=1');
```

## Configuration

Set environment variables in `.env.local`:

```bash
SERVICENOW_URL=https://instance.service-now.com
SERVICENOW_USERNAME=api_user
SERVICENOW_PASSWORD=api_password
```

## Testing Strategy

1. **Unit Tests:** Mock `ServiceNowHttpClient` to test repositories
2. **Integration Tests:** Test against ServiceNow dev instance
3. **E2E Tests:** Test complete workflows

## Next Steps

### Immediate
- [x] Create `ServiceNowTableAPIClient` with pagination
- [x] Create `ChangeRepository` with domain methods
- [x] Refactor extraction script to use new SDK
- [ ] Update package.json to use refactored script
- [ ] Add unit tests for Table API Client
- [ ] Add integration tests for Change Repository

### Future Enhancements
- [ ] Create `IncidentRepository`
- [ ] Create `ProblemRepository`
- [ ] Create `CMDBRepository` extensions
- [ ] Add batch operations support
- [ ] Add attachment download/upload
- [ ] Add query builder DSL
- [ ] Create CLI tool for data extraction
- [ ] Add support for ServiceNow Import Sets API
- [ ] Add support for Aggregate API

## Benefits Summary

✅ **Reusability:** One SDK for all ServiceNow operations
✅ **Maintainability:** Centralized logic, easier to update
✅ **Reliability:** Built-in retry, error handling, timeouts
✅ **Type Safety:** TypeScript interfaces for all operations
✅ **Testability:** Easy to mock and test
✅ **Performance:** Automatic pagination, parallel fetching
✅ **Scalability:** Add new repositories without duplicating code

## File Structure

```
lib/infrastructure/servicenow/
├── client/
│   ├── http-client.ts           # Low-level HTTP operations
│   ├── table-api-client.ts      # Table API wrapper
│   └── index.ts
├── repositories/
│   ├── change-repository.impl.ts         # Change Request operations
│   ├── incident-repository.impl.ts       # Incident operations (existing)
│   ├── case-repository.impl.ts           # Case operations (existing)
│   ├── catalog-repository.impl.ts        # Catalog operations (existing)
│   └── ... (other repositories)
├── types/
│   ├── api-responses.ts         # API response types
│   ├── domain-models.ts         # Domain model types
│   └── index.ts
└── errors/
    └── ... (error classes)

scripts/
├── extract-standard-changes.ts           # Original (deprecated)
└── extract-standard-changes-refactored.ts # New reusable version
```

---

**Built with best practices for enterprise-grade ServiceNow integrations.**
