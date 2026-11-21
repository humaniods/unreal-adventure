"""Triund multiplayer server: rooms, positions, friends and voice tokens over one WebSocket per player.

Run:  uvicorn triund_server.app:app --port 8787
Env:  LIVEKIT_URL (ws://127.0.0.1:7880), LIVEKIT_API_KEY / LIVEKIT_API_SECRET (devkey / secret = `livekit-server --dev`),
      TRIUND_DB (data/triund.db), TRIUND_ORIGINS (comma-separated allowed page origins; empty = any)

Protocol: JSON text frames {"t": type, ...}.
  client -> server: hello{pid,name,sex} party.create{mode,size} party.join{code} party.leave party.ready{ready}
                    party.plan{route,hour} party.start pose{p:[x,y,z,yaw,anim,speed,flags]} mic{mode}
                    friend.ask{pid} friend.accept{pid} link.ask{pid,kind:hand|carry} link.accept{pid} link.end ping
  server -> client: welcome{pid,friends} party{...} party.gone error{msg} start{world,route,hour,team,voice}
                    roster{players:[{pid,name,sex,team,mic}]} snap{p:[[pid,x,y,z,yaw,anim,speed,flags],...]}
                    friend.ask{pid,name} friends{list} link.ask{pid,name,sex,kind} link{link:{kind,with,lead}|null} pong
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from contextlib import asynccontextmanager

from collections import defaultdict, deque

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import bots

from .friends import Friends
from .rooms import Lobby, LobbyError, Party, World

log = logging.getLogger("triund")

TICK = 0.1             # snapshots 10 times a second
SEE_RADIUS = 220.0     # metres: players further away are not sent (the team always is)
MAX_FRAME = 4096
PID_RE = re.compile(r"^[A-Za-z0-9_-]{8,40}$")

LIVEKIT_URL = os.environ.get("LIVEKIT_URL", "ws://127.0.0.1:7880")
LIVEKIT_KEY = os.environ.get("LIVEKIT_API_KEY", "devkey")
LIVEKIT_SECRET = os.environ.get("LIVEKIT_API_SECRET", "secret")
ORIGINS = {o.strip() for o in os.environ.get("TRIUND_ORIGINS", "").split(",") if o.strip()}


def voice_token(pid: str, name: str, room: str) -> dict | None:
    """A LiveKit token for the world's voice room. Who hears whom (All / Team / Off) is set by each client with
    track subscription permissions, so one room serves the whole world."""
    try:
        from livekit import api
    except ImportError:
        return None
    tok = (api.AccessToken(LIVEKIT_KEY, LIVEKIT_SECRET).with_identity(pid).with_name(name)
           .with_grants(api.VideoGrants(room_join=True, room=room, can_publish=True, can_subscribe=True, can_publish_data=False))
           .with_ttl(__import__("datetime").timedelta(hours=8)))
    return {"url": LIVEKIT_URL, "token": tok.to_jwt(), "room": room}


class Hub:
    def __init__(self, lobby: Lobby, friends: Friends) -> None:
        self.lobby, self.friends = lobby, friends
        self.socks: dict[str, WebSocket] = {}
        self.asks: dict[str, set[str]] = {}   # pid -> who asked them to be friends (this session)

    async def send(self, pid: str, msg: dict) -> None:
        ws = self.socks.get(pid)
        if ws is None:
            return
        try:
            await ws.send_text(json.dumps(msg, separators=(",", ":")))
        except Exception:   # a closing socket: its own loop cleans up
            pass

    async def to_party(self, party: Party | None) -> None:
        if party is None:
            return
        if party.code not in self.lobby.parties:
            return
        view = {"t": "party", **self.lobby.party_view(party)}
        await asyncio.gather(*(self.send(m, view) for m in party.members))

    async def to_world(self, world: World | None) -> None:
        """Everyone in the world gets the roster (names, teams, mic modes)."""
        if world is None or world.wid not in self.lobby.worlds:
            return
        L = self.lobby
        players = [L.players[p] for p in world.players if p in L.players]
        for p in players:
            team = set(L.teammates(p.pid))
            roster = [{"pid": o.pid, "name": o.name, "sex": o.sex, "team": o.pid in team, "mic": o.mic,
                       "friend": self.friends.are_friends(p.pid, o.pid), "link": L.link_view(o.pid)} for o in players if o.pid != p.pid]
            await self.send(p.pid, {"t": "roster", "players": roster})

    async def start_for(self, pid: str, party: Party, world: World) -> None:
        p = self.lobby.players[pid]
        await self.send(pid, {"t": "start", "world": world.wid, "route": party.route, "hour": party.hour,
                              "team": self.lobby.teammates(pid), "voice": voice_token(pid, p.name, world.wid)})

    async def handle(self, pid: str, msg: dict) -> None:
        L, t = self.lobby, msg.get("t")
        try:
            if t == "pose":
                v = msg.get("p")
                if isinstance(v, list) and len(v) == 7:
                    L.set_pose(pid, v[0], v[1], v[2], v[3], v[4], v[5], v[6] if isinstance(v[6], int) else 0)
            elif t == "hello":   # the name typed after connecting
                p = L.connect(pid, msg.get("name"), str(msg.get("sex") or "m"))
                self.friends.seen(pid, p.name)
                if p.party:
                    await self.to_party(L.parties.get(p.party))
                if p.world:
                    await self.to_world(L.worlds.get(p.world))
            elif t == "link.ask":     # hold hands / lift your partner onto your shoulders (they have to say yes)
                o = L.ask_link(pid, str(msg.get("pid") or ""), str(msg.get("kind") or ""))
                me = L.players[pid]
                await self.send(o.pid, {"t": "link.ask", "pid": pid, "name": me.name, "sex": me.sex, "kind": msg.get("kind")})
            elif t == "link.accept":
                link = L.accept_link(pid, str(msg.get("pid") or ""))
                for a in (link.lead, link.other):
                    await self.send(a, {"t": "link", "link": L.link_view(a)})
                await self.to_world(L.worlds.get(L.players[pid].world) if L.players[pid].world else None)
            elif t == "link.end":
                await self.end_link(pid)
            elif t == "ping":
                await self.send(pid, {"t": "pong", "at": msg.get("at")})
            elif t == "party.create":
                party = L.create_party(pid, str(msg.get("mode")), int(msg.get("size") or 0))
                await self.to_party(party)
            elif t == "party.join":
                me = L.players[pid]
                old = L.parties.get(me.party) if me.party else None
                party = L.join_party(pid, str(msg.get("code") or ""))
                if old is not None and old is not party:
                    await self.to_party(old)
                await self.to_party(party)
                if party.started and party.world:   # joining friends who already set off
                    await self.start_for(pid, party, L.worlds[party.world])
                    await self.to_world(L.worlds[party.world])
            elif t == "party.leave":
                await self.end_link(pid)
                me = L.players[pid]
                world = L.worlds.get(me.world) if me.world else None
                if world is not None:
                    L._leave_world(me)
                party = L.leave_party(pid)
                await self.send(pid, {"t": "party.gone"})
                await self.to_party(party)
                await self.to_world(world)
            elif t == "party.ready":
                await self.to_party(L.set_ready(pid, bool(msg.get("ready"))))
            elif t == "party.plan":
                await self.to_party(L.set_plan(pid, str(msg.get("route")), float(msg.get("hour") or 0)))
            elif t == "party.start":
                party, world = L.start(pid)
                await self.to_party(party)
                await asyncio.gather(*(self.start_for(m, party, world) for m in party.members))
                await self.to_world(world)
            elif t == "mic":
                p = L.set_mic(pid, str(msg.get("mode")))
                if p.world:
                    await self.to_world(L.worlds.get(p.world))
            elif t == "friend.ask":
                other = str(msg.get("pid") or "")
                if other in L.players and other != pid and not self.friends.are_friends(pid, other):
                    self.asks.setdefault(other, set()).add(pid)
                    await self.send(other, {"t": "friend.ask", "pid": pid, "name": L.players[pid].name})
            elif t == "friend.accept":
                other = str(msg.get("pid") or "")
                if other in self.asks.get(pid, set()):
                    self.asks[pid].discard(other)
                    self.friends.add(pid, other)
                    for a in (pid, other):
                        await self.send(a, {"t": "friends", "list": self.friends.of(a)})
                    w = L.worlds.get(L.players[pid].world) if L.players[pid].world else None
                    await self.to_world(w)
            else:
                await self.send(pid, {"t": "error", "msg": "Unknown message."})
        except LobbyError as e:
            await self.send(pid, {"t": "error", "msg": str(e), "for": t})
        except (TypeError, ValueError, KeyError):
            await self.send(pid, {"t": "error", "msg": "Bad request.", "for": t})

    async def end_link(self, pid: str) -> None:
        L = self.lobby
        link = L.end_link(pid)
        if link is None:
            return
        for a in (link.lead, link.other):
            await self.send(a, {"t": "link", "link": None})
        p = L.players.get(pid)
        await self.to_world(L.worlds.get(p.world) if p and p.world else None)

    async def drop(self, pid: str) -> None:
        await self.end_link(pid)
        self.socks.pop(pid, None)
        self.asks.pop(pid, None)
        party, world = self.lobby.disconnect(pid)
        await self.to_party(party)
        await self.to_world(world)

    async def ticker(self) -> None:
        """10 times a second each player gets the poses of the players around them."""
        while True:
            t0 = time.monotonic()
            try:
                L = self.lobby
                sends = []
                for w in list(L.worlds.values()):
                    for pid in list(w.players):
                        if pid not in self.socks:
                            continue
                        vis = L.visible(pid, SEE_RADIUS)
                        if not vis:
                            continue
                        snap = [[o.pid, *(round(v, 2) if isinstance(v, float) else v for v in o.pose)] for o in vis]
                        sends.append(self.send(pid, {"t": "snap", "p": snap}))
                if sends:
                    await asyncio.gather(*sends)
            except Exception:
                log.exception("tick failed")
            await asyncio.sleep(max(0.0, TICK - (time.monotonic() - t0)))


HUB = Hub(Lobby(), Friends(os.environ.get("TRIUND_DB", os.path.join(os.path.dirname(__file__), "..", "data", "triund.db"))))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(HUB.ticker())
    yield
    task.cancel()


app = FastAPI(title="Triund multiplayer", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=sorted(ORIGINS) or ["*"], allow_methods=["GET", "POST"], allow_headers=["content-type"])
BRAIN = bots.Brain()
TALK_PER_MIN = int(os.environ.get("TRIUND_TALK_PER_MIN", "20"))   # each line is a Claude call
_talks: dict[str, deque] = defaultdict(deque)


def _allow_talk(ip: str) -> bool:
    now, q = time.monotonic(), _talks[ip]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= TALK_PER_MIN:
        return False
    q.append(now)
    return True


@app.post("/bot/chat")
async def bot_chat(req: Request) -> JSONResponse:
    """{text, persona: {...}, scene: {...}, history: [{who: me|them, text}]} -> {reply}"""
    if not _allow_talk(req.client.host if req.client else "?"):
        return JSONResponse({"error": "Too many lines a minute. Catch your breath."}, status_code=429)
    raw = await req.body()
    if len(raw) > 20000:
        return JSONResponse({"error": "Too long."}, status_code=413)
    try:
        body = json.loads(raw)
        said = " ".join(str(body.get("text") or "").split())[:bots.MAX_TEXT]
    except (json.JSONDecodeError, AttributeError):
        return JSONResponse({"error": "Bad request."}, status_code=400)
    if not said:
        return JSONResponse({"error": "Say something first."}, status_code=400)
    history = [h for h in (body.get("history") or [])[-bots.MAX_TURNS:] if isinstance(h, dict)]
    try:
        reply = await bots.chat(BRAIN, said, bots.Persona.from_dict(body.get("persona") or {}), history, bots.Scene.from_dict(body.get("scene") or {}))
    except bots.NotConfigured as e:
        log.error("bot chat: %s", e)
        return JSONResponse({"error": "not_configured"}, status_code=503)
    except Exception:
        log.exception("bot chat failed")
        return JSONResponse({"error": "They did not catch that. Try again."}, status_code=502)
    return JSONResponse({"reply": reply})


@app.get("/health")
def health() -> dict:
    L = HUB.lobby
    return {"ok": True, "talk": bots.configured(), "players": len(L.players), "parties": len(L.parties),
            "worlds": {w.wid: len(w.players) for w in L.worlds.values()}}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    if ORIGINS and ws.headers.get("origin") not in ORIGINS:
        await ws.close(code=4403)
        return
    await ws.accept()
    pid = None
    try:
        first = json.loads(await asyncio.wait_for(ws.receive_text(), timeout=10))
        pid = str(first.get("pid") or "")
        if first.get("t") != "hello" or not PID_RE.match(pid):
            await ws.close(code=4400)
            return
        old = HUB.socks.get(pid)
        if old is not None:                     # same player in a second tab: the new one wins
            await HUB.drop(pid)
            try:
                await old.close(code=4409)
            except Exception:
                pass
        p = HUB.lobby.connect(pid, first.get("name"), str(first.get("sex") or "m"))
        HUB.socks[pid] = ws
        HUB.friends.seen(pid, p.name)
        await HUB.send(pid, {"t": "welcome", "pid": pid, "name": p.name, "friends": HUB.friends.of(pid)})
        while True:
            raw = await ws.receive_text()
            if len(raw) > MAX_FRAME:
                continue
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if isinstance(msg, dict):
                await HUB.handle(pid, msg)
    except (WebSocketDisconnect, asyncio.TimeoutError, json.JSONDecodeError, AttributeError):
        pass
    finally:
        if pid and HUB.socks.get(pid) is ws:
            # the party must hear that you left even if this connection's task is being cancelled
            try:
                await asyncio.shield(HUB.drop(pid))
            except asyncio.CancelledError:
                pass


# the game itself, from the same origin as /ws and /bot/chat (browsers block pages from calling a local server on another
# port). Must stay last: it catches every path the routes above do not.
STATIC = os.environ.get("TRIUND_STATIC", os.path.join(os.path.dirname(__file__), "..", "..", "walk-test"))
if os.path.isdir(STATIC):
    app.mount("/", StaticFiles(directory=STATIC, html=True), name="game")
