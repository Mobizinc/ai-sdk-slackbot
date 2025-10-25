# Admin UI Deployment Guide

This guide covers deploying the new Next.js admin interface alongside the existing API.

## Overview

The admin interface is a separate Next.js 15 application located in `/admin` that works alongside the main API. It can be deployed in multiple ways.

---

## Deployment Options

### Option 1: Monorepo on Vercel (Recommended)

Deploy both API and admin UI in the same Vercel project.

**Pros:**
- ✅ Single deployment
- ✅ Shared authentication
- ✅ No CORS issues
- ✅ Simpler management

**Steps:**

1. **Update root package.json** to include admin build:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.api.json && cd admin && pnpm install && pnpm build",
    "build:api": "tsc -p tsconfig.api.json",
    "build:admin": "cd admin && pnpm install && pnpm build"
  }
}
```

2. **Update vercel.json** (Option A - Simple):

```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": "admin/.next",
  "redirects": [
    {
      "source": "/",
      "destination": "/admin"
    }
  ]
}
```

**OR** (Option B - Multi-app):

Create `admin/vercel.json`:
```json
{
  "framework": "nextjs",
  "buildCommand": "cd admin && pnpm install && pnpm build",
  "outputDirectory": "admin/.next"
}
```

3. **Deploy:**

```bash
git add admin/
git commit -m "Add Next.js admin interface"
git push
```

Vercel will auto-detect Next.js and deploy to `/admin` route.

---

### Option 2: Separate Vercel Project

Deploy admin as a standalone app.

**Pros:**
- ✅ Independent scaling
- ✅ Separate logs
- ✅ Isolated failures

**Cons:**
- ❌ Need to configure CORS
- ❌ Manage two deployments

**Steps:**

1. **Create new Vercel project** for admin:

```bash
cd admin
vercel
# Follow prompts to create new project
```

2. **Set environment variables:**

```bash
vercel env add NEXT_PUBLIC_ADMIN_TOKEN production
vercel env add VERCEL_URL production
# VERCEL_URL should point to main API (e.g., https://main-api.vercel.app)
```

3. **Update main API CORS** to allow admin domain:

```typescript
// api/admin/config.ts, api/business-contexts.ts, api/admin/queue-stats.ts
headers: {
  'Access-Control-Allow-Origin': 'https://admin.your-domain.com',
  // ...
}
```

4. **Deploy:**

```bash
vercel --prod
```

---

### Option 3: Static Export

Build admin as static files and serve via CDN.

**Pros:**
- ✅ Fast loading
- ✅ Cheap hosting
- ✅ No server needed

**Cons:**
- ❌ No server-side features
- ❌ Need to rebuild for updates

**Steps:**

1. **Update admin/next.config.js:**

```javascript
const nextConfig = {
  output: 'export',
  basePath: '/admin',
  images: {
    unoptimized: true,
  },
}
```

2. **Build:**

```bash
cd admin
pnpm build
# Outputs to admin/out/
```

3. **Upload `admin/out/` to:**
- AWS S3 + CloudFront
- Vercel static hosting
- Netlify
- GitHub Pages

---

## Configuration

### Environment Variables

#### Development (.env.local)
```bash
# No auth required in development
```

#### Production (Vercel)
```bash
# Required for admin access
BUSINESS_CONTEXT_ADMIN_TOKEN=your-secure-random-token-min-32-chars

# Required if admin UI uses the token on client side
NEXT_PUBLIC_ADMIN_TOKEN=your-secure-random-token-min-32-chars

# Optional - API base URL (auto-detected if same deployment)
# VERCEL_URL=https://your-api-domain.vercel.app
```

Generate secure token:
```bash
openssl rand -hex 32
```

### Security Checklist

- [ ] Set strong `BUSINESS_CONTEXT_ADMIN_TOKEN` (32+ characters)
- [ ] Enable HTTPS only (Vercel does this automatically)
- [ ] Restrict admin access (IP whitelist or VPN if needed)
- [ ] Review CORS settings if using separate deployment
- [ ] Rotate admin token periodically
- [ ] Monitor access logs

---

## Testing Before Deployment

### 1. Local Testing

```bash
# Terminal 1: Run main API
cd /path/to/ai-sdk-slackbot
pnpm dev

