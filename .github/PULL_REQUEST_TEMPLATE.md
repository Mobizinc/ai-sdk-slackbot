## Description
<!-- Provide a brief description of the changes in this PR -->

## Type of Change
<!-- Check the relevant box -->
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Database schema change (requires migration)
- [ ] Configuration change (environment variables, deployment settings)
- [ ] Documentation update

## Related Issues
<!-- Link to related GitHub issues -->
Closes #

## Testing
<!-- Describe the tests you ran to verify your changes -->

### Test Environment
- [ ] Tested locally with `vercel dev`
- [ ] Tested on preview deployment
- [ ] Tested on staging environment
- [ ] Tested database migration (if applicable)

### Test Cases
<!-- List specific test cases -->
1.
2.
3.

## Database Changes
<!-- If this PR includes database schema changes, check all that apply -->
- [ ] No database changes
- [ ] Schema changes included (migrations generated via `pnpm db:generate`)
- [ ] Migration tested on dev database branch
- [ ] Rollback procedure documented
- [ ] Production migration plan reviewed

### Migration Details
<!-- If applicable, describe the migration -->
- **Tables affected:**
- **Migration file:**
- **Rollback strategy:**

## Deployment Plan
<!-- Describe the deployment strategy for this change -->

### Environment Deployment Order
- [ ] Dev → Preview deployment (automatic)
- [ ] Staging → Merge to `staging` branch
- [ ] Production → Merge to `main` branch (requires approval)

### Pre-Deployment Checklist
- [ ] All CI checks passing
- [ ] Code review approved
- [ ] Environment variables updated (if needed)
- [ ] Database migrations tested
- [ ] Documentation updated

## Screenshots/Logs
<!-- If applicable, add screenshots or relevant logs -->

## Additional Notes
<!-- Any additional information reviewers should know -->

---

## Reviewer Checklist
<!-- For reviewers -->
- [ ] Code follows project style guidelines
- [ ] Tests are adequate and passing
- [ ] Documentation is updated
- [ ] No sensitive data exposed (API keys, passwords, etc.)
- [ ] Database changes are safe and reversible
- [ ] Deployment plan is clear
