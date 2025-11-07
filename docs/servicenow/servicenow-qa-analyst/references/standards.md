# Mobiz ServiceNow Development Standards

This is a living standards document that defines quality requirements for ServiceNow development at Mobiz. These standards are continuously updated based on validation patterns and discovered issues.

**Last Updated**: 2025-11-06
**Version**: 1.0

---

## General Principles

### 1. Customer-Specific Configuration
All configurations must be properly customized for the target customer. No generic template names, placeholders, or references to other customers should remain.

### 2. Environment Portability
All code and configuration must work across Dev, UAT, and Production environments without modification. Hard-coded sys_ids or environment-specific values are prohibited.

### 3. Completeness
Changes must be complete and tested before submission. Incomplete work, placeholder values, or "TODO" comments are not acceptable for production deployment.

### 4. Documentation
All changes must be documented with clear descriptions, business justifications, and rollback plans.

### 5. Quality Over Speed
Taking extra time to ensure quality is preferred over rushing deployments that may cause incidents.

---

## Naming Conventions

### Catalog Items
**Format**: `[Customer Abbreviation] - [Purpose] - [Type]`

**Examples**:
- `ACME - Laptop Request - Hardware`
- `GLOBEX - Shared Mailbox - Access Request`
- `INITECH - New Hire Onboarding - Service`

**Standard**: Display name and short description must be customer-specific and clearly describe the purpose.

**Rationale**: Prevents confusion when multiple customers have similar items. Makes search and discovery easier.

---

### Workflows
**Format**: `[Customer Abbreviation] - [Process Name] - WF`

**Examples**:
- `ACME - Hardware Approval - WF`
- `GLOBEX - Manager Delegation - WF`

**Standard**: All workflows must have "WF" suffix and customer abbreviation prefix.

**Rationale**: Easily distinguishes workflows from other components in lists.

---

### Business Rules
**Format**: `[Table] - [Action] - [When]`

**Examples**:
- `Incident - Assign to Group - Before`
- `Case - Validate Category - Display`
- `RITM - Auto Approve - After`

**Standard**: Name should indicate table, action, and timing.

**Rationale**: Makes it clear what the rule does and when it runs.

---

## Catalog Item Standards

### Required Fields
All catalog items must have:
- **Display Name**: Customer-specific, no generic terms
- **Short Description**: Meaningful description of purpose
- **Category**: Properly categorized
- **Active**: Set to true before deployment
- **Icon/Picture**: Visual representation (strongly recommended)

### Workflow Requirements
If approval or automation is needed:
- **Workflow must be attached**
- **Workflow must be published**
- **Workflow must include error handling**
- **Workflow must send appropriate notifications**

### Variables/Questions
- **Mandatory fields must be justified**: Don't make fields mandatory unless truly required
- **Help text required**: All variables should have clear help text
- **Default values must be appropriate**: No leftover defaults from cloned templates
- **Dependencies must be configured**: Show/hide logic for related fields

**Standard**: Catalog items must not contain suspicious keywords indicating cloned templates: "template", "copy of", "test", "sample", "demo", "client name", "TODO"

**Rationale**: Prevents embarrassing production releases with wrong customer names or incomplete customization.

**Added**: 2025-11-06

---

## Workflow Standards

### Publication Requirements
**Standard**: All workflows attached to records must be published before deployment.

**Rationale**: Unpublished workflows never execute, causing silent failures.

---

### Error Handling
**Standard**: All workflows with API calls, external integrations, or approvals must include error handling activities and failure notifications.

**Rationale**: Without error handling, workflows can hang indefinitely when issues occur.

---

### Activity Connections
**Standard**: All workflow activities must be properly connected. No orphaned activities allowed.

**Rationale**: Orphaned activities indicate incomplete work or logic errors.

---

## Business Rule Standards

### No Hard-Coded Sys_ids
**Standard**: Business rules must never contain hard-coded sys_ids. Use queries by name or other stable identifiers.

**Rationale**: Sys_ids differ across environments, causing production failures.

---

### Error Handling Required
**Standard**: All business rules with external calls or complex logic must include try-catch error handling.

**Rationale**: Prevents unhandled exceptions from causing user-facing errors.

---

### Infinite Loop Prevention
**Standard**: Business rules that update fields must check if the field has changed to prevent infinite loops.

**Code Pattern**:
```javascript
if (current.field_name.changes()) {
    // Perform action
}
```

**Rationale**: Prevents performance issues and potential system instability.

---

## UI Policy Standards

### Dependency Validation
**Standard**: All UI policies showing/hiding fields based on another field (parent/child relationships) must include proper dependency conditions.

**Example**: If "Case Subcategory" depends on "Case Category", the UI policy must include condition: `Case Category IS NOT EMPTY`

**Rationale**: Prevents critical production issues like the case categorization incident where subcategories appeared without proper parent selection.

**Added**: 2025-11-06

---

### Field Existence
**Standard**: All fields referenced in UI policies must exist on the target form in all environments.

**Rationale**: Prevents console errors and broken functionality.

---

## Client Script Standards

### Performance
**Standard**: Avoid expensive operations (GlideAjax, complex calculations) in onChange events. Move to onLoad or server-side when possible.

