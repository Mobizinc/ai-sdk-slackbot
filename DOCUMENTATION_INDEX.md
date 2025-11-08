# ServiceNow Change Validation Documentation Index

This project includes comprehensive documentation for the ServiceNow change validation system. Use this index to navigate the available documentation.

## Documentation Files

### 1. CHANGE_VALIDATION_ANALYSIS.md (28 KB, 880 lines)
**Purpose**: Comprehensive technical analysis covering all components

**Sections**:
- 1. Webhook Endpoint (api/servicenow-change-webhook.ts)
- 2. Worker/Evaluator (api/workers/process-change-validation.ts)
- 3. Service Layer (lib/services/change-validation.ts)
- 4. Database Schema (lib/db/schema.ts)
- 5. Repository Layer (lib/db/repositories/)
- 6. Validation Schemas (lib/schemas/)
- 7. ServiceNow Client (lib/tools/servicenow.ts)
- 8. Component Type Handling Summary
- 9. Configuration & Environment Variables
- 10. Data Flow Sequence
- 11. Testing & Validation
- 12. Key Design Patterns
- 13. Extensibility Guide
- Summary Table

**Use When**: You need detailed understanding of how each component works, line-by-line implementation details, or complete context about the system.

---

### 2. CHANGE_VALIDATION_QUICK_REFERENCE.md (9.3 KB, 299 lines)
**Purpose**: Quick lookup guide for developers

