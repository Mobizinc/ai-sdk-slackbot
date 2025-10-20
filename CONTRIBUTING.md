# Contributing to AI SDK Slackbot

Thank you for contributing! This document outlines our development workflow and best practices.

## 🌳 Branch Strategy

We use a three-tier branch strategy: **dev → staging → main**

```
main (production)
  ↑ PR only
staging (pre-production)
  ↑ PR only
dev (active development)
  ↑ PR from feature branches
feature/* (individual features)
```

### Branch Descriptions

| Branch | Purpose | Auto-Deploy | Database Branch |
|--------|---------|-------------|-----------------|
| `main` | Production | Vercel Production | `main` (production) |
| `staging` | Pre-production testing | Vercel Staging | `staging` (isolated) |
| `dev` | Active development | Vercel Preview | `dev` (isolated) |
| `feature/*` | Feature development | Vercel Preview | Preview branch |

---

## 🚀 Development Workflow

### 1. Starting New Work

```bash
# Ensure you have the latest code
git checkout dev
git pull origin dev

# Create a feature branch
git checkout -b feature/your-feature-name

# Link to Vercel (first time only)
vercel link

# Pull development environment variables
vercel env pull .env.development.local
```

### 2. Making Changes

```bash
# Make your changes
# Run tests locally
pnpm test

# Build to check for errors
pnpm build

# Test with Vercel dev server (uses dev database)
vercel dev
```

### 3. Database Changes

If you're modifying the database schema:

```bash
# 1. Update schema in lib/db/schema.ts

# 2. Generate migration
pnpm db:generate

# 3. Test migration on dev database
DATABASE_URL=$(grep DATABASE_URL .env.development.local | cut -d '=' -f2) pnpm db:push

# 4. Verify changes
pnpm db:studio
```

### 4. Submitting Changes

```bash
# Commit your changes
git add .
git commit -m "feat: your feature description"

# Push to your feature branch
git push origin feature/your-feature-name

# Create a Pull Request to `dev` branch on GitHub
```

---

## 📝 Pull Request Guidelines

### PR Title Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add user authentication
fix: resolve database connection timeout
docs: update API documentation
chore: upgrade dependencies
refactor: simplify classification logic
```

### PR Process

1. **Create PR to `dev` branch**
   - All feature branches merge to `dev` first
   - Fill out the PR template completely
   - Request review from team members

2. **CI Checks**
   - Build must pass
   - Tests must pass
   - Schema validation (if applicable)

3. **Review & Approval**
   - At least 1 approval required
   - Address all review comments
   - Ensure preview deployment works

4. **Merge**
   - Use "Squash and Merge" for feature branches
   - Delete feature branch after merge

---

## 🗄️ Database Migration Workflow

### Safe Migration Process

```bash
# 1. Create migration on dev branch
pnpm db:generate

# 2. Test on dev database (from Vercel)
DATABASE_URL=$(vercel env pull | grep DATABASE_URL) pnpm db:push

# 3. Commit migration files
git add migrations/
git commit -m "db: add service_offering columns"

# 4. Push and create PR
git push origin feature/your-schema-change

# 5. After merge to dev, test on staging
# (Automatic via Vercel)

# 6. After merge to staging, deploy to production
# (Requires approval and manual trigger)
```

### Migration Safety Checklist

- [ ] Migration is backwards compatible
- [ ] Tested on dev database branch
- [ ] Rollback procedure documented
- [ ] No data loss possible
- [ ] Indexes added for new columns
- [ ] Foreign keys are valid

---

## 🔄 Promotion Workflow

### Dev → Staging

```bash
# When dev is stable and ready for testing
git checkout staging
git pull origin staging

# Create PR from dev to staging
gh pr create --base staging --head dev --title "Promote dev to staging"

# After approval and merge:
# - Vercel automatically deploys to staging environment
# - Staging uses isolated database branch
# - Test all features thoroughly
```

### Staging → Production

```bash
# When staging is verified and ready for production
git checkout main
git pull origin main

# Create PR from staging to main
gh pr create --base main --head staging --title "Release to production"

# After approval:
# - Database migrations run automatically
# - Vercel deploys to production
# - Monitor logs and metrics
```

---

## 🧪 Testing Guidelines

### Local Testing

```bash
# Run unit tests
pnpm test

# Run specific test file
pnpm test path/to/test.ts

# Watch mode for development
pnpm test:watch
```

### Preview Testing

Every push to a branch creates a preview deployment:

1. Check the Vercel bot comment on your PR
2. Click the preview URL
3. Test your changes in the preview environment
4. Each preview has its own database branch

### Integration Testing

Before merging to `staging`:

```bash
# Test with real ServiceNow dev instance
NODE_ENV=development pnpm tsx scripts/test-your-feature.ts

# Test database operations
pnpm db:studio
```

---

## 📂 Project Structure

```
.
├── api/                    # Vercel serverless functions
│   ├── events.ts          # Slack event handler
│   ├── servicenow-webhook.ts  # ServiceNow webhook handler
│   └── cron/              # Scheduled jobs
├── lib/                    # Core application logic
│   ├── db/                # Database schema and repositories
│   ├── services/          # Business logic services
│   ├── tools/             # AI tools and integrations
│   └── schemas/           # TypeScript schemas and types
├── scripts/               # Utility scripts
│   ├── test-*.ts          # Test scripts
│   └── migrate-*.ts       # Migration scripts
├── migrations/            # Drizzle ORM migrations
└── .github/
    └── workflows/         # CI/CD workflows
```

---

## 🔒 Environment Variables

### Development

```bash
# Pull from Vercel (includes dev database URL)
vercel env pull .env.development.local

# Or manually add to .env.local:
DEV_DATABASE_URL=postgresql://...dev-branch...
DEV_SERVICENOW_URL=https://mobizdev.service-now.com
```

### Staging

```bash
# Vercel handles staging environment automatically
# No local configuration needed
```

### Production

```bash
# Managed via Vercel dashboard
# Never commit production credentials
```

---

## 🚨 Emergency Procedures

### Rolling Back a Deployment

```bash
# Via Vercel Dashboard:
# 1. Go to Deployments
# 2. Find the last working deployment
# 3. Click "..." → "Promote to Production"

# Via CLI:
vercel rollback <deployment-url>
```

### Reverting a Database Migration

```bash
# 1. Revert the schema changes in code
git revert <commit-hash>

# 2. Create a down migration
# (Manual SQL to undo changes)

# 3. Apply the revert
DATABASE_URL=<production-url> pnpm db:push
```

---

## 💡 Best Practices

### Code Quality

- Write meaningful commit messages
- Add comments for complex logic
- Keep functions small and focused
- Use TypeScript types strictly
- Follow existing code patterns

### Security

- Never commit secrets or API keys
- Use environment variables for configuration
- Validate all user inputs
- Sanitize database queries
- Review dependencies for vulnerabilities

### Performance

- Minimize database queries
- Use caching where appropriate
- Optimize AI prompts for token efficiency
- Monitor serverless function duration
- Keep bundle size small

---

## 📚 Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Neon Database Branching](https://neon.tech/docs/introduction/branching)
- [Drizzle ORM](https://orm.drizzle.team/)
- [AI SDK by Vercel](https://sdk.vercel.ai/)
- [Slack API](https://api.slack.com/)

---

## ❓ Questions?

- Create an issue on GitHub
- Ask in the team Slack channel
- Review existing PRs for examples

---

Thank you for contributing! 🎉
