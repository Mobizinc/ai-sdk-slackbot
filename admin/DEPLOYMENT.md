# Admin UI Deployment

## Current Status: Built, Not Deployed

The admin UI is complete and builds successfully but requires separate deployment from main API.

## Option 1: Deploy Admin as Separate Vercel Project (Recommended)

**Steps:**
```bash
cd admin
vercel --prod
```

**Environment Variables (Vercel dashboard for admin project):**
```
NEXT_PUBLIC_API_BASE_URL=https://slack.mobiz.solutions
NEXT_PUBLIC_ADMIN_TOKEN=(same as BUSINESS_CONTEXT_ADMIN_TOKEN)
```

**Result:** Admin at `https://admin-ui.vercel.app` or custom domain

---

## Option 2: Configure Main Project Root Directory

**In Vercel Dashboard (slack.mobiz.solutions project):**
1. Settings → General → Root Directory
2. Set to: `admin`
3. Redeploy

**Problem:** This would make admin the main deployment, breaking API functions

---

## Option 3: Use Vercel Monorepo (Complex)

Requires `vercel.json` multi-app configuration - not recommended for current structure.

---

## Recommended: Deploy Admin Separately

**Quick setup:**
```bash
cd admin
vercel login
vercel --prod
# Follow prompts, create new project
```

**Then access at the domain Vercel provides.**

**For custom domain:** Add `admin.mobiz.solutions` → point to admin Vercel project

---

**Current API deployment:** Unaffected, continues to work at slack.mobiz.solutions
