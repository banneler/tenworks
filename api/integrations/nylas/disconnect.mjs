import { json } from '../../_lib/http.mjs';
import { requireUser } from '../../_lib/auth.mjs';
import { fail } from '../../_lib/integration-http.mjs';
import {
  assertOrgIntegrationsEnabled,
  deleteUserIntegration,
  destroyGrant,
  getUserIntegration,
} from '../../_lib/nylas.mjs';

export function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function POST(req) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  try {
    await assertOrgIntegrationsEnabled();
    const integration = await getUserIntegration(auth.user.id);
    if (integration?.nylas_grant_id) {
      await destroyGrant(integration.nylas_grant_id);
    }
    await deleteUserIntegration(auth.user.id);
    return json({ ok: true });
  } catch (error) {
    return fail(error, '[api/integrations/nylas/disconnect]');
  }
}
