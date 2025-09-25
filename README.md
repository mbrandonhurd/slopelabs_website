# Avalanche UI Pro Starter (Next.js + TS + Tailwind)

A comprehensive starter for your avalanche forecasting dashboard with:
- **Manifest-driven data loading** (local demo, swap to S3/CDN)
- **MapLibre** for base map + raster overlay
- **Plotly** demo time-series panel
- **Auth guard** (mock JWT cookie via middleware, replace with Auth0/Clerk)
- **Admin area** scaffold
- **Signed URL stub** (`/api/sign`) to later secure S3/R2 objects
- **Dockerfile** and **vercel.json**

## Quickstart
```bash
npm install
# copy env
cp .env.example .env.local
# set AUTH_JWT_SECRET to something random
npm run dev
# open http://localhost:3000/r/south_rockies
# admin requires a demo login
open http://localhost:3000/login
```
Click "Sign in as Pro" or "Admin" to set a cookie.

## Structure
```
app/
  api/
    auth/login, auth/logout         # demo session cookie
    regions/[region]/manifest       # serves public/data/<region>/manifest.json
    sign                            # stub for S3 signed URLs
  admin/                            # protected by middleware
  r/[region]/page.tsx               # region dashboard
  login/page.tsx                    # demo login
components/
  DangerCards, ProblemsChips, MapPanel, TimeseriesPanel, Header
lib/
  api.ts, auth.ts, colors.ts
public/
  data/south_rockies/manifest.json, forecast.json, summary.json
```

## Swap to your pipeline
- Publish artifacts to S3/R2 under versioned paths + write `latest/MANIFEST.json`.
- Point `/api/regions/[region]/manifest` to fetch that **latest** manifest (or proxy to FastAPI).
- For private assets, implement `/api/sign` using AWS SDK v3 to mint **short-lived signed URLs**.

## Production notes
- Replace demo auth with Auth0/Clerk. Use their Next.js SDK and remove `middleware.ts` or adapt it.
- Set Cloudflare or Vercel DNS for your domain; let Vercel manage TLS.
- Cache: short TTL for manifest; long/immutable for versioned artifacts.
