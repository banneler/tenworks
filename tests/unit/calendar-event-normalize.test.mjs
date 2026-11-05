import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    parseUnixSeconds,
    normalizeHexColor,
    colorFromGoogleColorId,
    colorFromGoogleCalendarColorId,
    deterministicColorFromKey,
    parseEventWhen,
    normalizeCalendarEvent,
    buildCalendarColorMap,
    buildEventLabelColorMap,
    extractCalendarHexColor,
    extractEventLabelId,
} from '../../api/_lib/calendar-event-normalize.mjs';

describe('calendar-event-normalize when parse', () => {
    it('reads timespan start_time/end_time as exclusive unix seconds', () => {
        const start = 1785441600; // arbitrary
        const end = start + 45 * 60;
        const parsed = parseEventWhen({
            object: 'timespan',
            start_time: start,
            end_time: end,
        });
        assert.equal(parsed.allDay, false);
        assert.equal(parsed.startTime, start);
        assert.equal(parsed.endTime, end);
        assert.equal(parsed.endTime - parsed.startTime, 45 * 60);
    });

    it('falls back to endTime camelCase and ISO strings', () => {
        const startIso = '2026-07-30T18:00:00.000Z';
        const endIso = '2026-07-30T18:45:00.000Z';
        const parsed = parseEventWhen({ startTime: startIso, endTime: endIso });
        assert.equal(parsed.startTime, Math.floor(Date.parse(startIso) / 1000));
        assert.equal(parsed.endTime, Math.floor(Date.parse(endIso) / 1000));
        assert.equal(parsed.endTime - parsed.startTime, 45 * 60);
    });

    it('does not confuse all-day datespan with timed fields', () => {
        const parsed = parseEventWhen({ start_date: '2026-07-30', end_date: '2026-07-31' });
        assert.equal(parsed.allDay, true);
        assert.ok(parsed.startTime != null);
    });

    it('tolerates ms timestamps in parseUnixSeconds', () => {
        assert.equal(parseUnixSeconds(1785441600000), 1785441600);
        assert.equal(parseUnixSeconds(1785441600), 1785441600);
    });
});

