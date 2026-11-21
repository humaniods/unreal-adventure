/* Graphics presets for the Triund walk test. The level is remembered per viewer (localStorage, optional). */
window.TriundQuality = (function () {
  'use strict';
  const PRESETS = {
    high: { shadowSize: 2048, shadowRange: 90, grassR: 36, grassDensity: 1, treeLod: 150, pixelRatio: 1.5 },
    low: { shadowSize: 1024, shadowRange: 55, grassR: 17, grassDensity: 0.55, treeLod: 75, pixelRatio: 1 }
  };
  // phones and tablets start on Low (they can still pick High); laptops and desktops on High
  let level = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches ? 'low' : 'high';
  try { const v = localStorage.getItem('triund-quality'); if (v === 'high' || v === 'low') level = v; } catch (e) { /* storage blocked */ }
  const subs = [];
  return {
    get: () => level,
    params: l => PRESETS[l || level],
    set(l) {
      if (!PRESETS[l] || l === level) return;
      level = l;
      try { localStorage.setItem('triund-quality', l); } catch (e) { /* storage blocked */ }
      subs.forEach(f => f(PRESETS[l], l));
    },
    onChange(f) { subs.push(f); }
  };
})();
