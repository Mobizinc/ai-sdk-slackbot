# Missing Features & Bugs Found

## Case Search Tool Issues

### 1. ✅ FIXED: Missing `updatedBefore`/`updatedAfter` Filters
**Status:** Fixed in commit `a7a07d0`

**Issue:** Agent couldn't filter cases by update date even though backend supported it.

**Impact:** Queries like "cases not updated in 3 days" didn't work.

---

### 2. ❌ MISSING: `companyName` Filter

**Location:** `lib/agent/tools/case-search.ts`

**Issue:**
- Service layer supports both `accountName` and `companyName` filters
- ServiceNow has two different fields:
  - `account.name` - Business account/customer (currently exposed as "customer")
  - `company.name` - End-user's company/organization (NOT exposed)
- Agent tool only exposes `customer` (maps to accountName)

**Code Evidence:**
```typescript
// lib/infrastructure/servicenow/repositories/case-repository.impl.ts:125-133
if (criteria.accountName) {
  queryParts.push(`account.nameLIKE${criteria.accountName}`);
}

if (criteria.companyName) {
  queryParts.push(`company.nameLIKE${criteria.companyName}`);
}
```

**Impact:**
- Can't search by end-user's company name
- May be important for multi-tenant scenarios

**Fix Required:**
Add to `CaseSearchInputSchema`:
```typescript
company: z.string().optional().describe("Company name to filter by"),
```

Map in execute:
```typescript
companyName: input.company,
```

---

### 3. ❌ BUG: Incorrect `totalFound` Calculation

**Location:** `lib/services/case-search-service.ts:86`

**Issue:**
```typescript
const totalFound = offset + cases.length;
```

This calculates: `totalFound = offset + returned_results_length`

**Example of Bug:**
- User at offset 0, gets 50 results → reports "totalFound: 50"
- But actual total in ServiceNow might be 200!
- User at offset 50, gets 50 results → reports "totalFound: 100" (still wrong!)

**Root Cause:**
- ServiceNow API returns total count in `x-total-count` header
- TableApiClient correctly parses this header
- But `CaseRepository.search()` only returns `Case[]`, not the total count
- Service layer has no way to get the real total

**Impact:**
- **CRITICAL:** Agent gives users incorrect counts
- When user asks "how many cases?", answer is wrong
- Pagination metadata is misleading

**Fix Required:**
1. Change `CaseRepository.search()` signature:
```typescript
search(criteria: CaseSearchCriteria): Promise<{ cases: Case[], totalCount: number }>;
```

2. Update implementation to pass through `x-total-count` from ServiceNow

3. Update service layer:
```typescript
const { cases, totalCount } = await this.caseRepository.search(criteria);
const totalFound = totalCount; // Use real count, not offset + length
```

---

## Other Potential Issues

### 4. ⚠️ INVESTIGATE: Are There Other Repository Methods Missing Totals?

Similar pattern might exist in:
- `lib/infrastructure/servicenow/repositories/incident-repository.impl.ts`
- Any other search methods

Should audit all repository search methods to ensure they return total counts.

---

### 5. ⚠️ INVESTIGATE: Tool Parameter Type Mismatches

**Observation:**
- Agent tool uses `customer` (string)
- Maps to `accountName` in service layer
- But what if ServiceNow needs exact account sys_id for better matching?

Should review if we need both:
- Display name search (current: `accountName`)
- Exact ID search (potential: `accountSysId`)

---

## Priority

1. **HIGH**: Fix `totalFound` bug - users are getting wrong counts
2. **MEDIUM**: Add `companyName` filter - functional gap but has workarounds
3. **LOW**: Audit other repositories for similar issues

---

**Generated:** 2025-11-08
**Tool:** Claude Code