# Terminal 2: Run admin UI
cd /path/to/ai-sdk-slackbot/admin
pnpm dev
```

Visit: http://localhost:3001/admin

### 2. Build Testing

```bash
cd admin
pnpm build
pnpm start
```

Verify no build errors and app runs correctly.

### 3. API Integration Testing

Test each admin page:
- [ ] Dashboard loads
- [ ] Business Contexts list loads
- [ ] Config page shows settings
- [ ] Monitoring page shows queue stats
- [ ] No console errors
- [ ] Auth works (if enabled)

---

## Deployment Steps (Recommended Path)

### Phase 1: Deploy Admin Beta

1. **Create admin directory** (✅ Done)

2. **Install dependencies:**
```bash
cd admin
pnpm install
```

3. **Test locally:**
```bash
pnpm dev
```

4. **Deploy to /admin-beta route:**

Update `next.config.js`:
```javascript
basePath: '/admin-beta',  // Test route first
```

5. **Commit and push:**
```bash
git add admin/
git commit -m "Add Next.js admin interface (beta)"
git push
```

6. **Test on Vercel:**
Visit: https://your-domain.vercel.app/admin-beta

7. **Verify:**
- All pages load
- API calls work
- No console errors
- Auth works in production

### Phase 2: Switch to /admin

1. **Update next.config.js:**
```javascript
basePath: '/admin',  // Production route
```

2. **Rename old admin:**
```bash
mv admin-interface.html admin-interface.html.backup
```

3. **Update vercel.json redirect:**
```json
{
  "redirects": [
    {
      "source": "/admin.html",
      "destination": "/admin-interface.html.backup"
    }
  ]
}
```

4. **Deploy:**
```bash
git add .
git commit -m "Switch to new Next.js admin interface"
git push
```

5. **Verify and retire old HTML:**

After confirming new admin works for 1 week:
```bash
git rm admin-interface.html
git rm frontend/admin-interface.ts
git rm api/admin.ts
git commit -m "Retire old static admin interface"
```

---

## Rollback Plan

If issues occur:

1. **Revert to old admin:**
```bash
git revert HEAD
git push
```

2. **Or change basePath:**
```javascript
// admin/next.config.js
basePath: '/admin-old',
```

3. **Restore old admin route:**
Rename `admin-interface.html.backup` back to `admin-interface.html`

---

## Monitoring

### Vercel Logs

Check deployment logs:
```bash
vercel logs
```

### Build Status

Check build output for errors:
```
Vercel Dashboard → Deployments → Select deployment → Build Logs
```

### Runtime Errors

Check function logs:
```
Vercel Dashboard → Deployments → Select deployment → Function Logs
```

---

## Performance

### Bundle Size

Next.js automatically optimizes:
- Code splitting per route
- Tree shaking
- Image optimization
- Font optimization

### Loading Speed

First load should be < 1s on fast connection.

### Caching

Static assets cached aggressively.
API responses cached per endpoint configuration.

---

## Maintenance

### Adding New Pages

1. Create page in `app/your-page/page.tsx`
2. Add to navigation in `components/Navigation.tsx`
3. Test locally
4. Deploy

### Adding New API Endpoints

1. Create endpoint in parent `/api/admin/your-endpoint.ts`
2. Add method to `lib/api-client.ts`
3. Use in React components
4. Test and deploy

### Updating Dependencies

```bash
cd admin
pnpm update
pnpm audit
```

Test thoroughly before deploying updates.

---

## Troubleshooting

### "Module not found" errors

```bash
cd admin
rm -rf node_modules .next
pnpm install
pnpm build
```

### Build timing out on Vercel

Increase function duration in `vercel.json`:
```json
{
  "functions": {
    "admin/**": {
      "maxDuration": 60
    }
  }
}
```

### API calls failing with 401/403

- Check `NEXT_PUBLIC_ADMIN_TOKEN` matches `BUSINESS_CONTEXT_ADMIN_TOKEN`
- Verify token is being sent in Authorization header
- Check Vercel environment variables are set

### Styles not loading

- Verify Tailwind CSS is configured correctly
- Check `globals.css` is imported in layout
- Run `pnpm build` to see CSS build errors

---

## Current Status

**Phase 1: Foundation** - ✅ COMPLETE

- ✅ Next.js 15 application initialized
- ✅ Tailwind CSS + custom theme
- ✅ Navigation with routing
- ✅ API client with TypeScript
- ✅ 4 main pages created
- ✅ Responsive design
- ✅ Ready for deployment testing

**Next:** Deploy to /admin-beta for testing, then proceed with Phase 2 (CRUD forms).

---

**Last Updated:** 2025-10-24
**Version:** 0.1.0 (Phase 1)
**Status:** Ready for Beta Deployment
