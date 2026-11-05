#!/usr/bin/env node
// Lightweight production smoke test. No dependencies (Node 18+).
//   node scripts/smoke.mjs [baseUrl]
// Optional: SMOKE_TOKEN=<supabase access token> also runs an authenticated global-search.
// Unauthenticated API calls must be rejected (401/403) — that proves the function is deployed
// and auth-gated without spending AI quota.
const BASE = (process.argv[2] || process.env.SMOKE_BASE || 'https://tenworks.vercel.app').replace(/\/$/, '');
const PAGES = ['index','command-center','projects','proposals','schedule','shop','shop-dashboard','shop-settings',
  'inventory','talent','deals','accounts','contacts','campaigns','sequences','social_hub','cognito','admin',
  'ai-admin','mobile','status','reset-password'];
const AI = ['custom-user-social-post','extract-contact-info','generate-custom-suggestion','generate-prospect-email',
  'generate-sequence-steps','generate-social-post','get-account-briefing','get-activity-insight',
  'get-daily-briefing','get-gemini-suggestion','global-search','refine-social-post'];
let fail = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };
const post = (path, body, token) => fetch(BASE + path, { method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body) });

for (const p of PAGES) {
  const t = Date.now(); const r = await fetch(`${BASE}/${p}.html`); const html = await r.text();
  ok(r.ok && /<html/i.test(html), `page ${p}.html ${r.status} ${Date.now() - t}ms`);
}
for (const f of ['js/shared_constants.js','js/nav-loader.js','css/style.css','partials/nav-erp.html']) {
  const r = await fetch(`${BASE}/${f}`); ok(r.ok, `asset ${f} ${r.status}`);
}
for (const a of AI) { const r = await post('/api/ai', { action: a }); ok([401,403].includes(r.status), `api/ai ${a} unauth -> ${r.status}`); }
{ const r = await post('/api/admin', { action: 'update-user' }); ok([401,403].includes(r.status), `api/admin update-user unauth -> ${r.status}`); }
if (process.env.SMOKE_TOKEN) {
  const r = await post('/api/ai', { action: 'global-search', searchTerm: 'a' }, process.env.SMOKE_TOKEN);
  ok(r.ok, `api/ai global-search authed -> ${r.status}`);
}
console.log(fail ? `\n${fail} check(s) failed` : '\nAll checks passed'); process.exit(fail ? 1 : 0);