**Rationale**: Ensures responsive user experience.

---

### Error Handling
**Standard**: All client scripts must handle errors gracefully and not expose technical details to users.

**Rationale**: Provides better user experience and prevents information disclosure.

---

## Update Set Standards

### Completeness
**Standard**: Update sets must contain ALL related components for a change.

**Examples**:
- Workflow → Must include all modified activities
- UI Policy → Must include all policy actions
- Catalog Item → Must include variables, workflows, and client scripts

**Rationale**: Prevents incomplete deployments that break functionality.

---

### Description Required
**Standard**: Update sets must have meaningful descriptions explaining what changed and why.

**Rationale**: Aids in change tracking and troubleshooting.

---

### State Management
**Standard**: Update sets must be marked "Complete" before submission for validation.

**Rationale**: Ensures all changes are captured before migration.

---

## UAT Environment Standards

### Clone Freshness
**Standard**: UAT environment must be cloned from Production within the last 30 days.

**Rationale**: Ensures validation accuracy. Schema and data differences can cause false positives/negatives.

**Added**: 2025-11-06

---

### Testing Requirements
**Standard**: All changes must be manually tested in UAT before automated validation and deployment.

**Test Evidence Required**:
- Screenshots of successful execution
- Test user credentials used
- Date/time of testing
- Any issues discovered and resolved

**Rationale**: Automated validation catches configuration issues, but manual testing validates business logic.

---

## Change Request Standards

### Documentation Required
All standard changes for ServiceNow updates must include:
- **Change Title**: Clear, descriptive
- **Change Type**: Specified (catalog item, workflow, business rule, etc.)
- **Update Set Name and Sys_id**: Identified
- **Affected Components**: Listed with sys_ids
- **Test Scenarios**: Documented
- **Expected Behavior**: Clearly defined
- **Rollback Plan**: Detailed steps to revert

---

### Pre-Submission Checklist
Before submitting for validation, developers must verify:
- [ ] Update set is complete with all related components
- [ ] Manual testing completed in UAT
- [ ] No hard-coded sys_ids in scripts
- [ ] Display names updated for customer
- [ ] Workflows published
- [ ] Error handling implemented
- [ ] Dependencies configured correctly
- [ ] Rollback plan documented
- [ ] UAT environment is fresh (< 30 days)

---

## Code Quality Standards

### Script Comments
**Standard**: All scripts must include header comments explaining purpose, author, and date.

**Example**:
```javascript
/**
 * Business Rule: Incident Auto-Assignment
 * Purpose: Automatically assign incidents to appropriate group based on category
 * Author: John Smith
 * Date: 2025-11-06
 * Ticket: CHG0012345
 */
```

---

### Console.log Removal
**Standard**: All `console.log()`, `gs.print()`, and debug statements must be removed before production deployment.

**Rationale**: Prevents performance degradation and information disclosure.

---

### Consistent Formatting
**Standard**: Use consistent indentation (2 or 4 spaces) and follow JavaScript best practices.

**Rationale**: Improves readability and maintainability.

---

## Security Standards

### Role-Based Access
**Standard**: All catalog items, workflows, and other components must have appropriate role restrictions.

**Rationale**: Prevents unauthorized access and maintains data security.

---

### Input Validation
**Standard**: All user inputs must be validated and sanitized before processing.

**Rationale**: Prevents injection attacks and data quality issues.

---

## Change Type Specific Standards

### For New Catalog Items
**Priority Checks**:
1. Display name validation
2. Workflow attachment and publication
3. Variables configuration
4. Category assignment

### For Workflow Modifications
**Priority Checks**:
1. Published status
2. Activity connections
3. Error handling
4. Approver configuration

### For Business Rule Changes
**Priority Checks**:
1. Hard-coded sys_ids
2. Infinite loop prevention
3. Condition logic
4. Error handling

### For UI Policy Changes
**Priority Checks**:
1. **Dependency validation** (Critical!)
2. Field existence
3. Conflict detection
4. Proper conditions

---

## Continuous Improvement

This standards document is living and will be updated based on:
- **Validation patterns**: Issues found 3+ times become standards
- **Industry best practices**: ServiceNow recommendations and community standards
- **Incident reviews**: Production issues drive new preventive standards
- **Team feedback**: Developer and QA suggestions

**Review Frequency**: Monthly

**Update Process**: 
1. Analyze validation data from last month
2. Identify patterns (issues occurring 3+ times)
3. Draft new standards
4. Review with development team
5. Update this document
6. Communicate changes

---

## Compliance

**Enforcement**: All standards are enforced through automated validation via the ServiceNow QA Analyst skill.

**Exceptions**: Exceptions to standards must be:
1. Documented in change request
2. Approved by technical lead
3. Include business justification
4. Include mitigation plan

**Violations**: Violations are categorized as:
- **Critical**: Block deployment, must be fixed
- **Warning**: Review before deployment, strong recommendation to fix
- **Info**: Nice to have, won't block deployment

---

## Appendix: Standards History

### Version 1.0 (2025-11-06)
- Initial standards document created
- Based on common mistakes identified in recent validations
- Includes critical UI policy dependency validation
- Establishes UAT clone freshness requirement (30 days)
