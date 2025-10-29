# Metrics Baseline (Pre-Refactor)

**Date**: 2025-10-22
**Purpose**: Quantitative baseline for measuring refactor success

---

## Summary Statistics

| Metric | generate-response.ts | handle-passive-messages.ts | **Total** |
|--------|---------------------|----------------------------|-----------|
| **Total Lines** | 1,272 | 608 | **1,880** |
| **Code Lines** | 1,087 | 458 | **1,545** |
| **Comment Lines** | 30 | 58 | 88 |
| **Blank Lines** | 155 | 92 | 247 |
| **Function Declarations** | 0 | 10 | 10 |
| **Const/Let Functions** | 11 | 0 | 11 |
| **Tool Definitions** | 13 | 0 | 13 |
| **Import Statements** | 15 | 15 | 30 |

---

## File-Specific Analysis

### `lib/generate-response.ts` (1,272 LOC)

**Characteristics**:
- **Primary responsibility**: Agent orchestration for @mention flow
- **Complexity drivers**:
  - 13 tool definitions (weather, ServiceNow, search, KB generation, etc.)
  - Tool schema definitions (Zod validation)
  - Tool execution logic
  - Business context enrichment
  - Model fallback logic
  - Slack message formatting
  - Empty response handling (GLM-4.6 edge case)

**Code Breakdown**:
- System prompt building: ~50 LOC
- Business context enrichment: ~50 LOC
- Tool schemas (Zod): ~200 LOC
- Tool execute functions: ~700 LOC
- Main orchestrator: ~80 LOC
- Message formatting: ~30 LOC

**Pain Points**:
- Single file mixing concerns (schemas + execution + prompts + formatting)
- Hard to find specific tool implementation
- Tool tests require importing entire orchestrator
- Difficult to understand flow at a glance

### `lib/handle-passive-messages.ts` (608 LOC)

**Characteristics**:
- **Primary responsibility**: Passive message monitoring and KB workflow
- **Complexity drivers**:
  - Case number extraction (regex patterns)
  - ServiceNow case lookup integration
  - Azure Search similar cases
  - KB workflow state machine (5 states)
  - Resolution detection logic
  - Intelligent assistance generation
  - Context manager integration

**Code Breakdown**:
- Case number extraction: ~30 LOC
- Main event handler: ~150 LOC
- Intelligent assistance: ~100 LOC
- KB workflow triggers: ~100 LOC
- Resolution detection: ~80 LOC
- Helper functions: ~80 LOC

**Pain Points**:
- Mixes detection logic with action logic
- ServiceNow/Azure Search lookups scattered throughout
- KB workflow state management interleaved with message handling
- Hard to test individual behaviors (detection vs. actions)

---

## Refactor Goals

### Lines of Code (LOC) Targets

| Category | Before | After Target | Reduction |
|----------|--------|--------------|-----------|
| **Largest File** | 1,272 LOC | <200 LOC | -84% |
| **Average File Size** | 940 LOC | <100 LOC | -89% |
| **Total Code Lines** | 1,545 LOC | ~1,300 LOC | -16% |

**Notes**:
- Total LOC reduction will be modest (~16%) because we're extracting, not deleting
- Largest file reduction is key metric (94% improvement expected)
- Average file size will drop dramatically due to splitting into ~25 focused modules

### Module Count Targets

| Metric | Before | After Target |
|--------|--------|--------------|
| **Monolithic Files** | 2 | 0 |
| **Focused Modules** | 0 | ~25 |
| **Services** | 10 existing | +5 new (15 total) |
| **Agent Tools** | 0 separated | 9 tool files |
| **Passive Modules** | 0 separated | 7 modules |

### Complexity Targets

| Metric | Before | After Target |
|--------|--------|--------------|
| **Max Function Length** | ~300 LOC | <50 LOC |
| **Functions per File** | 10-11 | 2-4 |
| **Imports per File** | 15 | <8 |
| **Responsibilities per Module** | 5-7 | 1-2 |

---

## Test Coverage Baseline

**Current State**: Integration tests created in Phase 0

| Test File | Status | Tests | Coverage Target |
|-----------|--------|-------|-----------------|
| `generate-response.integration.test.ts` | Created | 14 tests | >90% |
| `handle-passive-messages.integration.test.ts` | Created | 15 tests | >90% |

**Test Scenarios Covered**:
- Basic functionality (simple messages, empty arrays)
- Options handling (channel context, thread context)
- Test injection points (mocking)
- Edge cases (long messages, empty responses, malformed events)
- Error handling (LLM errors, callback failures)
- Multi-turn conversations
- Concurrent message processing

---

## Success Metrics (Post-Refactor)

### Quantitative Metrics

1. **Code Organization**
   - ✅ No file exceeds 200 LOC
   - ✅ Average file size <100 LOC
   - ✅ Total LOC reduced by 10-20%
   - ✅ Max function length <50 LOC

2. **Test Coverage**
   - ✅ Overall coverage >90%
   - ✅ All integration tests pass
   - ✅ New unit tests for extracted services
   - ✅ Zero behavioral regressions

3. **Module Boundaries**
   - ✅ Clear separation: agent/, passive/, services/
   - ✅ <8 imports per module
   - ✅ Single responsibility per file
   - ✅ No duplicate logic across modules

### Qualitative Metrics

1. **Developer Experience**
   - Time to understand flow: <30 minutes (vs. ~2 hours)
   - Time to add new tool: <15 minutes (vs. ~1 hour)
   - Time to find specific logic: <2 minutes (vs. ~10 minutes)

2. **Maintainability**
   - Clear module boundaries
   - Easy to test individual components
   - Simple to add new features
   - Obvious where code belongs

---

## Measurement Commands

### Lines of Code
```bash
# Total lines
wc -l lib/generate-response.ts lib/handle-passive-messages.ts

# Code lines (excluding comments/blanks)
cat lib/generate-response.ts | grep -vE "^\s*$|^\s*//" | wc -l
```

### Function Count
```bash
# Function declarations
grep -cE "(^export\s+(async\s+)?function|^function)" lib/generate-response.ts

# Const/let functions
grep -cE "(const|let)\s+\w+\s*=\s*(async\s+)?\(" lib/generate-response.ts
```

### Import Count
```bash
grep -c "^import" lib/generate-response.ts
```

### Test Coverage
```bash
npm test -- --coverage
```

---

## Post-Refactor Comparison

**TO BE COMPLETED**: After Phase 5, run the same measurements and compare:

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Total LOC | 1,880 | TBD | TBD% |
| Code LOC | 1,545 | TBD | TBD% |
| Largest File | 1,272 | TBD | TBD% |
| Module Count | 2 | TBD | +TBD |
| Avg File Size | 940 | TBD | TBD% |
| Test Coverage | ~65% | TBD | +TBD% |

---

## Notes

1. **LOC Paradox**: Splitting files increases overhead (imports, exports, types), so total LOC may only decrease slightly
2. **Value Proposition**: Maintainability and clarity matter more than raw LOC reduction
3. **Module Granularity**: Aim for "just right" - not too fine-grained, not too coarse
4. **Test Investment**: More test LOC is acceptable if it increases confidence and prevents regressions

---

## References

- [API Contracts Baseline](./api-contracts-baseline.md)
- [Refactor Plan](./refactor-generate-and-passive.md)
- [Integration Tests](../tests/*integration.test.ts)
