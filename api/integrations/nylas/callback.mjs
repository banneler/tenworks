import {
  exchangeCodeForGrant,
  getAppOrigin,
  getRedirectUri,
  safeReturnTo,
  upsertUserIntegration,
  verifyState,
} from '../../_lib/nylas.mjs';

function redirect(location) {
  return new Response(null, { status: 302, headers: { Location: location } });
}

export async function GET(req) {
  const origin = getAppOrigin(req);
  const failTo = (reason, returnTo) => {
    const path = safeReturnTo(returnTo, '/command-center.html');
    const sep = path.includes('?') ? '&' : '?';
    return redirect(`${origin}${path}${sep}integrations=error&reason=${encodeURIComponent(reason)}`);
  };
  try {
    const url = new URL(req.url);
    const errorParam = url.searchParams.get('error');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    let returnTo = '/command-center.html';
    if (state) {
      try {
        returnTo = safeReturnTo(verifyState(state).returnTo, returnTo);
      } catch {
        /* keep default */
      }
    }
    if (errorParam) return failTo(errorParam, returnTo);
    if (!code || !state) return failTo('missing_code', returnTo);

    const payload = verifyState(state);
    returnTo = safeReturnTo(payload.returnTo, '/ai-admin.html?tab=integrations');
    const redirectUri = getRedirectUri(req);
    const token = await exchangeCodeForGrant({ code, redirectUri });
    const grantId = token.grant_id || token.grantId || token.data?.grant_id;
    const email = token.email || token.data?.email || null;
    const provider = payload.provider === 'microsoft' ? 'microsoft' : 'google';
    if (!grantId) {
      throw Object.assign(new Error('Nylas token exchange did not return a grant_id.'), { status: 502 });
    }
    await upsertUserIntegration({
      user_id: payload.uid,
      provider,
      nylas_grant_id: grantId,
      email,
      status: 'connected',
    });
    const sep = returnTo.includes('?') ? '&' : '?';
    return redirect(`${origin}${returnTo}${sep}integrations=connected`);
  } catch (error) {
    console.error('[api/integrations/nylas/callback]', error?.message || error);
    return failTo(error?.message || 'callback_failed', '/command-center.html');
  }
}
