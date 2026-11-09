// POST /api/admin { action: 'update-user', target_user_id, full_name, monthly_quota, exclude_from_reporting }
// Admin marker = auth user_metadata.is_admin === true (same check js/admin.js uses).
import { createClient } from '@supabase/supabase-js';
import { CORS, json } from './_lib/http.mjs';
import { requireUser } from './_lib/auth.mjs';

export function OPTIONS() { return new Response('ok', { headers: CORS }); }

export async function POST(req) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  if (auth.user.user_metadata?.is_admin !== true) return json({ error: 'Forbidden: admin only' }, 403);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'Server misconfigured: service role missing' }, 500);
  let b; try { b = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  const action = b.action || 'update-user';
  if (action !== 'update-user') return json({ error: `Unknown action: ${action}` }, 400);
  const { target_user_id, full_name, monthly_quota, exclude_from_reporting } = b;
  if (!target_user_id) return json({ error: 'target_user_id is required' }, 400);
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  try {
    const { data: got, error: gErr } = await admin.auth.admin.getUserById(target_user_id);
    if (gErr) throw gErr;
    const meta = { ...(got.user.user_metadata || {}) };
    if (typeof exclude_from_reporting === 'boolean') meta.exclude_from_reporting = exclude_from_reporting;
    if (full_name !== undefined) meta.full_name = full_name;
    const { error: uErr } = await admin.auth.admin.updateUserById(target_user_id, { user_metadata: meta });
    if (uErr) throw uErr;
    const row = { user_id: target_user_id };
    if (full_name !== undefined) row.full_name = full_name;
    if (monthly_quota !== undefined) row.monthly_quota = monthly_quota;
    const { data: existing, error: eErr } = await admin.from('user_quotas').select('id').eq('user_id', target_user_id).maybeSingle();
    if (eErr) throw eErr;
    const q = existing
      ? admin.from('user_quotas').update(row).eq('user_id', target_user_id)
      : admin.from('user_quotas').insert(row);
    const { error: qErr } = await q;
    if (qErr) throw qErr;
    return json({ message: 'User updated successfully' });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
