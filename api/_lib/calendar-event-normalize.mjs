/**
 * Shared Nylas → UI calendar event normalization.
 *
 * Timed events use Nylas `when.timespan` unix seconds. Google/Nylas end_time is
 * exclusive (2:00–2:45 → start=S, end=S+2700 → duration 45 minutes).
 */

function parseUnixSeconds(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string" && value.includes("T")) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  // Nylas uses unix seconds; tolerate accidental ms (>= 1e12).
  return n >= 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

/** Normalize provider/calendar hex colors to `#RRGGBB` (or null). */
function normalizeHexColor(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  if (/^#[0-9A-Fa-f]{6}$/.test(withHash)) return withHash.toUpperCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(withHash)) {
    const [, r, g, b] = withHash;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return null;
}

/**
 * Google Calendar EVENT colors — two different systems:
 *
 * 1) Legacy `color_id` / `colorId` ("1"…"11") — Nylas documents this for Google
 *    and may return it top-level or under `metadata` (Java SDK; Node SDK untyped).
 * 2) Named Labels in the Google UI (right-click → Labels: "Work", "Stuff", …) —
 *    Google `eventLabelId` + calendar `labelProperties.eventLabels`
 *    `[{ id, name, backgroundColor }]`. Requires Google's `eventLabelVersion=1`.
 *    Nylas v3 does NOT document or expose eventLabelId / labelProperties
 *    (Calendar has hexColor only; Event has no label fields in the Node SDK).
 *
 * Prefer: label hex (if ever passthrough) → legacy color_id → calendar hex.
 * @see https://developers.google.com/workspace/calendar/api/guides/labels
 * @see https://developer.nylas.com/docs/cookbook/calendar/events/list-events-google/
 */
const GOOGLE_EVENT_COLOR_IDS = Object.freeze({
  1: "#A4BDFC",
  2: "#7AE7BF",
  3: "#DBADFF",
  4: "#FF887C",
  5: "#FBD75B",
  6: "#FFB878",
  7: "#46D6DB",
  8: "#E1E1E1",
  9: "#5484ED",
  10: "#51B749",
  11: "#DC2127",
});

/**
 * Google Calendar *list* colorId (sidebar calendars / 24-swatch palette) → hex.
 * Distinct from event color_id (1–11). Used when Nylas omits hex_color, and as a
 * fallback if a numeric id outside 1–11 appears on an event.
 * @see https://developers.google.com/calendar/api/v3/reference/colors
 */
const GOOGLE_CALENDAR_COLOR_IDS = Object.freeze({
  1: "#AC725E",
  2: "#D06B64",
  3: "#F83A22",
  4: "#FA573C",
  5: "#FF7537",
  6: "#FFAD46",
  7: "#42D692",
  8: "#16A765",
  9: "#7BD148",
  10: "#B3DC6C",
  11: "#FBE983",
  12: "#FAD165",
  13: "#92E1C0",
  14: "#9FE1E7",
  15: "#9FC6E7",
  16: "#4986E7",
  17: "#9A9CFF",
  18: "#B99AFF",
  19: "#C2C2C2",
  20: "#CABDBF",
  21: "#CCA6AC",
  22: "#F691B2",
  23: "#CD74E6",
  24: "#A47AE2",
});

/** Stable distinct palette when provider returns no hex / colorId. */
const FALLBACK_CALENDAR_PALETTE = Object.freeze([
  "#039BE5",
  "#D50000",
  "#F4511E",
  "#F6BF26",
  "#0B8043",
  "#33B679",
  "#8E24AA",
  "#E67C73",
  "#3F51B5",
  "#7986CB",
  "#E4C441",
  "#616161",
]);

/**
 * Map Google/Nylas event `color_id` to `#RRGGBB`.
 * Prefers the event palette (1–11); falls back to the 24-swatch calendar palette.
 */
function colorFromGoogleColorId(colorId) {
  if (colorId == null || colorId === "") return null;
  const key = String(colorId).trim();
  return (
    GOOGLE_EVENT_COLOR_IDS[key] ||
    GOOGLE_EVENT_COLOR_IDS[Number(key)] ||
    GOOGLE_CALENDAR_COLOR_IDS[key] ||
    GOOGLE_CALENDAR_COLOR_IDS[Number(key)] ||
    null
  );
}

/** Map Google calendar-list colorId ("1"…"24") to `#RRGGBB`, or null. */
function colorFromGoogleCalendarColorId(colorId) {
  if (colorId == null || colorId === "") return null;
  const key = String(colorId).trim();
  return GOOGLE_CALENDAR_COLOR_IDS[key] || GOOGLE_CALENDAR_COLOR_IDS[Number(key)] || null;
}

/** Deterministic `#RRGGBB` from calendar id/name so Work ≠ Stuff when hex is missing. */
function deterministicColorFromKey(key) {
  const s = String(key || "").trim();
  if (!s) return null;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Force unsigned — JS `%` of a negative imul result indexes as undefined.
  const idx = (h >>> 0) % FALLBACK_CALENDAR_PALETTE.length;
  return FALLBACK_CALENDAR_PALETTE[idx];
}

/**
 * Resolve a calendar label hex from a Nylas/Google calendar object.
 * Prefers hex_color; falls back to calendar-list colorId / backgroundColor.
 */
function extractCalendarHexColor(calendarPayload) {
  const cal = calendarPayload?.data || calendarPayload || {};
  const meta = cal.metadata && typeof cal.metadata === "object" ? cal.metadata : {};
  const calendarColorId =
    cal.color_id ?? cal.colorId ?? meta.color_id ?? meta.colorId ?? meta.color ?? null;
  return (
    normalizeHexColor(cal.hex_color) ||
    normalizeHexColor(cal.hexColor) ||
    normalizeHexColor(cal.backgroundColor) ||
    normalizeHexColor(cal.background_color) ||
    // Bare `color` may be hex OR a Google colorId ("1"…"24") — try hex first.
    normalizeHexColor(cal.color) ||
    colorFromGoogleCalendarColorId(cal.color) ||
    colorFromGoogleCalendarColorId(calendarColorId) ||
    null
  );
}

/**
 * Build calendar_id → `#RRGGBB` from a Nylas calendars list payload/array.
 * Also indexes `"primary"` to the primary calendar's color when present.
 * When hex is missing, assigns a stable deterministic color per id so labels
 * like Work/Stuff never collapse to the same primary blue.
 */
function buildCalendarColorMap(calendarsPayload, { fillMissing = true } = {}) {
  const raw = Array.isArray(calendarsPayload?.data)
    ? calendarsPayload.data
    : Array.isArray(calendarsPayload)
      ? calendarsPayload
      : [];
  const map = new Map();
  let primaryId = null;
  let primaryColor = null;
  for (const cal of raw) {
    const id = cal?.id != null ? String(cal.id) : null;
    if (!id) continue;
    let color = extractCalendarHexColor(cal);
    if (!color && fillMissing) {
      color = deterministicColorFromKey(id) || deterministicColorFromKey(cal.name);
    }
    if (color) map.set(id, color);
    if (cal?.is_primary || cal?.isPrimary) {
      primaryId = id;
      if (color) {
        primaryColor = color;
        map.set("primary", color);
      }
    }
  }
  if (primaryColor && !map.has("primary")) map.set("primary", primaryColor);
  if (primaryId && map.has(primaryId) && !map.has("primary")) {
    map.set("primary", map.get(primaryId));
  }
  return map;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse Nylas v3 `when` (timespan / time / date / datespan) into unix seconds.
 * Prefers `start_time`/`end_time` (exclusive end); falls back to camelCase / ISO.
 */
function parseEventWhen(whenInput) {
  const when = whenInput || {};
  let startTime = null;
  let endTime = null;
  let allDay = false;

  const startRaw = when.start_time ?? when.startTime ?? when.start;
  const endRaw = when.end_time ?? when.endTime ?? when.end;

  if (startRaw != null && when.start_date == null && when.date == null) {
    // Timed timespan (or ISO start/end). end_time is exclusive.
    startTime = parseUnixSeconds(startRaw);
    endTime = parseUnixSeconds(endRaw);
    if (endTime == null && when.duration != null && startTime != null) {
      const dur = Number(when.duration);
      if (Number.isFinite(dur) && dur > 0) {
        // duration in seconds if large; otherwise treat as minutes.
        endTime = startTime + (dur >= 1000 ? Math.floor(dur) : Math.floor(dur * 60));
      }
    }
  } else if (when.time != null) {
    // Point-in-time → default 60m block for the day timeline.
    startTime = parseUnixSeconds(when.time);
    endTime = startTime != null ? startTime + 3600 : null;
  } else if (when.start_date) {
    allDay = true;
    const startMs = Date.parse(`${when.start_date}T00:00:00Z`);
    const endDate = when.end_date || when.start_date;
    const endMs = Date.parse(`${endDate}T00:00:00Z`);
    startTime = Number.isFinite(startMs) ? Math.floor(startMs / 1000) : null;
    endTime = Number.isFinite(endMs) ? Math.floor(endMs / 1000) : startTime;
  } else if (when.date) {
    allDay = true;
    const ms = Date.parse(`${when.date}T00:00:00Z`);
    startTime = Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
    endTime = startTime;
  }

  return { startTime, endTime, allDay };
}

/**
 * Google legacy event color_id — top-level (Nylas) or under metadata (CLI shape).
 * @see https://developer.nylas.com/docs/cookbook/calendar/events/list-events-google/
 * @see https://cli.nylas.com/guides/manage-google-calendar-cli
 */
function extractEventColorId(ev) {
  const meta = ev?.metadata && typeof ev.metadata === "object" ? ev.metadata : {};
  const raw =
    ev?.color_id ??
    ev?.colorId ??
    meta.color_id ??
    meta.colorId ??
    meta.color ??
    null;
  if (raw == null || raw === "") return null;
  return String(raw);
}

/**
 * Google named event Label id (`eventLabelId`). Nylas does not document this;
 * extract defensively if a future/passthrough payload includes it.
 * @see https://developers.google.com/workspace/calendar/api/guides/labels
 */
function extractEventLabelId(ev) {
  const meta = ev?.metadata && typeof ev.metadata === "object" ? ev.metadata : {};
  const raw =
    ev?.event_label_id ??
    ev?.eventLabelId ??
    meta.event_label_id ??
    meta.eventLabelId ??
    null;
  if (raw == null || raw === "") return null;
  return String(raw);
}

/**
 * Harvest Google `labelProperties.eventLabels` (or snake/passthrough variants)
 * from a Nylas/Google calendar object. Returns [{ id, name, color }].
 */
function extractEventLabelsFromCalendar(calendarPayload) {
  const cal = calendarPayload?.data || calendarPayload || {};
  const meta = cal.metadata && typeof cal.metadata === "object" ? cal.metadata : {};
  const labelProps =
    cal.labelProperties ||
    cal.label_properties ||
    meta.labelProperties ||
    meta.label_properties ||
    null;
  const rawList =
    (labelProps && (labelProps.eventLabels || labelProps.event_labels)) ||
    cal.eventLabels ||
    cal.event_labels ||
    meta.eventLabels ||
    meta.event_labels ||
    null;
  if (!Array.isArray(rawList)) return [];
  const out = [];
  for (const entry of rawList) {
    if (!entry || typeof entry !== "object") continue;
    const id = entry.id != null ? String(entry.id) : null;
    if (!id) continue;
    const color =
      normalizeHexColor(entry.backgroundColor) ||
      normalizeHexColor(entry.background_color) ||
      normalizeHexColor(entry.hex_color) ||
      normalizeHexColor(entry.hexColor) ||
      normalizeHexColor(entry.color) ||
      null;
    const name = (entry.name && String(entry.name).trim()) || null;
    if (!color && !name) continue;
    out.push({ id, name, color });
  }
  return out;
}

/**
 * Build eventLabelId → `{ color, name }` from calendars list/detail payloads.
 * Empty today for Nylas Google grants; ready if labels are ever passthrough.
 */
function buildEventLabelColorMap(calendarsPayload) {
  const raw = Array.isArray(calendarsPayload?.data)
    ? calendarsPayload.data
    : Array.isArray(calendarsPayload)
      ? calendarsPayload
      : calendarsPayload
        ? [calendarsPayload]
        : [];
  const map = new Map();
  for (const cal of raw) {
    for (const label of extractEventLabelsFromCalendar(cal)) {
      const prev = map.get(label.id) || {};
      map.set(label.id, {
        color: label.color || prev.color || null,
        name: label.name || prev.name || null,
      });
    }
  }
  return map;
}

/** Merge labels from one calendar payload into an existing label map. */
function mergeEventLabelColorMap(targetMap, calendarPayload) {
  const map = targetMap instanceof Map ? targetMap : new Map();
  for (const label of extractEventLabelsFromCalendar(calendarPayload)) {
    const prev = map.get(label.id) || {};
    map.set(label.id, {
      color: label.color || prev.color || null,
      name: label.name || prev.name || null,
    });
  }
  return map;
}

/**
 * Normalize a Nylas event for Command Center.
 * @param {object} ev
 * @param {{
 *   calendarColor?: string|null,
 *   colorByCalendarId?: Map<string,string>,
 *   labelColorById?: Map<string,{color?:string|null,name?:string|null}|string>,
 * }} [opts]
 */
function normalizeCalendarEvent(ev, { calendarColor, colorByCalendarId, labelColorById } = {}) {
  const { startTime, endTime, allDay } = parseEventWhen(ev?.when);

  const rawDesc = ev?.text_description || ev?.description || "";
  const description = stripHtml(rawDesc).slice(0, 160) || null;
  const calendarId = ev?.calendar_id || ev?.calendarId || null;
  const colorId = extractEventColorId(ev);
  const eventLabelId = extractEventLabelId(ev);
  const calKey = calendarId != null ? String(calendarId) : "";
  const calendarName =
    (ev?.calendar_name && String(ev.calendar_name).trim()) ||
    (ev?.calendarName && String(ev.calendarName).trim()) ||
    null;

  const labelEntry = eventLabelId && labelColorById?.get?.(String(eventLabelId));
  const labelHex = normalizeHexColor(
    labelEntry && typeof labelEntry === "object" ? labelEntry.color : labelEntry
  );
  const labelName =
    (labelEntry && typeof labelEntry === "object" && labelEntry.name) ||
    (ev?.label_name && String(ev.label_name).trim()) ||
    (ev?.labelName && String(ev.labelName).trim()) ||
    null;

  // Per-event color beats calendar color. Named Google Labels (Work/Stuff) are
  // NOT separate calendars — they share the primary calendar_id.
  let color = null;
  let colorSource = null;
  const fromColorId = colorFromGoogleColorId(colorId);
  if (labelHex) {
    color = labelHex;
    colorSource = "event_label";
  } else if (fromColorId) {
    color = fromColorId;
    colorSource = "color_id";
  } else if (normalizeHexColor(ev?.hex_color) || normalizeHexColor(ev?.hexColor)) {
    color = normalizeHexColor(ev?.hex_color) || normalizeHexColor(ev?.hexColor);
    colorSource = "event_hex";
  } else if (normalizeHexColor(calKey && colorByCalendarId?.get?.(calKey))) {
    color = normalizeHexColor(colorByCalendarId.get(calKey));
    colorSource = "calendar";
  } else if (normalizeHexColor(calendarColor)) {
    color = normalizeHexColor(calendarColor);
    colorSource = "calendar";
  } else if (normalizeHexColor(ev?.color)) {
    color = normalizeHexColor(ev.color);
    colorSource = "event_color_field";
  } else if (calKey === "primary" && normalizeHexColor(colorByCalendarId?.get?.("primary"))) {
    color = normalizeHexColor(colorByCalendarId.get("primary"));
    colorSource = "calendar";
  } else if (calKey) {
    color = deterministicColorFromKey(calKey);
    colorSource = color ? "deterministic" : null;
  }

  return {
    id: ev?.id || null,
    title: (ev?.title && String(ev.title).trim()) || "(No title)",
    description,
    startTime,
    endTime,
    allDay,
    location: ev?.location ? String(ev.location).trim() : null,
    calendarId,
    calendarName,
    colorId: colorId != null && colorId !== "" ? String(colorId) : null,
    eventLabelId,
    labelName,
    color,
    colorSource,
  };
}

/** Command Center day timeline window (local minutes from midnight). */
const TIMELINE_START_MIN = 7 * 60;
const TIMELINE_END_MIN = 18 * 60;

/**
 * Local minutes-from-midnight for a unix timestamp using a browser-style
 * `Date#getTimezoneOffset()` value (minutes to add to local to get UTC).
 */
function localMinutesFromUnix(unixSec, timezoneOffsetMin) {
  const sec = parseUnixSeconds(unixSec);
  if (sec == null || !Number.isFinite(Number(timezoneOffsetMin))) return null;
  const shifted = sec * 1000 - Number(timezoneOffsetMin) * 60 * 1000;
  const d = new Date(shifted);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function parseHhMmToMinutes(timeStr) {
  if (timeStr == null || timeStr === "") return null;
  const m = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Require start/end within 7:00–18:00 local when the client sends either
 * `localStart`/`localEnd` (HH:MM) or `timezoneOffsetMin` (Date#getTimezoneOffset).
 * Skips when neither is provided (backward compatible for non–Command Center callers).
 */
function assertTimelineBusinessHours(startTime, endTime, timezoneOffsetMin, localStart, localEnd) {
  let startMin = parseHhMmToMinutes(localStart);
  let endMin = parseHhMmToMinutes(localEnd);
  if (startMin == null || endMin == null) {
    if (timezoneOffsetMin == null || timezoneOffsetMin === "") return;
    const offset = Number(timezoneOffsetMin);
    if (!Number.isFinite(offset)) return;
    startMin = localMinutesFromUnix(startTime, offset);
    endMin = localMinutesFromUnix(endTime, offset);
  }
  if (startMin == null || endMin == null) {
    throw Object.assign(new Error("Enter a valid date and time."), { status: 400 });
  }
  if (startMin < TIMELINE_START_MIN || endMin > TIMELINE_END_MIN || endMin <= startMin) {
    throw Object.assign(
      new Error("Event times must be between 7:00 AM and 6:00 PM. Use Google or Outlook for earlier or later times."),
      { status: 400 }
    );
  }
}

export {
  parseUnixSeconds,
  normalizeHexColor,
  colorFromGoogleColorId,
  colorFromGoogleCalendarColorId,
  deterministicColorFromKey,
  GOOGLE_EVENT_COLOR_IDS,
  GOOGLE_CALENDAR_COLOR_IDS,
  FALLBACK_CALENDAR_PALETTE,
  extractCalendarHexColor,
  extractEventColorId,
  extractEventLabelId,
  extractEventLabelsFromCalendar,
  buildEventLabelColorMap,
  mergeEventLabelColorMap,
  buildCalendarColorMap,
  parseEventWhen,
  normalizeCalendarEvent,
  TIMELINE_START_MIN,
  TIMELINE_END_MIN,
  localMinutesFromUnix,
  assertTimelineBusinessHours,
};
