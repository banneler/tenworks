import { json } from '../../_lib/http.mjs';
import { requireUser } from '../../_lib/auth.mjs';
import { fail } from '../../_lib/integration-http.mjs';
import { assertOrgIntegrationsEnabled, getUserIntegration, listCalendars } from '../../_lib/nylas.mjs';
import { deterministicColorFromKey, extractCalendarHexColor } from '../../_lib/calendar-event-normalize.mjs';

function looksLikeHoliday(cal) {
  const n = String(cal?.name || '').toLowerCase();
  return /\bholidays?\b|\bweather\b|\bbirthdays?\b/.test(n);
}

function normalizeCalendar(cal) {
  const id = cal?.id ? String(cal.id) : null;
  if (!id) return null;
  const name = (cal?.name && String(cal.name).trim()) || 'Calendar';
  const color =
    extractCalendarHexColor(cal) ||
    deterministicColorFromKey(id) ||
    deterministicColorFromKey(name) ||
    null;
  return {
    id,
    name,
    color,
    isPrimary: Boolean(cal?.is_primary ?? cal?.isPrimary),
    readOnly: Boolean(cal?.read_only ?? cal?.readOnly),
    isOwnedByUser: cal?.is_owned_by_user ?? cal?.isOwnedByUser ?? null,
  };
}

export function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function GET(req) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  try {
    await assertOrgIntegrationsEnabled();
    const integration = await getUserIntegration(auth.user.id);
    if (!integration || integration.status !== 'connected' || !integration.nylas_grant_id) {
      return json({
        error: 'Connect Google or Outlook in Settings to use calendar.',
        code: 'not_connected',
      }, 409);
    }
    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get('limit') || 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const result = await listCalendars(integration.nylas_grant_id, { limit });
    const raw = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];
    const calendars = raw
      .map(normalizeCalendar)
      .filter(Boolean)
      .filter((c) => !(c.readOnly && looksLikeHoliday(c)));
    calendars.sort((a, b) => {
      if (a.readOnly !== b.readOnly) return a.readOnly ? 1 : -1;
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return json({
      ok: true,
      provider: integration.provider,
      calendars,
    });
  } catch (error) {
    return fail(error, '[api/integrations/calendar/calendars]');
  }
}
