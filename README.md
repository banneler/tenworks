# TenWorks

ERP + CRM for an architectural fabrication shop: projects, proposals, schedule, shop floor,
inventory, talent, and a CRM side (deals, accounts, contacts, campaigns, sequences, social).

Production: https://tenworks.vercel.app

Showcase (no login): https://tenworks.vercel.app/sales.html — `sales.html` next to the app.
Nylas calendar and email are ported and ready to connect. With no grant, Command Center and Settings show a connect state. The shop schedule is still Schedule.

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
| `NYLAS_API_KEY` | Nylas API key (also the OAuth client secret) |
| `NYLAS_CLIENT_ID` | Nylas application client id |
| `NYLAS_REDIRECT_URI` | Optional. Default is `{origin}/api/integrations/nylas/callback`. Production: `https://tenworks.vercel.app/api/integrations/nylas/callback` |
| `NYLAS_WEBHOOK_SECRET` | Optional. Verifies `POST /api/integrations/nylas/webhook`. Unsigned webhooks are accepted when this is unset |
| `NYLAS_API_URI` | Optional. Default `https://api.us.nylas.com` |
| `NYLAS_STATE_SECRET` | Optional HMAC for the OAuth `state` parameter. Falls back to `NYLAS_API_KEY`, then the Supabase service role key |
| `APP_ORIGIN` | Optional public origin used when sending the browser back after OAuth |

Apply `supabase/migrations/20261105120000_nylas_integrations.sql` before connecting an account. Admin → System Settings can turn email and calendar off. The flag starts on so the connect screen is visible with no grant.

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
