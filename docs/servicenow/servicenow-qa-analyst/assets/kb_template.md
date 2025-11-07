# ServiceNow Change Validation Report

**Change Number**: {CHANGE_NUMBER}  
**Validation Date**: {VALIDATION_DATE}  
**Validated By**: Claude QA Analyst  
**Environment**: {ENVIRONMENT}

---

## Executive Summary

**Overall Status**: {OVERALL_STATUS}

**Risk Assessment**: {RISK_LEVEL}

**Recommendation**: {RECOMMENDATION}

**Quick Stats**:
- ✅ Passed Checks: {PASSED_COUNT}
- ⚠️ Warnings: {WARNING_COUNT}
- ❌ Critical Issues: {CRITICAL_COUNT}

---

## Change Details

**Change Type**: {CHANGE_TYPE}  
**Component**: {COMPONENT_NAME}  
**Component Sys ID**: {COMPONENT_SYS_ID}  
**Update Set**: {UPDATE_SET_NAME}  
**Developer**: {DEVELOPER}

---

## Environment Health Check

### UAT Clone Status
- **Last Cloned**: {CLONE_DATE}
- **Age**: {CLONE_AGE_DAYS} days
- **Status**: {CLONE_STATUS}
- **Risk Level**: {CLONE_RISK_LEVEL}

{CLONE_WARNING_TEXT}

### Schema Validation
{SCHEMA_DIFFERENCES}

---

## Component Validation Results

{COMPONENT_VALIDATIONS}

---

## Critical Issues

{#if CRITICAL_ISSUES_EXIST}
The following critical issues **MUST** be resolved before production deployment:

{CRITICAL_ISSUES_LIST}

{#else}
✅ No critical issues detected.
{/if}

---

## Warnings

{#if WARNINGS_EXIST}
The following warnings should be reviewed and ideally addressed before deployment:

{WARNINGS_LIST}

{#else}
✅ No warnings detected.
{/if}

---

## Passed Validations

{PASSED_CHECKS_LIST}

---

## Dependency Analysis

{DEPENDENCY_ANALYSIS}

---

## Impact Assessment

### Affected Tables
{AFFECTED_TABLES}

### Related Components
{RELATED_COMPONENTS}

### Potential User Impact
{USER_IMPACT}

---

## Risk Assessment

**Overall Risk Level**: {RISK_LEVEL}

### Risk Factors
{RISK_FACTORS}

### Risk Mitigation
{RISK_MITIGATION}

---

## Recommendations

### Required Actions (Before Deployment)
{REQUIRED_ACTIONS}

### Suggested Improvements
{SUGGESTED_IMPROVEMENTS}

### Standards Compliance
{STANDARDS_COMPLIANCE_NOTES}

---

## Evidence

### API Validation Results
```json
{API_RESULTS}
```

### Configuration Review
{CONFIGURATION_DETAILS}

### Test Execution
{TEST_EXECUTION_NOTES}

---

## Rollback Plan Review

{ROLLBACK_PLAN_ASSESSMENT}

---

## Standards Violations

{#if STANDARDS_VIOLATIONS}
{STANDARDS_VIOLATIONS_LIST}
{#else}
✅ No standards violations detected.
{/if}

---

## Next Steps

{NEXT_STEPS}

---

## Appendix: Validation Methodology

This validation was performed using the Mobiz ServiceNow QA Analyst automated validation system, which:

1. ✅ Verified component existence and configuration
2. ✅ Checked dependencies and relationships
3. ✅ Validated against organizational standards
4. ✅ Performed impact analysis
5. ✅ Compared against known issues database
6. ✅ Assessed environment compatibility

**Validation Duration**: {VALIDATION_DURATION} seconds

---

## Contact & Support

For questions about this validation report:
- Review the [ServiceNow Development Standards](link-to-standards)
- Contact your technical lead
- Submit questions to #servicenow-development channel

---

**Report Generated**: {TIMESTAMP}  
**Validation ID**: {VALIDATION_ID}  
**System Version**: 1.0
