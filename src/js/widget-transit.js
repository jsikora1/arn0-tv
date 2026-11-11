/* Home widget: ZTM Gdańsk live departures (open data: ckan2.multimediagdansk.pl). Ported from appletv-tizen. */
var TransitWidget = (function () {
    'use strict';

    var URL_DEP = 'https://ckan2.multimediagdansk.pl/departures?stopId=';
    var REFRESH_MS = 30000;
    var ROWS_PER_STOP = 2;

    var stopName = '';
    var stops = [];  // [{ id, name, lines? }] one per direction; lines: optional whitelist of routeShortName
    var rows = {};   // stopId -> departures

    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    }

    function badgeClass(line) {
        if (/^N/.test(line)) return 'night';
        return +line < 100 ? 'tram' : 'bus';
    }

    function row(r, now) {
        var min = Math.max(0, Math.round((r.t - now) / 60000));
        return '<div class="t-row"><div class="t-line ' + badgeClass(r.line) + '">' + esc(r.line) + '</div>' +
            '<div class="t-head">' + esc(r.headsign) + '</div>' +
            '<div class="t-min' + (r.live ? ' live' : '') + '">' + (min === 0 ? 'teraz' : min + ' min') + '</div></div>';
    }

    function render() {
        document.getElementById('t-stop').textContent = stopName;
        var now = Date.now();
        document.getElementById('t-list').innerHTML = stops.map(function (s) {
            var items = (rows[s.id] || []).filter(function (r) { return r.t > now - 30000; }).slice(0, ROWS_PER_STOP);
            return '<div class="t-dir">→ ' + esc(s.name) + '</div>' +
                (items.length ? items.map(function (r) { return row(r, now); }).join('') : '<div class="t-empty">Brak odjazdów</div>');
        }).join('');
    }

    function fetchStop(stop, done) {
        var x = new XMLHttpRequest();
        x.open('GET', URL_DEP + stop.id);
        x.onload = function () {
            var out = [];
            try {
                JSON.parse(x.responseText).departures.forEach(function (d) {
                    if (stop.lines && stop.lines.indexOf(d.routeShortName) < 0) return;
                    out.push({ line: d.routeShortName, headsign: d.headsign, t: Date.parse(d.estimatedTime), live: d.status === 'REALTIME' });
                });
            } catch (e) { /* skip this stop */ }
            done(out);
        };
        x.onerror = function () { done([]); };
        x.send();
    }

    function fetchAll() {
        stops.forEach(function (s) {
            fetchStop(s, function (list) {
                rows[s.id] = list.sort(function (a, b) { return a.t - b.t; });
                render();
            });
        });
    }

    return {
        // cfg: { stopName, stops: [{ id, name }] }; without it the widget stays hidden.
        init: function (cfg) {
            if (!cfg || !cfg.stops || !cfg.stops.length) return;
            stopName = cfg.stopName || '';
            stops = cfg.stops;
            document.getElementById('transit-widget').classList.remove('hidden');
            render();
            fetchAll();
            setInterval(fetchAll, REFRESH_MS);
            setInterval(render, 15000);
        }
    };
})();
