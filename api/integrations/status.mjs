import { json } from '../_lib/http.mjs';
import { requireUser } from '../_lib/auth.mjs';
import { fail } from '../_lib/integration-http.mjs';
import { getOrgSettings, getUserIntegration, nylasConfigured } from '../_lib/nylas.mjs';

export function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function GET(req) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  try {
    const [settings, integration] = await Promise.all([
      getOrgSettings(),
      getUserIntegration(auth.user.id),
    ]);
    const connected = Boolean(integration && integration.status === 'connected' && integration.nylas_grant_id);
    return json({
      orgEnabled: Boolean(settings.email_calendar_enabled),
      connected,
      provider: connected ? integration.provider : null,
      email: connected ? integration.email : null,
      status: integration?.status || null,
      nylasConfigured: nylasConfigured(),
      schemaReady: true,
    });
  } catch (error) {
    return fail(error, '[api/integrations/status]');
  }
}
