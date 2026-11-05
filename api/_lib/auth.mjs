import { json } from './http.mjs';
// Verifies the Supabase session JWT. Returns { user, token } or { response } (401/500).
export async function requireUser(req) {
  const url = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return { response: json({ error: 'Server misconfigured: Supabase env missing' }, 500) };
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return { response: json({ error: 'Unauthorized' }, 401) };
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${m[1]}` } });
  if (!r.ok) return { response: json({ error: 'Unauthorized' }, 401) };
  const user = await r.json();
  if (!user?.id) return { response: json({ error: 'Unauthorized' }, 401) };
  return { user, token: m[1] };
}
