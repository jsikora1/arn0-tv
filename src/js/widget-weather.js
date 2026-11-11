/* Home widget: analog clock + current weather (Open-Meteo). Ported from appletv-tizen. */
var WeatherWidget = (function () {
    'use strict';

    var CACHE_KEY = 'arn0.widget.weather';
    var REFRESH_MS = 30 * 60 * 1000;

    var place = null;
    var data = null;

    /* ---------- icons (own SVGs in the multicolour SF style) ---------- */

    var C_SUN = '#ffd60a', C_CLOUD = '#f2f2f7', C_DARK_CLOUD = '#aeaeb2', C_RAIN = '#64d2ff', C_MOON = '#e5e5ea';
    var CLOUD = 'M18 50h28a11 11 0 0 0 1-22 15 15 0 0 0-29-2 12 12 0 0 0 0 24z';

    function sun(cx, cy, r) {
        var s = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + C_SUN + '"/>';
        for (var i = 0; i < 8; i++) {
            var a = i * Math.PI / 4, r1 = r + 4, r2 = r + 9;
            s += '<line x1="' + (cx + r1 * Math.cos(a)) + '" y1="' + (cy + r1 * Math.sin(a)) + '" x2="' + (cx + r2 * Math.cos(a)) +
                '" y2="' + (cy + r2 * Math.sin(a)) + '" stroke="' + C_SUN + '" stroke-width="4" stroke-linecap="round"/>';
        }
        return s;
    }
    function moon(dx, dy, k) {
        return '<path transform="translate(' + dx + ',' + dy + ') scale(' + k + ')" d="M36 10a22 22 0 1 0 18 34A18 18 0 1 1 36 10z" fill="' + C_MOON + '"/>';
    }
    function cloud(dy, color) {
        return '<path transform="translate(0,' + dy + ')" d="' + CLOUD + '" fill="' + (color || C_CLOUD) + '"/>';
    }
    function drops(n, color) {
        var s = '';
        for (var i = 0; i < n; i++) {
            var x = 22 + i * 10;
            s += '<line x1="' + x + '" y1="48" x2="' + (x - 4) + '" y2="58" stroke="' + (color || C_RAIN) + '" stroke-width="4" stroke-linecap="round"/>';
        }
        return s;
    }
    function flakes() {
        return [22, 32, 42].map(function (x, i) {
            return '<circle cx="' + x + '" cy="' + (52 + (i % 2) * 5) + '" r="3.5" fill="#fff"/>';
        }).join('');
    }

    function icon(kind, day) {
        var s;
        switch (kind) {
            case 'clear': s = day ? sun(32, 32, 13) : moon(4, 4, 1); break;
            case 'partly': s = (day ? sun(24, 22, 10) : moon(2, -2, 0.75)) + cloud(6); break;
            case 'cloud': s = cloud(-4, C_DARK_CLOUD) + cloud(4); break;
            case 'fog': s = cloud(-8) + '<g stroke="' + C_DARK_CLOUD + '" stroke-width="4" stroke-linecap="round"><line x1="12" y1="50" x2="52" y2="50"/><line x1="18" y1="58" x2="46" y2="58"/></g>'; break;
            case 'drizzle': s = cloud(-8) + drops(2); break;
            case 'rain': s = cloud(-8) + drops(3); break;
            case 'heavy': s = cloud(-8, C_DARK_CLOUD) + drops(4); break;
            case 'showers': s = (day ? sun(22, 16, 8) : moon(0, -6, 0.6)) + cloud(-6) + drops(2); break;
            case 'sleet': s = cloud(-8) + drops(1) + '<circle cx="38" cy="54" r="3.5" fill="#fff"/>'; break;
            case 'snow': s = cloud(-8) + flakes(); break;
            case 'thunder': s = cloud(-8, C_DARK_CLOUD) + '<path d="M34 40l-8 12h7l-4 10 12-14h-7l4-8z" fill="' + C_SUN + '"/>'; break;
            default: s = cloud(0);
        }
        return '<svg viewBox="0 0 64 64" class="wicon">' + s + '</svg>';
    }

    // WMO weather code -> [icon kind, Polish label]
    function describe(code) {
        if (code === 0) return ['clear', 'Bezchmurnie'];
        if (code === 1) return ['partly', 'Przeważnie bezchmurnie'];
        if (code === 2) return ['partly', 'Częściowe zachmurzenie'];
        if (code === 3) return ['cloud', 'Pochmurno'];
        if (code === 45 || code === 48) return ['fog', 'Mgła'];
        if (code >= 51 && code <= 55) return ['drizzle', 'Mżawka'];
        if (code === 56 || code === 57) return ['sleet', 'Marznąca mżawka'];
        if (code === 61 || code === 63) return ['rain', 'Deszcz'];
        if (code === 65) return ['heavy', 'Ulewa'];
        if (code === 66 || code === 67) return ['sleet', 'Marznący deszcz'];
        if (code >= 71 && code <= 77) return ['snow', 'Śnieg'];
        if (code === 80 || code === 81) return ['showers', 'Przelotny deszcz'];
        if (code === 82) return ['heavy', 'Ulewa'];
        if (code === 85 || code === 86) return ['snow', 'Przelotny śnieg'];
        if (code >= 95) return ['thunder', 'Burza'];
        return ['cloud', ''];
    }

    /* ---------- analog clock ---------- */

    function buildClock() {
        var s = '<circle cx="100" cy="100" r="96" fill="#1c1c1e"/>';
        for (var i = 0; i < 60; i++) {
            var a = i * 6 * Math.PI / 180, big = i % 5 === 0;
            var r1 = big ? 82 : 86, r2 = 91;
            s += '<line x1="' + (100 + r1 * Math.sin(a)) + '" y1="' + (100 - r1 * Math.cos(a)) + '" x2="' + (100 + r2 * Math.sin(a)) +
                '" y2="' + (100 - r2 * Math.cos(a)) + '" stroke="' + (big ? '#fff' : '#636366') + '" stroke-width="' + (big ? 2.5 : 1.2) + '"/>';
        }
        for (var h = 1; h <= 12; h++) {
            var b = h * 30 * Math.PI / 180;
            s += '<text x="' + (100 + 66 * Math.sin(b)) + '" y="' + (100 - 66 * Math.cos(b) + 8) + '" text-anchor="middle" font-size="22" font-weight="600" fill="#fff">' + h + '</text>';
        }
        s += '<line id="hand-h" x1="100" y1="108" x2="100" y2="54" stroke="#fff" stroke-width="7" stroke-linecap="round"/>';
        s += '<line id="hand-m" x1="100" y1="110" x2="100" y2="28" stroke="#fff" stroke-width="5" stroke-linecap="round"/>';
        s += '<line id="hand-s" x1="100" y1="118" x2="100" y2="20" stroke="#ff9f0a" stroke-width="2" stroke-linecap="round"/>';
        s += '<circle cx="100" cy="100" r="5" fill="#ff9f0a"/><circle cx="100" cy="100" r="2" fill="#1c1c1e"/>';
        document.getElementById('clockface').innerHTML = s;
    }

    function tickClock() {
        var d = new Date();
        var sec = d.getSeconds(), min = d.getMinutes() + sec / 60, hr = (d.getHours() % 12) + min / 60;
        document.getElementById('hand-h').setAttribute('transform', 'rotate(' + hr * 30 + ' 100 100)');
        document.getElementById('hand-m').setAttribute('transform', 'rotate(' + min * 6 + ' 100 100)');
        document.getElementById('hand-s').setAttribute('transform', 'rotate(' + sec * 6 + ' 100 100)');
    }

    /* ---------- data ---------- */

    function url() {
        return 'https://api.open-meteo.com/v1/forecast?latitude=' + place.latitude + '&longitude=' + place.longitude +
            '&current=temperature_2m,weather_code,is_day' +
            '&hourly=temperature_2m,weather_code,is_day' +
            '&daily=temperature_2m_max,temperature_2m_min' +
            '&forecast_days=2&timezone=auto';
    }

    function fetchData() {
        var x = new XMLHttpRequest();
        x.open('GET', url());
        x.onload = function () {
            if (x.status !== 200) return;
            try {
                data = JSON.parse(x.responseText);
                try { localStorage.setItem(CACHE_KEY, x.responseText); } catch (e) { /* ignore */ }
                render();
            } catch (e) { /* keep previous data */ }
        };
        x.send();
    }

    function deg(t) { return Math.round(t) + '°'; }

    // next n hourly entries starting at the current hour
    function hours(n) {
        var h = data.hourly, start = 0, now = data.current.time.slice(0, 13);
        for (var i = 0; i < h.time.length; i++) if (h.time[i].slice(0, 13) === now) { start = i; break; }
        var out = [];
        for (var j = start; j < start + n && j < h.time.length; j++) {
            out.push({ label: h.time[j].slice(11, 13), code: h.weather_code[j], day: h.is_day[j] === 1, temp: h.temperature_2m[j] });
        }
        return out;
    }

    function render() {
        document.getElementById('w-city').textContent = place.name || '';
        if (!data || !data.current) return;
        var c = data.current, d = describe(c.weather_code), dl = data.daily;
        document.getElementById('w-temp').textContent = deg(c.temperature_2m);
        document.getElementById('w-icon').innerHTML = icon(d[0], c.is_day === 1);
        document.getElementById('w-cond').textContent = d[1];
        document.getElementById('w-hl').textContent = 'Maks.: ' + deg(dl.temperature_2m_max[0]) + '  Min.: ' + deg(dl.temperature_2m_min[0]);
        document.getElementById('w-hours').innerHTML = hours(6).slice(1).map(function (h) {
            return '<div class="wh"><div>' + h.label + '</div>' + icon(describe(h.code)[0], h.day) + '<div>' + deg(h.temp) + '</div></div>';
        }).join('');
    }

    return {
        // cfg: { name, latitude, longitude }; without it the widget stays hidden.
        init: function (cfg) {
            if (!cfg || cfg.latitude == null || cfg.longitude == null) return;
            place = cfg;
            document.getElementById('weather-widget').classList.remove('hidden');
            buildClock();
            tickClock();
            setInterval(tickClock, 1000);
            try { data = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) { data = null; }
            render();
            fetchData();
            setInterval(fetchData, REFRESH_MS);
        }
    };
})();
