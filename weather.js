'use strict';
/* Time of day and the day's weather for the Triund walk test.
   The game clock (trek.js P.gt, 6x real time, starting 09:00, window.TRIUND_DAY0) drives:
   - the sun: real solar position for Triund (32.25 N, 76.33 E) in late November, India time (solar noon ~12:25,
     sunrise ~06:55, sunset ~17:25). Sky, light, haze, exposure, cloud colour and the shadow direction follow it.
   - the weather, as a typical Triund post-monsoon day: a clear morning; cloud builds over the peaks late morning;
     early afternoon brings mist, and on some days drizzle; it clears in the late afternoon and the evening is clear
     and cold. Which days get drizzle, and when exactly things change, is seeded by the day number.
   Each state is a full set of sky/haze/light numbers; the state in force is a smooth blend, so the change is
   gradual, as in the mountains.
   Interface: create(ctx) -> { update(gtSeconds), state } where state = { hours, clock, name, rain, temp, sunset, next } */
window.TriundWeather = {
  create({ THREE, SKY, SEASON, getAtmos, onSunDir }) {
    const LAT = 32.25 * Math.PI / 180, DEC = -19.6 * Math.PI / 180, NOON = 12.42;   // Nov 19; solar noon in IST hours
    function sunAt(h) {
      const H = (h - NOON) * 15 * Math.PI / 180;
      const el = Math.asin(Math.sin(LAT) * Math.sin(DEC) + Math.cos(LAT) * Math.cos(DEC) * Math.cos(H));
      let az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(LAT) - Math.tan(DEC) * Math.cos(LAT)) * 180 / Math.PI + 180;
      return { az, el: el * 180 / Math.PI };
    }
    // weather states, as changes from the season's clear sky (season.js)
    const SW = window.TriundSeason, clear = () => Object.assign({}, SW ? SW.weather() : { turbidity: 3.4, rayleigh: 1.15, mie: 0.0045, haze: 0x9fb4c9, hazeSun: 0xd8cdbb, fog: 0.000042, sun: 3.1, hemi: 1.45, sky: 0xbcd3ff, exposure: 0.8 });
    const STATES = {
      clear: {},
      cloudy: { turbidity: 6.5, rayleigh: 0.9, mie: 0.009, haze: 0xa3b0bc, hazeSun: 0xc8c6bf, fog: 0.00035, sun: 2.0, hemi: 1.65, sky: 0xc4ced8, exposure: 0.86 },
      mist: { turbidity: 10, rayleigh: 0.6, mie: 0.016, haze: 0xb3bbc0, hazeSun: 0xc2c5c5, fog: 0.011, sun: 0.9, hemi: 2.0, sky: 0xc9d1d6, exposure: 0.95 },
      drizzle: { turbidity: 11, rayleigh: 0.55, mie: 0.018, haze: 0xa5aeb3, hazeSun: 0xb2b6b8, fog: 0.008, sun: 0.75, hemi: 2.05, sky: 0xc2cbd0, exposure: 0.97, rain: 0.45 }
    };
    const NAMES = { clear: 'Clear', cloudy: 'Clouds building', mist: 'Mist', drizzle: 'Light drizzle' };
    const rnd = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    // the day's plan: [hour, state] keys, blended over 25 game minutes either side of each change
    function plan(day) {
      const a = rnd(day), b = rnd(day + 7), wet = rnd(day + 13) < 0.5;
      return [[0, 'clear'], [10.2 + a * 0.8, 'cloudy'], [12.6 + b * 0.8, wet ? 'drizzle' : 'mist'], [14.6 + a * 0.6, 'cloudy'], [15.9 + b * 0.5, 'clear']];
    }
    const col = new THREE.Color(), c2 = new THREE.Color();
    function blend(weights) {
      const base = clear(), out = { rain: 0 };
      const keys = ['turbidity', 'rayleigh', 'mie', 'fog', 'sun', 'hemi', 'exposure'];
      for (const k of keys) out[k] = 0;
      let haze = new THREE.Color(0, 0, 0), hazeSun = new THREE.Color(0, 0, 0), sky = new THREE.Color(0, 0, 0);
      for (const [name, w] of Object.entries(weights)) {
        if (w <= 0) continue; const st = Object.assign({}, base, STATES[name]);
        for (const k of keys) out[k] += st[k] * w;
        // fog is perceived roughly logarithmically: blend its log so a little mist appears gradually
        haze.add(col.set(st.haze).multiplyScalar(w)); hazeSun.add(c2.set(st.hazeSun).multiplyScalar(w)); sky.add(col.set(st.sky).multiplyScalar(w));
        out.rain += (st.rain || 0) * w;
      }
      let lf = 0; for (const [name, w] of Object.entries(weights)) if (w > 0) lf += Math.log(Object.assign({}, base, STATES[name]).fog) * w;
      out.fog = Math.exp(lf);
      out.haze = haze.getHex(); out.hazeSun = hazeSun.getHex(); out.sky = sky.getHex();
      out.wet = base.wet || 0; out.tint = base.tint; out.grade = base.grade; out.speed = base.speed;
      return out;
    }
    function weightsAt(h, day) {
      const P = plan(day), w = { clear: 0, cloudy: 0, mist: 0, drizzle: 0 }, T = 25 / 60;
      let cur = P[0][1], prev = cur, k = 1;
      for (let i = 0; i < P.length; i++) if (h >= P[i][0] - T) { prev = i ? P[i - 1][1] : P[i][1]; cur = P[i][1]; k = Math.min(1, (h - (P[i][0] - T)) / (2 * T)); }
      const s = k * k * (3 - 2 * k); w[prev] += 1 - s; w[cur] += s;
      return { w, P };
    }
    const DAY0 = window.TRIUND_DAY0 || 9, state = { hours: DAY0, clock: '09:00', name: 'Clear', rain: 0, temp: 8, sunset: '17:25', next: '' };
    let lastDir = null, wetness = 0, lastGt = null;
    const dir = new THREE.Vector3();
    return {
      state, sunAt,
      update(gt, altitude) {
        const totalH = DAY0 + gt / 3600, day = Math.floor(totalH / 24), h = totalH - day * 24;
        const { w, P } = weightsAt(h, day), W = blend(w);
        if (SKY.setWeather) SKY.setWeather(W);
        const s = sunAt(h), daylight = SKY.setSun ? SKY.setSun(s.az, s.el) : 1;
        const atmos = getAtmos && getAtmos(); if (atmos && atmos.setDaylight) atmos.setDaylight(daylight);
        // the shadow-casting light follows the sun while it is up (in steps of about half a degree, so shadows do not crawl)
        const a = THREE.MathUtils.degToRad(s.az), e = THREE.MathUtils.degToRad(Math.max(6, s.el));
        dir.set(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)).normalize();
        if (!lastDir || lastDir.angleTo(dir) > 0.009) { lastDir = (lastDir || new THREE.Vector3()).copy(dir); if (onSunDir) onSunDir(dir); }
        // wet ground: soaks during rain, dries over an hour or two of game time
        const dgt = lastGt == null ? 0 : Math.max(0, Math.min(600, gt - lastGt)); lastGt = gt;
        wetness = Math.max(0, Math.min(1, wetness + (W.rain > 0.1 ? dgt / 1200 : -dgt / 5400)));
        if (SEASON && SEASON.setDynamic) SEASON.setDynamic({ rain: W.rain, wet: wetness * 0.8 });
        const top = Object.entries(w).sort((x, y) => y[1] - x[1])[0][0];
        // air temperature: about 9 C at 2,100 m on a late-November noon, colder higher up, early and late; cooler in mist
        const diurnal = h >= 7 && h <= 17 ? Math.sin((h - 7) / 10 * Math.PI) * 6 - 2 : -2 - Math.min(5, ((h + 24 - 17) % 24) * 0.45);   // falls through the night
        state.temp = Math.round((9 - ((altitude || 2100) - 2100) * 0.0065 + diurnal - (W.rain > 0.1 ? 2 : 0) - (w.mist + w.drizzle) * 1.5) * 10) / 10;
        state.hours = h; state.daylight = daylight; state.sunEl = s.el; state.rain = W.rain;
        state.clock = String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0');
        state.name = s.el < -4 ? (top === 'clear' ? 'Clear night' : NAMES[top] + ' (night)') : NAMES[top];
        const nx = P.find(p => p[0] > h + 0.1);
        const hh = t => { const m = Math.round(t * 4) / 4; return String(Math.floor(m) % 24).padStart(2, '0') + ':' + String(Math.round((m % 1) * 60)).padStart(2, '0'); };
        state.next = nx ? `${NAMES[nx[1]]} from about ${hh(nx[0])}` : 'Clear and cold tonight';
        return state;
      }
    };
  }
};
