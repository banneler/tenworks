import { json } from '../../_lib/http.mjs';
import { requireUser } from '../../_lib/auth.mjs';
import { fail, readJson } from '../../_lib/integration-http.mjs';
import {
  appendEmailSignature,
  assertOrgIntegrationsEnabled,
  getUserEmailSignature,
  getUserIntegration,
  plainTextToEmailHtml,
  sendMessage,
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
    if (!integration || integration.status !== 'connected' || !integration.nylas_grant_id) {
      return json({
        error: 'Connect Google or Outlook in Settings to send email in-app.',
        code: 'not_connected',
      }, 409);
    }
    const body = await readJson(req);
    const to = body.to;
    if (!to || (Array.isArray(to) && !to.length)) {
      return json({ error: 'Missing "to" recipient.' }, 400);
    }
    const signature = await getUserEmailSignature(auth.user.id);
    const messageBody = plainTextToEmailHtml(appendEmailSignature(body.body, signature));
    const result = await sendMessage(integration.nylas_grant_id, {
      to,
      subject: body.subject,
      body: messageBody,
      cc: body.cc,
      bcc: body.bcc,
    });
    return json({
      ok: true,
      provider: integration.provider,
      from: integration.email,
      signatureApplied: Boolean(signature),
      result,
    });
  } catch (error) {
    return fail(error, '[api/integrations/email/send]');
  }
}
