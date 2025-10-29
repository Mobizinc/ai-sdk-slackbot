# Setup Scripts Update: Automatic CI Relationship Creation

## Date: 2025-10-15

## Problem Identified
Setup scripts were incomplete - they only created CMDB CIs but not the CI Relationship records:
- ❌ **setup-service-portfolio.ts** - Created Business Service & Service Offerings but no CI relationships
- ❌ **setup-altus-application-services.ts** - Created Application Services but no CI relationships

This caused ServiceNow CI Relationship Viewer to show no connections, requiring manual fixes after every deployment.

## Solution Implemented
Updated both scripts to automatically create CI Relationship records in the `cmdb_rel_ci` table.

### Changes to `setup-service-portfolio.ts`

**Added Phase 3: CI Relationships**
- Runs after Service Offerings are created/found
- Queries all Service Offerings under the Business Service
- For each Service Offering:
  - Checks if CI relationship already exists
  - If missing, creates relationship: Business Service → Service Offering
  - Relationship type: "Contains::Contained by"
- Tracks counts of found vs created relationships
- Updated summary output to include CI relationship stats

**Behavior:**
- Idempotent: Safe to run multiple times
- Creates 6 CI relationships (one for each Service Offering)
- Works for both new deployments and existing environments

### Changes to `setup-altus-application-services.ts`

**Added CI Relationship Creation in Phase 2**
- For **existing Application Services**:
  - After finding service, checks if CI relationship exists
  - If missing, creates relationship: Service Offering → Application Service
- For **newly created Application Services**:
  - Immediately after creation, creates CI relationship
  - Service Offering → Application Service
  - Relationship type: "Contains::Contained by"
- Tracks counts of found vs created relationships
- Updated summary output to include CI relationship stats

**Behavior:**
- Idempotent: Safe to run multiple times
- Creates 24 CI relationships (one for each Application Service)
- Works for both new deployments and existing environments

## Benefits

✅ **Complete Automation**
- No manual CI relationship creation needed
- CI Relationship Viewer works immediately after deployment

✅ **Reusable for Future Clients**
- Scripts follow ServiceNow CMDB best practices
- Can be used as template for other client deployments

✅ **Idempotent & Safe**
- Scripts check if relationships already exist before creating
- Safe to re-run without creating duplicates
- Handles mixed scenarios (some CIs exist, some don't)

✅ **Proper CMDB Structure**
- Parent field + CI Relationships = Complete CMDB hierarchy
- Visible in all ServiceNow relationship tools:
  - CI Relationship Viewer
  - CI Dependency Views
  - Relationship maps

## Technical Details

### CI Relationship Structure
```
Business Service (parent)
  └─ Contains::Contained by → Service Offering (child)
       └─ Contains::Contained by → Application Service (child)
```

### API Endpoints Used
- **Check**: `GET /api/now/table/cmdb_rel_ci?sysparm_query=parent=X^child=Y`
- **Create**: `POST /api/now/table/cmdb_rel_ci` with payload:
  ```json
  {
    "parent": "parent_sys_id",
    "child": "child_sys_id",
    "type": "Contains::Contained by"
  }
  ```

### Summary Output Format
Both scripts now show:
```
📊 Summary:
   [CI Records created/found]
   CI Relationships: X total
     - Found existing: Y
     - Created new: Z
```

## Files Modified

1. **scripts/setup-service-portfolio.ts**
   - Added Phase 3: CI Relationships section
   - Updated header comments
   - Updated summary output

2. **scripts/setup-altus-application-services.ts**
   - Added CI relationship logic in existing service check
   - Added CI relationship creation after new service creation
   - Updated header comments
   - Updated summary output

## Testing Recommendations

To verify the updates work correctly:

### Test 1: Clean Environment
```bash
# In DEV environment with no existing records
npx tsx scripts/setup-service-portfolio.ts
npx tsx scripts/setup-altus-application-services.ts
npx tsx scripts/verify-all-ci-relationships.ts
```

Expected results:
- Phase 1: Creates 6 Service Offerings
- Phase 3: Creates 6 CI relationships
- Phase 2 (second script): Creates 24 Application Services + 24 CI relationships
- Verification: Shows all 30 CI relationships exist

### Test 2: Existing Environment (Idempotency)
```bash
# Run scripts again in same environment
npx tsx scripts/setup-service-portfolio.ts
npx tsx scripts/setup-altus-application-services.ts
```

Expected results:
- Finds all existing CIs
- Finds all existing CI relationships
- Creates: 0 new CIs, 0 new relationships
- No errors, no duplicates

### Test 3: Mixed Environment
```bash
# Environment with CIs but missing CI relationships
# (Like PROD was before the manual fix)
npx tsx scripts/setup-service-portfolio.ts
npx tsx scripts/setup-altus-application-services.ts
```

Expected results:
- Finds all existing CIs
- Creates missing CI relationships only
- No duplicate CIs or relationships

## Migration Notes

### For Future Clients
When deploying for a new client:
1. Update `CUSTOMER_ACCOUNT_NUMBER` in environment
2. Run scripts in order:
   - `setup-service-portfolio.ts` (creates BS, SO, relationships)
   - `setup-altus-application-services.ts` (creates AS, relationships)
3. CI Relationship Viewer will work immediately

### For Existing Deployments
If you have existing deployments without CI relationships:
- Simply re-run the setup scripts
- They will detect missing relationships and create them
- No need for separate fix scripts

## Documentation Updated

- ✅ Script header comments updated to mention CI relationships
- ✅ Created this implementation guide
- ✅ Updated CI_Relationship_Fix_Summary.md with references to updated scripts

## Backwards Compatibility

✅ **Fully backward compatible**
- Scripts still work if CI relationships already exist
- No breaking changes to API calls
- No changes to CI record structure (parent field unchanged)
- Only additions (Phase 3 in first script, inline checks in second script)

## Future Enhancements

Potential improvements for future consideration:
1. Create helper function `createCIRelationship()` to reduce code duplication
2. Add relationship validation/repair mode
3. Support for other relationship types (Depends on, Runs on, etc.)
4. Bulk relationship creation API for better performance
