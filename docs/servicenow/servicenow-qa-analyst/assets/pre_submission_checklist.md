# ServiceNow Change Pre-Submission Checklist

Complete this checklist **before** submitting your change for automated QA validation.

**Developer**: ___________________  
**Change Number**: CHG___________  
**Date**: _____________________

---

## 1. Update Set Completeness

- [ ] Update set is committed in UAT
- [ ] Update set state is set to "Complete"
- [ ] Update set contains **ALL** related components:
  - [ ] If workflow changed, all workflow activities included
  - [ ] If UI policy changed, all policy actions included
  - [ ] If catalog item changed, variables and scripts included
  - [ ] If business rule changed, related scripts included
- [ ] No components are missing or left in another update set
- [ ] Update set description is clear and meaningful

---

## 2. Environment Requirements

- [ ] UAT was cloned from Production within last **30 days**
- [ ] If UAT is stale (>30 days), request fresh clone before proceeding
- [ ] All testing performed in UAT environment
- [ ] Components verified to exist in UAT

---

## 3. Testing Requirements

- [ ] Manual end-to-end testing completed in UAT
- [ ] Test results documented (screenshots, test users, date/time)
- [ ] All test scenarios from requirements have been executed
- [ ] Edge cases and error scenarios tested
- [ ] Approval workflows tested with actual approvers (if applicable)
- [ ] No errors in browser console during testing
- [ ] Performance is acceptable (no slow form loads or script timeouts)

---

## 4. Configuration Validation

### For Catalog Items
- [ ] Display name is customer-specific (no "Template", "Copy of", etc.)
- [ ] Short description is accurate and complete
- [ ] Category is assigned appropriately
- [ ] Item is set to Active
- [ ] Icon/picture is set (recommended)
- [ ] Variables are relevant and necessary
- [ ] Mandatory fields are truly required
- [ ] Workflow is attached (if needed)
- [ ] Workflow is **published**

### For Workflows
- [ ] Workflow is published
- [ ] All activities are connected properly
- [ ] No orphaned activities
- [ ] Error handling activities included
- [ ] Notifications configured correctly
- [ ] Approver configuration is correct (no hard-coded sys_ids)
- [ ] Timeout handling implemented (if applicable)

### For Business Rules
- [ ] No hard-coded sys_ids in script
- [ ] No infinite loop potential (checking field changes before updating)
- [ ] Try-catch error handling included
- [ ] Condition logic is correct
- [ ] Execution order reviewed if multiple rules on same table
- [ ] Script follows coding standards (comments, formatting)
- [ ] All referenced fields exist in target environment

### For UI Policies
- [ ] **All parent/child field dependencies have proper conditions**
- [ ] All referenced fields exist on the form
- [ ] No conflicting policies
- [ ] Conditions are correct and tested
- [ ] Show/hide logic works as expected
- [ ] Mandatory field logic is appropriate

### For Client Scripts
- [ ] No expensive operations in onChange events
- [ ] GlideAjax used correctly with callbacks
- [ ] Error handling implemented
- [ ] All referenced fields exist
- [ ] No console.log() statements left in code
- [ ] Script runs on correct UI type (desktop/mobile/both)

---

## 5. Code Quality

- [ ] All scripts have header comments (purpose, author, date, ticket)
- [ ] No console.log() or debug statements
- [ ] Consistent code formatting and indentation
- [ ] Variable names are meaningful
- [ ] No commented-out code blocks
- [ ] No TODO comments
- [ ] Code follows organizational standards

---

## 6. Environment Portability

- [ ] **No hard-coded sys_ids anywhere**
- [ ] No environment-specific URLs or references
- [ ] All queries use names or stable identifiers
- [ ] Configuration will work in Production without modification
- [ ] Tested with data that matches Production patterns

---

## 7. Documentation

- [ ] Change description is clear and complete
- [ ] Business justification is documented
- [ ] Technical design is documented (if complex)
- [ ] **Rollback plan is documented with specific steps**
- [ ] Confluence page created or updated (if applicable)
- [ ] All sys_ids for validation are collected and listed

---

## 8. Standards Compliance

- [ ] Naming conventions followed (customer abbreviation, descriptive name)
- [ ] Component names don't contain generic terms
- [ ] No references to other customers
- [ ] All required fields populated
- [ ] Security/access controls configured appropriately
- [ ] Component placed in correct application scope (if applicable)

---

## 9. Change Request Information

Have you provided all of the following in the change request?

- [ ] Change title
- [ ] Change type (catalog item, workflow, business rule, etc.)
- [ ] Update set name
- [ ] Update set sys_id (if available)
- [ ] Affected tables/components
- [ ] Primary sys_ids to validate (comma-separated)
- [ ] UAT testing completion status
- [ ] Test scenarios executed
- [ ] Expected behavior
- [ ] Documentation/Confluence link
- [ ] Rollback plan

---

## 10. Common Mistake Prevention

Review these common mistakes and confirm they don't apply:

- [ ] Display name updated after cloning (not using source customer name)
- [ ] Workflow is published (not just saved)
- [ ] UI policy includes dependency conditions (parent/child fields)
- [ ] Business rule won't cause infinite loop
- [ ] No hard-coded sys_ids in any scripts
- [ ] Variables are relevant (removed unnecessary ones from cloned items)
- [ ] Error handling exists in workflows and scripts
- [ ] All components from update set are actually needed

---

## 11. Pre-Validation Self-Check

Before submitting, perform these final checks:

- [ ] Open the catalog item/workflow/component in UAT and verify it looks correct
- [ ] Execute the process end-to-end one more time
- [ ] Check ServiceNow logs for any errors or warnings
- [ ] Review the update set items list - does everything belong?
- [ ] Search for your sys_id format in scripts (regex: `[a-f0-9]{32}`)
- [ ] Grep for old customer names or template keywords

---

## Submission

By checking this box, I confirm that:
- [ ] I have completed all applicable items in this checklist
- [ ] I have performed thorough testing in UAT
- [ ] I understand that critical issues will block deployment
- [ ] I have a rollback plan if issues are found
- [ ] I am ready for automated QA validation

**Developer Signature**: ___________________  
**Date**: _____________________

---

## Notes / Additional Information

_Use this space to document anything unusual, known limitations, or specific testing instructions:_

```
[Your notes here]
```

---

**After Submission**:
1. Monitor validation progress
2. Review validation report when complete
3. Address any critical issues or warnings found
4. Update change request with validation results
5. Proceed with deployment approval process

---

**Questions?** Review the [ServiceNow Development Standards](link) or contact your technical lead.
