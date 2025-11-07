# ServiceNow Change Comment Template

This template is used for posting automated validation results as work notes/comments to ServiceNow change records.

---

## Standard Comment Format

```
═══════════════════════════════════════════════════════════
ServiceNow QA Analyst - Automated Validation Complete
═══════════════════════════════════════════════════════════

Validation Date: {VALIDATION_DATE} {VALIDATION_TIME} UTC
Environment: {ENVIRONMENT}
Component: {COMPONENT_NAME}
Duration: {VALIDATION_DURATION}s

OVERALL STATUS: {STATUS_EMOJI} {OVERALL_STATUS}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VALIDATION SUMMARY:
✅ Passed Checks: {PASSED_COUNT}
⚠️  Warnings: {WARNING_COUNT}
❌ Critical Issues: {CRITICAL_COUNT}

Risk Level: {RISK_BADGE}

{CRITICAL_SECTION}

{WARNING_SECTION}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ENVIRONMENT HEALTH:
• UAT Clone Age: {CLONE_AGE_DAYS} days {CLONE_STATUS_EMOJI}
• Schema Status: {SCHEMA_STATUS}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RECOMMENDATION: {RECOMMENDATION_TEXT}

Full Validation Report: {KB_ARTICLE_LINK}
Validation ID: {VALIDATION_ID}

═══════════════════════════════════════════════════════════
```

---

## Status Emoji Mapping

```
PASSED → ✅ 
PASSED_WITH_WARNINGS → ⚠️
FAILED → ❌
```

---

## Risk Badge Mapping

```
LOW → 🟢 LOW RISK
MEDIUM → 🟡 MEDIUM RISK  
HIGH → 🔴 HIGH RISK
CRITICAL → 🔴 CRITICAL RISK
```

---

## Critical Section Template

```
❌ CRITICAL ISSUES FOUND ({COUNT}):
{#for each critical issue}
  {ISSUE_NUMBER}. {ISSUE_DESCRIPTION}
     → Fix: {REMEDIATION}
{/for}
```

---

## Warning Section Template

```
⚠️  WARNINGS ({COUNT}):
{#for each warning}
  {WARNING_NUMBER}. {WARNING_DESCRIPTION}
     → Recommendation: {REMEDIATION}
{/for}
```

---

## Recommendation Text Examples

### When PASSED
```
✅ READY FOR DEPLOYMENT

All validations passed. Component meets quality standards and is ready for production deployment. Review the full report for detailed results.
```

### When PASSED_WITH_WARNINGS
```
⚠️ REVIEW RECOMMENDED

All critical checks passed, but {WARNING_COUNT} warning(s) were identified. Review warnings in the full report and consider addressing before deployment. Deployment is not blocked.
```

### When FAILED
```
❌ DEPLOYMENT BLOCKED

{CRITICAL_COUNT} critical issue(s) must be resolved before proceeding to production. Review each issue in the full report, implement fixes, and resubmit for validation.
```

### When UAT is Stale
```
⚠️ UAT ENVIRONMENT STALE

UAT was last cloned {CLONE_AGE_DAYS} days ago (threshold: 30 days). Consider refreshing UAT from Production before final deployment to ensure validation accuracy.
```

---

## Complete Example - PASSED

```
═══════════════════════════════════════════════════════════
ServiceNow QA Analyst - Automated Validation Complete
═══════════════════════════════════════════════════════════

Validation Date: 2025-11-06 14:30:45 UTC
Environment: UAT
Component: ACME - Laptop Request - Hardware
Duration: 12.3s

OVERALL STATUS: ✅ PASSED

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VALIDATION SUMMARY:
✅ Passed Checks: 15
⚠️  Warnings: 0
❌ Critical Issues: 0

Risk Level: 🟢 LOW RISK

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ENVIRONMENT HEALTH:
• UAT Clone Age: 14 days ✅
• Schema Status: No differences detected

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RECOMMENDATION: ✅ READY FOR DEPLOYMENT

All validations passed. Component meets quality standards and is ready for production deployment. Review the full report for detailed results.

Full Validation Report: KB0012345
Validation ID: 789

═══════════════════════════════════════════════════════════
```

---

## Complete Example - FAILED

