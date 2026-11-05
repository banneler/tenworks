/**
 * Command Center calendar card + month view.
 * Adapted from Constellation command-center calendar (upcoming list, month grid, day agenda).
 * The hour-drag day timeline from Constellation is not ported.
 */
import {
    createCalendarEvent,
    getIntegrationState,
    listCalendarEvents,
    updateCalendarEvent,
} from './integrations.js';

const SETTINGS_HREF = 'ai-admin.html?tab=integrations';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

function dayKeyFromDate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDayGroupLabel(date) {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    if (dayKeyFromDate(date) === dayKeyFromDate(today)) return 'Today';
    if (dayKeyFromDate(date) === dayKeyFromDate(tomorrow)) return 'Tomorrow';
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatEventTime(ev) {
    if (ev?.allDay) return 'All day';
    if (ev?.startTime == null) return '';
    const start = new Date(Number(ev.startTime) * 1000);
    const end = ev.endTime != null ? new Date(Number(ev.endTime) * 1000) : null;
    const opts = { hour: 'numeric', minute: '2-digit' };
    const startLabel = start.toLocaleTimeString(undefined, opts);
    if (!end || Number.isNaN(end.getTime())) return startLabel;
    return `${startLabel}–${end.toLocaleTimeString(undefined, opts)}`;
}

function groupEventsByDay(events) {
    const groups = [];
    const index = new Map();
    for (const ev of events) {
        const date = new Date(Number(ev.startTime) * 1000);
        const key = dayKeyFromDate(date);
        if (!index.has(key)) {
            const group = { key, date, events: [] };
            index.set(key, group);
            groups.push(group);
        }
        index.get(key).events.push(ev);
    }
    return groups;
}

function connectEmptyHtml() {
    return `
        <div class="nylas-connect-empty">
            <div class="nylas-connect-mark" aria-hidden="true"><i class="fa-regular fa-calendar"></i></div>
            <h3>Connect calendar &amp; email</h3>
            <p>Google or Outlook shows up here once it’s connected. Until then this stays empty on purpose — the shop schedule is still on the Schedule page.</p>
            <a class="btn-primary" href="${SETTINGS_HREF}">Connect calendar &amp; email</a>
        </div>
    `;
}

export function mountNylasCalendar(supabase, { showModal, showToast }) {
    const card = document.getElementById('cc-calendar-card');
    const list = document.getElementById('cc-calendar-list');
    const actions = document.getElementById('cc-calendar-actions');
    const addBtn = document.getElementById('cc-calendar-add-btn');
    const monthBtn = document.getElementById('cc-calendar-month-btn');
    const backdrop = document.getElementById('cc-month-calendar-backdrop');
    const grid = document.getElementById('cc-month-grid');
    const title = document.getElementById('cc-month-calendar-title');
    const weekdayRow = document.getElementById('cc-month-weekday-row');
    const dayHeading = document.getElementById('cc-month-day-heading');
    const dayList = document.getElementById('cc-month-day-list');
    const dayAddBtn = document.getElementById('cc-month-day-add-btn');
    if (!card || !list) return { refresh: async () => {} };

    let integrationState = null;
    let monthYear = null;
    let monthIndex = null;
    let selectedDayKey = null;
    let monthEvents = [];

    function setCardVisible(visible) {
        card.classList.toggle('hidden', !visible);
    }
    function setActionsVisible(visible) {
        actions?.classList.toggle('hidden', !visible);
    }

    function promptConnect() {
        showModal(
            'Connect calendar & email',
            `<p>Connect Google or Outlook in <a href="${SETTINGS_HREF}" class="cc-calendar-settings-link">Settings</a> to add events and open the month view. Nothing is linked yet, so this screen is the demo state.</p>`,
            null,
            false,
            `<button id="modal-ok-btn" class="btn-primary">OK</button><a href="${SETTINGS_HREF}" class="btn-secondary" style="display:inline-flex;align-items:center;">Open Settings</a>`
        );
    }

    function renderUpcoming(events) {
        if (!events.length) {
            list.innerHTML = '<p class="cc-calendar-empty">No upcoming events</p>';
            return;
        }
        const groups = groupEventsByDay(events);
        list.innerHTML = groups.map((group) => `
            <section class="cc-calendar-day-group">
                <div class="cc-calendar-day-header">${escapeHtml(formatDayGroupLabel(group.date))}</div>
                ${group.events.map((ev) => `
                    <div class="cc-calendar-item">
                        <span class="cc-event-bullet" style="background:${escapeHtml(ev.color || 'var(--primary-blue)')}"></span>
                        <div class="cc-calendar-item-when">${escapeHtml(formatEventTime(ev))}</div>
                        <div class="cc-calendar-item-body">
                            <div class="cc-calendar-item-title">${escapeHtml(ev.title || '(No title)')}</div>
                            ${ev.description ? `<div class="cc-calendar-item-desc">${escapeHtml(String(ev.description).replace(/<[^>]+>/g, ' ').slice(0, 180))}</div>` : ''}
                        </div>
                    </div>
                `).join('')}
            </section>
        `).join('');
    }

    async function refresh() {
        setActionsVisible(false);
        try {
            integrationState = await getIntegrationState(supabase);
            if (!integrationState.orgEnabled && integrationState.schemaReady !== false) {
                setCardVisible(false);
                list.innerHTML = '';
                return;
            }
            setCardVisible(true);
            setActionsVisible(true);
            if (!integrationState.connected) {
                list.innerHTML = connectEmptyHtml();
                return;
            }
            list.innerHTML = '<p class="cc-calendar-empty">Loading calendar…</p>';
            const nowSec = Math.floor(Date.now() / 1000);
            const data = await listCalendarEvents(supabase, {
                start: nowSec,
                end: nowSec + 7 * 24 * 60 * 60,
                limit: 15,
            });
            renderUpcoming(Array.isArray(data?.events) ? data.events : []);
        } catch (error) {
            console.warn('[command-center] calendar panel:', error);
            if (integrationState?.orgEnabled || integrationState?.schemaReady === false) {
                setCardVisible(true);
                if (error?.code === 'not_connected') list.innerHTML = connectEmptyHtml();
                else list.innerHTML = '<p class="cc-calendar-empty">Couldn’t load calendar events right now.</p>';
            } else {
                setCardVisible(false);
            }
        }
    }

    function localDateTimeToUnix(dateStr, timeStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        const [hh, mm] = timeStr.split(':').map(Number);
        return Math.floor(new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0).getTime() / 1000);
    }

    function openEventForm(prefill = {}) {
        if (!integrationState?.connected) {
            promptConnect();
            return;
        }
        const isEdit = prefill.mode === 'edit' && prefill.eventId;
        const now = new Date();
        now.setMinutes(0, 0, 0);
        if (now.getHours() < 7) now.setHours(9, 0, 0, 0);
        if (now.getHours() >= 17) now.setHours(16, 0, 0, 0);
        const dateDefault = prefill.date || dayKeyFromDate(now);
        const startDefault = prefill.start || `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
        const endDate = new Date(now.getTime() + 60 * 60 * 1000);
        const endDefault = prefill.end || `${pad2(endDate.getHours())}:${pad2(endDate.getMinutes())}`;
        showModal(
            isEdit ? 'Edit event' : 'Add event',
            `
                <div class="form-group"><label for="nylas-event-title">Title</label><input id="nylas-event-title" class="form-control" value="${escapeHtml(prefill.title || '')}" required></div>
                <div class="form-group"><label for="nylas-event-date">Date</label><input id="nylas-event-date" type="date" class="form-control" value="${escapeHtml(dateDefault)}"></div>
                <div class="nylas-event-times">
                    <div class="form-group"><label for="nylas-event-start">Start</label><input id="nylas-event-start" type="time" class="form-control" value="${escapeHtml(startDefault)}"></div>
                    <div class="form-group"><label for="nylas-event-end">End</label><input id="nylas-event-end" type="time" class="form-control" value="${escapeHtml(endDefault)}"></div>
                </div>
                <p class="placeholder-text">Times stay between 7:00 AM and 6:00 PM, same as Constellation. Use Google or Outlook for anything outside that window.</p>
                <div class="form-group"><label for="nylas-event-desc">Description</label><textarea id="nylas-event-desc" class="form-control" rows="4">${escapeHtml(prefill.description || '')}</textarea></div>
            `,
            async () => {
                try {
                    const titleText = document.getElementById('nylas-event-title')?.value.trim();
                    const dateStr = document.getElementById('nylas-event-date')?.value;
                    const startStr = document.getElementById('nylas-event-start')?.value;
                    const endStr = document.getElementById('nylas-event-end')?.value;
                    const description = document.getElementById('nylas-event-desc')?.value || '';
                    if (!titleText) {
                        showToast('Event title is required.', 'error');
                        return false;
                    }
                    if (!dateStr || !startStr || !endStr) {
                        showToast('Enter a date, start, and end.', 'error');
                        return false;
                    }
                    const startTime = localDateTimeToUnix(dateStr, startStr);
                    const endTime = localDateTimeToUnix(dateStr, endStr);
                    const payload = {
                        title: titleText,
                        description,
                        startTime,
                        endTime,
                        calendarId: prefill.calendarId || 'primary',
                        localStart: startStr,
                        localEnd: endStr,
                        timezoneOffsetMin: new Date().getTimezoneOffset(),
                    };
                    const result = isEdit
                        ? await updateCalendarEvent(supabase, { ...payload, eventId: prefill.eventId }, { onNotice: showToast })
                        : await createCalendarEvent(supabase, payload, { onNotice: showToast });
                    if (!result?.ok) return false;
                    await refresh();
                    if (backdrop && !backdrop.classList.contains('hidden')) await loadMonth();
                    return true;
                } catch (error) {
                    showToast(error.message || 'Could not save the event.', 'error');
                    return false;
                }
            },
            true,
            `<button id="modal-confirm-btn" class="btn-primary">${isEdit ? 'Save event' : 'Add event'}</button><button id="modal-cancel-btn" class="btn-secondary">Cancel</button>`
        );
    }

    function eventsOnDay(dayKey) {
        return monthEvents.filter((ev) => dayKeyFromDate(new Date(Number(ev.startTime) * 1000)) === dayKey);
    }

    function renderWeekdays() {
        if (!weekdayRow) return;
        const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        weekdayRow.innerHTML = labels.map((label) => `<div class="cc-month-weekday">${label}</div>`).join('');
    }

    function renderDayPanel(dayKey) {
        if (!dayHeading || !dayList) return;
        const [y, m, d] = dayKey.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        dayHeading.textContent = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
        dayAddBtn?.classList.remove('hidden');
        const events = eventsOnDay(dayKey);
        if (!events.length) {
            dayList.innerHTML = '<p class="cc-month-day-empty">Nothing scheduled.</p>';
            return;
        }
        dayList.innerHTML = events.map((ev) => `
            <button type="button" class="cc-month-event" data-event-id="${escapeHtml(ev.id || '')}">
                <span class="cc-event-bullet" style="background:${escapeHtml(ev.color || 'var(--primary-blue)')}"></span>
                <span class="cc-month-event-when">${escapeHtml(formatEventTime(ev))}</span>
                <span class="cc-month-event-title">${escapeHtml(ev.title || '(No title)')}</span>
            </button>
        `).join('');
    }

    function renderMonthGrid() {
        if (!grid || monthYear == null || monthIndex == null) return;
        const first = new Date(monthYear, monthIndex, 1);
        const startPad = first.getDay();
        const daysInMonth = new Date(monthYear, monthIndex + 1, 0).getDate();
        const todayKey = dayKeyFromDate(new Date());
        const cells = [];
        for (let i = 0; i < startPad; i++) cells.push('<div class="cc-month-cell is-outside"></div>');
        for (let day = 1; day <= daysInMonth; day++) {
            const key = `${monthYear}-${pad2(monthIndex + 1)}-${pad2(day)}`;
            const count = eventsOnDay(key).length;
            const classes = ['cc-month-cell'];
            if (key === selectedDayKey) classes.push('is-selected');
            if (key === todayKey) classes.push('is-today');
            cells.push(`
                <button type="button" class="${classes.join(' ')}" data-day-key="${key}">
                    <span class="cc-month-cell-num">${day}</span>
                    ${count ? `<span class="cc-month-cell-count">${count}</span>` : ''}
                </button>
            `);
        }
        grid.innerHTML = cells.join('');
        if (title) {
            title.textContent = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        }
        if (selectedDayKey) renderDayPanel(selectedDayKey);
    }

    async function loadMonth() {
        if (monthYear == null || monthIndex == null) return;
        const start = new Date(monthYear, monthIndex, 1, 0, 0, 0, 0);
        const end = new Date(monthYear, monthIndex + 1, 1, 0, 0, 0, 0);
        try {
            const data = await listCalendarEvents(supabase, {
                start: Math.floor(start.getTime() / 1000),
                end: Math.floor(end.getTime() / 1000),
                limit: 100,
            });
            monthEvents = Array.isArray(data?.events) ? data.events : [];
        } catch (error) {
            monthEvents = [];
            showToast(error?.message || 'Couldn’t load month events.', 'warning');
        }
        renderMonthGrid();
    }

    function openMonth() {
        if (!integrationState?.connected) {
            promptConnect();
            return;
        }
        if (!backdrop) return;
        const now = new Date();
        if (monthYear == null || monthIndex == null) {
            monthYear = now.getFullYear();
            monthIndex = now.getMonth();
        }
        if (!selectedDayKey) selectedDayKey = dayKeyFromDate(now);
        renderWeekdays();
        backdrop.classList.remove('hidden');
        backdrop.setAttribute('aria-hidden', 'false');
        loadMonth();
    }

    function closeMonth() {
        backdrop?.classList.add('hidden');
        backdrop?.setAttribute('aria-hidden', 'true');
    }

    function shiftMonth(delta) {
        monthIndex += delta;
        if (monthIndex < 0) {
            monthIndex = 11;
            monthYear -= 1;
        } else if (monthIndex > 11) {
            monthIndex = 0;
            monthYear += 1;
        }
        selectedDayKey = `${monthYear}-${pad2(monthIndex + 1)}-01`;
        loadMonth();
    }

    addBtn?.addEventListener('click', () => openEventForm());
    monthBtn?.addEventListener('click', () => openMonth());
    document.getElementById('cc-month-calendar-close')?.addEventListener('click', closeMonth);
    document.getElementById('cc-month-prev-btn')?.addEventListener('click', () => shiftMonth(-1));
    document.getElementById('cc-month-next-btn')?.addEventListener('click', () => shiftMonth(1));
    dayAddBtn?.addEventListener('click', () => {
        if (!selectedDayKey) return;
        openEventForm({ date: selectedDayKey, start: '09:00', end: '10:00' });
    });
    grid?.addEventListener('click', (event) => {
        const cell = event.target.closest('[data-day-key]');
        if (!cell) return;
        selectedDayKey = cell.dataset.dayKey;
        renderMonthGrid();
    });
    dayList?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-event-id]');
        if (!button) return;
        const ev = monthEvents.find((item) => String(item.id) === button.dataset.eventId);
        if (!ev) return;
        const start = new Date(Number(ev.startTime) * 1000);
        const end = ev.endTime != null ? new Date(Number(ev.endTime) * 1000) : new Date(start.getTime() + 3600000);
        openEventForm({
            mode: 'edit',
            eventId: ev.id,
            calendarId: ev.calendarId || ev.calendar_id,
            title: ev.title || '',
            description: ev.description || '',
            date: dayKeyFromDate(start),
            start: `${pad2(start.getHours())}:${pad2(start.getMinutes())}`,
            end: `${pad2(end.getHours())}:${pad2(end.getMinutes())}`,
        });
    });
    backdrop?.addEventListener('click', (event) => {
        if (event.target === backdrop) closeMonth();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !backdrop || backdrop.classList.contains('hidden')) return;
        const shared = document.getElementById('modal-backdrop');
        if (shared && !shared.classList.contains('hidden')) return;
        closeMonth();
    });

    return { refresh };
}
