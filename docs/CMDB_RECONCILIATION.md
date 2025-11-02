# CMDB Reconciliation Feature

## Overview

The CMDB Reconciliation feature automatically links Configuration Items (CIs) from ServiceNow to cases and creates child tasks for missing CIs. This closes the loop between entity extraction and CMDB data governance, turning discovered technical entities into actionable insights.

## Refactoring Summary (2025)

### Problem Solved
The original implementation was a monolithic 506-line "god module" that mixed multiple concerns:
- Entity resolution logic
- CMDB processing logic  
- ServiceNow API integration
- Database operations
- Notification handling

### Solution Implemented
Refactored into a clean, modular architecture with clear separation of concerns:

**Before**: Single 506-line file with mixed responsibilities
**After**: 5 focused modules totaling ~400 lines with clear boundaries

### Key Achievements
- ✅ **Zero Breaking Changes**: All existing imports and APIs work unchanged
- ✅ **90% Code Reuse**: Leveraged existing infrastructure (repositories, clients, services)
- ✅ **Comprehensive Testing**: Added unit tests for all new modules
- ✅ **Clean Architecture**: Each module has a single, well-defined responsibility
- ✅ **Maintainability**: Significantly easier to understand, test, and extend

### Files Changed
```
lib/services/cmdb-reconciliation.ts           # Replaced with thin facade
lib/services/cmdb-reconciliation-original.ts   # Backup of original
lib/services/cmdb/                            # New modular structure
├── types.ts                                  # Shared types and constants
├── entity-resolution-service.ts             # Alias resolution wrapper
├── cmdb-match-processor.ts                  # Pure match processing logic
└── reconciliation-orchestrator.ts           # Main workflow coordination

tests/cmdb/                                   # New comprehensive test suite
├── entity-resolution-service.test.ts
├── cmdb-match-processor.test.ts
└── reconciliation-orchestrator.test.ts
```

## Architecture

### Modular Design (Post-Refactor)

The CMDB Reconciliation service has been refactored from a monolithic 506-line module into a clean, modular architecture following separation of concerns principles.

#### Core Components

1. **ReconciliationOrchestrator** (`lib/services/cmdb/reconciliation-orchestrator.ts`)
   - Main workflow coordination service
   - Orchestrates all other services in the reconciliation process
   - Handles the complete reconciliation workflow from entity resolution to task creation

2. **EntityResolutionService** (`lib/services/cmdb/entity-resolution-service.ts`)
   - Thin wrapper around `BusinessContextService` for alias resolution
   - Resolves entity aliases to canonical CI names
   - Filters out non-CI-worthy entities

3. **CmdbMatchProcessor** (`lib/services/cmdb/cmdb-match-processor.ts`)
   - Pure business logic for processing CMDB search results
   - Implements confidence scoring and match validation
   - No side effects - pure processing logic

4. **Types Module** (`lib/services/cmdb/types.ts`)
   - Centralized type definitions and interfaces
   - Shared constants and enums
   - Ensures type safety across all modules

5. **CmdbReconciliationService** (`lib/services/cmdb-reconciliation.ts`)
   - Thin facade maintaining backward compatibility
   - Delegates to `ReconciliationOrchestrator` for actual work
   - Preserves existing public API for zero breaking changes

#### Existing Infrastructure (Reused)

6. **CmdbReconciliationRepository** (`lib/db/repositories/cmdb-reconciliation-repository.ts`)
   - Database layer for reconciliation results (unchanged)
   - Tracks all reconciliation attempts and outcomes

7. **Database Schema** (`lib/db/schema.ts`)
   - `cmdb_reconciliation_results` table stores reconciliation history (unchanged)

8. **Integration Points**
   - Integrated into `CaseTriageService` workflow (unchanged)
   - Uses existing `ServiceNowClient` for CMDB operations (unchanged)
   - Leverages `BusinessContextService` for alias resolution (unchanged)

### Architecture Benefits

- **Separation of Concerns**: Each module has a single, well-defined responsibility
- **Testability**: Pure functions and dependency injection enable comprehensive unit testing
- **Maintainability**: Modular structure makes code easier to understand and modify
- **Reusability**: Individual components can be reused in other contexts
- **Backward Compatibility**: Zero breaking changes for existing consumers
- **Extensibility**: Easy to add new features or modify existing behavior

