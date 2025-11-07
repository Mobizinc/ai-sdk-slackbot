# Common ServiceNow Development Mistakes

This is a living document that tracks common mistakes found during validation. It is automatically updated based on validation patterns.

---

## Display Name Not Updated After Cloning

**Description**: Developer clones a catalog item, workflow, or other component for a new customer but forgets to update the display name, leaving the original customer's name or generic template names like "Copy of..." or "Template".

**How to Catch**: 
- Check if display name or short description contains: "template", "copy of", "test", "sample", "demo", "client name", "customer name"
- Compare catalog item name against customer name in the change request

**Remediation**: 
- Update the display name to reflect the actual customer and purpose
- Update short description to match
- Search for other occurrences of the old name in related fields

**Severity**: MEDIUM - Causes confusion and looks unprofessional but doesn't break functionality

**Last Updated**: 2025-11-06

---

## Missing UI Policy Dependency Conditions

**Description**: Developer creates parent/child field dependencies (e.g., Case Category -> Case Subcategory) but forgets to add the condition to show the child field only when the parent is selected. This was the example that caused production issues with case categorization.

**How to Catch**:
- For any UI policy showing/hiding fields, check if those fields have dependencies
- Validate that dependent fields have conditions checking parent field values
- Look for reference fields with dependent reference qualifiers
- Check choice fields where choices depend on another field

**Remediation**:
- Add UI policy condition: "Show subcategory field ONLY when parent category is not empty"
- Test with different parent values to ensure correct children appear
- Document the dependency relationship

**Severity**: CRITICAL - Can cause data quality issues and user confusion in production

**Last Updated**: 2025-11-06

---

## Hard-coded Sys_ids in Scripts

**Description**: Developer uses hard-coded sys_ids in business rules, workflows, or client scripts. These sys_ids are different across Dev/UAT/Prod environments, causing code to break when promoted.

**How to Catch**:
- Scan script content for 32-character hexadecimal strings (sys_id format)
- Look for patterns like `getReference('user_sys_id')` with hard-coded values
- Check for queries using sys_id instead of name or other stable identifiers

**Remediation**:
- Replace hard-coded sys_ids with queries by name or other stable attributes
- Use configuration records or system properties for environment-specific values
- Document any legitimate use of sys_ids with explanations

**Severity**: CRITICAL - Causes failures in production

**Last Updated**: 2025-11-06

---

## Workflow Missing Error Handling

**Description**: Developer creates workflow with API calls, approvals, or automations but doesn't include error handling activities. When something fails, the workflow gets stuck.

**How to Catch**:
- Check workflow activities for try-catch patterns
- Look for "End" activities on error paths
- Validate notification on failure
- Check if REST/API activities have error conditions

**Remediation**:
- Add error handling activities after risky operations
- Configure notifications for workflow failures
- Add transition conditions for success/failure paths
- Test error scenarios in UAT

**Severity**: HIGH - Can cause workflows to hang or data to be lost

**Last Updated**: 2025-11-06

---

## Incomplete Update Sets

**Description**: Developer completes a change but doesn't include all related records in the update set. For example, updating a workflow but not including the modified activities.

**How to Catch**:
- Count workflow activities and verify all are in update set
- Check UI policy has corresponding actions
- Verify business rule conditions haven't changed
- Look for orphaned references

**Remediation**:
- Review update set completeness before marking complete
- Use update set preview to catch missing dependencies
- Create checklist of related records to include

**Severity**: HIGH - Causes incomplete deployments

**Last Updated**: 2025-11-06

---

## Variables Copied But Not Relevant

**Description**: When cloning a catalog item, developer keeps all variables from the source item even though some aren't relevant to the new customer or use case.

**How to Catch**:
- Compare variable names/questions to catalog item purpose
- Look for customer-specific variable names from source
- Check for unused variables (not referenced in workflow or scripts)

**Remediation**:
- Remove irrelevant variables
- Rename variables to match new purpose
- Update variable help text and labels

**Severity**: MEDIUM - Confuses users but doesn't break functionality

**Last Updated**: 2025-11-06

---

## Business Rule Infinite Loop

**Description**: Business rule updates a field that triggers itself, creating an infinite loop.

**How to Catch**:
- Check if business rule updates fields that are in its condition
- Look for `current.update()` in display business rules
- Validate execution order with other rules

**Remediation**:
- Add condition to prevent re-triggering: `if (current.changes())`
- Use setAbortAction() for display rules
- Review execution order

**Severity**: CRITICAL - Can cause performance issues or system instability

**Last Updated**: 2025-11-06

---

## Unpublished Workflow Attached

**Description**: Developer attaches a workflow to a catalog item or other record but forgets to publish the workflow, causing it to never run.

**How to Catch**:
- Check `published` field on any workflow references
- Validate workflow can be executed
- Test in UAT before promoting

**Remediation**:
- Publish the workflow
- Test end-to-end execution
- Verify workflow activities are correct

**Severity**: CRITICAL - Workflow never runs, approvals never happen

**Last Updated**: 2025-11-06

---

## Missing Mandatory Field Validation

**Description**: Catalog item or form has fields that should be mandatory but aren't marked as such, allowing incomplete requests.

**How to Catch**:
- Review variable configuration for business-critical fields
- Check UI policies for mandatory conditions
- Test submission without required fields

**Remediation**:
- Mark appropriate variables as mandatory
- Add UI policy to enforce at form level
- Add data policy for backend enforcement

**Severity**: MEDIUM - Causes data quality issues

**Last Updated**: 2025-11-06

---

## Client Script Performance Issues

**Description**: Client script performs expensive operations (queries, loops) on onChange, causing slow form performance.

**How to Catch**:
- Look for GlideAjax in onChange scripts
- Check for loops over large data sets
- Identify unnecessary field updates

**Remediation**:
- Move expensive operations to onLoad or server-side
- Use callback functions properly with GlideAjax
- Cache results when possible
- Consider using asynchronous patterns

**Severity**: MEDIUM - Impacts user experience

**Last Updated**: 2025-11-06

---

## Standard Naming Convention Violations

**Description**: Developer creates components without following organizational naming standards, making them hard to find and maintain.

**How to Catch**:
- Check component names against naming standards
- Look for inconsistent prefixes or suffixes
- Validate scope/namespace usage

**Remediation**:
- Rename component to follow standards
- Update all references to renamed component
- Document naming convention in standards

**Severity**: LOW - Doesn't break functionality but impacts maintainability

**Last Updated**: 2025-11-06

---

## Notes for Standards Document

When these mistakes occur frequently (3+ times), they should be promoted to the standards document as preventive measures rather than reactive checks.

**Pattern Analysis**: This document should be reviewed monthly to identify trends:
- Which mistakes occur most frequently?
- Are mistakes concentrated with certain developers?
- Do certain change types have more issues?
- Are there seasonal patterns (e.g., more mistakes during busy periods)?

**Continuous Improvement**: Use this data to:
- Update training materials
- Create automated checks
- Develop templates that prevent mistakes
- Refine the standards document
