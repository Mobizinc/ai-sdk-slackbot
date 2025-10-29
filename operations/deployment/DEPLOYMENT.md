# Deployment Guide

This document outlines the deployment process for AI SDK Slackbot across dev, staging, and production environments.

---

## 🌍 Environments

| Environment | Branch | Database | Vercel Domain | Purpose |
|-------------|--------|----------|---------------|---------|
| Development | `dev` | `dev` branch | `*-dev.vercel.app` | Active development |
| Staging | `staging` | `staging` branch | `*-staging.vercel.app` | Pre-production testing |
| Production | `main` | `main` branch | Custom domain | Live production |

---

## 🚀 Deployment Process

### 1. Feature Development (dev)

```bash
# Create feature branch
git checkout dev
git checkout -b feature/your-feature

# Make changes, commit, push
git add .
git commit -m "feat: your feature"
git push origin feature/your-feature

# Create PR to dev branch
gh pr create --base dev --head feature/your-feature
```

**Automatic Actions:**
- ✅ Vercel creates preview deployment
- ✅ CI runs build and tests
- ✅ Preview uses isolated database branch
- ✅ Schema validation (if schema changed)

**Merge Process:**
1. Get approval from team member
2. Ensure all CI checks pass
3. Test preview deployment
4. Squash and merge to `dev`

---

### 2. Promote to Staging

When `dev` is stable and ready for testing:

```bash
# Create PR from dev to staging
git checkout staging
git pull origin staging
gh pr create --base staging --head dev --title "Promote dev to staging"
```

**Automatic Actions:**
- ✅ Vercel deploys to staging environment
- ✅ Uses staging database branch (isolated from production)
- ✅ All CI checks run
- ✅ Schema migrations applied automatically

**Testing Checklist:**
- [ ] Core features work correctly
- [ ] ServiceNow integration works
- [ ] Database migrations applied successfully
- [ ] No errors in Vercel function logs
- [ ] Performance is acceptable
- [ ] Test with real Slack workspace (if applicable)

**Approval:**
- Requires 1+ approvals
- All tests must pass
- Staging deployment must be verified

---

### 3. Production Release

When staging is verified and ready:

```bash
# Create PR from staging to main
git checkout main
git pull origin main
gh pr create --base main --head staging --title "Production Release: YYYY-MM-DD"
```

**Pre-Deployment Checklist:**
- [ ] All staging tests passed
- [ ] Database migrations tested
- [ ] Rollback plan documented
- [ ] Team notified of deployment
- [ ] Monitor/alerting ready
- [ ] Off-hours deployment if breaking changes

**Automatic Actions:**
- ✅ Vercel deploys to production
- ✅ Database migrations run on main branch
- ✅ Production URLs updated
- ✅ Previous deployment available for rollback

**Post-Deployment:**
1. Monitor Vercel logs for errors
2. Check key metrics (response times, error rates)
3. Verify database migrations succeeded
4. Test critical paths manually
5. Be ready to rollback if issues arise

---

## 🗄️ Database Migrations

### Safe Migration Strategy

**Development:**
```bash
# Make schema changes
vim lib/db/schema.ts

# Generate migration
pnpm db:generate

# Test on dev database
DATABASE_URL=$(grep DATABASE_URL .env.development.local | cut -d '=' -f2) pnpm db:push

# Verify in Drizzle Studio
pnpm db:studio
```

**Staging:**
- Migrations auto-apply when PR merges to `staging`
- Vercel uses staging database branch
- Test thoroughly before production

**Production:**
- Migrations auto-apply when PR merges to `main`
- Monitor logs during deployment
- Verify no errors in migration

### Migration Best Practices

✅ **Do:**
- Add nullable columns first
- Create indexes separately
- Test rollback procedure
- Add column, backfill data, add NOT NULL in separate deploys
- Use `IF NOT EXISTS` / `IF EXISTS` for safety

❌ **Don't:**
- Remove columns without deprecation period
- Rename columns directly (use add + copy + remove)
- Drop tables without backup
- Make breaking schema changes without coordination

---

## 🔄 Rollback Procedures

### Application Rollback (Code)

**Via Vercel Dashboard:**
1. Go to project → Deployments
2. Find last working deployment
3. Click "..." → "Promote to Production"

