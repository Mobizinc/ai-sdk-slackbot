# Deployment Steps - Case Triage System

**Branch:** `case-triage-updates`
**PR:** #2 (https://github.com/Mobizinc/ai-sdk-slackbot/pull/2)
**Status:** ✅ All fixes committed and pushed

---

## Option 1: Deploy via PR (Recommended)

### Step 1: Merge PR #2

```bash
# On GitHub:
# 1. Go to https://github.com/Mobizinc/ai-sdk-slackbot/pull/2
# 2. Review changes (33 files, +8,207 lines)
# 3. Click "Merge pull request"
# 4. Vercel will auto-deploy from main branch
```

### Step 2: Verify Vercel Environment Variables

**Go to:** Vercel Dashboard → Your Project → Settings → Environment Variables

**Required (check these are set):**

```bash
# ServiceNow
SERVICENOW_URL=https://mobiz.service-now.com
SERVICENOW_INSTANCE_URL=https://mobiz.service-now.com
SERVICENOW_USERNAME=SVC.Mobiz.Integration.TableAPI.PROD
SERVICENOW_PASSWORD=<from secure storage>
SERVICENOW_CASE_TABLE=x_mobit_serv_case_service_case

# Azure AI Search (for similar cases)
AZURE_SEARCH_ENDPOINT=https://search-sharedservices-rag.search.windows.net
AZURE_SEARCH_KEY=<your-key>
AZURE_SEARCH_INDEX_NAME=case-intelligence-prod

# OpenAI (for embeddings - enables vector search)
OPENAI_API_KEY=<your-key>

# Database
DATABASE_URL=postgresql://...

# Feature flags (NEW - add these if not present)
ENABLE_CASE_CLASSIFICATION=true
CASE_CLASSIFICATION_WRITE_NOTES=true
CASE_CLASSIFICATION_MAX_RETRIES=3

# Webhook security (NEW - generate if not set)
SERVICENOW_WEBHOOK_SECRET=<run: openssl rand -base64 32>
```

**NEW Variables to Add:**
1. `ENABLE_CASE_CLASSIFICATION=true`
2. `CASE_CLASSIFICATION_WRITE_NOTES=true`
3. `SERVICENOW_WEBHOOK_SECRET=<generate with: openssl rand -base64 32>`

### Step 3: Wait for Vercel Deployment

```bash
# Monitor deployment:
# Vercel Dashboard → Deployments
# Wait for "Ready" status (~2-3 minutes)
```

### Step 4: Run Category Sync in Production

**CRITICAL:** After deployment, sync ServiceNow categories to database:

```bash
# Option A: Via Vercel CLI (if you have it)
vercel env pull .env.production
npx tsx scripts/sync-servicenow-categories.ts

# Option B: SSH to production and run script
# (if you have server access)

# Option C: Trigger via API call
# Create an admin endpoint to trigger sync (I can add this if needed)
```

This will:
- Fetch 21 categories from ServiceNow
- Fetch 8 subcategories from ServiceNow
- Store in database for fast lookups

### Step 5: Test Production Webhook

```bash
# Health check:
curl https://slack.mobiz.solutions/api/servicenow-webhook

# Expected response:
{
  "status": "healthy",
  "classification_enabled": true,
  "connectivity": {
    "azure_search": true,
    "database": true,
    "servicenow": true
  }
}

# Test with real case:
npx tsx scripts/test-deployed-webhook.ts SCS0048813
```

---

## Option 2: Deploy Directly from Branch (Faster)

If you want to skip the PR merge:

### Step 1: Deploy Branch Directly

```bash
# Deploy case-triage-updates branch to production:
vercel --prod
```

### Step 2-5: Same as Option 1

(Verify env vars, wait for deployment, run category sync, test)

---

## Post-Deployment Verification

### 1. Test Webhook Health

```bash
curl https://slack.mobiz.solutions/api/servicenow-webhook
```

Should show:
- `classification_enabled: true`
- All connectivity checks passing
- Stats from last 7 days

### 2. Test Classification

```bash
# Send a test webhook (or trigger from ServiceNow):
npx tsx scripts/test-deployed-webhook.ts SCS0048813
```

Expected:
- ✅ Category from real ServiceNow list
- ✅ Similar cases with MSP labels ([Neighbors], etc.)
- ✅ High-quality diagnostic steps
- ✅ Business context (Meditech EHR, etc.)
- ✅ Pattern recognition if applicable
- ✅ No fake KB articles

### 3. Monitor Logs

```bash
vercel logs --follow
```

Watch for:
- `[Case Triage] Using 21 categories from ServiceNow cache` ✅
- `[Azure Search] Found X similar cases using VECTOR SEARCH` ✅
- `[Business Context] Loaded from database: Neighbors` ✅
- `⚠️ PATTERN ALERT: X similar cases from THE SAME CLIENT` (if applicable) ✅

---

## What You Need to Do:

**Minimum (Required):**
1. ✅ Merge PR #2 or deploy branch
2. ✅ Verify environment variables in Vercel (add 3 new ones)
3. ✅ Run category sync after deployment

**Optional (Recommended):**
1. Test webhook with real ServiceNow case
2. Monitor logs for first few classifications
3. Verify work notes in ServiceNow have pattern alerts

---

## No Code Changes Needed

All fixes are already:
- ✅ Committed (10 commits)
- ✅ Pushed to GitHub
- ✅ In PR #2

**Just merge/deploy and add the 3 new environment variables!**

---

## Environment Variables Summary

**Already Set (verify in Vercel):**
- ServiceNow credentials
- Azure Search config
- OpenAI API key
- Database URL

**NEW (add to Vercel):**
```bash
ENABLE_CASE_CLASSIFICATION=true
CASE_CLASSIFICATION_WRITE_NOTES=true
SERVICENOW_WEBHOOK_SECRET=<generate: openssl rand -base64 32>
```

**That's it!** No other changes needed.
