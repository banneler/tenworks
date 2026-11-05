import { json } from '../../_lib/http.mjs';
import { requireUser } from '../../_lib/auth.mjs';
import { fail, readJson } from '../../_lib/integration-http.mjs';
import {
  assertOrgIntegrationsEnabled,
  createEvent,
  getCalendar,
  getUserIntegration,
  listCalendars,
  listEvents,
  updateEvent,
} from '../../_lib/nylas.mjs';
import {
  assertTimelineBusinessHours,
  buildCalendarColorMap,
  buildEventLabelColorMap,
  deterministicColorFromKey,
  extractCalendarHexColor,
  mergeEventLabelColorMap,
  normalizeCalendarEvent,
  parseUnixSeconds,
} from '../../_lib/calendar-event-normalize.mjs';

function looksLikeHolidayCalendar(cal) {
  const n = String(cal?.name || '').toLowerCase();
  return /\bholidays?\b|\bweather\b|\bbirthdays?\b/.test(n);
}

function resolveListCalendarIds(calendarIdParam, calendarsResult, colorByCalendarId) {
  const raw = Array.isArray(calendarsResult?.data)
    ? calendarsResult.data
    : Array.isArray(calendarsResult)
      ? calendarsResult
      : [];
  if (calendarIdParam && calendarIdParam !== 'all') return [String(calendarIdParam)];
  const usable = raw.filter((c) => c?.id && !looksLikeHolidayCalendar(c));
  usable.sort((a, b) => {
    const ar = Boolean(a.read_only ?? a.readOnly);
    const br = Boolean(b.read_only ?? b.readOnly);
    if (ar !== br) return ar ? 1 : -1;
    const ap = Boolean(a.is_primary ?? a.isPrimary);
    const bp = Boolean(b.is_primary ?? b.isPrimary);
    if (ap !== bp) return ap ? -1 : 1;
    return 0;
  });
  const ids = usable.map((c) => String(c.id));
  if (ids.length) return ids;
  if (colorByCalendarId?.has?.('primary')) return ['primary'];
  if (raw[0]?.id) return [String(raw[0].id)];
  return ['primary'];
}

async function requireConnected(req) {
  const auth = await requireUser(req);
  if (auth.response) return auth;
  await assertOrgIntegrationsEnabled();
  const integration = await getUserIntegration(auth.user.id);
  if (!integration || integration.status !== 'connected' || !integration.nylas_grant_id) {
    return {
      response: json({
        error: 'Connect Google or Outlook in Settings to use calendar.',
        code: 'not_connected',
      }, 409),
    };
  }
  return { user: auth.user, integration };
}