**Sections**:
- Component Type & Component SysId Handling (what they are, where they're handled)
- Database Storage (SQL table structure)
- Component-Specific Validation Routes (catalog_item, ldap_server, mid_server, workflow)
- Code Flow: Component Type Routing
- Error Handling: Timeout & Fallback
- Example: Adding a New Component Type
- Testing Component Type Handling
- Key Files & Line References
- Quick Checklist

**Use When**: You need quick answers, want to add a new component type, or need a refresher on specific fields.

---

### 3. CHANGE_VALIDATION_ARCHITECTURE.md (43 KB, 542 lines)
**Purpose**: Visual architecture diagrams and system overview

**Sections**:
- System Architecture Overview (ASCII diagram)
- Async Processing Flow (QStash queue)
- Component Type Routing Details (ASCII diagram)
- Database Schema: Key Fields (visual table structure)
- Data Flow: Component Type at Each Stage
- Error Handling Flow (ASCII diagram)
- File Organization (directory tree)
- Component Type Support Matrix

**Use When**: You're learning the system architecture, need visual diagrams, or want to understand how components interact at a high level.

---

## Quick Navigation by Task

### I want to understand how the system works
1. Start: CHANGE_VALIDATION_ARCHITECTURE.md (System Overview section)
2. Read: CHANGE_VALIDATION_ANALYSIS.md (sections 1-3)
3. Reference: CHANGE_VALIDATION_QUICK_REFERENCE.md (Code Flow section)

### I need to add a new component type
1. Read: CHANGE_VALIDATION_QUICK_REFERENCE.md (Adding a New Component Type)
2. Reference: CHANGE_VALIDATION_ANALYSIS.md (sections 3, 4, 7)
3. Check: Database schema additions needed (section 4)

### I need to modify component type handling
1. Start: CHANGE_VALIDATION_QUICK_REFERENCE.md (Component Type fields)
2. Deep dive: CHANGE_VALIDATION_ANALYSIS.md (section 3: Service Layer, collectValidationFacts method)
3. Reference: CHANGE_VALIDATION_ARCHITECTURE.md (Component Type Routing Details)

### I need to understand database structure
1. Reference: CHANGE_VALIDATION_QUICK_REFERENCE.md (Database Storage)
2. Full details: CHANGE_VALIDATION_ANALYSIS.md (section 4: Database Schema)
3. Visual: CHANGE_VALIDATION_ARCHITECTURE.md (Database Schema: Key Fields)

### I need to debug a validation issue
1. Check: CHANGE_VALIDATION_ARCHITECTURE.md (Error Handling Flow)
2. Read: CHANGE_VALIDATION_ANALYSIS.md (section 3: Service Layer, error handling in each method)
3. Reference: CHANGE_VALIDATION_QUICK_REFERENCE.md (Error Handling: Timeout & Fallback)

### I need to test component type handling
1. Reference: CHANGE_VALIDATION_QUICK_REFERENCE.md (Testing Component Type Handling)
2. Details: CHANGE_VALIDATION_ANALYSIS.md (section 11: Testing & Validation)
3. Code flow: CHANGE_VALIDATION_ARCHITECTURE.md (Data Flow section)

---

## Key Concepts Explained

### component_type
- **What**: The kind of ServiceNow configuration item being changed
- **Examples**: catalog_item, ldap_server, mid_server, workflow
- **Where**: Webhook payload → Database → Fact Collection (routes validation)
- **Read**: CHANGE_VALIDATION_QUICK_REFERENCE.md (Component Type & Component SysId)

### component_sys_id
- **What**: The unique identifier (sys_id) of the specific component in ServiceNow
- **Usage**: Passed to component-specific API methods to fetch details
- **Examples**: From sc_cat_item, cmdb_ci_ldap_server, ecc_agent, wf_workflow tables
- **Read**: CHANGE_VALIDATION_QUICK_REFERENCE.md (Component Type & Component SysId)

### collectValidationFacts()
- **What**: Core method that collects facts from ServiceNow based on component type
- **Where**: lib/services/change-validation.ts (lines 175-329)
- **Key Feature**: Component-specific routing using conditional logic
- **Read**: CHANGE_VALIDATION_ANALYSIS.md (section 3: Service Layer)

### synthesizeWithClaude()
- **What**: Uses Claude Sonnet 4.5 to intelligently validate changes
- **Input**: Facts object with component-specific data and checks
- **Output**: ValidationResult with overall_status (PASSED/FAILED/WARNING)
- **Read**: CHANGE_VALIDATION_ANALYSIS.md (section 3: synthesizeWithClaude)

---

## File Locations Reference

| Component | File | Lines | Doc Section |
|-----------|------|-------|-------------|
| Webhook Handler | api/servicenow-change-webhook.ts | 1-203 | ANALYSIS.md §1 |
| Worker | api/workers/process-change-validation.ts | 1-115 | ANALYSIS.md §2 |
| Service | lib/services/change-validation.ts | 1-540 | ANALYSIS.md §3 |
| Database Schema | lib/db/schema.ts | 1051-1098 | ANALYSIS.md §4 |
| Repository | lib/db/repositories/change-validation-repository.ts | 1-315 | ANALYSIS.md §5 |
| Zod Schemas | lib/schemas/servicenow-change-webhook.ts | 1-100 | ANALYSIS.md §6 |
| ServiceNow Client | lib/tools/servicenow.ts | 3580-3707 | ANALYSIS.md §7 |

---

## Environment Configuration

### Required
- `SERVICENOW_WEBHOOK_SECRET`: HMAC signature verification
- `SERVICENOW_INSTANCE_URL`: ServiceNow instance URL
- `SERVICENOW_USERNAME` + `SERVICENOW_PASSWORD` OR `SERVICENOW_API_TOKEN`

### Feature Flags
- `ENABLE_CHANGE_VALIDATION`: Enable/disable (default: true)
- `ENABLE_ASYNC_PROCESSING`: Enable/disable async (default: true)

### Optional
- `ANTHROPIC_API_KEY`: For Claude synthesis

**Read**: CHANGE_VALIDATION_ANALYSIS.md (section 9)

---

## Component Type Support Matrix

| Type | Table | Checks | Status | Lines |
|------|-------|--------|--------|-------|
| catalog_item | sc_cat_item | 4 | ✓ Implemented | 224-249 |
| ldap_server | cmdb_ci_ldap_server | 3 | ✓ Implemented | 250-272 |
| mid_server | ecc_agent | 3 | ✓ Implemented | 273-296 |
| workflow | wf_workflow | 3 | ✓ Implemented | 297-321 |

**Read**: 
- CHANGE_VALIDATION_QUICK_REFERENCE.md (Component-Specific Validation Routes)
- CHANGE_VALIDATION_ARCHITECTURE.md (Component Type Support Matrix)

---

## Testing

### Test Files
- Unit: `tests/api/servicenow-change-webhook.test.ts`
- Unit: `tests/api/workers/process-change-validation.test.ts`
- Unit: `tests/lib/services/change-validation.test.ts`
- Unit: `tests/lib/db/repositories/change-validation-repository.test.ts`
- Integration: `tests/integration/change-validation-integration.test.ts`

**Read**: CHANGE_VALIDATION_ANALYSIS.md (section 11: Testing & Validation)

---

## Design Patterns Used

1. **Timeout Protection**: All ServiceNow API calls have 8-second timeout
2. **Graceful Degradation**: If API fails, continue with false checks (fail-safe)
3. **Conditional Routing**: Component type determines which validation to run
4. **Multi-Strategy JSON Extraction**: Robust LLM response parsing
5. **Async-First with Fallback**: QStash primary, sync secondary

**Read**: CHANGE_VALIDATION_ANALYSIS.md (section 12: Key Design Patterns)

---

## How to Extend

### Adding a New Component Type

Steps:
1. Update Zod schema (add to accepted types)
2. Add ServiceNow Client method (fetch component from API)
3. Add fact collector in Service (conditional block in collectValidationFacts)
4. Define component-specific checks
5. Update Claude prompt (optional)

**Read**: CHANGE_VALIDATION_QUICK_REFERENCE.md (Adding a New Component Type)

**Detailed**: CHANGE_VALIDATION_ANALYSIS.md (section 13: Extensibility)

---

## Common Questions

**Q: Where does component_type come from?**
A: ServiceNow webhook payload when change enters "Assess" state. See CHANGE_VALIDATION_ANALYSIS.md section 1.

**Q: How are component-specific checks defined?**
A: In collectValidationFacts() method based on componentType. See CHANGE_VALIDATION_ANALYSIS.md section 3.

**Q: What happens if ServiceNow API times out?**
A: API call has 8-second timeout. If timeout, all checks set to false (fail-safe). See CHANGE_VALIDATION_QUICK_REFERENCE.md (Error Handling).

**Q: Can I add a new component type?**
A: Yes, see CHANGE_VALIDATION_QUICK_REFERENCE.md (Adding a New Component Type).

**Q: How is validation result stored?**
A: In validationResults JSONB field with {overall_status, checks, synthesis}. See CHANGE_VALIDATION_ANALYSIS.md section 4.

**Q: Can validation work without Claude API?**
A: Yes, falls back to rules-based validation. See CHANGE_VALIDATION_ANALYSIS.md section 3 (synthesizeWithRules).

---

## Additional Resources

### Database Migrations
Check `migrations/` directory for changeValidations table creation

### Integration Tests
See `tests/integration/change-validation-integration.test.ts` for full workflow examples

### Logging & Tracing
System uses LangSmith integration. See section 3 in CHANGE_VALIDATION_ANALYSIS.md

---

## Version History

This documentation was created on 2024-11-07 and covers:
- ServiceNow change validation feature
- Component type handling (catalog_item, ldap_server, mid_server, workflow)
- Webhook → QStash worker → Service → Database → ServiceNow workflow
- Claude Sonnet 4.5 integration for validation synthesis
- Timeout protection and error handling patterns

---

## Questions or Issues?

Refer to:
1. The specific analysis section for that component
2. The quick reference for quick lookups
3. The architecture diagrams for visual understanding
4. Test files for implementation examples

---

**Generated**: 2024-11-07
**Coverage**: Complete system analysis with 1,721 lines of documentation
