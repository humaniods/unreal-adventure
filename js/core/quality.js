/* Graphics presets for the Triund walk test. The level is remembered per viewer (localStorage, optional). */
window.TriundQuality = (function () {
  'use strict';
  const PRESETS = {
    high: { shadowSize: 2048, shadowRange: 90, grassR: 36, grassDensity: 1, treeLod: 150, pixelRatio: 1.5 },
    low: { shadowSize: 1024, shadowRange: 55, grassR: 17, grassDensity: 0.55, treeLod: 75, pixelRatio: 1 },
    // phones and tablets: a phone GPU fills ~4x fewer pixels a second than a laptop's; fewer people, short grass,
    // a small sun shadow, and the picture may drop to 60 % resolution before frames are lost
    phone: { shadowSize: 512, shadowRange: 30, grassR: 10, grassDensity: 0.3, treeLod: 55, pixelRatio: 0.85, minScale: 0.6 }
  };
  // phones and tablets start on Phone (they can still pick Low or High); laptops and desktops on High
  // (the same test as the game's touch mode: a phone with a Bluetooth joystick or mouse paired is still a phone)
  const mm = q => typeof matchMedia === 'function' && matchMedia(q).matches, ua = navigator.userAgent || '';
  const touchDevice = (mm('(pointer: coarse)') && !mm('(pointer: fine)')) ||
    (navigator.maxTouchPoints > 0 && mm('(any-pointer: coarse)') && (/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)));
  let level = touchDevice ? 'phone' : 'high';
  // the choice saved since Phone exists; before that a touch device was put on Low automatically, so an old 'low'
  // there means nothing (an old 'high' was picked by hand)
  try { const v2 = localStorage.getItem('triund-quality-v2'), v1 = localStorage.getItem('triund-quality');
    if (PRESETS[v2]) level = v2; else if (v1 === 'high' || (v1 === 'low' && level !== 'phone')) level = v1; } catch (e) { /* storage blocked */ }
  const subs = [];
  return {
    get: () => level,
    params: l => PRESETS[l || level],
    set(l) {
      if (!PRESETS[l] || l === level) return;
      level = l;
      try { localStorage.setItem('triund-quality-v2', l); } catch (e) { /* storage blocked */ }
      subs.forEach(f => f(PRESETS[l], l));
    },
    onChange(f) { subs.push(f); }
  };
})();
