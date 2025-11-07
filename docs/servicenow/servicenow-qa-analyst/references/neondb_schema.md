# NeonDB Schema Documentation

This document describes the database schema used for tracking ServiceNow change validations.

## Connection Configuration

The `track_validation.py` script connects to Postgres/NeonDB using environment variables with fallback logic:

```python
database_url = os.getenv("NEON_DATABASE_URL") or os.getenv("DATABASE_URL")
```

**Priority Order:**
1. `NEON_DATABASE_URL` - Preferred
2. `DATABASE_URL` - Fallback

**Connection String Format:**
```
postgresql://user:password@host:port/database?sslmode=require
```

## Table: change_validations

Stores validation results for ServiceNow Standard Changes to enable pattern analysis and continuous improvement.

### Schema Definition

```sql
CREATE TABLE IF NOT EXISTS change_validations (
    id SERIAL PRIMARY KEY,
    change_number VARCHAR(50),
    validation_date TIMESTAMP WITH TIME ZONE,
    overall_status VARCHAR(20),
    checks JSONB,
    duration_seconds DOUBLE PRECISION
);
```

### Column Descriptions

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | SERIAL | NO | Auto-incrementing primary key |
| `change_number` | VARCHAR(50) | YES | ServiceNow change number (e.g., "CHG0012345") |
| `validation_date` | TIMESTAMP WITH TIME ZONE | YES | When validation was performed (UTC) |
| `overall_status` | VARCHAR(20) | YES | Validation result: "PASSED" or "FAILED" |
| `checks` | JSONB | YES | Detailed check results as JSON object |
| `duration_seconds` | DOUBLE PRECISION | YES | How long validation took to execute |

### JSONB checks Structure

The `checks` column stores detailed validation results as a JSON object:

```json
{
  "exists": true,
  "active": true,
  "display_name_valid": true,
  "has_workflow": false,
  "has_category": false
}
```

**Standard Check Keys:**
- `exists` - Boolean: Item exists in target environment
- `active` - Boolean: Item is active/enabled
- `display_name_valid` - Boolean: Name doesn't contain template keywords
- `has_workflow` - Boolean: Workflow is attached (for catalog items)
- `has_category` - Boolean: Category is assigned (for catalog items)

Additional check keys may be added for other change types (workflows, business rules, etc.).

### Auto-Creation Behavior

The table is **automatically created** if it doesn't exist when `log_validation()` is called. This happens in `track_validation.py`:

```python
cur.execute("""
    CREATE TABLE IF NOT EXISTS change_validations (
        id SERIAL PRIMARY KEY,
        change_number VARCHAR(50),
        validation_date TIMESTAMP WITH TIME ZONE,
        overall_status VARCHAR(20),
        checks JSONB,
        duration_seconds DOUBLE PRECISION
    )
""")
```

No manual table creation is required.

## Usage Examples

### Insert Validation Result

```python
from track_validation import log_validation

validation_results = {
    "overall_status": "FAILED",
    "checks": {
        "exists": True,
        "active": True,
        "display_name_valid": True,
        "has_workflow": False,
        "has_category": False
    },
    "duration_seconds": 1.23
}

log_validation("CHG0012345", validation_results)
```

### Query Recent Failures

```sql
SELECT change_number, validation_date, checks
FROM change_validations
WHERE overall_status = 'FAILED'
ORDER BY validation_date DESC
LIMIT 10;
```

### Analyze Common Failure Patterns

```sql
SELECT 
    checks->>'has_workflow' as has_workflow,
    checks->>'has_category' as has_category,
    COUNT(*) as failure_count
FROM change_validations
WHERE overall_status = 'FAILED'
GROUP BY checks->>'has_workflow', checks->>'has_category'
ORDER BY failure_count DESC;
```

### Performance Metrics

```sql
SELECT 
    overall_status,
    COUNT(*) as count,
    AVG(duration_seconds) as avg_duration,
    MAX(duration_seconds) as max_duration
FROM change_validations
GROUP BY overall_status;
```