describe('calendar-event-normalize colors', () => {
    it('prefers calendar map hex_color over missing event color', () => {
        const colorByCalendarId = buildCalendarColorMap({
            data: [
                { id: 'cal-1', hex_color: '#a4bdfc', is_primary: true },
                { id: 'cal-2', hex_color: '#f83a22' },
            ],
        });
        assert.equal(colorByCalendarId.get('primary'), '#A4BDFC');
        const ev = normalizeCalendarEvent(
            {
                id: 'e1',
                title: 'Discovery call - Acme Corp',
                calendar_id: 'cal-2',
                when: { start_time: 1000, end_time: 1000 + 45 * 60 },
            },
            { calendarColor: '#A4BDFC', colorByCalendarId }
        );
        assert.equal(ev.color, '#F83A22');
        assert.equal(ev.endTime - ev.startTime, 45 * 60);
    });

    it('normalizeHexColor accepts 3-digit and bare hex', () => {
        assert.equal(normalizeHexColor('f00'), '#FF0000');
        assert.equal(normalizeHexColor('#039BE5'), '#039BE5');
        assert.equal(normalizeHexColor('039be5'), '#039BE5');
    });

    it('maps Google color_id over calendar label color', () => {
        assert.equal(colorFromGoogleColorId('11'), '#DC2127');
        assert.equal(colorFromGoogleColorId(4), '#FF887C');
        const colorByCalendarId = buildCalendarColorMap({
            data: [{ id: 'cal-1', hex_color: '#a4bdfc', is_primary: true }],
        });
        const ev = normalizeCalendarEvent(
            {
                id: 'e-color',
                title: 'Tomato event',
                calendar_id: 'cal-1',
                color_id: '11',
                when: { start_time: 1000, end_time: 1900 },
            },
            { colorByCalendarId }
        );
        assert.equal(ev.color, '#DC2127');
        assert.equal(ev.colorId, '11');
    });

    it('reads Google color_id from metadata (Nylas/Google shape)', () => {
        const colorByCalendarId = buildCalendarColorMap({
            data: [{ id: 'cal-1', hex_color: '#a4bdfc', is_primary: true }],
        });
        const ev = normalizeCalendarEvent(
            {
                id: 'e-meta',
                title: 'Meta color',
                calendar_id: 'cal-1',
                metadata: { color_id: '4' },
                when: { start_time: 1000, end_time: 1900 },
            },
            { colorByCalendarId }
        );
        assert.equal(ev.colorId, '4');
        assert.equal(ev.color, '#FF887C');
    });

    it('maps Google calendar-list colorId when hex_color is null', () => {
        assert.equal(colorFromGoogleCalendarColorId('3'), '#F83A22');
        assert.equal(colorFromGoogleCalendarColorId('16'), '#4986E7');
        assert.equal(
            extractCalendarHexColor({ id: 'work', name: 'Work', hex_color: null, color_id: '3' }),
            '#F83A22'
        );
    });

    it('does not paint Work/Stuff with primary color when their hex is missing', () => {
        // Primary hex chosen outside the deterministic fallback palette.
        const primaryHex = '#112233';
        const colorByCalendarId = buildCalendarColorMap(
            {
                data: [
                    { id: 'primary-cal', hex_color: primaryHex, is_primary: true },
                    { id: 'work-cal', name: 'Work', hex_color: null },
                    { id: 'stuff-cal', name: 'Stuff', hex_color: null },
                ],
            },
            { fillMissing: false }
        );
        assert.equal(colorByCalendarId.get('primary-cal'), primaryHex);
        assert.equal(colorByCalendarId.get('work-cal'), undefined);

        const workEv = normalizeCalendarEvent(
            {
                id: 'e-work',
                title: 'Work meeting',
                calendar_id: 'work-cal',
                when: { start_time: 1000, end_time: 1900 },
            },
            {
                // Bug regress: old code passed primary hex as calendarColor for every cal.
                calendarColor: null,
                colorByCalendarId,
            }
        );
        const stuffEv = normalizeCalendarEvent(
            {
                id: 'e-stuff',
                title: 'Stuff block',
                calendar_id: 'stuff-cal',
                when: { start_time: 2000, end_time: 2900 },
            },
            { calendarColor: null, colorByCalendarId }
        );
        const primaryEv = normalizeCalendarEvent(
            {
                id: 'e-pri',
                title: 'Primary',
                calendar_id: 'primary-cal',
                when: { start_time: 3000, end_time: 3900 },
            },
            { calendarColor: primaryHex, colorByCalendarId }
        );

        assert.equal(primaryEv.color, primaryHex);
        assert.notEqual(workEv.color, primaryHex);
        assert.notEqual(stuffEv.color, primaryHex);
        assert.notEqual(workEv.color, stuffEv.color);
        assert.equal(workEv.color, deterministicColorFromKey('work-cal'));
        assert.equal(stuffEv.color, deterministicColorFromKey('stuff-cal'));
    });

    it('fillMissing assigns stable distinct colors for Work/Stuff', () => {
        const map = buildCalendarColorMap({
            data: [
                { id: 'work-cal', name: 'Work', hex_color: null },
                { id: 'stuff-cal', name: 'Stuff', hex_color: null },
            ],
        });
        assert.ok(map.get('work-cal'));
        assert.ok(map.get('stuff-cal'));
        assert.notEqual(map.get('work-cal'), map.get('stuff-cal'));
    });

    it('same primary calendar + different color_id paints Test3 ≠ Test Event ≠ Discovery', () => {
        const primaryHex = '#039BE5';
        const colorByCalendarId = buildCalendarColorMap({
            data: [{ id: 'primary-cal', hex_color: primaryHex, is_primary: true }],
        });
        const work = normalizeCalendarEvent(
            {
                id: 'test3',
                title: 'Test3',
                calendar_id: 'primary-cal',
                color_id: '3', // grape / magenta-ish legacy palette
                when: { start_time: 1000, end_time: 1900 },
            },
            { colorByCalendarId }
        );
        const stuff = normalizeCalendarEvent(
            {
                id: 'test-event',
                title: 'Test Event',
                calendar_id: 'primary-cal',
                metadata: { color_id: '6' }, // tangerine
                when: { start_time: 2000, end_time: 2900 },
            },
            { colorByCalendarId }
        );
        const discovery = normalizeCalendarEvent(
            {
                id: 'discovery',
                title: 'Discovery call — Acme Corp',
                calendar_id: 'primary-cal',
                when: { start_time: 3000, end_time: 3900 },
            },
            { colorByCalendarId }
        );
        assert.equal(work.color, '#DBADFF');
        assert.equal(work.colorSource, 'color_id');
        assert.equal(stuff.color, '#FFB878');
        assert.equal(stuff.colorSource, 'color_id');
        assert.equal(discovery.color, primaryHex);
        assert.equal(discovery.colorSource, 'calendar');
        assert.notEqual(work.color, stuff.color);
        assert.notEqual(work.color, discovery.color);
        assert.notEqual(stuff.color, discovery.color);
    });

    it('prefers Google eventLabelId hex over calendar color when label map present', () => {
        const colorByCalendarId = buildCalendarColorMap({
            data: [{ id: 'primary-cal', hex_color: '#039BE5', is_primary: true }],
        });
        const labelColorById = buildEventLabelColorMap({
            data: [
                {
                    id: 'primary-cal',
                    labelProperties: {
                        eventLabels: [
                            { id: 'label-work', name: 'Work', backgroundColor: '#cd74e6' },
                            { id: 'label-stuff', name: 'Stuff', backgroundColor: '#ffad46' },
                        ],
                    },
                },
            ],
        });
        assert.equal(extractEventLabelId({ eventLabelId: 'label-work' }), 'label-work');
        const work = normalizeCalendarEvent(
            {
                id: 'e1',
                title: 'Test3',
                calendar_id: 'primary-cal',
                event_label_id: 'label-work',
                when: { start_time: 1000, end_time: 1900 },
            },
            { colorByCalendarId, labelColorById }
        );
        assert.equal(work.color, '#CD74E6');
        assert.equal(work.labelName, 'Work');
        assert.equal(work.colorSource, 'event_label');
    });
});