## Workflow

### 1. Entity Extraction (Existing)
- Case triage extracts technical entities (IPs, systems, software)
- Entities are stored for analytics and display

### 2. Entity Resolution (New)
- Extracted entities are checked against BusinessContext aliases
- Aliases like "L drive" are resolved to canonical CI names
- Unresolved aliases are skipped to avoid low-quality requests

### 3. CMDB Lookup (New)
- Resolved entities are searched in ServiceNow CMDB
- Supports search by name, IP address, or sys_id

### 4. Action Processing (New)
- **Match Found**: CI is automatically linked to the case via work note
- **No Match**: Child task is created for CMDB team
- **Multiple Matches**: Marked as ambiguous for manual review

## Configuration

### Environment Variables

```bash
# Enable/disable CMDB reconciliation
CMDB_RECONCILIATION_ENABLED=false

# Confidence threshold for matches
CMDB_RECONCILIATION_CONFIDENCE_THRESHOLD=0.7

# Cache reconciliation results
CMDB_RECONCILIATION_CACHE_RESULTS=true

# Assignment group for child tasks
CMDB_RECONCILIATION_ASSIGNMENT_GROUP="CMDB Administrators"

# Slack channel for notifications
CMDB_RECONCILIATION_SLACK_CHANNEL="cmdb-alerts"
```

### Config Object (`lib/config.ts`)

```typescript
cmdbReconciliationEnabled: getBooleanEnv("CMDB_RECONCILIATION_ENABLED", false),
cmdbReconciliationConfidenceThreshold: getNumberEnv("CMDB_RECONCILIATION_CONFIDENCE_THRESHOLD", 0.7),
cmdbReconciliationCacheResults: getBooleanEnv("CMDB_RECONCILIATION_CACHE_RESULTS", true),
cmdbReconciliationAssignmentGroup: process.env.CMDB_RECONCILIATION_ASSIGNMENT_GROUP || "CMDB Administrators",
cmdbReconciliationSlackChannel: process.env.CMDB_RECONCILIATION_SLACK_CHANNEL || "cmdb-alerts",
```

## Database Schema

### cmdb_reconciliation_results Table

| Column | Type | Description |
|--------|------|-------------|
| id | serial | Primary key |
| case_number | text | ServiceNow case number |
| case_sys_id | text | ServiceNow case sys_id |
| entity_value | text | Original entity value |
| entity_type | text | Entity type (IP_ADDRESS, SYSTEM, etc.) |
| original_entity_value | text | Entity before alias resolution |
| resolved_entity_value | text | Entity after alias resolution |
| reconciliation_status | text | Status (matched, unmatched, ambiguous, skipped) |
| cmdb_sys_id | text | Matched CI sys_id |
| cmdb_name | text | Matched CI name |
| cmdb_class | text | Matched CI class |
| cmdb_url | text | Direct URL to CI |
| confidence | real | Match confidence score |
| business_context_match | text | Matching business context name |
| child_task_number | text | Created child task number |
| child_task_sys_id | text | Created child task sys_id |
| error_message | text | Error details if any |
| metadata | jsonb | Additional metadata |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Record update time |

## Business Context Integration

### Alias Resolution

Business Context entries can define aliases for entities:

```json
{
  "entityName": "Legal File Server",
  "aliases": ["L drive", "L:", "\\fileserver01\\legal-docs"],
  "cmdbIdentifiers": [{
    "ciName": "\\fileserver01\\legal-docs",
    "sysId": "ci_sys_id_123",
    "ipAddresses": ["192.168.1.100"]
  }]
}
```

When a case mentions "L drive", the system:
1. Finds the matching Business Context
2. Resolves to the canonical CI name
3. Searches CMDB using the resolved name
4. Links the CI or creates task as appropriate

## ServiceNow Integration

### CI Linking

When a CI match is found, a work note is added to the case:

```
CMDB Reconciliation: Linked Configuration Item "\\fileserver01\legal-docs" (cmdb_ci_server) to this case.
CI Details: https://instance.service-now.com/nav_to.do?uri=cmdb_ci.do?sys_id=ci_sys_id_123
IP Addresses: 192.168.1.100
Owner Group: Infrastructure Team
```

