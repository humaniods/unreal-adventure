'use strict';
/* Voice on the mountain (LiveKit). One voice room per world; who hears whom is decided here:
   - All:  your mic is open to everyone; you hear players within 45 m (louder the closer, from their side) and your
           team at any distance (like a radio).
   - Team: only your party can subscribe to your mic (track subscription permissions), and you hear only them.
   - Off:  mic off and nobody is played.
   Only the players you can hear are subscribed, so a world of 100 costs each player a handful of audio streams.
   The LiveKit browser client is loaded from the CDN the first time voice starts.
   Interface: create(o) -> { setMode(mode), tick(dt) } with o = { url, token, mode, team(), where(pid), me(), onTalk(pid, on), onError(text) } */
window.TriundVoice = {
  create(o) {
    const HEAR = 45;
    let LK = null, room = null, mode = o.mode, alive = true, ready = false;
    const els = new Map();   // pid -> { el, pan }

    function lib() {
      if (window.LivekitClient) return Promise.resolve(window.LivekitClient);
      return new Promise((ok, bad) => {
        const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/livekit-client@2.9.1/dist/livekit-client.umd.js';
        s.onload = () => window.LivekitClient ? ok(window.LivekitClient) : bad(new Error('no LivekitClient')); s.onerror = () => bad(new Error('voice library failed to load'));
        document.head.appendChild(s);
      });
    }
    async function permissions() {
      if (!room) return;
      const lp = room.localParticipant;
      if (mode === 'team') lp.setTrackSubscriptionPermissions(false, Array.from(o.team()).map(id => ({ participantIdentity: id, allowAll: true })));
      else lp.setTrackSubscriptionPermissions(true);
      try { await lp.setMicrophoneEnabled(mode !== 'off', { echoCancellation: true, noiseSuppression: true, autoGainControl: true }); }
      catch (e) { o.onError('Microphone blocked: allow it in the browser to talk.'); }
    }
    (async () => {
      try {
        LK = await lib(); if (!alive) return;
        room = new LK.Room({ adaptiveStream: false, dynacast: false });
        room.on(LK.RoomEvent.TrackSubscribed, (track, pub, part) => {
          if (track.kind !== 'audio') return;
          const el = track.attach(); el.autoplay = true; el.style.display = 'none'; document.body.appendChild(el);
          els.set(part.identity, { el, track });
        });
        room.on(LK.RoomEvent.TrackUnsubscribed, (track, pub, part) => { track.detach().forEach(e => e.remove()); els.delete(part.identity); });
        room.on(LK.RoomEvent.ActiveSpeakersChanged, speakers => {
          const on = new Set(speakers.map(s => s.identity));
          for (const p of room.remoteParticipants.values()) o.onTalk(p.identity, on.has(p.identity));
          o.onTalk(room.localParticipant.identity, on.has(room.localParticipant.identity));
        });
        room.on(LK.RoomEvent.Disconnected, () => { ready = false; });
        await room.connect(o.url, o.token, { autoSubscribe: false });
        ready = true; await permissions();
        room.startAudio().catch(() => {});
      } catch (e) { console.error('voice', e); o.onError('Voice could not connect: you can still walk together.'); }
    })();

    let t = 0;
    return {
      setMode(m) { mode = m; permissions(); },
      tick(dt) {
        t -= dt; if (t > 0 || !ready) return; t = 0.25;
        const me = o.me(), team = o.team();
        for (const p of room.remoteParticipants.values()) {
          const id = p.identity, w = o.where(id), mate = team.has(id);
          const d = w ? Math.hypot(w.x - me.x, w.z - me.z) : Infinity;
          const want = mode !== 'off' && (mate || (mode === 'all' && d < HEAR));
          for (const pub of p.audioTrackPublications.values()) {
            if (pub.isSubscribed !== want) pub.setSubscribed(want);
            if (want && pub.track && pub.track.setVolume) pub.track.setVolume(mate ? Math.max(0.6, 1 - d / 400) : Math.max(0, Math.min(1, 1.15 - d / HEAR)));
          }
        }
      },
      debug() { return { ready, mode, els: els.size, subs: room ? Array.from(room.remoteParticipants.values()).flatMap(p => Array.from(p.audioTrackPublications.values()).map(pub => ({ id: p.identity, sub: pub.isSubscribed, vol: pub.track && pub.track.getVolume ? pub.track.getVolume() : null }))) : [], micOn: room ? room.localParticipant.isMicrophoneEnabled : null }; },
      stop() { alive = false; if (room) room.disconnect(); }
    };
  }
};