**Via CLI:**
```bash
# List recent deployments
vercel ls

# Rollback to specific deployment
vercel rollback <deployment-url>
```

### Database Rollback (Schema)

**Option 1: Revert Code + Down Migration**
```bash
# Revert the commit
git revert <commit-hash>

# Push to trigger deployment
git push origin main

# Database automatically uses previous schema
```

**Option 2: Manual SQL Rollback**
```bash
# Connect to production database
psql $DATABASE_URL

# Run manual rollback SQL
ALTER TABLE table_name DROP COLUMN column_name;

# Document the rollback
git commit -m "docs: rollback migration for X"
```

---

## 🔐 Environment Variables

### Adding New Variables

```bash
# Add to all environments
vercel env add VARIABLE_NAME

# Or add to specific environment
vercel env add VARIABLE_NAME production
vercel env add VARIABLE_NAME staging
vercel env add VARIABLE_NAME development
```

### Pulling Variables Locally

```bash
# Development
vercel env pull .env.development.local

# Staging
vercel env pull --environment=staging .env.staging.local

# Production (be careful!)
vercel env pull --environment=production .env.production.local
```

### Sensitive Variables

Never commit:
- Database URLs
- API keys
- Secrets
- Passwords
- Tokens

Always use Vercel environment variables or secrets manager.

---

## 📊 Monitoring

### Key Metrics to Watch

**Vercel Dashboard:**
- Function execution time
- Error rate
- Cold start frequency
- Build duration

**Neon Dashboard:**
- Database connections
- Query performance
- Storage usage
- Branch count

**Application Logs:**
- Classification failures
- ServiceNow API errors
- Slack API rate limits
- QStash delivery failures

---

## 🚨 Emergency Procedures

### Critical Bug in Production

1. **Immediate Rollback**
   ```bash
   vercel rollback <last-working-deployment>
   ```

2. **Create Hotfix**
   ```bash
   git checkout main
   git checkout -b hotfix/critical-bug
   # Fix the bug
   git commit -m "hotfix: critical bug description"
   git push origin hotfix/critical-bug
   ```

3. **Emergency Merge**
   - Create PR to `main` (skip staging for critical fixes)
   - Get emergency approval
   - Merge and deploy
   - Backport to `staging` and `dev` after

### Database Corruption

1. **Stop writes** (if possible)
2. **Restore from Neon backup**
   - Neon automatically creates backups
   - Restore from latest working point
3. **Verify data integrity**
4. **Resume operations**

### Service Outage

1. **Check Vercel status**: https://www.vercel-status.com/
2. **Check Neon status**: https://neonstatus.com/
3. **Check Slack API status**: https://status.slack.com/
4. **Review function logs** for specific errors
5. **Scale resources** if needed (Vercel Pro plan)

---

## 📚 Useful Commands

```bash
# View recent deployments
vercel ls

# View deployment logs
vercel logs <deployment-url>

# Check build logs
vercel inspect <deployment-url>

# Test production environment locally
vercel dev --prod

# Pull latest code and database state
git pull && vercel env pull

# Run database migrations locally
pnpm db:push

# Open database studio
pnpm db:studio

# View deployment URL
vercel alias ls
```

---

## 🎯 Deployment Checklist

### Before Every Deploy

- [ ] All tests passing
- [ ] Code review approved
- [ ] Database migrations tested
- [ ] Breaking changes documented
- [ ] Environment variables updated
- [ ] Rollback plan ready

### During Deploy

- [ ] Monitor Vercel logs
- [ ] Watch for errors
- [ ] Verify migrations succeed
- [ ] Check function execution

### After Deploy

- [ ] Verify key functionality
- [ ] Check error rates
- [ ] Monitor performance
- [ ] Update changelog
- [ ] Notify team

---

## 📞 Support

If you encounter issues during deployment:

1. Check this documentation
2. Review Vercel logs
3. Check Neon database logs
4. Contact team in Slack
5. Create incident report if critical

---

## 🔗 Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Neon Branching Guide](https://neon.tech/docs/introduction/branching)
- [Drizzle ORM Migrations](https://orm.drizzle.team/docs/migrations)
- [GitHub Actions](https://docs.github.com/en/actions)

---

Last updated: 2025-10-16