### Child Task Creation

When no CI match is found, a child task is created with:
- Assignment group: `CMDB_RECONCILIATION_ASSIGNMENT_GROUP`
- Description including entity details and parent case
- Link back to parent case

### Slack Notifications

Optional Slack notifications are sent to `CMDB_RECONCILIATION_SLACK_CHANNEL`:

```
🔍 CMDB Alert: Missing Configuration Item

A case has referenced a configuration item that doesn't exist in the CMDB.

Case: CASE001234
Child Task: TASK1734567890
Entity: L drive
Resolved Entity: \\fileserver01\legal-docs

A child task has been created and assigned to CMDB Administrators to investigate and create the appropriate CI.
```

## API Usage

### Direct Service Usage

```typescript
import { getCmdbReconciliationService } from './lib/services/cmdb-reconciliation';

const service = getCmdbReconciliationService();

const result = await service.reconcileEntities({
  caseNumber: "CASE001234",
  caseSysId: "sys_id_123",
  entities: {
    ip_addresses: ["192.168.1.1"],
    systems: ["server01"],
    users: ["user1"],
    software: ["software1"],
    error_codes: ["ERR001"]
  }
});

console.log(`Processed ${result.totalEntities} entities:`);
console.log(`- Matched: ${result.matched}`);
console.log(`- Unmatched: ${result.unmatched}`);
console.log(`- Skipped: ${result.skipped}`);
console.log(`- Ambiguous: ${result.ambiguous}`);
```

### Getting Statistics

```typescript
// Get case-specific statistics
const stats = await service.getCaseStatistics("CASE001234");

// Get recent reconciliation results
const recent = await service.getRecentResults(50);

// Get unmatched entities needing CI creation
const unmatched = await service.getUnmatchedEntities(20);
```

## Testing

### Unit Tests

Comprehensive test suite covers all modular components:
- Entity alias resolution (`EntityResolutionService`)
- CMDB matching logic (`CmdbMatchProcessor`)
- Workflow orchestration (`ReconciliationOrchestrator`)
- Integration and facade (`CmdbReconciliationService`)
- Child task creation and error handling
- Statistics calculation and reporting

Run tests:
```bash
# New modular tests
npm test -- tests/cmdb/entity-resolution-service.test.ts
npm test -- tests/cmdb/cmdb-match-processor.test.ts
npm test -- tests/cmdb/reconciliation-orchestrator.test.ts

# Existing tests (still valid)
npm test -- cmdb-reconciliation.test.ts
npm test -- cmdb-reconciliation-repository.test.ts
```

### Test Coverage

- ✅ Entity resolution with Business Context (`EntityResolutionService`)
- ✅ CMDB search and confidence scoring (`CmdbMatchProcessor`)
- ✅ Workflow orchestration and coordination (`ReconciliationOrchestrator`)
- ✅ CI linking to cases (integration tests)
- ✅ Child task creation (integration tests)
- ✅ Slack notifications (integration tests)
- ✅ Error handling and edge cases (all modules)
- ✅ Repository operations (existing tests)
- ✅ Statistics and reporting (orchestrator tests)
- ✅ Backward compatibility (facade tests)

## Monitoring and Analytics

### Key Metrics

1. **Reconciliation Rate**: Percentage of entities successfully reconciled
2. **Match Rate**: Percentage of resolved entities that find CMDB matches
3. **Task Creation Rate**: Percentage of searches requiring child tasks
4. **Alias Resolution Rate**: Percentage of entities resolved through aliases

### Database Queries

```sql
-- Overall reconciliation statistics
SELECT 
  reconciliation_status,
  COUNT(*) as count,
  COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
FROM cmdb_reconciliation_results 
GROUP BY reconciliation_status;

-- Recent activity
SELECT 
  case_number,
  entity_value,
  entity_type,
  reconciliation_status,
  created_at
FROM cmdb_reconciliation_results 
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Top missing entities
SELECT 
  resolved_entity_value,
  COUNT(*) as missing_count
FROM cmdb_reconciliation_results 
WHERE reconciliation_status = 'unmatched'
GROUP BY resolved_entity_value
ORDER BY missing_count DESC
LIMIT 10;
```

