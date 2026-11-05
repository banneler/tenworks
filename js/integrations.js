/**
 * Dual-mode email/calendar helper, ported from Constellation js/integrations.js.
 * - Org toggle off → mailto / clipboard, calendar card hidden
 * - Org on + user connected → Nylas send / calendar APIs
 * - Org on + not connected → connect prompt + mailto fallback
 */

let cachedState = null;
let cachedAt = 0;
const CACHE_MS = 15_000;

function openMailto({ to, subject = '', body = '' }) {
    const recipients = Array.isArray(to) ? to.filter(Boolean).join(',') : String(to || '');
    if (!recipients) throw new Error('No email recipient.');
    const href = `mailto:${recipients}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body || '')}`;
    window.open(href, '_blank');
    return { mode: 'mailto', ok: true };
}

async function getAccessToken(supabase) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token;
    if (!token) throw new Error('Your session has expired. Please sign in again.');
    return token;
}

async function callIntegrationsApi(supabase, path, { method = 'GET', body } = {}) {
    const token = await getAccessToken(supabase);
    const response = await fetch(path, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: body == null ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const err = new Error(data?.error || `Request failed (${response.status})`);
        err.status = response.status;
        err.code = data?.code;
        err.data = data;
        throw err;
    }
    return data;
}

function schemaMissing(error) {
    const msg = `${error?.code || ''} ${error?.message || ''}`;
    return /PGRST205|42P01|schema cache|does not exist|org_settings|user_integrations/i.test(msg);
}

function emptyState(extra = {}) {
    return {
        orgEnabled: true,
        connected: false,
        provider: null,
        email: null,
        status: null,
        nylasConfigured: null,
        schemaReady: false,
        ...extra,
    };
}

export async function getIntegrationState(supabase, { force = false } = {}) {
    if (!force && cachedState && Date.now() - cachedAt < CACHE_MS) return cachedState;
    try {
        const data = await callIntegrationsApi(supabase, '/api/integrations/status');
        cachedState = {
            orgEnabled: Boolean(data.orgEnabled),
            connected: Boolean(data.connected),
            provider: data.provider || null,
            email: data.email || null,
            status: data.status || null,
            nylasConfigured: Boolean(data.nylasConfigured),
            schemaReady: data.schemaReady !== false,
        };
    } catch (apiError) {
        try {
            const [{ data: settings, error: settingsError }, { data: { session } }] = await Promise.all([
                supabase.from('org_settings').select('email_calendar_enabled').eq('id', 1).maybeSingle(),
                supabase.auth.getSession(),
            ]);
            if (settingsError) throw settingsError;
            const userId = session?.user?.id;
            let integration = null;
            if (userId) {
                const { data, error } = await supabase
                    .from('user_integrations')
                    .select('provider,email,status,nylas_grant_id')
                    .eq('user_id', userId)
                    .maybeSingle();
                if (error && !schemaMissing(error)) throw error;
                integration = data;
            }
            const orgEnabled = settings ? Boolean(settings.email_calendar_enabled) : true;
            const connected = Boolean(orgEnabled && integration?.status === 'connected' && integration?.nylas_grant_id);
            cachedState = {
                orgEnabled,
                connected,
                provider: connected ? integration.provider : null,
                email: connected ? integration.email : null,
                status: integration?.status || null,
                nylasConfigured: apiError?.code === 'nylas_not_configured' ? false : null,
                schemaReady: true,
            };
        } catch (error) {
            console.warn('[integrations] Failed to load state:', error);
            cachedState = schemaMissing(error)
                ? emptyState()
                : { orgEnabled: false, connected: false, provider: null, email: null, status: null, nylasConfigured: null, schemaReady: false };
        }
    }
    cachedAt = Date.now();
    return cachedState;
}

export function clearIntegrationStateCache() {
    cachedState = null;
    cachedAt = 0;
}

export async function startConnect(supabase, provider, returnTo = window.location.pathname + window.location.search) {
    const data = await callIntegrationsApi(supabase, '/api/integrations/nylas/auth-url', {
        method: 'POST',
        body: { provider, returnTo },
    });
    if (!data?.authUrl) throw new Error('No auth URL returned.');
    window.location.href = data.authUrl;
}

export async function disconnectIntegration(supabase) {
    await callIntegrationsApi(supabase, '/api/integrations/nylas/disconnect', { method: 'POST', body: {} });
    clearIntegrationStateCache();
}

