'use strict';
/* Food, kit, money and energy for the Triund walk test.
   Prices follow 2025-26 trail reports (chai Rs 30-50, Maggi Rs 50-150, water Rs 40-50 a bottle, all rising with
   altitude; tent with sleeping bags about Rs 600 a night at the top). 1 coin is shown as about Rs 1.
   Energy is food fuel (0-100 %), separate from stamina (breath) and hydration. The starter kit for each bag size
   covers only part of what the climb burns, so most hikers buy a meal or a snack on the way, as on the real trail.
   The wallet and the bag are kept in this browser (localStorage, optional) until there is a server. */
window.TriundEconomy = (function () {
  // effects: en = energy %, hyd = hydration %, warm = warmth, eat = minutes (game time) it takes, bag = stays in the bag
  const ITEMS = {
    chai:      { name: 'Masala chai', price: 30, en: 6, hyd: 10, warm: 0.3, eat: 3, cat: 'drink', icon: '☕' },
    lemontea:  { name: 'Ginger lemon honey tea', price: 50, en: 8, hyd: 14, warm: 0.3, eat: 3, cat: 'drink', icon: '🍋' },
    maggi:     { name: 'Maggi', price: 70, en: 22, hyd: 4, warm: 0.2, eat: 6, cat: 'meal', icon: '🍜' },
    eggmaggi:  { name: 'Egg Maggi', price: 100, en: 30, hyd: 4, warm: 0.2, eat: 7, cat: 'meal', icon: '🍳' },
    omelette:  { name: 'Omelette with bread', price: 80, en: 24, hyd: 0, warm: 0.1, eat: 6, cat: 'meal', icon: '🍳' },
    paratha:   { name: 'Aloo paratha with curd', price: 100, en: 30, hyd: 2, warm: 0.15, eat: 8, cat: 'meal', icon: '🫓' },
    rajma:     { name: 'Rajma chawal', price: 150, en: 38, hyd: 2, warm: 0.15, eat: 10, cat: 'meal', icon: '🍛', top: true },
    water:     { name: 'Water bottle, 1 L', price: 40, en: 0, hyd: 0, sips: 5, kg: 1.0, bag: true, cat: 'pack', icon: '💧' },
    glucon:    { name: 'Glucon-D / ORS sachet', price: 30, en: 10, hyd: 20, eat: 1, kg: 0.05, bag: true, cat: 'pack', icon: '🧃' },
    snickers:  { name: 'Snickers bar', price: 50, en: 12, hyd: 0, eat: 1, kg: 0.05, bag: true, cat: 'pack', icon: '🍫' },
    parleg:    { name: 'Parle-G biscuits', price: 15, en: 10, hyd: -2, eat: 2, kg: 0.08, bag: true, cat: 'pack', icon: '🍪' },
    banana:    { name: 'Banana', price: 20, en: 10, hyd: 2, eat: 1, kg: 0.15, bag: true, cat: 'pack', icon: '🍌' },
    // starter kit only (not sold on the trail)
    homeparatha: { name: 'Packed aloo paratha', en: 28, hyd: 0, eat: 4, kg: 0.25, bag: true, icon: '🫓' },
    dryfruit:  { name: 'Dry fruits pouch', en: 20, hyd: -1, eat: 2, kg: 0.2, bag: true, icon: '🥜' },
    chocolate: { name: 'Chocolate', en: 12, hyd: 0, eat: 1, kg: 0.1, bag: true, icon: '🍫' }
  };
  // camp gear (not food): `need` says what a night at the top needs
  const GEAR = {
    tent:     { name: '2-person tent', kg: 2.8, icon: '⛺' },
    sbag:     { name: 'Sleeping bag (0 °C)', kg: 1.4, icon: '🛏' },
    mat:      { name: 'Sleeping mat', kg: 0.5, icon: '🟫' },
    fleece:   { name: 'Fleece and warm layers', kg: 0.9, icon: '🧥' },
    rain:     { name: 'Rain jacket', kg: 0.4, icon: '🧥' },
    poncho:   { name: 'Rain poncho', kg: 0.2, icon: '🧥' },
    headlamp: { name: 'Torch', kg: 0.1, icon: '🔦' },
    speaker: { name: 'Bluetooth speaker', kg: 0.25, icon: '🔊' }
  };
  // what each bag size comes with (free). Food deliberately covers only part of the climb.
  const KITS = {
    8:  { label: 'Day hike', food: { water: 2, parleg: 2, banana: 1 }, gear: ['poncho', 'headlamp', 'speaker'],
          note: 'Light and quick. No tent or sleeping bag: rent them at the top to stay the night.' },
    12: { label: 'Overnight, light', food: { water: 2, homeparatha: 1, parleg: 2, chocolate: 1 }, gear: ['sbag', 'fleece', 'rain', 'headlamp', 'speaker'],
          note: 'Sleeping bag and warm layers. Rent a tent at the top to stay the night.' },
    18: { label: 'Full camping', food: { water: 3, homeparatha: 2, dryfruit: 1, chocolate: 2 }, gear: ['tent', 'sbag', 'mat', 'fleece', 'rain', 'headlamp', 'speaker'],
          note: 'Everything for a night out, and the most food, but the heaviest climb.' }
  };
  // a stall's menu: big cafes and stalls cook; every stall sells packed snacks and water. Price rises with altitude.
  function menuFor(stop, alt) {
    const ids = ['chai', 'lemontea', 'maggi', 'eggmaggi', 'omelette', 'paratha', 'water', 'glucon', 'snickers', 'parleg', 'banana'];
    if (stop && stop.top) ids.push('rajma');
    const k = priceFactor(alt);
    return ids.map(id => ({ id, ...ITEMS[id], price: Math.round(ITEMS[id].price * k / 5) * 5 }));
  }
  // Gallu Devi (~2150 m) base price, x1.2 by Magic View (~2500 m), x1.5 at the top (~2840 m)
  const priceFactor = alt => 1 + Math.max(0, Math.min(1, (alt - 2150) / 690)) * 0.5;

  // coin packs for the (mock) payment gateway: rupees -> coins
  const PACKS = [{ id: 'p49', inr: 49, coins: 100 }, { id: 'p99', inr: 99, coins: 220, tag: 'Popular' }, { id: 'p199', inr: 199, coins: 480, tag: 'Best value' }];
  const WELCOME = 150;

  /* ---------- wallet (per viewer, in this browser) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  };
  const wallet = {
    coins: store.get('triund-coins', WELCOME),
    history: store.get('triund-coin-history', []),
    add(n, why, ref) { this.coins += n; this.history.unshift({ t: Date.now(), n, why, ref: ref || null }); this.history.length = Math.min(this.history.length, 50); this.save(); },
    spend(n, why) { if (this.coins < n) return false; this.coins -= n; this.history.unshift({ t: Date.now(), n: -n, why }); this.history.length = Math.min(this.history.length, 50); this.save(); return true; },
    save() { store.set('triund-coins', this.coins); store.set('triund-coin-history', this.history); }
  };

  /* ---------- the bag ---------- */
  function newBag(kg) {
    const kit = KITS[kg] || KITS[12], food = {};
    for (const id in kit.food) food[id] = kit.food[id];
    return { kg, food, gear: kit.gear.slice(), rented: [] };
  }
  const bagWeight = bag => {
    let w = 0;
    for (const id in bag.food) w += (ITEMS[id].kg || 0.1) * bag.food[id];
    for (const g of bag.gear) w += GEAR[g].kg;
    return w;
  };

  /* ---------- energy (food fuel), in % per game hour ---------- */
  // Flat walking burns ~30 %/h, a steep climb up to ~60 %/h; standing ~6 %/h; the pack multiplies it (sqrt of the
  // load factor). The climb from Gallu Devi takes ~3.5 game hours: about 150-200 % in all, against a breakfast of 80 %.
  // hr: heart rate. Above about 140 bpm the legs run on sugar, not fat, and the store empties several times faster:
  // pushing hard shows up in energy, not only in stamina
  function burnPerHour(v, grade, load, hr) {
    const hard = Math.max(0, (hr || 0) - 140) * 1.6;
    if (v < 0.15) return 6 + hard * 0.5;
    return (30 + 30 * Math.max(0, Math.min(1, grade / 0.25))) * Math.sqrt(load) + hard;
  }
  // resting (seated) brings energy and stamina back: 2 %/game minute energy, 4 %/game minute stamina
  const REST = { energyPerMin: 2, staminaPerMin: 4 };

  return { ITEMS, GEAR, KITS, PACKS, WELCOME, wallet, menuFor, priceFactor, newBag, bagWeight, burnPerHour, REST };
})();