## Troubleshooting

### Common Issues

1. **CMDB Reconciliation Not Running**
   - Check `CMDB_RECONCILIATION_ENABLED=true`
   - Verify ServiceNow credentials
   - Check database connectivity

2. **High Skip Rate**
   - Review Business Context aliases
   - Check entity extraction quality
   - Verify CI-worthy entity filters

3. **Child Task Creation Failing**
   - Verify ServiceNow task creation permissions
   - Check assignment group exists
   - Review ServiceNow API limits

4. **Slack Notifications Not Working**
   - Verify `SLACK_BOT_TOKEN` has chat:write permission
   - Check channel exists and bot is member
   - Verify `CMDB_RECONCILIATION_SLACK_CHANNEL` setting

### Debug Logging

Enable debug logging:
```bash
LOG_LEVEL=debug
```

Key log messages:
- `[CMDB] Starting reconciliation for case {caseNumber}`
- `[CMDB] Linked CI {ciName} to case {caseSysId}`
- `[CMDB] Created child task {taskNumber} for missing CI: {entity}`
- `[CMDB] Sent Slack notification to {channel}`

## Migration Guide

### For Consumers

The refactoring maintains **100% backward compatibility**. No changes required:

```typescript
// This continues to work exactly as before
import { getCmdbReconciliationService } from './lib/services/cmdb-reconciliation';

const service = getCmdbReconciliationService();
await service.reconcileEntities({...});
```

### For Developers

When extending the system, use the new modular structure:

```typescript
// For entity resolution logic
import { EntityResolutionService } from './lib/services/cmdb/entity-resolution-service';

// For match processing logic  
import { CmdbMatchProcessor } from './lib/services/cmdb/cmdb-match-processor';

// For workflow orchestration
import { ReconciliationOrchestrator } from './lib/services/cmdb/reconciliation-orchestrator';

// For types and interfaces
import { CmdbReconciliationResult, EntityResolutionResult } from './lib/services/cmdb/types';
```

## Future Enhancements

### Planned Features

1. **Batch Processing**: Cron job for bulk reconciliation of historical cases
2. **Automatic CI Creation**: Optional stub CI creation for high-confidence matches
3. **Advanced Matching**: Fuzzy matching and machine learning for CI resolution
4. **CMDB Health Dashboard**: Real-time monitoring of CMDB data quality
5. **Integration with ITSM**: Automatic change request creation for CI updates

### Extension Points

The modular architecture makes extensibility straightforward:
- **Custom Entity Resolvers**: Extend `EntityResolutionService` or create alternatives
- **Additional CMDB Sources**: Modify `CmdbMatchProcessor` to support multiple sources
- **Alternative Notification Channels**: Extend `ReconciliationOrchestrator` with new integrations
- **Custom Matching Algorithms**: Enhance `CmdbMatchProcessor` with new scoring methods
- **Workflow Customization**: Modify `ReconciliationOrchestrator` for different business processes

### Development Benefits

- **Isolated Testing**: Each module can be tested independently
- **Parallel Development**: Teams can work on different modules simultaneously
- **Safe Refactoring**: Changes to one module don't affect others
- **Easy Debugging**: Issues can be isolated to specific modules
- **Code Reuse**: Modules can be reused in other parts of the system

## Security Considerations

1. **Access Control**: ServiceNow credentials limited to read CI and create tasks
2. **Data Privacy**: No sensitive data stored in reconciliation metadata
3. **Audit Trail**: Complete audit trail in database and ServiceNow
4. **Rate Limiting**: Built-in rate limiting for ServiceNow API calls

## Performance

### Optimization Strategies

1. **Caching**: Business Context and CMDB lookup results cached
2. **Batching**: Multiple entities processed in parallel where possible
3. **Database Indexing**: Optimized indexes on reconciliation table
4. **Async Processing**: Non-blocking integration with case triage

### Scaling Considerations

- Designed for high-volume case processing
- Horizontal scaling through database partitioning
- Queue-based processing for peak loads
- Monitoring and alerting for performance metrics