export async function sendEmail(supabase, { to, subject = '', body = '', cc, bcc } = {}, options = {}) {
    const state = await getIntegrationState(supabase, { force: options.forceRefresh });
    const toast = typeof options.onNotice === 'function' ? options.onNotice : () => {};

    if (!state.orgEnabled) {
        return openMailto({ to, subject, body });
    }

    if (!state.connected) {
        toast('Connect Google or Outlook in Settings to send in-app. Opening your email client for now.', 'info');
        const result = openMailto({ to, subject, body });
        return { ...result, prompted: true };
    }

    try {
        await callIntegrationsApi(supabase, '/api/integrations/email/send', {
            method: 'POST',
            body: { to, subject, body, cc, bcc },
        });
        toast('Email sent.', 'success');
        return { mode: 'nylas', ok: true };
    } catch (error) {
        console.error('[integrations] send failed, falling back to mailto:', error);
        toast(error.message || 'In-app send failed. Opening your email client.', 'warning');
        const result = openMailto({ to, subject, body });
        return { ...result, prompted: true, error };
    }
}

export async function listCalendarEvents(supabase, opts = {}) {
    const params = new URLSearchParams();
    if (opts.calendarId) params.set('calendarId', opts.calendarId);
    if (opts.limit != null) params.set('limit', String(opts.limit));
    if (opts.start != null) params.set('start', String(opts.start));
    if (opts.end != null) params.set('end', String(opts.end));
    const qs = params.toString();
    return callIntegrationsApi(supabase, `/api/integrations/calendar/events${qs ? `?${qs}` : ''}`);
}

export async function listCalendars(supabase, opts = {}) {
    const params = new URLSearchParams();
    if (opts.limit != null) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return callIntegrationsApi(supabase, `/api/integrations/calendar/calendars${qs ? `?${qs}` : ''}`);
}

export async function createCalendarEvent(supabase, event = {}, options = {}) {
    const state = await getIntegrationState(supabase, { force: options.forceRefresh });
    const toast = typeof options.onNotice === 'function' ? options.onNotice : () => {};
    if (!state.orgEnabled || !state.connected) {
        toast(
            state.orgEnabled
                ? 'Connect Google or Outlook in Settings to use calendar.'
                : 'Calendar integrations are disabled for this organization.',
            'info'
        );
        return { mode: 'disconnected', ok: false };
    }
    const data = await callIntegrationsApi(supabase, '/api/integrations/calendar/events', {
        method: 'POST',
        body: event,
    });
    toast('Calendar event created.', 'success');
    return { mode: 'nylas', ok: true, data };
}

export async function updateCalendarEvent(supabase, event = {}, options = {}) {
    const state = await getIntegrationState(supabase, { force: options.forceRefresh });
    const toast = typeof options.onNotice === 'function' ? options.onNotice : () => {};
    if (!state.orgEnabled || !state.connected) {
        toast(
            state.orgEnabled
                ? 'Connect Google or Outlook in Settings to edit calendar events.'
                : 'Calendar integrations are disabled for this organization.',
            'info'
        );
        return { mode: 'disconnected', ok: false };
    }
    const eventId = event.eventId || event.id;
    if (!eventId) {
        toast('Missing event id.', 'error');
        return { mode: 'nylas', ok: false };
    }
    const data = await callIntegrationsApi(supabase, '/api/integrations/calendar/events', {
        method: 'PATCH',
        body: { ...event, eventId },
    });
    toast('Calendar event updated.', 'success');
    return { mode: 'nylas', ok: true, data };
}

export function emailActionLabel(state) {
    if (state?.orgEnabled && state?.connected) return 'Send Email';
    return 'Send with Email Client';
}

export function handleIntegrationsQueryToast(showToastFn) {
    try {
        const params = new URLSearchParams(window.location.search);
        const flag = params.get('integrations');
        if (!flag) return;
        if (flag === 'connected') showToastFn?.('Email & calendar connected.', 'success');
        else if (flag === 'error') {
            const reason = params.get('reason') || 'Connection failed.';
            showToastFn?.(decodeURIComponent(reason), 'error');
        }
        params.delete('integrations');
        params.delete('reason');
        const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', next);
        clearIntegrationStateCache();
    } catch (_) {
        /* ignore */
    }
}
