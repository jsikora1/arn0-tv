/* Home widget: public iCal feed -> upcoming events. Ported from appletv-tizen. */
var CalendarWidget = (function () {
    'use strict';

    var CACHE_KEY = 'arn0.widget.calendar';
    var REFRESH_MS = 15 * 60 * 1000;
    var DAYS_AHEAD = 14;
    var MAX_ROWS = 4;
    var DAY = 86400000;
    var WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    var DAY_NAMES = ['NIEDZIELA', 'PONIEDZIAŁEK', 'WTOREK', 'ŚRODA', 'CZWARTEK', 'PIĄTEK', 'SOBOTA'];
    var DAY_SHORT = ['nd', 'pon', 'wt', 'śr', 'czw', 'pt', 'sob'];
    var MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];

    var icsUrl = null;
    var upcoming = []; // [{start, end, allDay, title}] as ms

    /* ---------- iCal parsing ---------- */

    function parseDate(value, params) {
        var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/.exec(value);
        if (!m) return null;
        var allDay = !m[4] || /VALUE=DATE(?!-)/.test(params || '');
        if (allDay) return { t: new Date(+m[1], +m[2] - 1, +m[3]).getTime(), allDay: true };
        if (m[7]) return { t: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]), allDay: false };
        // TZID times are treated as TV-local time
        return { t: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime(), allDay: false };
    }

    function parseDuration(v) {
        var m = /P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/.exec(v || '');
        if (!m) return 0;
        return ((+m[1] || 0) * 7 * DAY) + ((+m[2] || 0) * DAY) + ((+m[3] || 0) * 3600000) + ((+m[4] || 0) * 60000);
    }

    function unescapeText(s) {
        return s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
    }

    function parseICS(text) {
        var lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
        var events = [], ev = null;
        lines.forEach(function (line) {
            if (line === 'BEGIN:VEVENT') { ev = { exdates: {} }; return; }
            if (line === 'END:VEVENT') { if (ev && ev.start) events.push(ev); ev = null; return; }
            if (!ev) return;
            var colon = line.indexOf(':');
            if (colon < 0) return;
            var head = line.slice(0, colon), value = line.slice(colon + 1);
            var semi = head.indexOf(';');
            var name = semi < 0 ? head : head.slice(0, semi), params = semi < 0 ? '' : head.slice(semi + 1);
            if (name === 'DTSTART') { var s = parseDate(value, params); if (s) { ev.start = s.t; ev.allDay = s.allDay; } }
            else if (name === 'DTEND') { var e = parseDate(value, params); if (e) ev.end = e.t; }
            else if (name === 'DURATION') ev.duration = parseDuration(value);
            else if (name === 'SUMMARY') ev.title = unescapeText(value);
            else if (name === 'UID') ev.uid = value;
            else if (name === 'RRULE') {
                ev.rrule = {};
                value.split(';').forEach(function (p) { var kv = p.split('='); ev.rrule[kv[0]] = kv[1]; });
            } else if (name === 'EXDATE') {
                value.split(',').forEach(function (v) { var x = parseDate(v, params); if (x) ev.exdates[x.t] = true; });
            } else if (name === 'RECURRENCE-ID') {
                var r = parseDate(value, params); if (r) ev.recurrenceId = r.t;
            }
        });
        events.forEach(function (e) {
            if (e.end == null) e.end = e.start + (e.duration || (e.allDay ? DAY : 0));
        });
        return events;
    }

    function shift(base, freq, k) {
        var d = new Date(base);
        if (freq === 'DAILY') d.setDate(d.getDate() + k);
        else if (freq === 'WEEKLY') d.setDate(d.getDate() + 7 * k);
        else if (freq === 'MONTHLY') d.setMonth(d.getMonth() + k);
        else if (freq === 'YEARLY') d.setFullYear(d.getFullYear() + k);
        return d.getTime();
    }

    // start times of an event's occurrences overlapping [from, to)
    function occurrences(ev, from, to, moved) {
        var dur = ev.end - ev.start, out = [];
        var r = ev.rrule;
        if (!r) {
            if (ev.end > from && ev.start < to) out.push(ev.start);
            return out;
        }
        var interval = +r.INTERVAL || 1;
        var until = r.UNTIL ? parseDate(r.UNTIL).t : Infinity;
        var count = r.COUNT ? +r.COUNT : Infinity;
        var byday = r.FREQ === 'WEEKLY' && r.BYDAY ? r.BYDAY.split(',').map(function (d) { return WD[d.slice(-2)]; }) : null;
        var weekStart = null;
        if (byday) { // Monday of the DTSTART week
            var d0 = new Date(ev.start);
            weekStart = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - (d0.getDay() + 6) % 7, d0.getHours(), d0.getMinutes()).getTime();
            byday.sort(function (a, b) { return (a + 6) % 7 - (b + 6) % 7; });
        }
        var n = 0;
        for (var i = 0; i < 20000; i++) {
            var cands = byday
                ? byday.map(function (wd) { var w = new Date(shift(weekStart, 'WEEKLY', i * interval)); w.setDate(w.getDate() + (wd + 6) % 7); return w.getTime(); })
                    .filter(function (t) { return t >= ev.start; })
                : [shift(ev.start, r.FREQ, i * interval)];
            for (var j = 0; j < cands.length; j++) {
                var t = cands[j];
                if (t > until || n >= count || t >= to) return out;
                n++;
                if (t + dur > from && !ev.exdates[t] && !moved[ev.uid + '@' + t]) out.push(t);
            }
        }
        return out;
    }

    function computeUpcoming(events) {
        var now = Date.now();
        var today = new Date(); today.setHours(0, 0, 0, 0);
        var to = today.getTime() + DAYS_AHEAD * DAY;
        var moved = {};
        events.forEach(function (e) { if (e.recurrenceId != null) moved[e.uid + '@' + e.recurrenceId] = true; });

        var list = [];
        events.forEach(function (e) {
            var base = e.recurrenceId != null ? { start: e.start, end: e.end, allDay: e.allDay, title: e.title, exdates: {} } : e;
            occurrences(base, now, to, e.recurrenceId != null ? {} : moved).forEach(function (t) {
                list.push({ start: t, end: t + (e.end - e.start), allDay: e.allDay, title: e.title || '(bez tytułu)' });
            });
        });
        list.sort(function (a, b) { return a.start - b.start || (b.allDay ? 1 : 0) - (a.allDay ? 1 : 0); });
        return list;
    }

    /* ---------- rendering ---------- */

    function hhmm(t) {
        var d = new Date(t), m = d.getMinutes();
        return d.getHours() + ':' + (m < 10 ? '0' : '') + m;
    }

    function dayLabel(t) {
        var today = new Date(); today.setHours(0, 0, 0, 0);
        var d = new Date(t); d.setHours(0, 0, 0, 0);
        var diff = Math.round((d - today) / DAY);
        if (diff <= 0) return 'Dziś';
        if (diff === 1) return 'Jutro';
        return DAY_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3);
    }

    function esc(s) {
        return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    }

    function render() {
        var now = new Date();
        document.getElementById('c-dayname').textContent = DAY_NAMES[now.getDay()];
        document.getElementById('c-date').textContent = now.getDate() + ' ' + MONTHS[now.getMonth()];

        var items = upcoming.filter(function (e) { return e.end > Date.now(); }).slice(0, MAX_ROWS);
        if (!items.length) {
            document.getElementById('c-list').innerHTML = '<div class="c-empty">Brak wydarzeń w najbliższych dniach</div>';
            return;
        }
        var lastDay = null;
        document.getElementById('c-list').innerHTML = items.map(function (e) {
            var day = dayLabel(e.start);
            var head = day !== lastDay && day !== 'Dziś' ? '<div class="c-day">' + day + '</div>' : '';
            lastDay = day;
            var when = e.allDay ? 'cały dzień' : hhmm(e.start) + (e.end > e.start ? '–' + hhmm(e.end) : '');
            return head + '<div class="c-ev"><div class="c-bar"></div><div class="c-title">' + esc(e.title) +
                '</div><div class="c-when">' + when + '</div></div>';
        }).join('');
    }

    function fetchData() {
        var x = new XMLHttpRequest();
        x.open('GET', icsUrl);
        x.onload = function () {
            if (x.status !== 200) return;
            try {
                upcoming = computeUpcoming(parseICS(x.responseText));
                try { localStorage.setItem(CACHE_KEY, JSON.stringify(upcoming)); } catch (e) { /* ignore */ }
                render();
            } catch (e) {
                document.getElementById('c-list').innerHTML = '<div class="c-empty">Błąd kalendarza: ' + esc(e.message) + '</div>';
            }
        };
        x.onerror = function () {
            if (!upcoming.length) document.getElementById('c-list').innerHTML = '<div class="c-empty">Brak połączenia z kalendarzem</div>';
        };
        x.send();
    }

    return {
        // url: public iCal (.ics) address; without it the widget stays hidden.
        init: function (url) {
            if (!url) return;
            icsUrl = url;
            document.getElementById('cal-widget').classList.remove('hidden');
            try { upcoming = JSON.parse(localStorage.getItem(CACHE_KEY)) || []; } catch (e) { upcoming = []; }
            render();
            fetchData();
            setInterval(fetchData, REFRESH_MS);
            setInterval(render, 60000); // drop finished events, roll the date at midnight
        }
    };
})();