### Find Changes with Specific Failures

```sql
-- Find all changes that failed due to missing workflow
SELECT change_number, validation_date
FROM change_validations
WHERE checks->>'has_workflow' = 'false'
ORDER BY validation_date DESC;
```

### Track Improvement Over Time

```sql
SELECT 
    DATE_TRUNC('week', validation_date) as week,
    COUNT(*) as total_validations,
    SUM(CASE WHEN overall_status = 'PASSED' THEN 1 ELSE 0 END) as passed,
    SUM(CASE WHEN overall_status = 'FAILED' THEN 1 ELSE 0 END) as failed,
    ROUND(100.0 * SUM(CASE WHEN overall_status = 'PASSED' THEN 1 ELSE 0 END) / COUNT(*), 1) as pass_rate
FROM change_validations
WHERE validation_date >= NOW() - INTERVAL '3 months'
GROUP BY week
ORDER BY week DESC;
```

## Future Extensions

Consider adding these columns for richer analytics:

```sql
-- Proposed additional columns
ALTER TABLE change_validations ADD COLUMN developer VARCHAR(100);
ALTER TABLE change_validations ADD COLUMN change_type VARCHAR(50);
ALTER TABLE change_validations ADD COLUMN environment VARCHAR(20);
ALTER TABLE change_validations ADD COLUMN component_sys_id VARCHAR(50);
```

## Maintenance

### Cleanup Old Records

```sql
-- Delete validation records older than 1 year
DELETE FROM change_validations
WHERE validation_date < NOW() - INTERVAL '1 year';
```

### Index Recommendations

For better query performance on large datasets:

```sql
CREATE INDEX idx_change_validations_change_number ON change_validations(change_number);
CREATE INDEX idx_change_validations_validation_date ON change_validations(validation_date);
CREATE INDEX idx_change_validations_status ON change_validations(overall_status);
```

### JSONB Query Optimization

For frequent queries on specific check keys:

```sql
CREATE INDEX idx_change_validations_checks_workflow ON change_validations USING GIN ((checks->'has_workflow'));
CREATE INDEX idx_change_validations_checks_category ON change_validations USING GIN ((checks->'has_category'));
```

## Connection Troubleshooting

### Common Issues

**Error: "NEON_DATABASE_URL or DATABASE_URL is not configured"**
- Solution: Set either environment variable with valid Postgres connection string

**Error: "Could not connect to server"**
- Check: Database host is accessible
- Check: Port 5432 (or custom port) is open
- Check: SSL mode is set correctly (`?sslmode=require` for Neon)

**Error: "Password authentication failed"**
- Verify: Username and password in connection string
- Check: User has CREATE TABLE and INSERT permissions

### Testing Connection

```python
import os
import psycopg2

database_url = os.getenv("NEON_DATABASE_URL") or os.getenv("DATABASE_URL")
if not database_url:
    print("❌ DATABASE_URL not set")
else:
    try:
        conn = psycopg2.connect(database_url)
        print("✓ Connection successful")
        conn.close()
    except Exception as e:
        print(f"❌ Connection failed: {e}")
```

## Integration with AI Agent

The AI agent should:
1. Run validation scripts (check_uat_clone_date.py, validate_catalog_item.py)
2. Collect results
3. Apply ReACT pattern (Review → Reason → Act)
4. Log final results using `track_validation.py`
5. Post synthesized findings to ServiceNow change record

**Workflow:**
```python
# 1. Run validations
uat_status = subprocess.run(["python", "check_uat_clone_date.py"])
catalog_status = subprocess.run(["python", "validate_catalog_item.py", sys_id])

# 2. Parse results
validation_results = parse_validation_outputs(uat_status, catalog_status)

# 3. Log to NeonDB
log_validation(change_number, validation_results)

# 4. Synthesize and post to ServiceNow
synthesized_comment = apply_react_pattern(validation_results)
client.post_change_comment(change_sys_id, synthesized_comment)
```
