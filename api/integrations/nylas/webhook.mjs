import { json } from '../../_lib/http.mjs';
import { fail } from '../../_lib/integration-http.mjs';
import { markGrantInvalid, verifyNylasWebhookSignature } from '../../_lib/nylas.mjs';

export function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function GET(req) {
  const challenge = new URL(req.url).searchParams.get('challenge');
  if (challenge) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return json({ ok: true });
}

export async function POST(req) {
  try {
    const raw = await req.text();
    const signature = req.headers.get('x-nylas-signature');
    if (!verifyNylasWebhookSignature(raw, signature)) {
      return json({ error: 'Invalid webhook signature.' }, 401);
    }
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }
    const type = String(payload.type || payload?.data?.object?.type || '').toLowerCase();
    const grantId =
      payload.data?.object?.grant_id ||
      payload.data?.grant_id ||
      payload.grant_id ||
      payload.data?.object?.id;
    if (grantId && (type.includes('grant') || type.includes('invalid') || type.includes('deleted'))) {
      await markGrantInvalid(grantId);
    }
    return json({ ok: true });
  } catch (error) {
    return fail(error, '[api/integrations/nylas/webhook]');
  }
}
