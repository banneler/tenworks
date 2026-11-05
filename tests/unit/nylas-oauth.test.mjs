import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { safeReturnTo, signState, verifyState } from '../../api/_lib/nylas.mjs';
import { POST as authUrl } from '../../api/integrations/nylas/auth-url.mjs';
import { GET as statusGet } from '../../api/integrations/status.mjs';

describe('nylas oauth state', () => {
    it('rejects open redirects', () => {
        assert.equal(safeReturnTo('https://evil.example'), '/ai-admin.html?tab=integrations');
        assert.equal(safeReturnTo('//evil.example'), '/ai-admin.html?tab=integrations');
        assert.equal(safeReturnTo('/command-center.html?x=1'), '/command-center.html?x=1');
    });

    it('round-trips a signed state payload', () => {
        process.env.NYLAS_STATE_SECRET = 'test-state-secret';
        const state = signState({ uid: 'user-1', provider: 'google', returnTo: '/ai-admin.html?tab=integrations', exp: Date.now() + 60_000 });
        const payload = verifyState(state);
        assert.equal(payload.uid, 'user-1');
        assert.equal(payload.provider, 'google');
    });

    it('refuses an unauthenticated status read', async () => {
        process.env.SUPABASE_URL = 'https://example.supabase.co';
        process.env.SUPABASE_ANON_KEY = 'anon';
        const previous = global.fetch;
        global.fetch = async () => new Response('no', { status: 401 });
        try {
            const res = await statusGet(new Request('http://localhost/api/integrations/status'));
            assert.equal(res.status, 401);
        } finally {
            global.fetch = previous;
        }
    });

    it('explains a missing Nylas deployment instead of throwing', async () => {
        process.env.SUPABASE_URL = 'https://example.supabase.co';
        process.env.SUPABASE_ANON_KEY = 'anon';
        delete process.env.NYLAS_API_KEY;
        delete process.env.NYLAS_CLIENT_ID;
        const previous = global.fetch;
        global.fetch = async (url) => {
            if (String(url).includes('/auth/v1/user')) {
                return new Response(JSON.stringify({ id: 'user-1', email: 'nate@example.com' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            throw new Error(`unexpected fetch ${url}`);
        };
        try {
            const res = await authUrl(new Request('http://localhost/api/integrations/nylas/auth-url', {
                method: 'POST',
                headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: 'google', returnTo: '/ai-admin.html?tab=integrations' }),
            }));
            const body = await res.json();
            assert.equal(res.status, 503);
            assert.equal(body.code, 'nylas_not_configured');
            assert.match(body.error, /NYLAS_CLIENT_ID/);
        } finally {
            global.fetch = previous;
        }
    });

    it('rejects a tampered state', () => {
        process.env.NYLAS_STATE_SECRET = 'test-state-secret';
        const state = signState({ uid: 'user-1', exp: Date.now() + 60_000 });
        const [body] = state.split('.');
        assert.throws(() => verifyState(`${body}.not-the-signature`), /signature mismatch/);
    });
});
