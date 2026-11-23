'use strict';
/* Rooms without a server of our own (build 2.7), the way a game like Ludo feels: open the game anywhere (phone,
   tablet, laptop), Create a room, share the code; friends open the game anywhere and Join with it.

   The browser that creates the room is the room: it runs the same room logic as ../../server (ready, start, the
   host's start point and time, positions ten times a second, hand in hand, carrying, mic modes) and every friend
   connects straight to it over WebRTC (PeerJS; its free public broker only introduces the two browsers, then the
   game data flows between them; PeerJS's TURN relay helps through strict networks). If the host closes the game, the
   room ends. Good for a couple or a group of bakchods (2-8); the 100-player shared mountain needs the trek server.

   TriundP2P.host(code) / TriundP2P.join(code) return an object shaped like a WebSocket (send, onopen, onmessage,
   onclose, close), so net.js speaks the same messages to either. TriundP2P.voice(...) is the same in-game voice as
   voice.js, peer to peer. */
window.TriundP2P = (function () {
  const PREFIX = 'triund-room-';
  const LIB = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  let libP = null;
  const lib = () => libP || (libP = new Promise((ok, bad) => {
    if (window.Peer) return ok(window.Peer);
    const s = document.createElement('script'); s.src = LIB; s.onload = () => window.Peer ? ok(window.Peer) : bad(new Error('no Peer')); s.onerror = () => bad(new Error('could not load PeerJS')); document.head.appendChild(s);
  }));
  const sockLike = () => ({ onopen: null, onmessage: null, onclose: null, readyState: 0 });
  let myPeer = null;   // this browser's PeerJS peer (voice calls use it too)

  /* ---------- the room, run by the host's browser (the same rules as server/triund_server/rooms.py) ---------- */
  function Hub(code, peerId) {
    const players = new Map();   // pid -> { pid, name, sex, mic, pose, peer, out(msg) }
    let party = null; const links = new Map(), linkAsks = new Map();
    const send = (pid, m) => { const p = players.get(pid); if (p) p.out(m); };
    // poses go on the fast line when there is one (unordered: a lost packet does not hold up the ones behind it)
    const sendFast = (pid, m) => { const p = players.get(pid); if (p) (p.fast || p.out)(m); };
    const view = () => party && { t: 'party', code: party.code, mode: party.mode, size: party.size, host: party.host, started: party.started, route: party.route, hour: party.hour,
      members: party.members.filter(m => players.has(m)).map(m => ({ pid: m, name: players.get(m).name, ready: party.ready.has(m) || m === party.host })) };
    const toParty = () => { const v = view(); if (v) party.members.forEach(m => send(m, v)); };
    const linkView = pid => { const l = links.get(pid); return l ? { kind: l.kind, with: l.lead === pid ? l.other : l.lead, lead: l.lead === pid } : null; };
    const roster = () => { if (!party || !party.started) return; for (const m of party.members) send(m, { t: 'roster', players: party.members.filter(o => o !== m && players.has(o)).map(o => { const q = players.get(o); return { pid: o, name: q.name, sex: q.sex, team: true, mic: q.mic, friend: false, link: linkView(o), peer: q.peer }; }) }); };
    const startFor = pid => send(pid, { t: 'start', world: 'p2p-' + code, route: party.route, hour: party.hour, team: party.members.filter(m => m !== pid), voice: { p2p: true } });
    const near = (a, b) => a.pose && b.pose && (a.pose[0] - b.pose[0]) ** 2 + (a.pose[2] - b.pose[2]) ** 2 <= 9;
    function endLink(pid) {
      linkAsks.delete(pid); for (const [k, v] of linkAsks) if (v.from === pid) linkAsks.delete(k);
      const l = links.get(pid); if (!l) return; links.delete(l.lead); links.delete(l.other);
      [l.lead, l.other].forEach(a => send(a, { t: 'link', link: null })); roster();
    }
    const err = (pid, msg, t) => send(pid, { t: 'error', msg, for: t });
    function handle(pid, m) {
      const me = players.get(pid); if (!me) return;
      switch (m.t) {
        case 'hello': me.name = String(m.name || 'Hiker').replace(/[<>&"]/g, '').trim().slice(0, 32) || 'Hiker'; me.sex = m.sex === 'f' ? 'f' : 'm'; if (m.peer) me.peer = String(m.peer).slice(0, 80); toParty(); roster(); break;
        case 'pose': {
          if (!(Array.isArray(m.p) && m.p.length === 7 && m.p.slice(0, 4).every(Number.isFinite))) break;
          const ts = Number.isFinite(m.ts) ? m.ts : null;
          if (ts !== null && me.ts !== null && ts <= me.ts && ts > me.ts - 5000) break;   // overtaken by a newer one
          me.pose = m.p; me.ts = ts;
          // passed on the moment it arrives (not on a timer of our own, which would beat against the sender's 15 a
          // second and send some poses twice and skip others); with the sender's own time, so friends see even steps
          if (party && party.started && party.members.includes(pid)) { const e = [pid, ...m.p]; if (ts !== null) e.push(ts); for (const o of party.members) if (o !== pid && players.has(o)) sendFast(o, { t: 'snap', p: [e] }); }
          break; }
        case 'ping': send(pid, { t: 'pong', at: m.at }); break;
        case 'party.create': {
          if (party && party.host !== pid) return err(pid, 'This room already has a host.', m.t);
          const size = m.mode === 'couple' ? 2 : [4, 6, 8].includes(+m.size) ? +m.size : 4;
          party = { code, mode: m.mode === 'couple' ? 'couple' : 'bakchods', size, host: pid, members: [pid], ready: new Set(), started: false, route: 'galu', hour: 7.5 };
          toParty(); break; }
        case 'party.join': {
          if (!party || String(m.code || '').toUpperCase() !== code) return err(pid, 'No room with that code. Check the letters with your friend.', m.t);
          if (!party.members.includes(pid)) {
            if (party.members.length >= party.size) return err(pid, `That room is full (${party.size} of ${party.size}).`, m.t);
            party.members.push(pid);
          }
          toParty(); if (party.started) { startFor(pid); roster(); } break; }
        case 'party.ready': if (party) { m.ready ? party.ready.add(pid) : party.ready.delete(pid); toParty(); } break;
        case 'party.plan': if (party && party.host === pid && ['mcleod', 'galu', 'magic', 'shiva'].includes(m.route) && [7.5, 9, 11].includes(+m.hour)) { party.route = m.route; party.hour = +m.hour; toParty(); } break;
        case 'party.start': {
          if (!party || party.host !== pid) return err(pid, 'Only the host can start.', m.t);
          if (party.members.length < 2) return err(pid, 'Wait for at least one friend to join.', m.t);
          const waiting = party.members.filter(x => x !== pid && !party.ready.has(x)).map(x => players.get(x).name);
          if (waiting.length) return err(pid, 'Not ready yet: ' + waiting.join(', ') + '.', m.t);
          party.started = true; toParty(); party.members.forEach(startFor); roster(); break; }
        case 'party.leave': leave(pid); send(pid, { t: 'party.gone' }); break;
        case 'mic': if (['all', 'team', 'off'].includes(m.mode)) { me.mic = m.mode; roster(); } break;
        case 'link.ask': {
          const o = players.get(String(m.pid || '')), kind = m.kind;
          if (!o || !party || !party.members.includes(o.pid) || o.pid === pid) return err(pid, 'Only with someone from your own group.', m.t);
          if (!['hand', 'carry'].includes(kind)) return;
          if (links.has(pid) || links.has(o.pid)) return err(pid, 'Let go first.', m.t);
          if (!near(me, o)) return err(pid, 'Walk up next to them first.', m.t);
          linkAsks.set(o.pid, { from: pid, kind }); send(o.pid, { t: 'link.ask', pid, name: me.name, sex: me.sex, kind }); break; }
        case 'link.accept': {
          const a = linkAsks.get(pid); if (!a || a.from !== m.pid) return err(pid, 'Nobody asked.', m.t);
          linkAsks.delete(pid); const o = players.get(a.from); if (!o || links.has(pid) || links.has(a.from)) return err(pid, 'Too late.', m.t);
          const l = { kind: a.kind, lead: a.from, other: pid }; links.set(a.from, l); links.set(pid, l);
          [a.from, pid].forEach(x => send(x, { t: 'link', link: linkView(x) })); roster(); break; }
        case 'link.end': endLink(pid); break;
        default: break;   // friend requests: everyone in a room is already your group
      }
    }
    function leave(pid) {
      endLink(pid);
      if (!party) return;
      party.members = party.members.filter(x => x !== pid); party.ready.delete(pid);
      if (pid === party.host) { party.members.forEach(x => { send(x, { t: 'error', msg: 'The host closed the room.' }); send(x, { t: 'party.gone' }); }); party = null; return; }
      toParty(); roster();
    }
    const tick = setInterval(() => { if (party) party.members.forEach(m => send(m, { t: 'pong', at: 0 })); }, 2000);   // heartbeat: the room is still there
    return {
      code, peerId,
      add(pid, out) { players.set(pid, { pid, name: 'Hiker', sex: 'm', mic: 'all', pose: null, ts: null, peer: null, out, fast: null }); out({ t: 'welcome', pid, name: 'Hiker', friends: [] }); },
      setFast(pid, f) { const p = players.get(pid); if (p) p.fast = f; },
      has: pid => players.has(pid),
      handle, remove(pid) { if (!players.has(pid)) return; leave(pid); players.delete(pid); },
      stop() { clearInterval(tick); }
    };
  }

  /* ---------- the host: this browser is the room ---------- */
  function host(code) {
    const sock = sockLike(); let hub = null, peer = null, closed = false;
    const local = { pid: null };
    const fastOut = new Map(), pidPeer = new Map();   // pid -> its fast line's send; pid -> the browser it came from
    sock.send = str => { let m; try { m = JSON.parse(str); } catch (e) { return; }
      if (!hub) return;
      if (m.t === 'hello' && !local.pid) { local.pid = String(m.pid); hub.add(local.pid, o => sock.onmessage && sock.onmessage({ data: JSON.stringify(o) })); }
      if (local.pid) hub.handle(local.pid, m); };
    sock.close = () => { closed = true; if (hub) hub.stop(); if (peer) peer.destroy(); };
    lib().then(Peer => {
      peer = myPeer = new Peer(PREFIX + code, { debug: 0 });
      peer.on('open', id => { hub = Hub(code, id); sock.readyState = 1; sock.peerId = id; sock.onopen && sock.onopen(); });
      peer.on('connection', conn => {
        if (conn.label === 'fast') {   // a friend's second, unordered line: poses only
          const fp = String(conn.metadata && conn.metadata.pid || '');
          if (!/^[A-Za-z0-9_-]{8,40}$/.test(fp)) { conn.close(); return; }
          const out = o => { if (conn.open) conn.send(JSON.stringify(o)); };
          const mine = () => pidPeer.get(fp) === conn.peer;   // only from the browser that said hello as this pid
          conn.on('open', () => { fastOut.set(fp, out); if (hub && mine()) hub.setFast(fp, out); out({ t: 'fast' }); });   // 'fast': this host knows the line
          conn.on('data', d => { let m; try { m = typeof d === 'string' ? JSON.parse(d) : d; } catch (e) { return; } if (hub && m && m.t === 'pose' && mine() && hub.has(fp)) hub.handle(fp, m); });
          const gone = () => { if (fastOut.get(fp) === out) { fastOut.delete(fp); if (hub) hub.setFast(fp, null); } };
          conn.on('close', gone); conn.on('error', gone);
          return;
        }
        let pid = null;
        conn.on('data', d => { let m; try { m = typeof d === 'string' ? JSON.parse(d) : d; } catch (e) { return; }
          if (!pid) { if (m.t !== 'hello' || !/^[A-Za-z0-9_-]{8,40}$/.test(String(m.pid))) return; pid = String(m.pid); pidPeer.set(pid, conn.peer); hub.add(pid, o => { if (conn.open) conn.send(JSON.stringify(o)); }); if (fastOut.has(pid)) hub.setFast(pid, fastOut.get(pid)); }
          hub.handle(pid, m); });
        conn.on('close', () => { if (pid) hub.remove(pid); });
        conn.on('error', () => { if (pid) hub.remove(pid); });
      });
      peer.on('error', e => { sock.error = e.type === 'unavailable-id' ? 'taken' : e.type; if (!closed && sock.readyState !== 1) { sock.readyState = 3; sock.onclose && sock.onclose(); } });
      peer.on('disconnected', () => { if (!closed && !peer.destroyed) peer.reconnect(); });   // the broker dropped us; data links keep running
    }, () => { sock.error = 'lib'; sock.readyState = 3; sock.onclose && sock.onclose(); });
    return sock;
  }

  /* ---------- a friend: connect to the host's browser ---------- */
  function join(code) {
    const sock = sockLike(); let peer = null, conn = null, closed = false, fast = null, fastOk = false, fastTries = 0;
    // poses on a second line that is unordered (reliable: false), so one lost packet on a phone's Wi-Fi does not
    // hold every pose behind it; everything else (rooms, hands, carrying) stays on the ordered line
    function openFast(pid) {
      if (closed || fast || fastTries++ > 3 || !peer || !conn || !conn.open) return;
      const f = fast = peer.connect(PREFIX + code, { reliable: false, label: 'fast', metadata: { pid } });
      // poses move to this line only once the host answers on it (a host on an older version of the game ignores it)
      f.on('data', d => { if (fast === f) fastOk = true; sock.onmessage && sock.onmessage({ data: typeof d === 'string' ? d : JSON.stringify(d) }); });
      const gone = () => { if (fast === f) { fast = null; fastOk = false; setTimeout(() => openFast(pid), 3000); } };
      f.on('close', gone); f.on('error', gone);
    }
    sock.send = str => {
      if (fastOk && fast && fast.open && str.startsWith('{"t":"pose"')) { fast.send(str); return; }
      if (conn && conn.open) conn.send(str);
      if (!fast && str.startsWith('{"t":"hello"')) { try { openFast(String(JSON.parse(str).pid)); } catch (e) { /* not json */ } }
    };
    sock.close = () => { closed = true; if (peer) peer.destroy(); };
    const fail = why => { if (closed) return; sock.error = why; const was = sock.readyState; sock.readyState = 3; closed = true; if (peer) peer.destroy(); if (sock.onclose) sock.onclose({ wasOpen: was === 1 }); };
    lib().then(Peer => {
      peer = myPeer = new Peer({ debug: 0 });
      peer.on('open', id => {
        sock.peerId = id;
        conn = peer.connect(PREFIX + code, { reliable: true });
        const t = setTimeout(() => { if (!conn.open) fail('timeout'); }, 15000);
        conn.on('open', () => { clearTimeout(t); sock.readyState = 1; sock.onopen && sock.onopen(); });
        conn.on('data', d => sock.onmessage && sock.onmessage({ data: typeof d === 'string' ? d : JSON.stringify(d) }));
        conn.on('close', () => fail('closed'));
      });
      peer.on('error', e => fail(e.type === 'peer-unavailable' ? 'noroom' : e.type));
    }, () => fail('lib'));
    return sock;
  }

  /* ---------- the microphone ----------
     Phones and tablets (iPad/iPhone Safari above all) only ask for the microphone, and only start playing other
     people's voices, after a tap. So the game asks on the taps that lead into a room (Create, Join, Ready, Start,
     Mic) through mic(), keeps the stream, and voice() uses it. */
  let micStream = null, micAsk = null, micErr = null;
  const MIC_HELP = {
    NotAllowedError: 'Microphone is blocked for this site. iPad / iPhone: Settings → Safari → Microphone → Allow (or aA in the address bar → Website Settings → Microphone). Android Chrome: tap the lock by the address → Permissions → Microphone → Allow. Then tap Mic again.',
    NotFoundError: 'No microphone found on this device.',
    NotReadableError: 'Another app is using the microphone. Close it and tap Mic again.',
    SecurityError: 'The microphone needs the https link of the game.'
  };
  function mic(force) {
    if (micStream && micStream.getAudioTracks().some(t => t.readyState === 'live')) return Promise.resolve(micStream);
    if (micAsk && !force) return micAsk;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { micErr = 'This browser cannot use the microphone here (open the https link in Chrome or Safari).'; return Promise.reject(new Error(micErr)); }
    micAsk = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then(st => { micStream = st; micErr = null; micAsk = null; listeners.forEach(f => f(st)); return st; },
        e => { micAsk = null; micErr = MIC_HELP[e && e.name] || 'Could not open the microphone (' + (e && (e.name || e.message)) + '). Tap Mic to try again.'; throw e; });
    return micAsk;
  }
  const listeners = new Set();
  // a silent track: you can still hear the others before (or without) your own microphone
  let silent = null;
  function silentStream() {
    if (silent) return silent;
    try { const AC = new (window.AudioContext || window.webkitAudioContext)(), d = AC.createMediaStreamDestination(), o = AC.createOscillator(), g = AC.createGain(); g.gain.value = 0; o.connect(g); g.connect(d); o.start(); silent = d.stream; }
    catch (e) { silent = new MediaStream(); }
    return silent;
  }
  // voices that the browser would not start without a tap: started on the next tap anywhere
  const waiting = new Set(); let tapHint = null;
  const kick = () => { for (const el of waiting) el.play().then(() => waiting.delete(el), () => {}); };
  ['pointerdown', 'touchend', 'keydown'].forEach(ev => document.addEventListener(ev, kick, { passive: true }));

  /* ---------- voice between the browsers of a room (the same rules as voice.js) ---------- */
  function voice(o) {
    const HEAR = 45; let mode = o.mode, alive = true, warned = false;
    const calls = new Map();   // pid -> { call, el, t0 }
    const want = id => mode !== 'off';
    const out = () => micStream || silentStream();
    function attach(pid, call) {
      const c = { call, el: null, t0: performance.now() }; calls.set(pid, c);
      call.on('stream', rs => {
        const el = new Audio(); el.srcObject = rs; el.autoplay = true; el.setAttribute('playsinline', '');
        el.play().catch(() => { waiting.add(el); if (!tapHint) { tapHint = 1; o.onError('Tap the screen once to hear your friends.'); } });
        c.el = el;
      });
      const gone = () => { if (calls.get(pid) === c) { if (c.el) { c.el.srcObject = null; waiting.delete(c.el); } calls.delete(pid); } };
      call.on('close', gone); call.on('error', gone);
    }
    // your microphone arrives later than the call (you allowed it after the trek began): swap it into every call
    const onMic = st => { const tr = st.getAudioTracks()[0]; for (const c of calls.values()) { const pc = c.call.peerConnection; if (pc && tr) pc.getSenders().forEach(snd => { if (snd.track && snd.track.kind === 'audio' || !snd.track) snd.replaceTrack(tr).catch(() => {}); }); } st.getAudioTracks().forEach(t => { t.enabled = mode !== 'off'; }); };
    listeners.add(onMic);
    if (myPeer) myPeer.on('call', call => { if (!alive) return; const pid = (call.metadata && call.metadata.pid) || call.peer; const old = calls.get(pid); if (old) old.call.close(); call.answer(out()); attach(pid, call); });
    // ask now as well (works on laptops and Android; on iPad it waits for the tap on Mic)
    mic().then(st => { if (alive) onMic(st); }, () => { if (alive && micErr && !warned) { warned = true; o.onError(micErr); } });
    let t = 0;
    return {
      setMode(m) { mode = m; if (micStream) micStream.getAudioTracks().forEach(tr => { tr.enabled = m !== 'off'; }); },
      // the Mic button / N: a tap, so the browser may ask for the microphone now
      retry() { if (micStream) return; mic(true).then(st => { onMic(st); o.onError('Microphone on: your friends can hear you.'); }, () => { if (micErr) o.onError(micErr); }); },
      tick(dt) {
        t -= dt; if (t > 0 || !myPeer || !alive) return; t = 0.5;
        const me = o.me(), roster = o.roster(), now = performance.now();
        // a call that never brought a voice in 12 s is dropped and made again
        for (const [pid, c] of calls) if (!c.el && now - c.t0 > 12000) { c.call.close(); calls.delete(pid); }
        for (const p of roster) {
          // the one with the smaller id calls, so each pair has exactly one call
          if (!p.peer || calls.has(p.pid) || !(o.pid < p.pid)) continue;
          const call = myPeer.call(p.peer, out(), { metadata: { pid: o.pid } }); if (call) attach(p.pid, call);
        }
        for (const [pid, c] of calls) {
          if (!c.el) continue; const w = o.where(pid);
          const d = w ? Math.hypot(w.x - me.x, w.z - me.z) : Infinity;
          c.el.muted = !want(pid); c.el.volume = Math.max(0.6, Math.min(1, 1.1 - d / 400));   // your group: like a radio, near or far
          if (d > HEAR * 20) c.el.volume = 0.6;
        }
      },
      debug() { return { p2p: true, mode, calls: calls.size, heard: Array.from(calls.values()).filter(c => c.el).length, micOn: !!(micStream && micStream.getAudioTracks().some(tr => tr.enabled)), micErr }; },
      stop() { alive = false; listeners.delete(onMic); for (const c of calls.values()) c.call.close(); }
    };
  }

  return { host, join, voice, mic, get micError() { return micErr; }, get micReady() { return !!(micStream && micStream.getAudioTracks().some(t => t.readyState === 'live')); }, get peerId() { return myPeer && myPeer.id; } };
})();
