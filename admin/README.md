# Admin UI - Next.js Application

Modern admin interface for AI Slack Bot built with Next.js 15, React 19, and Tailwind CSS.

## Features

- **Business Context Management** - CRUD operations for clients, vendors, platforms
- **Reports & Analytics** - Missing categories, catalog redirects, escalations
- **Configuration Viewer** - System settings and environment variables
- **Queue Monitoring** - Real-time async triage performance metrics
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Dark Mode Support** - Built-in dark mode theming
- **Type-Safe** - Full TypeScript coverage with type-safe API client

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **UI:** Tailwind CSS + shadcn/ui patterns
- **State:** React hooks + SWR for data fetching
- **Icons:** Lucide React
- **Type Safety:** TypeScript strict mode

## Development

### Prerequisites

- Node.js 20+ and pnpm 8+
- Parent API running (main ai-sdk-slackbot)

### Install Dependencies

```bash
cd admin
pnpm install
```

### Run Development Server

```bash
# In another terminal, run the main API (for example `pnpm dev` from the repo root)
pnpm dev
```

Open [http://localhost:3001/admin](http://localhost:3001/admin) and ensure
`NEXT_PUBLIC_API_BASE_URL` in `.env.local` points to the API host (e.g. `http://localhost:3000`).

### Build for Production

```bash
pnpm build
pnpm start
```

## Project Structure

```
admin/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout with navigation
│   ├── page.tsx                 # Dashboard home page
│   ├── business-contexts/       # Business context management
│   │   └── page.tsx
│   ├── reports/                 # Reports & analytics
│   │   ├── page.tsx             # Reports index
│   │   ├── missing-categories/  # Missing category report
│   │   ├── catalog-redirects/   # Catalog redirect analytics
│   │   └── escalations/         # Escalation dashboard
│   ├── config/                  # Configuration viewer
│   │   └── page.tsx
│   └── monitoring/              # Queue monitoring
│       └── page.tsx
├── components/                   # React components
│   ├── Navigation.tsx           # Top navigation bar
│   └── ui/                      # Reusable UI components
├── lib/                         # Utilities and API client
│   ├── api-client.ts            # Typed API wrapper
│   └── utils.ts                 # Utility functions
├── public/                      # Static assets
├── next.config.js               # Next.js configuration
├── tailwind.config.ts           # Tailwind CSS configuration
├── tsconfig.json                # TypeScript configuration
└── package.json                 # Dependencies
```

## API Integration

The admin UI consumes existing API endpoints (no backend changes required):

### Existing Endpoints (Reused)
- `GET /api/business-contexts` - List all contexts
- `POST /api/business-contexts` - Create context
- `PUT /api/business-contexts?id=X` - Update context
- `DELETE /api/business-contexts?id=X` - Delete context
- `GET /api/admin/config` - Get configuration
- `GET /api/admin/queue-stats` - Get queue statistics

### New Endpoints (To Be Added in Phase 3)
- `GET /api/admin/missing-categories?days=30` - Missing category analytics
- `GET /api/admin/catalog-redirect-stats?clientId=X&days=30` - Catalog redirect metrics
- `GET /api/admin/escalation-stats?days=30` - Escalation analytics

## Authentication

Uses same token-based auth as current admin:

**Development:** No authentication required

**Production:** Requires `BUSINESS_CONTEXT_ADMIN_TOKEN` environment variable

```bash
# In Vercel environment variables
BUSINESS_CONTEXT_ADMIN_TOKEN=your-secure-token-here
NEXT_PUBLIC_ADMIN_TOKEN=your-secure-token-here
```

The admin UI passes the token in the `Authorization: Bearer <token>` header.

## Deployment

### Option 1: Monorepo (Recommended)

Deploy as part of the main Vercel project with admin as a separate app:

```json
// Root vercel.json
{
  "builds": [
    { "src": "api/**/*.ts", "use": "@vercel/node" },
    { "src": "admin/package.json", "use": "@vercel/next" }
  ],
  "routes": [
    { "src": "/admin/(.*)", "dest": "admin/$1" },
    { "src": "/api/(.*)", "dest": "api/$1" }
  ]
}
```

### Option 2: Separate Deployment

Deploy admin as a separate Vercel project:

```bash
cd admin
vercel --prod
```

Set `VERCEL_URL` environment variable to point to main API.

### Option 3: Static Export

Build and serve as static files:

```bash
cd admin
pnpm build
# Outputs to admin/.next
```

Serve via CDN or static hosting.

## Migration from Old Admin

### Phase 1: Foundation (Current)
- ✅ Next.js setup with routing
- ✅ Navigation and layout
- ✅ API client wrapper
- ✅ Business Contexts list (read-only)
- ✅ Config viewer
- ✅ Queue monitoring

### Phase 2: Full CRUD (Next)
- [ ] Business Context create/edit/delete forms
- [ ] Form validation
- [ ] Import/export JSON
- [ ] Success/error notifications

### Phase 3: Reports (After Phase 2)
- [ ] Missing Categories report page
- [ ] Catalog Redirect analytics page
- [ ] Charts and visualizations

### Phase 4: Advanced (After Phase 3)
- [ ] Escalation dashboard
- [ ] Client Settings manager
- [ ] Real-time updates
- [ ] Search functionality

### Phase 5: Production (Final)
- [ ] Security audit
- [ ] Performance optimization
- [ ] Mobile optimization
- [ ] **Retire old admin-interface.html**

## Current Status

**Phase 1: Foundation** - ✅ COMPLETE

- Modern Next.js 15 application
- Fully typed API client
- Responsive navigation
- 4 main pages (Dashboard, Business Contexts, Config, Monitoring)
- Reports section (structure ready)
- Ready for Phase 2 (CRUD forms)

## Contributing

1. Make changes in `/admin` directory
2. Test locally with `pnpm dev`
3. Build with `pnpm build` to verify no errors
4. Commit changes
5. Deploy via Vercel

## Troubleshooting

**Build fails:**
- Check TypeScript errors: `pnpm type-check`
- Verify all dependencies installed: `pnpm install`

**Auth not working:**
- Verify `BUSINESS_CONTEXT_ADMIN_TOKEN` is set
- Check Authorization header is being sent

**API calls failing:**
- Verify parent API is running
- Check CORS headers in API responses
- Verify API endpoints haven't changed

## Next Steps

See deployment documentation: `ADMIN_DEPLOYMENT_GUIDE.md`
