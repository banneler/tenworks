import { json } from '../../_lib/http.mjs';
import { requireUser } from '../../_lib/auth.mjs';
import { fail, readJson } from '../../_lib/integration-http.mjs';
import {
  assertOrgIntegrationsEnabled,
  buildHostedAuthUrl,
  getRedirectUri,
  nylasConfigured,
  safeReturnTo,
  signState,
} from '../../_lib/nylas.mjs';

const PROVIDERS = new Set(['google', 'microsoft']);

export function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function POST(req) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  try {
    if (!nylasConfigured()) {
      return json({
        error: 'Nylas is not configured on this deployment yet. Set NYLAS_CLIENT_ID and NYLAS_API_KEY, then connect again.',
        code: 'nylas_not_configured',
      }, 503);
    }
    await assertOrgIntegrationsEnabled();
    const body = await readJson(req);
    const provider = String(body.provider || '').toLowerCase();
    if (!PROVIDERS.has(provider)) {
      return json({ error: 'provider must be "google" or "microsoft".' }, 400);
    }
    const redirectUri = getRedirectUri(req);
    const returnTo = safeReturnTo(body.returnTo, '/ai-admin.html?tab=integrations');
    const state = signState({
      uid: auth.user.id,
      provider,
      returnTo,
      exp: Date.now() + 15 * 60 * 1000,
    });
    const authUrl = buildHostedAuthUrl({
      provider,
      redirectUri,
      state,
      loginHint: auth.user.email || undefined,
    });
    return json({ authUrl, provider });
  } catch (error) {
    return fail(error, '[api/integrations/nylas/auth-url]');
  }
}
