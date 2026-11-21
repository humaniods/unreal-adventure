'use strict';
/* Playing together (build 2.6).

   Start screen, "Play": Solo (as before, offline) · Couple (2) · Bakchods (4, 6 or 8 friends).
   Ludo-style rooms: the host creates a room and gets a 6-letter code and an invite link; friends type the code or
   open the link. Everyone taps Ready, the host starts, and the whole party sets off together from the host's start
   point and time. A friend can still join later with the same code: they appear at the start.
   One mountain, many parties (PUBG-style): the server puts parties starting at the same time into one shared world
   of up to 100 players. You see everyone around you; your party is your team (green names, on the watch map).
   Voice (voice.js, LiveKit), N switches: All (everyone near you, louder the closer, your team anywhere) · Team
   (only your party hears you and you hear only them) · Off (mic and speaker off).
   A player walking with music on their speaker: you hear it as they pass.
   Walk up to a player and press E to ask them to be friends; G accepts a request. Friends are kept on the server.

   Interface: create(ctx) -> { mode, active, update(dt, P), prompt(P), interact(P), acceptFriend(), cycleMic(),
     musicNear(x, z), peopleForMap() } */
window.TriundNet = {
  create(ctx) {
    const { THREE, scene } = ctx;
    const $ = id => document.getElementById(id);
    const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
      set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } } };
    const QS = new URLSearchParams(location.search);
    const SERVER = QS.get('server') || store.get('triund-server', '') ||
      (location.port === '8765' ? 'ws://' + location.hostname + ':8787/ws'                      // the old static dev server
        : (location.protocol === 'https:' ? 'wss://' : 'ws://') + (location.host || '127.0.0.1:8787') + '/ws');   // served by the trek server
    if (QS.get('server')) store.set('triund-server', QS.get('server'));
    let pid = store.get('triund-pid', '');
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(pid)) { pid = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => (b % 36).toString(36)).join(''); store.set('triund-pid', pid); }
    // everyone's clothes come from their player id (the same hash on every screen)
    const seedOf = id => { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

    /* ---------- start screen: mode and room ---------- */
    const css = document.createElement('style');
    css.textContent = `
#playPanel{display:grid;gap:10px;border:1px solid var(--line);border-radius:12px;padding:12px}
#playPanel[hidden]{display:none}
#playPanel .prow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
#playPanel input{flex:1;min-width:120px;font:700 22px var(--f-display);letter-spacing:.3em;text-transform:uppercase;background:transparent;color:inherit;border:1px solid var(--line);border-radius:10px;padding:8px 10px}
#roomCode{font:700 40px var(--f-display);letter-spacing:.25em;color:var(--marigold)}
#roomList{display:grid;gap:4px;margin:0;padding:0;list-style:none;font-size:15px}
#roomList li{display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding:4px 0}
#roomList .ok{color:#7fd37a}#roomList .wait{color:var(--muted)}
#roomMsg{font-size:14px;color:var(--muted);margin:0}
#roomMsg.err{color:#ff8a7a}
.btn.small{padding:8px 14px;font-size:15px}
#netPill{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:12;display:flex;gap:10px;align-items:center;background:rgba(13,22,19,.72);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:5px 14px;font:600 14px var(--f-display,sans-serif);letter-spacing:.04em;color:#f1ead8;pointer-events:none}
#netPill[hidden]{display:none}
#netPill .m-all{color:#7fd37a}#netPill .m-team{color:#f2c230}#netPill .m-off{color:#ff8a7a}
#netPill kbd{font:inherit;font-size:12px;border:1px solid rgba(255,255,255,.3);border-radius:4px;padding:0 4px}
#netPill .talk{display:inline-block;width:8px;height:8px;border-radius:50%;background:#7fd37a;opacity:.15;transition:opacity .1s}
#netPill .talk.on{opacity:1}`;
    document.head.appendChild(css);

    const startBtn = $('startBtn'), card = startBtn.closest('.card');
    const field = document.createElement('div'); field.className = 'field';
    field.innerHTML = `<div class="label" id="playLabel">Play</div>
<div class="seg" role="group" aria-labelledby="playLabel" id="playSeg">
  <button type="button" data-mode="solo" aria-pressed="true"><b>Solo</b><span>Just you and the bots</span></button>
  <button type="button" data-mode="couple" aria-pressed="false"><b>Couple</b><span>You and your partner</span></button>
  <button type="button" data-mode="bakchods" aria-pressed="false"><b>Bakchods</b><span>4, 6 or 8 friends</span></button>
</div>
<div id="playPanel" hidden>
  <div class="seg" role="group" aria-label="Group size" id="sizeSeg" hidden>
    <button type="button" data-size="4" aria-pressed="true"><b>4</b><span>friends</span></button>
    <button type="button" data-size="6" aria-pressed="false"><b>6</b><span>friends</span></button>
    <button type="button" data-size="8" aria-pressed="false"><b>8</b><span>friends</span></button>
  </div>
  <div id="roomOut">
    <div class="prow"><button type="button" class="btn primary small" id="roomCreate">Create a room</button><span class="fine">and send the code to your friends</span></div>
    <div class="prow" style="margin-top:8px"><input id="roomCodeIn" maxlength="6" placeholder="CODE" autocomplete="off" spellcheck="false" aria-label="Room code"><button type="button" class="btn ghost small" id="roomJoin">Join</button></div>
  </div>
  <div id="roomIn" hidden>
    <div class="prow"><span id="roomCode">------</span><button type="button" class="btn ghost small" id="roomCopy">Copy invite link</button><button type="button" class="btn ghost small" id="roomLeave">Leave</button></div>
    <ul id="roomList"></ul>
    <div class="prow"><button type="button" class="btn primary small" id="roomGo">Ready</button></div>
  </div>
  <p id="roomMsg"></p>
</div>`;
    $('nameBox').closest('.field').after(field);   // your name first: friends see it over your head
    const pill = document.createElement('div'); pill.id = 'netPill'; pill.hidden = true; document.body.appendChild(pill);

    let mode = 'solo', size = 4, ws = null, wsOpen = false, party = null, myName = '', started = false, ready = false;
    let world = null, team = new Set(), roster = new Map(), friends = new Map(), asks = [], micMode = store.get('triund-mic', 'all');
    if (!['all', 'team', 'off'].includes(micMode)) micMode = 'all';
    const msg = (t, err) => { const m = $('roomMsg'); m.textContent = t || ''; m.classList.toggle('err', !!err); };
    const ROUTE_NAME = { mcleod: 'McLeod Ganj', galu: 'Gallu Devi', magic: 'Magic View', shiva: 'Bhagsu' };
    const hourTxt = h => String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.round((h % 1) * 60)).padStart(2, '0');

    function syncMode() {
      document.querySelectorAll('#playSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
      document.querySelectorAll('#sizeSeg button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.size === size)));
      $('playPanel').hidden = mode === 'solo'; $('sizeSeg').hidden = mode !== 'bakchods' || !!party;
      $('roomOut').hidden = !!party; $('roomIn').hidden = !party;
      // in a room the big start button is replaced by Ready / Start together
      startBtn.style.display = mode === 'solo' ? '' : 'none';
      if (party) {
        $('roomCode').textContent = party.code;
        const host = party.host === pid;
        $('roomList').innerHTML = party.members.map(m => `<li><span>${esc(m.name)}${m.pid === party.host ? ' · host' : ''}${m.pid === pid ? ' (you)' : ''}</span><span class="${m.ready ? 'ok' : 'wait'}">${m.ready ? 'ready' : 'not ready'}</span></li>`).join('') +
          Array.from({ length: Math.max(0, party.size - party.members.length) }, () => '<li><span class="wait">waiting for a friend…</span><span></span></li>').join('');
        const go = $('roomGo');
        if (party.started) { go.textContent = 'Join the trek'; go.disabled = false; }
        else if (host) { const all = party.members.length >= 2 && party.members.every(m => m.ready); go.textContent = all ? 'Start together' : 'Waiting for friends'; go.disabled = !all; }
        else { go.textContent = ready ? 'Ready ✓ (tap to undo)' : 'I am ready'; go.disabled = false; }
        if (!host) msg(`${party.mode === 'couple' ? 'Couple' : 'Bakchods'} room · start: ${ROUTE_NAME[party.route] || party.route}, ${hourTxt(party.hour)} (the host chooses)`);
        else if (!party.started) msg('You are the host: the start point and time above are for everyone. Send the code or the link.');
      }
    }
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    $('playSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (party && b.dataset.mode !== party.mode) { msg('Leave the room first.', true); return; } mode = b.dataset.mode; syncMode(); if (mode !== 'solo') connect(); });
    $('sizeSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; size = +b.dataset.size; syncMode(); });
    $('roomCreate').addEventListener('click', () => { if (!needName()) return; send({ t: 'party.create', mode, size: mode === 'couple' ? 2 : size }); });
    $('roomJoin').addEventListener('click', () => { if (!needName()) return; const c = $('roomCodeIn').value.trim().toUpperCase(); if (c.length !== 6) { msg('The code has 6 letters.', true); return; } send({ t: 'party.join', code: c }); });
    $('roomCodeIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('roomJoin').click(); });
    $('roomLeave').addEventListener('click', () => { send({ t: 'party.leave' }); });
    $('roomCopy').addEventListener('click', () => {
      const u = new URL(location.href); u.search = ''; u.searchParams.set('join', party.code); if (QS.get('server')) u.searchParams.set('server', QS.get('server'));
      const text = `Triund trek together! Room code ${party.code}\n${u}`;
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => ctx.toast('Invite copied: send it on WhatsApp'), () => { prompt('Copy this invite:', text); });
    });
    $('roomGo').addEventListener('click', () => {
      if (!party) return;
      if (party.started) { if (pendingStart) begin(pendingStart); return; }
      if (party.host === pid) { send({ t: 'party.plan', route: ctx.getStart(), hour: ctx.getHour() }); send({ t: 'party.start' }); }
      else { ready = !ready; send({ t: 'party.ready', ready }); }
    });
    // the host's start point and time go to the room as they change them
    for (const id of ['fromSeg', 'timeSeg']) $(id).addEventListener('click', () => setTimeout(() => { if (party && party.host === pid && !party.started) send({ t: 'party.plan', route: ctx.getStart(), hour: ctx.getHour() }); }, 0));
    function needName() { if (ctx.needSex && !ctx.needSex()) { msg('Choose Male or Female first (under your name).', true); return false; } myName = ctx.getName(); if (!myName) { const nb = $('nameBox'); nb.classList.add('need'); nb.focus(); msg('Write your name first: your friends see it above your head.', true); return false; } if (wsOpen) send({ t: 'hello', pid, name: myName, sex: ctx.getSex ? ctx.getSex() || 'm' : 'm' }); return true; }

    /* ---------- connection ---------- */
    let queue = [], retry = 0;
    function connect() {
      if (ws) return;
      msg('Connecting to the trek server…');
      try { ws = new WebSocket(SERVER); } catch (e) { ws = null; msg('Cannot reach the trek server (' + SERVER + ').', true); return; }
      ws.onopen = () => { wsOpen = true; retry = 0; myName = ctx.getName() || 'Hiker'; ws.send(JSON.stringify({ t: 'hello', pid, name: myName, sex: ctx.getSex ? ctx.getSex() || 'm' : 'm' })); };
      ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } on(m); };
      ws.onclose = () => {
        const was = wsOpen; ws = null; wsOpen = false;
        if (mode === 'solo' && !started) return;
        msg(was ? 'Lost the trek server. Reconnecting…' : 'Cannot reach the trek server. Is it running? (' + SERVER + ')', true);
        if (started) { ctx.toast('Connection lost: reconnecting…'); clearRemotes(); }
        party = null; syncMode();
        if (retry++ < 20) setTimeout(connect, Math.min(8000, 800 * retry));
      };
    }
    function send(o) { if (ws && wsOpen) ws.send(JSON.stringify(o)); else { queue.push(o); connect(); } }
    let pendingStart = null;
    function on(m) {
      switch (m.t) {
        case 'welcome':
          friends = new Map((m.friends || []).map(f => [f.pid, f.name])); msg(mode === 'solo' ? '' : 'Connected. Create a room or type a friend’s code.');
          { const q = queue; queue = []; q.forEach(send); }
          if (joinCode) { const c = joinCode; joinCode = null; if (ctx.getName()) send({ t: 'party.join', code: c }); else { $('roomCodeIn').value = c; msg('Write your name, then press Join.'); } }
          break;
        case 'party': party = m; if (party.host === pid) ready = true; else ready = !!(party.members.find(x => x.pid === pid) || {}).ready; mode = party.mode; syncMode(); break;
        case 'party.gone': party = null; ready = false; msg('You left the room.'); syncMode(); break;
        case 'error': msg(m.msg, true); if (started) ctx.toast(m.msg); break;
        case 'start': pendingStart = m; if (!started) begin(m); break;
        case 'roster': setRoster(m.players || []); break;
        case 'snap': snap(m.p || []); break;
        case 'friend.ask': asks.push({ pid: m.pid, name: m.name }); ctx.say(`${m.name} wants to be your friend. Press G to accept.`, 5); ctx.buzz(1); break;
        case 'link.ask': linkAsk = { pid: m.pid, name: m.name, sex: m.sex, kind: m.kind }; ctx.buzz(1);
          ctx.say(m.kind === 'hand' ? `${m.name} holds out a hand. Press J to take it.` : `${m.name} crouches down to carry you on ${m.sex === 'f' ? 'her' : 'his'} shoulders. Press U to climb on.`, 6); break;
        case 'link': setLink(m.link); break;
        case 'friends': { const before = friends.size; friends = new Map((m.list || []).map(f => [f.pid, f.name])); if (friends.size > before) ctx.toast('New friend added'); break; }
      }
    }
    // an invite link: ?join=CODE opens the right room
    let joinCode = (QS.get('join') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || null;
    if (joinCode) { mode = 'bakchods'; $('roomCodeIn').value = joinCode; syncMode(); connect(); }

    function begin(m) {
      started = true; world = m.world; team = new Set(m.team || []);
      const all = [pid].concat(m.team || []).sort(), slot = all.indexOf(pid) - (all.length - 1) / 2;
      ctx.begin(m.route, m.hour, slot);
      pill.hidden = false; renderPill();
      // a voice server on the host's own laptop (127.0.0.1) cannot be reached by friends elsewhere: say so instead of failing
      const loop = h => /^(127\.|localhost$|\[?::1)/.test(h);
      if (m.voice && loop(new URL(m.voice.url.replace(/^ws/, 'http')).hostname) && !loop(location.hostname)) {
        m.voice = null; ctx.toast('Voice works once the trek is on the online server. Walk together and chat with Enter for now.');
      } else if (m.voice && window.TriundVoice) {
        VOICE = window.TriundVoice.create({ url: m.voice.url, token: m.voice.token, mode: micMode, team: () => team, where: id => { const r = remotes.get(id); return r ? r.a : null; }, me: () => ctx.me(), onTalk: (id, on) => { if (id === pid) myTalk = on; else { const r = remotes.get(id); if (r) { r.talk = on; r.tagDirty = true; } } renderPill(); }, onError: t => ctx.toast(t) });
      } else if (!m.voice && !VOICE) ctx.toast('Voice is not set up on this server: you see your friends but cannot talk.');
      send({ t: 'mic', mode: micMode });
    }
    let VOICE = null, myTalk = false;

    /* ---------- other players ---------- */
    const remotes = new Map();   // pid -> { a (crowd slot), buf: [[t,x,y,z,yaw]], anim, speed, flags, tag, name, team }
    const DELAY = 0.12;          // render 120 ms in the past so there are always two snapshots to blend
    function setRoster(list) {
      roster = new Map(list.map(p => [p.pid, p]));
      for (const [id, r] of remotes) if (!roster.has(id)) dropRemote(id);
      for (const [id, r] of remotes) { const p = roster.get(id); r.name = p.name; r.team = p.team; r.mic = p.mic; r.friend = p.friend; r.link = p.link; r.tagDirty = true;
        if (p.sex && p.sex !== r.sex && ctx.crowd()) { r.sex = p.sex; ctx.crowd().freeRemote(r.a); r.a = ctx.crowd().addRemote(p.sex, seedOf(id)); } }   // they changed Male/Female: a new body
      renderPill();
    }
    function dropRemote(id) { const r = remotes.get(id); if (!r) return; if (ctx.crowd()) ctx.crowd().freeRemote(r.a); if (r.tag) { scene.remove(r.tag); r.tag.material.map.dispose(); r.tag.material.dispose(); } remotes.delete(id); }
    function clearRemotes() { for (const id of Array.from(remotes.keys())) dropRemote(id); }
    function snap(list) {
      const now = performance.now() / 1000, seen = new Set();
      for (const s of list) {
        const [id, x, y, z, yaw, anim, speed, flags] = s; seen.add(id);
        let r = remotes.get(id);
        if (!r) {
          const info = roster.get(id) || { name: 'Hiker', sex: 'm', team: team.has(id) };
          const a = ctx.crowd() ? ctx.crowd().addRemote(info.sex, seedOf(id)) : null; if (!a) continue;
          r = { a, buf: [], name: info.name, sex: info.sex, link: info.link, team: info.team || team.has(id), mic: info.mic, friend: info.friend, tag: null, tagDirty: true, talk: false, last: now };
          remotes.set(id, r);
        }
        r.buf.push([now, x, y, z, yaw]); if (r.buf.length > 8) r.buf.shift();
        r.anim = anim; r.speed = speed; r.flags = flags; r.last = now;
      }
      // out of range (the server stops sending them): gone after 2 s
      for (const [id, r] of remotes) if (!seen.has(id) && now - r.last > 2) dropRemote(id);
    }
    const angLerp = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };
    function makeTag(r) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
      g.font = '600 30px Rajdhani, Hind, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const label = r.name + (r.talk ? '  \u{1F50A}' : r.mic === 'off' ? '  \u{1F507}' : '');
      const w = Math.min(250, g.measureText(label).width + 28);
      g.fillStyle = 'rgba(13,22,19,0.6)'; g.beginPath(); g.roundRect ? g.roundRect(128 - w / 2, 10, w, 44, 22) : g.rect(128 - w / 2, 10, w, 44); g.fill();
      g.fillStyle = r.team ? '#8ff08a' : r.friend ? '#f2c230' : '#f1ead8'; g.fillText(label, 128, 33);
      const tex = new THREE.CanvasTexture(c);
      if (!r.tag) { r.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, fog: false })); r.tag.scale.set(1.6, 0.4, 1); r.tag.renderOrder = 5; scene.add(r.tag); }
      else { r.tag.material.map.dispose(); r.tag.material.map = tex; r.tag.material.needsUpdate = true; }
      r.tagDirty = false;
    }

    /* ---------- hand in hand, on your partner's shoulders (J / U; the other one says yes with the same key) ---------- */
    let link = null, linkAsk = null;          // my link { kind, with, lead }; a request waiting for my answer
    const SHOULDER = 1.43;                    // shoulder height of a standing hiker, per unit of body scale
    const KG = { f: 55, m: 68 };              // what your partner weighs on your shoulders
    function setLink(l) {
      const was = link; link = l; linkAsk = null;
      const r = l ? remotes.get(l.with) : null, name = r ? r.name : (was && remotes.get(was.with) || {}).name || 'your partner';
      ctx.setCarry(l && l.kind === 'carry' && l.lead ? KG[(r && r.sex) || 'f'] : 0);
      if (l && l.kind === 'hand') ctx.say(`You walk hand in hand with ${name}. J to let go.`, 4);
      else if (l && l.kind === 'carry') ctx.say(l.lead ? `${name} is on your shoulders. Heavy! Every step costs more now. U to put ${r && r.sex === 'm' ? 'him' : 'her'} down.` : `You are up on ${name}'s shoulders: what a view. U to get down.`, 5);
      else if (was) {
        ctx.say(was.kind === 'hand' ? 'You let go of each other\'s hands.' : was.lead ? 'You crouch and let your partner down.' : 'You slide down off the shoulders, back on your own feet.', 3);
        if (was.kind === 'carry' && !was.lead) {   // carried: step down beside the one who carried you
          const c = remotes.get(was.with), P = ctx.me();
          if (c && P) { P.x = c.a.x + Math.cos(c.a.yaw) * 0.9; P.z = c.a.z - Math.sin(c.a.yaw) * 0.9; P.y = ctx.ground(P.x, P.z); }
        }
      }
      for (const rr of remotes.values()) rr.tagDirty = true;
    }
    function teammateNear(P, d0) { let best = null, bd = d0 || 2.5; for (const [id, r] of remotes) if (r.team) { const d = Math.hypot(r.a.x - P.x, r.a.z - P.z); if (d < bd) { bd = d; best = { pid: id, r }; } } return best; }
    function linkKey(kind) {
      if (!started) return;
      if (link) { send({ t: 'link.end' }); return; }
      if (linkAsk && linkAsk.kind === kind) { send({ t: 'link.accept', pid: linkAsk.pid }); return; }
      const n = teammateNear(ctx.me(), 2.6);
      if (!n) { ctx.toast(kind === 'hand' ? 'Stand next to your partner to hold hands' : 'Stand next to your partner to carry them'); return; }
      send({ t: 'link.ask', pid: n.pid, kind });
      ctx.say(kind === 'hand' ? `You hold out your hand to ${n.r.name}.` : `You crouch down so ${n.r.name} can climb onto your shoulders.`, 3);
    }
    // where a body is: me (my character, or where I stand) or a player I can see
    const bodyOf = id => {
      if (id === pid) { const b = ctx.myBody(); return b; }
      const r = remotes.get(id); return r ? { x: r.a.x, y: r.a.y, z: r.a.z, yaw: r.a.yaw, scale: r.a.look.scale, root: r.a.ch && r.a.ch.root, a: r.a } : null;
    };
    // on someone's shoulders: hips just behind their neck, thighs over their shoulders, facing the same way
    function onShoulders(c) { const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw); return ctx.crowd().sitRoot({ x: c.x - fx * 0.08, z: c.z - fz * 0.08, ry: c.yaw, y: c.y + SHOULDER * c.scale }, 0.93); }
    // the carried one and the carrier, the two hands that hold: every pair I can see, once (lead -> other)
    function pairs() {
      const out = [];
      if (link) out.push(link.lead ? { kind: link.kind, lead: pid, other: link.with } : { kind: link.kind, lead: link.with, other: pid });
      for (const [id, r] of remotes) if (r.link && r.link.lead && r.link.with !== pid) out.push({ kind: r.link.kind, lead: id, other: r.link.with });
      return out;
    }
    const V = () => new THREE.Vector3();
    const _p = V(), _d = V(), _t = V(), _p2 = V(), _d2 = V(), _t2 = V();
    function holdHand(b, toward) {   // b's hand on the side of `toward`, reaching for the point between them
      if (!b || !b.root || !b.root.visible) return;
      const lx = Math.cos(b.yaw), lz = -Math.sin(b.yaw), dx = toward.x - b.x, dz = toward.z - b.z, side = lx * dx + lz * dz > 0 ? 'l' : 'r';
      const d = Math.hypot(dx, dz) || 1, reach = Math.min(0.5 * d, 0.5) * b.scale;
      _p.set(b.x + dx / d * reach, b.y + 0.88 * b.scale, b.z + dz / d * reach);
      _d.set(dx / d, -0.35, dz / d).normalize(); _t.set(Math.sin(b.yaw), 0, Math.cos(b.yaw));
      window.TriundAnim.armIK(THREE, b.root, { [side]: { p: _p, dir: _d, thumb: _t } }, b.yaw);
    }
    function holdShins(c) {          // the carrier's hands on the shins hanging down in front of their chest
      if (!c || !c.root || !c.root.visible) return;
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), lx = Math.cos(c.yaw), lz = -Math.sin(c.yaw), y = c.y + 1.18 * c.scale, f = 0.2 * c.scale;
      _p.set(c.x + fx * f + lx * 0.16, y, c.z + fz * f + lz * 0.16); _p2.set(c.x + fx * f - lx * 0.16, y, c.z + fz * f - lz * 0.16);
      _d.set(fx * 0.3, -1, fz * 0.3).normalize(); _d2.copy(_d); _t.set(-lx, 0, -lz); _t2.set(lx, 0, lz);
      window.TriundAnim.armIK(THREE, c.root, { l: { p: _p, dir: _d, thumb: _t }, r: { p: _p2, dir: _d2, thumb: _t2 } }, c.yaw);
    }
    function holdHead(rider, c) {    // the rider's hands resting on the carrier's head
      if (!rider || !rider.root || !rider.root.visible) return;
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), lx = Math.cos(c.yaw), lz = -Math.sin(c.yaw), y = c.y + 1.68 * c.scale;
      _p.set(c.x + fx * 0.04 + lx * 0.09, y, c.z + fz * 0.04 + lz * 0.09); _p2.set(c.x + fx * 0.04 - lx * 0.09, y, c.z + fz * 0.04 - lz * 0.09);
      _d.set(fx, -0.4, fz).normalize(); _d2.copy(_d); _t.set(-lx, 0, -lz); _t2.set(lx, 0, lz);
      window.TriundAnim.armIK(THREE, rider.root, { l: { p: _p, dir: _d, thumb: _t }, r: { p: _p2, dir: _d2, thumb: _t2 } }, c.yaw);
    }

    /* ---------- what you send: where you are and what you are doing, 10 times a second ---------- */
    let sendT = 0;
    function renderPill() {
      if (pill.hidden) return;
      const near = Array.from(remotes.values()).filter(r => r.a && Math.hypot(r.a.x - ctx.me().x, r.a.z - ctx.me().z) < 60).length;
      const teamOn = Array.from(roster.values()).filter(p => p.team).length;
      const label = { all: 'Mic: All', team: 'Mic: Team', off: 'Mic: Off' }[micMode];
      pill.innerHTML = `<span class="talk${myTalk ? ' on' : ''}"></span><span class="m-${micMode}">${label}</span><kbd>N</kbd><span>· team ${teamOn + 1} · ${near} near · ${roster.size + 1} on the mountain</span>`;
    }
    let pillT = 0;
    return {
      get mode() { return mode; },
      get active() { return started && wsOpen; },
      pid, seed: seedOf(pid),
      update(dt, P, pose) {
        if (!started) return;
        sendT -= dt;
        if (sendT <= 0 && wsOpen && pose) { sendT = 0.1; send({ t: 'pose', p: [+pose.x.toFixed(2), +pose.y.toFixed(2), +pose.z.toFixed(2), +pose.yaw.toFixed(3), pose.anim, +(pose.speed || 1).toFixed(2), pose.flags | 0] }); }
        const now = performance.now() / 1000 - DELAY;
        for (const [id, r] of remotes) {
          const b = r.buf; if (!b.length) continue;
          let i = b.length - 1; while (i > 0 && b[i - 1][0] > now) i--;
          const A = b[Math.max(0, i - 1)], B = b[i], t = B[0] > A[0] ? Math.min(1, Math.max(0, (now - A[0]) / (B[0] - A[0]))) : 1;
          const a = r.a; a.x = A[1] + (B[1] - A[1]) * t; a.y = A[2] + (B[2] - A[2]) * t; a.z = A[3] + (B[3] - A[3]) * t; a.yaw = angLerp(A[4], B[4], t);
          a.anim = r.anim || 'Idle'; a.animSpeed = r.speed || 1; a.lamp = !!(r.flags & 1);
          if (r.tagDirty) makeTag(r);
          r.tag.position.set(a.x, a.y + 2.15, a.z); r.tag.visible = Math.hypot(a.x - P.x, a.z - P.z) < 45;
        }
        // anyone being carried sits on their carrier's shoulders (placed here from the carrier, so the two never drift apart)
        for (const pr of pairs()) {
          if (pr.kind !== 'carry' || pr.other === pid) continue;
          const c = bodyOf(pr.lead), rr = remotes.get(pr.other); if (!c || !rr) continue;
          const q = onShoulders(c); rr.a.x = q.x; rr.a.y = q.y; rr.a.z = q.z; rr.a.yaw = c.yaw; rr.a.anim = 'Sitting_Idle'; rr.a.animSpeed = 1;
          if (rr.tag) rr.tag.position.set(q.x, q.y + 1.9, q.z);
        }
        P.pullV = 0;
        if (link) {
          const r = remotes.get(link.with);
          if (r && link.kind === 'carry' && !link.lead) {          // I am carried: I go where they go
            P.x = r.a.x; P.z = r.a.z; P.y = ctx.ground(P.x, P.z); P.v = 0;
          } else if (r && link.kind === 'hand') {
            // hand in hand: you walk side by side, about 75 cm apart; whoever falls behind or drifts is drawn back to
            // the other's side (the side you were on when you took hands)
            const d = Math.hypot(r.a.x - P.x, r.a.z - P.z);
            if (d > 7) send({ t: 'link.end' });
            else {
              const lx = Math.cos(r.a.yaw), lz = -Math.sin(r.a.yaw);
              if (link.side === undefined) link.side = lx * (P.x - r.a.x) + lz * (P.z - r.a.z) >= 0 ? 1 : -1;
              const tx = r.a.x + lx * link.side * 0.75, tz = r.a.z + lz * link.side * 0.75, ex = tx - P.x, ez = tz - P.z, e = Math.hypot(ex, ez);
              P.pullV = 0;
              // whoever walks leads; only the one standing still (or barely moving) is drawn along
              if (e > 0.2 && P.v < 0.3) { const k = Math.min(e - 0.2, (e - 0.2) * dt * (d > 1.2 ? 6 : 2.5)); P.x += ex / e * k; P.z += ez / e * k; P.y = ctx.ground(P.x, P.z); P.pullV = k / Math.max(dt, 1e-3); P.pullYaw = r.a.yaw; }
            }
          }
        }
        if (VOICE) VOICE.tick(dt);
        pillT -= dt; if (pillT <= 0) { pillT = 1; renderPill(); }
      },
      get carried() { return !!(link && link.kind === 'carry' && !link.lead && remotes.get(link.with)); },
      // the one carrying me: where to put my body (on their shoulders)
      carrierSeat() { const c = link && bodyOf(link.with); return c ? Object.assign(onShoulders(c), { yaw: c.yaw }) : null; },
      // after the bodies are animated: hands that hold hands, the carrier's hands on the rider's shins, the rider's on the head
      afterBodies() {
        if (!started) return;
        for (const pr of pairs()) {
          const a = bodyOf(pr.lead), b = bodyOf(pr.other); if (!a || !b) continue;
          if (pr.kind === 'hand') { holdHand(a, b); holdHand(b, a); }
          else { holdShins(a); holdHead(b, a); }
        }
      },
      hands() { linkKey('hand'); }, carry() { linkKey('carry'); },
      linkState() { return { link, ask: linkAsk }; },
      // QA: what this player sees and hears
      debug() { return { mode: micMode, link, remotes: Array.from(remotes, ([id, r]) => ({ id, name: r.name, sex: r.sex, body: r.a.look.sex, team: r.team, x: r.a.x, y: r.a.y, z: r.a.z, yaw: r.a.yaw, anim: r.a.anim, ch: !!r.a.ch, link: r.link })), voice: VOICE && VOICE.debug ? VOICE.debug() : null }; },
      // the nearest real player (for E: ask to be friends)
      nearest(P, r0) { let best = null, bd = r0 || 3.5; for (const [id, r] of remotes) { const d = Math.hypot(r.a.x - P.x, r.a.z - P.z); if (d < bd) { bd = d; best = { pid: id, r }; } } return best; },
      prompt(P) {
        if (!started) return null;
        if (link) { const r = remotes.get(link.with), nm = esc(r ? r.name : 'partner'); return link.kind === 'hand' ? `<kbd>J</kbd> Let go of ${nm}'s hand` : link.lead ? `<kbd>U</kbd> Put ${nm} down` : `<kbd>U</kbd> Get down`; }
        if (linkAsk) return linkAsk.kind === 'hand' ? `<kbd>J</kbd> Take ${esc(linkAsk.name)}'s hand` : `<kbd>U</kbd> Climb onto ${esc(linkAsk.name)}'s shoulders`;
        const n = this.nearest(P); if (!n) return null;
        if (n.r.team) return `<kbd>J</kbd> Hold ${esc(n.r.name)}'s hand · <kbd>U</kbd> Carry ${n.r.sex === 'm' ? 'him' : 'her'} on your shoulders`;
        if (friends.has(n.pid)) return `${esc(n.r.name)} · friend`;
        return `<kbd>E</kbd> Ask ${esc(n.r.name)} to be friends`;
      },
      interact(P) {
        if (!started) return false; const n = this.nearest(P); if (!n || n.r.team || friends.has(n.pid)) return false;
        send({ t: 'friend.ask', pid: n.pid }); ctx.say(`You wave at ${n.r.name} and ask to be friends.`, 3); return true;
      },
      acceptFriend() {
        const a = asks.shift(); if (!a) { ctx.toast('No friend requests'); return; }
        send({ t: 'friend.accept', pid: a.pid }); ctx.say(`You and ${a.name} are friends now.`, 3);
      },
      cycleMic() {
        if (!started) return;
        micMode = micMode === 'all' ? 'team' : micMode === 'team' ? 'off' : 'all'; store.set('triund-mic', micMode);
        send({ t: 'mic', mode: micMode }); if (VOICE) VOICE.setMode(micMode);
        ctx.toast({ all: 'Mic: All. Everyone near you hears you; your team hears you anywhere', team: 'Mic: Team. Only your party', off: 'Mic and speaker off' }[micMode]);
        renderPill();
      },
      // a player near you with music on their speaker (sound.js plays it by distance and side)
      rename() { if (wsOpen) send({ t: 'hello', pid, name: ctx.getName() || 'Hiker', sex: ctx.getSex ? ctx.getSex() || 'm' : 'm' }); },
      musicNear(x, z) { let best = null, bd = 60; for (const r of remotes.values()) if (r.flags & 2) { const d = Math.hypot(r.a.x - x, r.a.z - z); if (d < bd) { bd = d; best = { x: r.a.x, z: r.a.z }; } } return best; },
      // for the watch map: team in green, others in white
      peopleForMap() { return Array.from(remotes.values()).map(r => ({ x: r.a.x, z: r.a.z, team: r.team })); }
    };
  }
};
