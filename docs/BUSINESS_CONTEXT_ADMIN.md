# Business Context Admin Interface

## 🔒 Security Overview

The Business Context Admin interface is **secured by default**:

### Development (Safe)
- ✅ Automatically enabled when running `vercel dev` locally
- ✅ No authentication required on localhost
- ✅ HTML interface is **excluded** from production deployment

### Production (Secure)
- ❌ Admin HTML interface is **NOT deployed** to production
- 🔐 API requires Bearer token authentication
- 🔐 API is **disabled by default** unless token is configured

## 🚀 Local Usage (Recommended)

### 1. Start Local Server

```bash
vercel dev
```

### 2. Open Admin Interface

```
http://localhost:3000/api/admin
```

### 3. Manage Business Contexts

- **View**: See all clients, vendors, platforms grouped by type
- **Edit**: Click any card to edit all fields
- **Create**: Click "➕ Add New" to create entities
- **Import**: Click "📥 Import JSON" to bulk import
- **Export**: Click "📤 Export JSON" to download current state

**No authentication needed in development!**

---

## 🌐 Production Access (Advanced)

If you **must** access the admin API in production:

### 1. Generate Admin Token

```bash
openssl rand -base64 32
```

### 2. Add to Vercel Environment Variables

In Vercel Dashboard → Settings → Environment Variables:

```
BUSINESS_CONTEXT_ADMIN_TOKEN=your-generated-token-here
```

### 3. Access API with Bearer Token

```bash
# List all contexts
curl https://your-domain.vercel.app/api/business-contexts \
  -H "Authorization: Bearer your-generated-token-here"

# Get single context
curl https://your-domain.vercel.app/api/business-contexts?id=123 \
  -H "Authorization: Bearer your-generated-token-here"

# Create context
curl https://your-domain.vercel.app/api/business-contexts \
  -X POST \
  -H "Authorization: Bearer your-generated-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "entityName": "New Client",
    "entityType": "CLIENT",
    "industry": "Technology"
  }'

# Update context
curl https://your-domain.vercel.app/api/business-contexts?id=123 \
  -X PUT \
  -H "Authorization: Bearer your-generated-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated description"
  }'

# Delete context
curl https://your-domain.vercel.app/api/business-contexts?id=123 \
  -X DELETE \
  -H "Authorization: Bearer your-generated-token-here"
```

⚠️ **Warning**: Keep your admin token secret! Anyone with the token can modify your business contexts.

---

## 📋 API Reference

### GET /api/business-contexts

List all active business contexts.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "entityName": "Altus Community Healthcare",
      "entityType": "CLIENT",
      "industry": "Healthcare",
      "description": "...",
      "aliases": ["Altus", "Altus Health"],
      "keyContacts": [...],
      "cmdbIdentifiers": [...],
      "isActive": true
    }
  ],
  "count": 12
}
```

### GET /api/business-contexts?id=123

Get single business context by ID.

### POST /api/business-contexts

Create new business context.

**Required fields:**
- `entityName` (string)
- `entityType` ("CLIENT" | "VENDOR" | "PLATFORM")

**Optional fields:**
- `industry`, `description`, `technologyPortfolio`, `serviceDetails`
- `aliases` (array of strings)
- `relatedEntities` (array of strings)
- `keyContacts` (array of objects)
- `slackChannels` (array of objects)
- `cmdbIdentifiers` (array of objects)
- `contextStewards` (array of objects)
- `isActive` (boolean, default: true)

### PUT /api/business-contexts?id=123

Update existing business context. Provide only fields to update.

### DELETE /api/business-contexts?id=123

Delete business context by ID.

---

## 🔐 Security Best Practices

### ✅ DO:
- Use the admin interface locally with `vercel dev`
- Keep admin tokens in Vercel environment variables (never in code)
- Generate strong random tokens (32+ bytes)
- Rotate admin tokens periodically
- Use the command-line `npm run db:import-contexts` for bulk imports

### ❌ DON'T:
- Commit `.env.local` with admin tokens to git
- Share admin tokens in Slack or email
- Deploy the admin HTML interface to production
- Use weak or predictable tokens

---

## 🛠️ Files

- **`api/business-contexts.ts`** - API endpoint (secured with Bearer token in production)
- **`public/business-context-admin.html`** - Admin interface (excluded from production)
- **`.vercelignore`** - Excludes admin HTML from deployment
- **`business-contexts.json`** - Source of truth for bulk imports

---

## 🔄 Workflow Comparison

| Action | Local Admin UI | CLI Import | Production API |
|--------|----------------|------------|----------------|
| **Security** | None (localhost) | None | Bearer token required |
| **Ease of use** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Bulk operations** | Import/Export JSON | ✅ Designed for bulk | Manual API calls |
| **Recommended for** | Day-to-day edits | Initial setup | Automation/scripts |

---

## 🆘 Troubleshooting

### "Business Context Admin API is disabled in production"

**Solution**: The admin token is not configured. Add `BUSINESS_CONTEXT_ADMIN_TOKEN` to Vercel environment variables.

### "Unauthorized. Provide Bearer token in Authorization header"

**Solution**: Include the admin token in the Authorization header:
```
Authorization: Bearer your-token-here
```

### Admin page not loading locally

**Solution**: Make sure you're running `vercel dev` (not `npm run dev`) and accessing `http://localhost:3000`

### Changes not reflected in production

**Solution**:
1. Export JSON from local admin
2. Commit to `business-contexts.json`
3. Run `npm run db:import-contexts` in production (or after deploy)

---

## 📚 Related Documentation

- [BUSINESS_CONTEXTS.md](./BUSINESS_CONTEXTS.md) - Overview of business context system
- [business-contexts.json](./business-contexts.json) - JSON data format
- [scripts/import-business-contexts.ts](./scripts/import-business-contexts.ts) - Import script
