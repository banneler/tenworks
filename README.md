# TenWorks

ERP + CRM for an architectural fabrication shop: projects, proposals, schedule, shop floor,
inventory, talent, and a CRM side (deals, accounts, contacts, campaigns, sequences, social).

Production: https://tenworks.vercel.app

## Architecture
- **Frontend:** static HTML pages at the repo root, one ES-module script per page in `js/`,
  styles in `css/style.css`. No build step and no framework.
- **Navigation:** `js/nav-loader.js` injects `partials/nav-erp.html` or `partials/nav-crm.html`
  into `#nav-container`, then sets `window.__navReady` and dispatches `navReady`.
- **Data:** Supabase (Postgres + Auth + RLS). The browser uses the public anon key from
  `js/shared_constants.js`. Admins are marked by `user_metadata.is_admin`.
- **Serverless API (Vercel functions):**
  - `api/ai.mjs` is `POST /api/ai {action, ...}` and dispatches to `api/_lib/handlers/*.mjs`
    (global-search, daily briefing, account briefing, social posts, sequence steps, and others).
    It needs a Supabase bearer token.
  - `api/admin.mjs` is `POST /api/admin {action:'update-user', ...}` and is admin-only.
  - Front-end callers use `invokeApi()` in `js/shared_constants.js`.
- **Legacy:** the Supabase edge functions are kept for reference and fallback. Don't delete them.
- **Migrations:** `supabase/migrations/`.

## Environment variables (Vercel project)
| Name | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | anon key (server-side auth checks) |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key (admin actions only; never ship to the browser) |
| `GEMINI_API_KEY` | Google Gemini key for the AI actions |
| `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL` | optional model overrides (see `api/_lib/env.mjs`) |

## Local development
```bash
npx vercel link        # once
npx vercel env pull    # writes .env.local
npx vercel dev         # serves the pages and /api on http://localhost:3000
```

## Deploy
Push to `main`. Vercel builds automatically (`vercel.json` sets `outputDirectory: "."`).

## Smoke test
```bash
node scripts/smoke.mjs                       # production
node scripts/smoke.mjs http://localhost:3000 # local
SMOKE_TOKEN=<access token> node scripts/smoke.mjs   # adds an authenticated search
```
The smoke test checks that every page and core asset returns 200. It also checks that every
`/api/ai` action and `/api/admin` are deployed and reject unauthenticated calls. It does not
spend AI quota.