```
═══════════════════════════════════════════════════════════
ServiceNow QA Analyst - Automated Validation Complete
═══════════════════════════════════════════════════════════

Validation Date: 2025-11-06 10:15:22 UTC
Environment: UAT
Component: GLOBEX - Shared Mailbox Conversion - Automation
Duration: 15.7s

OVERALL STATUS: ❌ FAILED

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VALIDATION SUMMARY:
✅ Passed Checks: 8
⚠️  Warnings: 2
❌ Critical Issues: 3

Risk Level: 🔴 HIGH RISK

❌ CRITICAL ISSUES FOUND (3):
  1. Workflow "GLOBEX Mailbox Approval WF" is not published
     → Fix: Publish the workflow before deploying to production
  
  2. Business rule contains hard-coded sys_id: 2d6a47c7870011100fadcbb6dabb35fb
     → Fix: Replace with query by name or use system property
  
  3. Missing error handling in workflow REST activity
     → Fix: Add error transition and notification on API failure

⚠️  WARNINGS (2):
  1. Catalog item display name contains "Template"
     → Recommendation: Update display name to customer-specific value
  
  2. No icon/picture set for catalog item
     → Recommendation: Add visual icon for better user experience

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ENVIRONMENT HEALTH:
• UAT Clone Age: 22 days ✅
• Schema Status: No differences detected

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RECOMMENDATION: ❌ DEPLOYMENT BLOCKED

3 critical issue(s) must be resolved before proceeding to production. Review each issue in the full report, implement fixes, and resubmit for validation.

Full Validation Report: KB0012346
Validation ID: 790

═══════════════════════════════════════════════════════════
```

---

## Complete Example - PASSED WITH WARNINGS

```
═══════════════════════════════════════════════════════════
ServiceNow QA Analyst - Automated Validation Complete
═══════════════════════════════════════════════════════════

Validation Date: 2025-11-06 16:45:10 UTC
Environment: UAT
Component: INITECH - Employee Onboarding - Service
Duration: 18.2s

OVERALL STATUS: ⚠️ PASSED WITH WARNINGS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VALIDATION SUMMARY:
✅ Passed Checks: 18
⚠️  Warnings: 3
❌ Critical Issues: 0

Risk Level: 🟡 MEDIUM RISK

⚠️  WARNINGS (3):
  1. Variable "Department" could benefit from default value
     → Recommendation: Consider adding default to improve UX
  
  2. Client script has synchronous GlideAjax call
     → Recommendation: Convert to async for better performance
  
  3. No help text on 2 mandatory variables
     → Recommendation: Add help text to guide users

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ENVIRONMENT HEALTH:
• UAT Clone Age: 8 days ✅
• Schema Status: No differences detected

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RECOMMENDATION: ⚠️ REVIEW RECOMMENDED

All critical checks passed, but 3 warning(s) were identified. Review warnings in the full report and consider addressing before deployment. Deployment is not blocked.

Full Validation Report: KB0012347
Validation ID: 791

═══════════════════════════════════════════════════════════
```

---

## Usage Notes

1. **Always post as Work Notes** (not Additional Comments) for internal tracking
2. **Include KB article link** so team can review full details
3. **Use validation ID** for cross-referencing with NeonDB tracking
4. **Keep formatting consistent** for easy scanning in change history
5. **Update change state** based on validation result:
   - PASSED → Move to "Authorize" or "Scheduled"
   - FAILED → Move back to "Assess" with assignment to developer

---

## Formatting Guidelines

- Use box drawing characters (═, ━) for visual separation
- Use emoji sparingly but consistently for status indicators
- Keep line length under 80 characters where possible
- Ensure formatting displays correctly in ServiceNow UI
- Test with ServiceNow's rich text editor if using HTML alternative

---

## HTML Alternative (If Plain Text Doesn't Format Well)

```html
<div style="font-family: monospace; border: 2px solid #333; padding: 10px; background: #f5f5f5;">
  <h3>ServiceNow QA Analyst - Automated Validation Complete</h3>
  <p><strong>Status:</strong> <span style="color: green;">✅ PASSED</span></p>
  <p><strong>Environment:</strong> UAT</p>
  <!-- Rest of content with appropriate HTML styling -->
</div>
```

Note: Use HTML only if ServiceNow instance supports it and plain text formatting is problematic.
