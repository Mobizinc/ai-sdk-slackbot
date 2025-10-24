# CMDB Reconciliation Feature

## Overview

The CMDB Reconciliation feature automatically links Configuration Items (CIs) from ServiceNow to cases and creates child tasks for missing CIs. This closes the loop between entity extraction and CMDB data governance, turning discovered technical entities into actionable insights.

## Architecture

### Core Components

1. **CmdbReconciliationService** (`lib/services/cmdb-reconciliation.ts`)
   - Main orchestration service
   - Handles entity resolution, CMDB lookup, and task creation
   - Integrates with BusinessContext for alias resolution

2. **CmdbReconciliationRepository** (`lib/db/repositories/cmdb-reconciliation-repository.ts`)
   - Database layer for reconciliation results
   - Tracks all reconciliation attempts and outcomes

3. **Database Schema** (`lib/db/schema.ts`)
   - `cmdb_reconciliation_results` table stores reconciliation history
   - Tracks matches, misses, and child task creation

4. **Integration Points**
   - Integrated into `CaseTriageService` workflow
   - Uses existing `ServiceNowClient` for CMDB operations
   - Leverages `BusinessContextService` for alias resolution

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

Comprehensive test suite covers:
- Entity alias resolution
- CMDB matching logic
- Child task creation
- Error handling
- Statistics calculation

Run tests:
```bash
npm test -- cmdb-reconciliation.test.ts
npm test -- cmdb-reconciliation-repository.test.ts
```

### Test Coverage

- ✅ Entity resolution with Business Context
- ✅ CMDB search and matching
- ✅ CI linking to cases
- ✅ Child task creation
- ✅ Slack notifications
- ✅ Error handling and edge cases
- ✅ Repository operations
- ✅ Statistics and reporting

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

## Future Enhancements

### Planned Features

1. **Batch Processing**: Cron job for bulk reconciliation of historical cases
2. **Automatic CI Creation**: Optional stub CI creation for high-confidence matches
3. **Advanced Matching**: Fuzzy matching and machine learning for CI resolution
4. **CMDB Health Dashboard**: Real-time monitoring of CMDB data quality
5. **Integration with ITSM**: Automatic change request creation for CI updates

### Extension Points

The service is designed for extensibility:
- Custom entity resolvers
- Additional CMDB sources
- Alternative notification channels
- Custom matching algorithms

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