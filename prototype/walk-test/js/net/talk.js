'use strict';
/* Chatting with the people on the trail (build 2.6).
   Walk up to a hiker or a stall keeper and press Enter: they stop and turn to you. Type (Hindi, English or Hinglish)
   and press Enter; their answer shows as a subtitle while they talk with their hands. Everyone is somebody: a name,
   a home town, a reason to be on the mountain, going up or down, where they stand and what time it is. Each person
   remembers what you said to them.
   Real conversation runs on the trek server (../server, POST /bot/chat, Claude). Without the server, or without a
   Claude key on it, they still answer with short everyday lines.
   Interface: create(ctx) -> { prompt(P), open(), busy, personaOf(a) }   ctx: { crowd(), me(), playing(), scene(person, doing), say, toast } */
window.TriundTalk = {
  create(ctx) {
    const QS = new URLSearchParams(location.search);
    const BASE = (() => {
      const s = QS.get('server') || (() => { try { return localStorage.getItem('triund-server') || ''; } catch (e) { return ''; } })();
      if (s) return s.replace(/^ws/, 'http').replace(/\/ws$|\/triund-ws$/, '');
      return location.port === '8765' ? 'http://' + location.hostname + ':8787' : location.origin && location.origin !== 'null' ? location.origin : 'http://127.0.0.1:8787';
    })();

    /* ---------- who they are (fixed for each person, from their id) ---------- */
    const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
    const pick = (arr, h, k) => arr[(h >>> (k * 3)) % arr.length];
    const NAMES = { m: ['Rohit', 'Arjun', 'Karan', 'Aman', 'Siddharth', 'Vikram', 'Rahul', 'Nikhil', 'Harsh', 'Aditya', 'Manish', 'Tenzin', 'Gurpreet', 'Abhishek', 'Varun'],
      f: ['Priya', 'Ananya', 'Sneha', 'Neha', 'Riya', 'Kavya', 'Simran', 'Pooja', 'Ishita', 'Megha', 'Tanvi', 'Aditi', 'Pema'] };
    const HOMES = ['Delhi', 'Chandigarh', 'Pune', 'Bengaluru', 'Mumbai', 'Ludhiana', 'Jaipur', 'Kolkata', 'Dehradun', 'Gurugram', 'Lucknow', 'Ahmedabad', 'Hyderabad', 'Amritsar', 'Shimla'];
    const WHO = ['an IT engineer on a long weekend with three college friends', 'a college student on a trip with the hostel gang',
      'on your first ever trek, a little nervous but loving it', 'a solo backpacker who has been in McLeod Ganj for two weeks',
      'here with your partner, it was their idea', 'a photographer chasing the sunset from the top', 'a school teacher on a winter break with your cousins',
      'a regular who comes up Triund every year', 'a startup founder trying to switch off your phone for a day', 'camping on the top tonight with friends'];
    const KEEPER_NAMES = { m: ['Raju', 'Sanjay', 'Om Prakash', 'Ramesh', 'Kishan', 'Bittu'], f: ['Kamla', 'Sunita', 'Rekha'] };
    const VILLAGES = ['Dharamkot', 'Naddi', 'Bhagsu', 'Gallu', 'Jogiwara'];
    const personas = new Map();
    function personaOf(a) {
      const id = a.id || 'p'; if (personas.has(id)) return personas.get(id);
      const h = hash(id), sex = a.look && a.look.sex === 'f' ? 'f' : 'm', keeper = a.kind === 'keeper';
      const p = keeper ? { name: pick(KEEPER_NAMES[sex], h, 1), sex, age: 35 + (h % 25), home: pick(VILLAGES, h, 2), role: 'keeper', who: '' }
        : { name: pick(NAMES[sex], h, 1), sex, age: 19 + (h % 22), home: pick(HOMES, h, 2), role: 'hiker', who: pick(WHO, h, 4) };
      p.history = []; personas.set(id, p); return p;
    }
    function doing(a) {
      if (a.kind === 'keeper') return 'standing at your stall counter';
      if (a.state === 'sit') return 'sitting at a chai stall having a break';
      if (a.state === 'fire') return 'sitting by a campfire on the top';
      if (a.state === 'top') return 'on the Triund top meadow';
      if (a.state === 'rest') return 'resting by the path';
      return a.dir > 0 ? 'walking up toward Triund' : 'walking down after the top';
    }

    /* ---------- without the server: short everyday answers ---------- */
    function offline(p, said, sc) {
      const t = said.toLowerCase(), r = a => a[(hash(said + p.name) >>> 3) % a.length], km = sc.to_top_km;
      if (/\b(naam|name)\b/.test(t)) return `Main ${p.name}. Aur aap?`;
      if (/kahan se|kaha se|where.*from|kidhar se/.test(t)) return p.role === 'keeper' ? `${p.home} se hoon, neeche wala gaon. Roz upar aata hoon.` : `${p.home} se aaye hain. Aap?`;
      if (/kitna|door|dur|far|km|how long|time|ghante|kab tak/.test(t)) return km ? `Top abhi lagbhag ${km.toFixed(1)} km hai, ${Math.max(1, Math.round(km * 0.8))} ghanta aur. Aaram se chalo.` : 'Bas thoda aur, upar se view ekdum mast hai.';
      if (/chai|maggi|khana|food|paani|pani|water|bhook/.test(t)) return p.role === 'keeper' ? 'Haan ji, garam chai aur Maggi ready hai. Counter pe E dabao.' : 'Magic View pe chai pi lena, last achha stop hai.';
      if (/mausam|weather|thand|cold|snow|barf|baarish|rain|dhoop/.test(t)) return 'Subah saaf tha, dopahar tak baadal aa jaate hain. Jacket rakhna, upar thand hai.';
      if (/thak|tired|saans|breath/.test(t)) return 'Thoda baith jao, paani piyo. Pahad bhaagta nahi.';
      if (/^(hi|hello|hey|namaste|namaskar|ram ram|jai)/.test(t)) return r([`Namaste! ${p.home} se hoon. Aap upar ja rahe ho?`, 'Hello! Kaisa chal raha hai trek?', 'Arre namaste! Mast din hai na aaj?']);
      return r(['Haan yaar, sahi baat.', 'Chalte raho, upar view kamaal ka hai.', 'Hmm, pata nahi bhai. Upar chai wale se pooch lo.', 'Haha, sahi hai!']);
    }

    /* ---------- the chat line: Enter to open, type, Enter to send ---------- */
    const css = document.createElement('style');
    css.textContent = `#talkBox{position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:13;width:min(560px,90vw);display:flex;gap:8px;align-items:center;background:rgba(13,22,19,.86);border:1px solid rgba(255,255,255,.2);border-radius:14px;padding:8px 10px}
#talkBox[hidden]{display:none}#talkBox b{font:700 15px var(--f-display,sans-serif);color:#f2c230;white-space:nowrap}
#talkBox input{flex:1;background:transparent;border:0;outline:0;color:#f1ead8;font:16px Hind,sans-serif}`;
    document.head.appendChild(css);
    const box = document.createElement('div'); box.id = 'talkBox'; box.hidden = true;
    box.innerHTML = '<b></b><input id="talkIn" type="text" maxlength="300" autocomplete="off" spellcheck="false">';
    document.body.appendChild(box);
    const input = box.querySelector('input');
    let who = null, waiting = false, warned = false;
    function open() {
      const crowd = ctx.crowd(), P = ctx.me(); if (!crowd || !P || waiting) return false;
      const a = crowd.nearestPerson(P, 3.4); if (!a) return false;
      who = a; const p = personaOf(a); crowd.chat(a, 60, 0);
      box.querySelector('b').textContent = (p.history.length ? p.name : a.kind === 'keeper' ? 'Stall keeper' : 'Hiker') + ':';
      input.placeholder = 'Say something… (Enter to send, Enter on an empty line to close)';
      input.value = ''; box.hidden = false; input.focus(); return true;
    }
    function close() { box.hidden = true; input.blur(); if (who && ctx.crowd()) ctx.crowd().chat(who, 6, 0); }
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Enter') return;
      e.preventDefault(); const text = input.value.trim(); close(); if (text && who) send(who, text);
    });
    input.addEventListener('keyup', e => e.stopPropagation());
    async function send(a, said) {
      const p = personaOf(a), sc = ctx.scene(a, doing(a)); waiting = true;
      ctx.toast('You: ' + said.slice(0, 90)); ctx.say(`${p.name}: …`, 20); ctx.crowd().chat(a, 30, 0);
      let reply = null;
      try {
        const res = await fetch(BASE + '/bot/chat', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: said, persona: { name: p.name, sex: p.sex, age: p.age, home: p.home, role: p.role, who: p.who }, scene: sc, history: p.history.slice(-8) }) });
        const d = await res.json().catch(() => null);
        if (res.ok && d && d.reply) reply = d.reply;
        else if (res.status === 429 && d) ctx.toast(d.error);
      } catch (e) { /* no server: fall back below */ }
      if (!reply) {
        reply = offline(p, said, sc);
        if (!warned) { warned = true; setTimeout(() => ctx.toast('Short answers only: real chat needs the trek server with a Claude key'), 2600); }
      }
      waiting = false;
      p.history.push({ who: 'me', text: said }, { who: 'them', text: reply });
      if (p.history.length > 16) p.history.splice(0, p.history.length - 16);
      const dur = Math.min(9, Math.max(3, reply.length / 14));
      ctx.crowd().chat(a, dur + 15, dur); ctx.say(`${p.name}: ${reply}`, dur + 2);
    }
    window.addEventListener('keydown', e => { if (e.code === 'Enter' && !e.repeat && box.hidden && ctx.playing() && open()) e.preventDefault(); });

    return {
      get busy() { return waiting || !box.hidden; },
      base: BASE,
      prompt(P) {
        if (!box.hidden || waiting) return null;
        const c = ctx.crowd(); const a = c && c.nearestPerson(P, 3.4); if (!a) return null;
        const p = personas.get(a.id);
        return `<kbd>Enter</kbd> Talk to ${p && p.history.length ? p.name : a.kind === 'keeper' ? 'the stall keeper' : 'the hiker'}`;
      },
      open, personaOf,
      // QA: say a line to the nearest person
      qaSay(text) { const c = ctx.crowd(), a = c && c.nearestPerson(ctx.me(), 3.4); if (!a) return false; send(a, text); return true; }
    };
  }
};
