'use strict';
/* Trail soundscape, all synthesized with Web Audio (no recordings, no licences to track):
   birds by habitat (bulbul, blue magpie, great barbet, laughingthrush in the forest; whistling-thrush by water;
   crows and choughs up top), streams and the Bhagsunag fall (distance and side from the OSM water),
   mule bells and hooves from the mule strings, dog barks, and the Bhagsu Naag temple bell.
   Sources: trip reports collected in the research notes (mule bells heard before the mules, roaring Bhagsu fall,
   whistling-thrush near water, crows at the top). Calls are stylised, not recordings of the species. */
window.TriundSound = {
  init({ AC, master, noise, streams, falls, temples }) {
    const out = AC.createGain(); out.gain.value = 1; out.connect(master);
    const hasPan = !!AC.createStereoPanner;
    const now = () => AC.currentTime;
    const rnd = (a, b) => a + Math.random() * (b - a);
    // one-shot voice chain: [source] -> lowpass (air absorption) -> gain -> pan -> out
    function chain(pan, dist, gain) {
      const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(1800, 16000 * Math.exp(-dist / 140));
      const g = AC.createGain(); g.gain.value = gain;
      let tail = g;
      if (hasPan) { const p = AC.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); tail = p; }
      lp.connect(g); tail.connect(out); return lp;
    }
    const distGain = (d, ref) => ref / (ref + d);
    // envelope helper on a gain node
    function envNode(t, peak, a, d) { const g = AC.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); return g; }
    function tone(dst, t, type, f0, f1, dur, peak, fm) {
      const o = AC.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      if (fm) { const m = AC.createOscillator(), mg = AC.createGain(); m.frequency.value = fm[0]; mg.gain.value = fm[1]; m.connect(mg); mg.connect(o.frequency); m.start(t); m.stop(t + dur + 0.05); }
      const g = envNode(t, peak, Math.min(0.02, dur * 0.2), dur); o.connect(g); g.connect(dst); o.start(t); o.stop(t + dur + 0.05);
    }
    function noiseBurst(dst, t, type, f, q, dur, peak) {
      const s = AC.createBufferSource(); s.buffer = noise; const bf = AC.createBiquadFilter(); bf.type = type; bf.frequency.value = f; bf.Q.value = q;
      const g = envNode(t, peak, 0.004, dur); s.connect(bf); bf.connect(g); g.connect(dst); s.start(t, Math.random() * 1.5, dur + 0.05);
    }

    /* ---------- birds ---------- */
    const CALLS = {
      // Himalayan bulbul: cheerful, chattering phrases
      bulbul(d, t) { let x = t; for (let i = 0, n = 3 + (Math.random() * 3 | 0); i < n; i++) { const f = rnd(1500, 2400); tone(d, x, 'sine', f, f * rnd(0.8, 1.3), rnd(0.07, 0.13), 0.5, [rnd(30, 60), 120]); x += rnd(0.09, 0.16); } },
      // whistling-thrush: loud, human-like whistle, rising and falling
      thrush(d, t) { let x = t; for (let i = 0, n = 2 + (Math.random() * 3 | 0); i < n; i++) { const f = rnd(1400, 2200); tone(d, x, 'sine', f, f * rnd(1.15, 1.5), rnd(0.18, 0.32), 0.6); x += rnd(0.25, 0.45); } },
      // blue magpie: harsh rasping chatter then a whistle
      magpie(d, t) { for (let i = 0; i < 5; i++) noiseBurst(d, t + i * 0.09, 'bandpass', rnd(2400, 3200), 3, 0.06, 0.6); tone(d, t + 0.55, 'sine', 2600, 1900, 0.25, 0.35); },
      // great barbet: loud repeated "piu"
      barbet(d, t) { for (let i = 0; i < 6; i++) tone(d, t + i * 0.42, 'sine', 980, 760, 0.22, 0.45); },
      // streaked laughingthrush: short sweet whistles
      laughing(d, t) { tone(d, t, 'sine', 2300, 2800, 0.12, 0.4); tone(d, t + 0.16, 'sine', 2800, 2200, 0.16, 0.4); },
      // large-billed crow: deep hoarse caw
      crow(d, t) { for (let i = 0, n = 1 + (Math.random() * 3 | 0); i < n; i++) { const x = t + i * 0.42; tone(d, x, 'sawtooth', 520, 430, 0.3, 0.22, [28, 25]); noiseBurst(d, x, 'bandpass', 1300, 1.5, 0.28, 0.12); } },
      // red-billed chough: ringing "chee-ow"
      chough(d, t) { tone(d, t, 'square', 1700, 1100, 0.2, 0.12); }
    };
    let birdT = 1.5;
    function birdTick(dt, L, env) {
      birdT -= dt; if (birdT > 0) return;
      const forest = env.alt < 2650, top = env.alt > 2700, nearWater = env.waterD < 90;
      birdT = rnd(1.2, forest ? 4.5 : 7);
      const pool = [];
      if (forest) pool.push(['bulbul', 4], ['magpie', 2], ['barbet', 1.5], ['laughing', 2]);
      if (nearWater) pool.push(['thrush', 5]);
      if (top) pool.push(['chough', 1]);
      pool.push(['crow', top || env.nearStall ? 3 : 0.8]);
      let sum = 0; for (const p of pool) sum += p[1]; let r = Math.random() * sum, k = pool[0][0];
      for (const p of pool) { r -= p[1]; if (r <= 0) { k = p[0]; break; } }
      const dist = rnd(12, 110), pan = rnd(-0.9, 0.9);
      CALLS[k](chain(pan, dist, 0.16 * distGain(dist, 25)), now() + 0.02);
    }

    /* ---------- water beds (looping noise, gain and pan from the nearest stream / fall) ---------- */
    function bed(type, f, q) {
      const s = AC.createBufferSource(); s.buffer = noise; s.loop = true; s.playbackRate.value = 0.9;
      const bf = AC.createBiquadFilter(); bf.type = type; bf.frequency.value = f; bf.Q.value = q;
      const g = AC.createGain(); g.gain.value = 0; let tail = g;
      const p = hasPan ? AC.createStereoPanner() : null; if (p) { g.connect(p); tail = p; }
      s.connect(bf); bf.connect(g); tail.connect(out); s.start(0, Math.random()); return { g, p, bf };
    }
    const streamBed = bed('bandpass', 1500, 0.4), fallBed = bed('lowpass', 900, 0.6), fallLow = bed('lowpass', 160, 0.8);
    const SP = []; for (const st of streams || []) for (let k = 0; k < st.p.length; k += 4) SP.push([st.p[k], -st.p[k + 1]]);
    function nearest(list, x, z) { let b = null, bd = Infinity; for (const p of list) { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; b = p; } } return b ? { p: b, d: Math.sqrt(bd) } : { p: null, d: Infinity }; }
    // -1 left .. +1 right of the listener (camera yaw: local +x = (cos yaw, -sin yaw) in x/z)
    function panTo(L, x, z) { const dx = x - L.x, dz = z - L.z, l = Math.hypot(dx, dz) || 1; return (dx * Math.cos(L.yaw) - dz * Math.sin(L.yaw)) / l; }

    /* ---------- bells, hooves, barks ---------- */
    function bell(t, pan, dist, f) {
      const d = chain(pan, dist, 0.1 * distGain(dist, 12));
      for (const [m, a, dec] of [[1, 0.5, 0.9], [2.76, 0.28, 0.5], [5.4, 0.16, 0.25], [8.9, 0.08, 0.12]]) tone(d, t, 'sine', f * m, f * m * 0.998, dec, a);
    }
    function hoof(t, pan, dist) { noiseBurst(chain(pan, dist, 0.12 * distGain(dist, 6)), t, 'bandpass', rnd(1600, 2600), 4, 0.035, 0.7); }
    function bark(t, pan, dist) {
      for (let i = 0, n = 1 + (Math.random() * 3 | 0); i < n; i++) {
        const d = chain(pan, dist, 0.2 * distGain(dist, 10)), x = t + i * rnd(0.28, 0.4);
        tone(d, x, 'sawtooth', rnd(420, 520), 260, 0.14, 0.4, [60, 40]); noiseBurst(d, x, 'bandpass', 900, 2, 0.12, 0.35);
      }
    }
    function templeBell(t, pan, dist) {
      const d = chain(pan, dist, 0.16 * distGain(dist, 20));
      for (const [m, a, dec] of [[1, 0.5, 2.6], [2.0, 0.3, 1.8], [2.97, 0.2, 1.2], [4.1, 0.1, 0.8]]) tone(d, t, 'sine', 640 * m, 640 * m * 0.997, dec, a);
    }
    let templeT = 8;

    let slow = 0;
    const st = { waterD: Infinity };
    return {
      update(dt, L, info, active) {
        out.gain.setTargetAtTime(active ? 1 : 0, now(), 0.3);
        if (!active) return;
        slow -= dt;
        if (slow <= 0) {
          slow = 0.25;
          const sN = nearest(SP, L.x, L.z), fN = nearest(falls || [], L.x, L.z);
          st.waterD = Math.min(sN.d, fN.d);
          const sg = sN.p ? 0.07 * Math.max(0, 1 - sN.d / 140) ** 2 : 0, fg = fN.p ? 0.32 * Math.max(0, 1 - fN.d / 380) ** 2 : 0;
          streamBed.g.gain.setTargetAtTime(sg, now(), 0.4); fallBed.g.gain.setTargetAtTime(fg, now(), 0.4); fallLow.g.gain.setTargetAtTime(fg * 1.4, now(), 0.4);
          if (hasPan) {
            if (sN.p) streamBed.p.pan.setTargetAtTime(panTo(L, sN.p[0], sN.p[1]) * 0.7, now(), 0.3);
            if (fN.p) { const pp = panTo(L, fN.p[0], fN.p[1]) * 0.7; fallBed.p.pan.setTargetAtTime(pp, now(), 0.3); fallLow.p.pan.setTargetAtTime(pp * 0.5, now(), 0.3); }
          }
        }
        birdTick(dt, L, { alt: L.y, waterD: st.waterD, nearStall: info.nearStall });
        // mule bells (ring with each step while the string is moving) and hooves close by
        if (info.mules) for (const m of info.mules) {
          if (!m.moving) continue;
          m.members.forEach((a, i) => {
            const g = a.g, d = Math.hypot(g.position.x - L.x, g.position.z - L.z); if (d > 160) return;
            a.bellT = (a.bellT == null ? Math.random() : a.bellT) - dt;
            if (a.bellT <= 0) { a.bellT = rnd(0.55, 0.85); bell(now() + 0.01, panTo(L, g.position.x, g.position.z), d, 1650 + i * 140); }
            a.hoofT = (a.hoofT == null ? Math.random() : a.hoofT) - dt;
            if (a.hoofT <= 0) { a.hoofT = rnd(0.28, 0.4); if (d < 45) hoof(now() + 0.01, panTo(L, g.position.x, g.position.z), d); }
          });
        }
        // dog barks queued by the fauna module
        if (info.events) { for (const e of info.events) if (e.type === 'bark') { const d = Math.hypot(e.x - L.x, e.z - L.z); if (d < 200) bark(now() + 0.02, panTo(L, e.x, e.z), d); } info.events.length = 0; }
        // temple bell when near the Bhagsu Naag temple
        templeT -= dt;
        if (templeT <= 0) { templeT = rnd(14, 35); const tN = nearest(temples || [], L.x, L.z); if (tN.p && tN.d < 220) templeBell(now() + 0.02, panTo(L, tN.p[0], tN.p[1]), tN.d); }
      }
    };
  }
};
