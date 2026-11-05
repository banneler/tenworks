import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw Object.assign(new Error(`${name} is not configured.`), { status: 503 });
  }
  return value;
}

export function nylasConfigured() {
  return Boolean(process.env.NYLAS_API_KEY && process.env.NYLAS_CLIENT_ID);
}

export function getNylasApiBase() {
  return (process.env.NYLAS_API_URI || 'https://api.us.nylas.com').replace(/\/$/, '');
}

export function getRedirectUri(req) {
  if (process.env.NYLAS_REDIRECT_URI) return process.env.NYLAS_REDIRECT_URI.replace(/\/$/, '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = (req.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim();
  if (!host) {
    throw Object.assign(new Error('Unable to determine Nylas redirect URI.'), { status: 500 });
  }
  return `${proto}://${host}/api/integrations/nylas/callback`;
}

export function getAppOrigin(req) {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN.replace(/\/$/, '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = (req.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim();
  return `${proto}://${host}`;
}

function getStateSecret() {
  return process.env.NYLAS_STATE_SECRET || process.env.NYLAS_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function signState(payload) {
  const secret = getStateSecret();
  if (!secret) {
    throw Object.assign(new Error('No secret available to sign OAuth state.'), { status: 503 });
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyState(state) {
  if (!state || typeof state !== 'string' || !state.includes('.')) {
    throw Object.assign(new Error('Invalid OAuth state.'), { status: 400 });
  }
  const [body, sig] = state.split('.');
  const secret = getStateSecret();
  if (!secret) {
    throw Object.assign(new Error('No secret available to verify OAuth state.'), { status: 503 });
  }
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw Object.assign(new Error('OAuth state signature mismatch.'), { status: 400 });
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw Object.assign(new Error('OAuth state could not be parsed.'), { status: 400 });
  }
  if (!payload?.uid || !payload?.exp || Date.now() > Number(payload.exp)) {
    throw Object.assign(new Error('OAuth state expired.'), { status: 400 });
  }
  return payload;
}

/** Only same-origin relative paths. Blocks protocol-relative and absolute URLs. */
export function safeReturnTo(value, fallback = '/ai-admin.html?tab=integrations') {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes('\n') || value.includes('\r')) {
    return fallback;
  }
  return value;
}

export async function nylasFetch(path, options = {}) {
  const apiKey = requireEnv('NYLAS_API_KEY');
  const response = await fetch(`${getNylasApiBase()}${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
    body: options.body == null ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      (typeof data === 'string' ? data : null) ||
      `Nylas request failed (${response.status}).`;
    throw Object.assign(new Error(message), { status: response.status >= 500 ? 502 : response.status });
  }
  return data;
}

export function buildHostedAuthUrl({ provider, redirectUri, state, loginHint }) {
  const clientId = requireEnv('NYLAS_CLIENT_ID');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    provider,
    state,
  });
  if (loginHint) params.set('login_hint', loginHint);
  return `${getNylasApiBase()}/v3/connect/auth?${params.toString()}`;
}

export async function exchangeCodeForGrant({ code, redirectUri }) {
  const clientId = requireEnv('NYLAS_CLIENT_ID');
  const apiKey = requireEnv('NYLAS_API_KEY');
  return nylasFetch('/v3/connect/token', {
    method: 'POST',
    body: {
      client_id: clientId,
      client_secret: apiKey,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    },
  });
}

export async function destroyGrant(grantId) {
  if (!grantId) return;
  if (!process.env.NYLAS_API_KEY) return;
  try {
    await nylasFetch(`/v3/grants/${encodeURIComponent(grantId)}`, { method: 'DELETE' });
  } catch (error) {
    if (Number(error?.status) !== 404) throw error;
  }
}

export async function sendMessage(grantId, { to, subject, body, cc, bcc }) {
  const toList = (Array.isArray(to) ? to : [to])
    .filter(Boolean)
    .map((email) => (typeof email === 'string' ? { email } : email));
  if (!toList.length) {
    throw Object.assign(new Error('At least one recipient is required.'), { status: 400 });
  }
  return nylasFetch(`/v3/grants/${encodeURIComponent(grantId)}/messages/send`, {
    method: 'POST',
    body: {
      subject: subject || '',
      body: body || '',
      to: toList,
      ...(cc?.length ? { cc: cc.map((email) => (typeof email === 'string' ? { email } : email)) } : {}),
      ...(bcc?.length ? { bcc: bcc.map((email) => (typeof email === 'string' ? { email } : email)) } : {}),
    },
  });
}

function normalizeWritableColorId(event) {
  if (!event || typeof event !== 'object') return undefined;
  const hasColorId = Object.prototype.hasOwnProperty.call(event, 'colorId');
  const hasColor_id = Object.prototype.hasOwnProperty.call(event, 'color_id');
  if (!hasColorId && !hasColor_id) return undefined;
  const raw = hasColorId ? event.colorId : event.color_id;
  if (raw == null || raw === '') return null;
  const key = String(raw).trim();
  if (!/^(1[01]|[1-9])$/.test(key)) return undefined;
  return key;
}

export async function createEvent(grantId, event) {
  const calendarId = event.calendarId || 'primary';
  const start = event.startTime != null ? Number(event.startTime) : Math.floor(Date.now() / 1000) + 3600;
  const end = event.endTime != null ? Number(event.endTime) : start + 3600;
  const colorId = normalizeWritableColorId(event);
  return nylasFetch(`/v3/grants/${encodeURIComponent(grantId)}/events?calendar_id=${encodeURIComponent(calendarId)}`, {
    method: 'POST',
    body: {
      title: event.title || 'Meeting',
      description: event.description || '',
      when: { start_time: start, end_time: end },
      ...(colorId ? { color_id: colorId } : {}),
      ...(event.participants?.length
        ? {
            participants: event.participants.map((p) =>
              typeof p === 'string' ? { email: p } : { email: p.email, name: p.name }
            ),
          }
        : {}),
    },
  });
}

export async function updateEvent(grantId, eventId, event) {
  const id = String(eventId || '').trim();
  if (!id) throw Object.assign(new Error('Event id is required.'), { status: 400 });
  const calendarId = event.calendarId || 'primary';
  const body = {};
  if (event.title != null) body.title = event.title || 'Meeting';
  if (event.description != null) body.description = event.description || '';
  if (event.startTime != null && event.endTime != null) {
    body.when = { start_time: Number(event.startTime), end_time: Number(event.endTime) };
  }
  if (event.participants?.length) {
    body.participants = event.participants.map((p) =>
      typeof p === 'string' ? { email: p } : { email: p.email, name: p.name }
    );
  }
  const colorId = normalizeWritableColorId(event);
  if (colorId !== undefined) body.color_id = colorId;
  return nylasFetch(
    `/v3/grants/${encodeURIComponent(grantId)}/events/${encodeURIComponent(id)}?calendar_id=${encodeURIComponent(calendarId)}`,
    { method: 'PUT', body }
  );
}

export async function listEvents(grantId, { calendarId = 'primary', limit = 20, start, end } = {}) {
  const params = new URLSearchParams({ calendar_id: calendarId, limit: String(limit) });
  if (start != null && Number.isFinite(Number(start))) params.set('start', String(Math.floor(Number(start))));
  if (end != null && Number.isFinite(Number(end))) params.set('end', String(Math.floor(Number(end))));
  return nylasFetch(`/v3/grants/${encodeURIComponent(grantId)}/events?${params.toString()}`);
}

export async function getCalendar(grantId, calendarId = 'primary') {
  const id = calendarId || 'primary';
  return nylasFetch(`/v3/grants/${encodeURIComponent(grantId)}/calendars/${encodeURIComponent(id)}`);
}

export async function listCalendars(grantId, { limit = 50 } = {}) {
  const params = new URLSearchParams({
    limit: String(Math.min(Math.max(Number(limit) || 50, 1), 200)),
  });
  return nylasFetch(`/v3/grants/${encodeURIComponent(grantId)}/calendars?${params.toString()}`);
}

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw Object.assign(new Error('Server misconfigured: Supabase service role missing.'), { status: 500 });
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function throwDb(error) {
  if (!error) return;
  throw Object.assign(new Error(error.message || 'Database error'), { status: 500 });
}

export async function getOrgSettings() {
  const { data, error } = await adminClient().from('org_settings').select('*').eq('id', 1).maybeSingle();
  throwDb(error);
  return data || { id: 1, email_calendar_enabled: true };
}

export async function assertOrgIntegrationsEnabled() {
  const settings = await getOrgSettings();
  if (!settings.email_calendar_enabled) {
    throw Object.assign(new Error('Email & calendar integrations are disabled for this organization.'), { status: 403 });
  }
  return settings;
}

export async function getUserIntegration(userId) {
  const { data, error } = await adminClient()
    .from('user_integrations')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  throwDb(error);
  return data || null;
}

export async function getUserEmailSignature(userId) {
  if (!userId) return '';
  const { data, error } = await adminClient()
    .from('user_settings')
    .select('email_signature')
    .eq('user_id', userId)
    .maybeSingle();
  throwDb(error);
  return String(data?.email_signature || '').trim();
}

export function appendEmailSignature(body, signature) {
  const sig = String(signature || '').trim();
  if (!sig) return body || '';
  const base = String(body || '').replace(/[ \t]+$/gm, '').replace(/\s+$/g, '');
  if (!base) return sig;
  if (base.endsWith(sig)) return base;
  return `${base}\n\n${sig}`;
}

function looksLikeHtml(text) {
  return /<[a-z][\s\S]*>/i.test(String(text || ''));
}

export function plainTextToEmailHtml(text) {
  const value = String(text ?? '');
  if (!value) return '';
  if (looksLikeHtml(value)) return value;
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n/g, '<br>');
}

export async function upsertUserIntegration(row) {
  const { data, error } = await adminClient()
    .from('user_integrations')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .maybeSingle();
  throwDb(error);
  return data || null;
}

export async function deleteUserIntegration(userId) {
  const { error } = await adminClient().from('user_integrations').delete().eq('user_id', userId);
  throwDb(error);
}

export async function markGrantInvalid(grantId) {
  if (!grantId) return;
  const { error } = await adminClient()
    .from('user_integrations')
    .update({ status: 'invalid' })
    .eq('nylas_grant_id', grantId);
  throwDb(error);
}

export function verifyNylasWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.NYLAS_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signatureHeader) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody || '').digest('hex');
  try {
    const a = Buffer.from(String(signatureHeader));
    const b = Buffer.from(digest);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