export function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function GET(req) {
  try {
    const gate = await requireConnected(req);
    if (gate.response) return gate.response;
    const { integration } = gate;
    const url = new URL(req.url);
    const calendarIdParam = url.searchParams.get('calendarId');
    const limitRaw = Number(url.searchParams.get('limit') || 15);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 15;
    const nowSec = Math.floor(Date.now() / 1000);
    const start = parseUnixSeconds(url.searchParams.get('start')) ?? nowSec;
    const end = parseUnixSeconds(url.searchParams.get('end')) ?? nowSec + 7 * 24 * 60 * 60;

    const calendarsResult = await listCalendars(integration.nylas_grant_id, { limit: 50 }).catch((err) => {
      console.warn('[api/integrations/calendar/events] list calendars failed:', err?.message || err);
      return null;
    });
    const colorByCalendarId = buildCalendarColorMap(calendarsResult, { fillMissing: false });
    const labelColorById = buildEventLabelColorMap(calendarsResult);
    const calendarIds = resolveListCalendarIds(calendarIdParam, calendarsResult, colorByCalendarId);

    const idsNeedingColor = new Set(
      calendarIds.filter((id) => !colorByCalendarId.has(String(id))).map(String)
    );
    idsNeedingColor.add('primary');
    const colorLookups = await Promise.all(
      [...idsNeedingColor].map((calId) =>
        getCalendar(integration.nylas_grant_id, calId)
          .then((payload) => ({ calId, payload }))
          .catch((err) => {
            console.warn('[api/integrations/calendar/events] calendar color lookup failed:', calId, err?.message || err);
            return { calId, payload: null };
          })
      )
    );
    for (const { calId, payload } of colorLookups) {
      if (!payload) continue;
      mergeEventLabelColorMap(labelColorById, payload);
      const hex = extractCalendarHexColor(payload);
      if (hex) {
        colorByCalendarId.set(String(calId), hex);
        const cal = payload?.data || payload || {};
        if (cal.is_primary || cal.isPrimary || calId === 'primary') {
          colorByCalendarId.set('primary', hex);
          if (cal.id != null) colorByCalendarId.set(String(cal.id), hex);
        }
      }
    }
    for (const calId of calendarIds) {
      const key = String(calId);
      if (!colorByCalendarId.has(key)) {
        const fallback = deterministicColorFromKey(key);
        if (fallback) colorByCalendarId.set(key, fallback);
      }
    }

    const calendarColor =
      colorByCalendarId.get('primary') ||
      colorByCalendarId.get(String(calendarIds[0] || '')) ||
      null;

    const perCalLimit = Math.min(100, Math.max(limit, Math.ceil((limit * 2) / Math.max(1, calendarIds.length)) + 5));
    const listResults = await Promise.all(
      calendarIds.map((calId) =>
        listEvents(integration.nylas_grant_id, { calendarId: calId, limit: perCalLimit, start, end }).catch((err) => {
          console.warn('[api/integrations/calendar/events] list events failed for', calId, err?.message || err);
          return null;
        })
      )
    );

    const calListRaw = Array.isArray(calendarsResult?.data)
      ? calendarsResult.data
      : Array.isArray(calendarsResult)
        ? calendarsResult
        : [];
    const nameByCalendarId = new Map();
    for (const cal of calListRaw) {
      if (cal?.id == null) continue;
      const name = (cal.name && String(cal.name).trim()) || null;
      if (name) nameByCalendarId.set(String(cal.id), name);
    }

    const seen = new Set();
    const events = [];
    for (let i = 0; i < listResults.length; i++) {
      const result = listResults[i];
      const calId = calendarIds[i];
      const raw = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];
      const fallbackColor = colorByCalendarId.get(String(calId)) || null;
      const calName = nameByCalendarId.get(String(calId)) || null;
      for (const ev of raw) {
        const id = ev?.id != null ? String(ev.id) : null;
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        if (!ev.calendar_id && !ev.calendarId && calId) ev.calendar_id = calId;
        if (!ev.calendar_name && !ev.calendarName && calName) ev.calendar_name = calName;
        const normalized = normalizeCalendarEvent(ev, {
          calendarColor: fallbackColor,
          colorByCalendarId,
          labelColorById,
        });
        if (normalized.startTime == null) continue;
        if (!normalized.color && fallbackColor) {
          normalized.color = fallbackColor;
          if (!normalized.colorSource) normalized.colorSource = 'calendar';
        }
        events.push(normalized);
      }
    }
    events.sort((a, b) => a.startTime - b.startTime);
    const sliced = events.slice(0, limit);
    const calendarColors = Object.fromEntries(colorByCalendarId.entries());
    const calendars = calendarIds.map((id) => ({
      id: String(id),
      name: nameByCalendarId.get(String(id)) || String(id),
      color: colorByCalendarId.get(String(id)) || null,
    }));
    return json({
      ok: true,
      provider: integration.provider,
      calendarColor,
      calendarIds,
      calendarColors,
      calendars,
      events: sliced,
    });
  } catch (error) {
    return fail(error, '[api/integrations/calendar/events]');
  }
}

async function writeEvent(req) {
  const gate = await requireConnected(req);
  if (gate.response) return gate.response;
  const { integration } = gate;
  const body = await readJson(req);
  if (!body.title && !body.description && req.method === 'POST') {
    return json({ error: 'Event title or description is required.' }, 400);
  }
  const startTime = body.startTime != null ? Number(body.startTime) : null;
  const endTime = body.endTime != null ? Number(body.endTime) : null;
  if (startTime != null && endTime != null) {
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
      return json({ error: 'End time must be after start time.' }, 400);
    }
    assertTimelineBusinessHours(startTime, endTime, body.timezoneOffsetMin, body.localStart, body.localEnd);
  }
  const payload = {
    title: body.title,
    description: body.description,
    startTime: body.startTime,
    endTime: body.endTime,
    calendarId: body.calendarId,
    participants: body.participants,
  };
  if (Object.prototype.hasOwnProperty.call(body, 'colorId')) payload.colorId = body.colorId;
  else if (Object.prototype.hasOwnProperty.call(body, 'color_id')) payload.color_id = body.color_id;

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const eventId = body.eventId || body.id;
    if (!eventId) return json({ error: 'Event id is required to update.' }, 400);
    const result = await updateEvent(integration.nylas_grant_id, eventId, payload);
    return json({ ok: true, provider: integration.provider, from: integration.email, result });
  }
  const result = await createEvent(integration.nylas_grant_id, payload);
  return json({ ok: true, provider: integration.provider, from: integration.email, result });
}

export async function POST(req) {
  try {
    return await writeEvent(req);
  } catch (error) {
    return fail(error, '[api/integrations/calendar/events]');
  }
}

export async function PATCH(req) {
  return POST(req);
}

export async function PUT(req) {
  return POST(req);
}
