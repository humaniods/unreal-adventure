"""Parties (Ludo-style rooms with a short code) and worlds (one shared Triund for up to 100 players).

Pure game-state logic, no I/O: app.py feeds it messages and sends what it returns.

- A party is a group of friends playing together: a couple (2) or a group of bakchods (4, 6 or 8).
  The host creates it and gets a 6-letter code; friends join with the code or an invite link. When everyone in
  the lobby is ready the host starts, and the whole party is placed in a world together. A friend can still join
  with the code after the start: they drop straight into the same world.
- A world is one shared mountain for up to 100 players from many parties. Everyone sees the players around them;
  their own party is their team.
"""
from __future__ import annotations

import math
import secrets
import time
from dataclasses import dataclass, field

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # no 0/O or 1/I: easy to read out over the phone
CODE_LEN = 6
MODES: dict[str, tuple[int, ...]] = {"couple": (2,), "bakchods": (4, 6, 8)}
WORLD_CAP = 100
ROUTES = ("mcleod", "galu", "magic", "shiva")
HOURS = (7.5, 9.0, 11.0)
MIC_MODES = ("all", "team", "off")
LINK_KINDS = ("hand", "carry")    # walk hand in hand · carry your partner on your shoulders
LINK_REACH = 3.0                  # metres: you have to be next to each other to start one
NAME_MAX = 32


class LobbyError(ValueError):
    """A request the player can fix; the message is shown to them as is."""


def clean_name(raw: object) -> str:
    name = " ".join(str(raw or "").replace("<", "").replace(">", "").replace("&", "").replace('"', "").split())
    return name[:NAME_MAX] or "Hiker"


@dataclass
class Player:
    pid: str
    name: str
    sex: str = "m"
    party: str | None = None          # party code
    world: str | None = None          # world id
    mic: str = "all"
    # last reported pose: x, y, z, yaw, animation, animation speed, flags (1 torch, 2 music, 4 sitting, 8 lying)
    pose: tuple[float, float, float, float, str, float, int] | None = None
    pose_t: float = 0.0


@dataclass
class Party:
    code: str
    mode: str
    size: int
    host: str
    members: list[str] = field(default_factory=list)
    ready: set[str] = field(default_factory=set)
    started: bool = False
    route: str = "galu"
    hour: float = 7.5
    world: str | None = None


@dataclass
class Link:
    kind: str          # hand | carry
    lead: str          # the one who asked (for carry: the one carrying)
    other: str

    def partner(self, pid: str) -> str:
        return self.other if pid == self.lead else self.lead


@dataclass
class World:
    wid: str
    hour: float
    players: set[str] = field(default_factory=set)
    created: float = field(default_factory=time.time)


class Lobby:
    def __init__(self, world_cap: int = WORLD_CAP) -> None:
        self.world_cap = world_cap
        self.players: dict[str, Player] = {}
        self.parties: dict[str, Party] = {}
        self.worlds: dict[str, World] = {}
        self.links: dict[str, Link] = {}          # pid -> its link (both ends point at the same Link)
        self.link_asks: dict[str, tuple[str, str]] = {}   # asked pid -> (asker, kind)

    # ---------- players ----------
    def connect(self, pid: str, name: str, sex: str = "m") -> Player:
        p = self.players.get(pid)
        if p is None:
            p = Player(pid=pid, name=clean_name(name), sex="f" if sex == "f" else "m")
            self.players[pid] = p
        else:
            p.name = clean_name(name)
            p.sex = "f" if sex == "f" else "m"
        return p

    def disconnect(self, pid: str) -> tuple[Party | None, World | None]:
        """Drops the player from their party and world. Returns what changed (to tell the others)."""
        p = self.players.get(pid)
        if p is None:
            return None, None
        self.end_link(pid)
        self.players.pop(pid, None)
        world = self._leave_world(p)
        party = self._leave_party(p)
        return party, world

    # ---------- parties ----------
    def _new_code(self) -> str:
        for _ in range(100):
            code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LEN))
            if code not in self.parties:
                return code
        raise LobbyError("Could not make a room code. Try again.")

    def create_party(self, pid: str, mode: str, size: int) -> Party:
        p = self._player(pid)
        if mode not in MODES:
            raise LobbyError("Choose Couple or Bakchods.")
        if size not in MODES[mode]:
            raise LobbyError(f"A {mode} room is for {', '.join(map(str, MODES[mode]))} players.")
        self._leave_party(p)
        party = Party(code=self._new_code(), mode=mode, size=size, host=pid, members=[pid])
        self.parties[party.code] = party
        p.party = party.code
        return party

    def join_party(self, pid: str, code: str) -> Party:
        p = self._player(pid)
        code = (code or "").strip().upper()
        party = self.parties.get(code)
        if party is None:
            raise LobbyError("No room with that code. Check the letters with your friend.")
        if pid in party.members:
            return party
        if len(party.members) >= party.size:
            raise LobbyError(f"That room is full ({party.size} of {party.size}).")
        self._leave_party(p)
        party.members.append(pid)
        p.party = code
        if party.started and party.world:
            self._enter_world(p, self.worlds[party.world])
        return party

    def leave_party(self, pid: str) -> Party | None:
        return self._leave_party(self._player(pid))

    def _leave_party(self, p: Player) -> Party | None:
        if not p.party:
            return None
        self.end_link(p.pid)
        party = self.parties.get(p.party)
        p.party = None
        if party is None:
            return None
        if p.pid in party.members:
            party.members.remove(p.pid)
        party.ready.discard(p.pid)
        if not party.members:
            del self.parties[party.code]
            return party
        if party.host == p.pid:
            party.host = party.members[0]   # the next one in becomes the host
        return party

    def set_ready(self, pid: str, ready: bool) -> Party:
        party = self._party_of(pid)
        if ready:
            party.ready.add(pid)
        else:
            party.ready.discard(pid)
        return party

    def set_plan(self, pid: str, route: str, hour: float) -> Party:
        """The host picks where and when the party starts (everyone starts together)."""
        party = self._party_of(pid)
        if party.host != pid:
            raise LobbyError("Only the host chooses the start.")
        if route not in ROUTES:
            raise LobbyError("Unknown start point.")
        if hour not in HOURS:
            raise LobbyError("Unknown start time.")
        party.route, party.hour = route, hour
        return party

    def start(self, pid: str) -> tuple[Party, World]:
        party = self._party_of(pid)
        if party.host != pid:
            raise LobbyError("Only the host can start.")
        if party.started:
            raise LobbyError("Already started.")
        if len(party.members) < 2:
            raise LobbyError("Wait for at least one friend to join.")
        waiting = [self.players[m].name for m in party.members if m not in party.ready and m != pid]
        if waiting:
            raise LobbyError("Not ready yet: " + ", ".join(waiting) + ".")
        world = self._world_for(len(party.members), party.hour)
        party.started, party.world = True, world.wid
        for m in party.members:
            self._enter_world(self.players[m], world)
        return party, world

    # ---------- worlds ----------
    def _world_for(self, n: int, hour: float) -> World:
        """The fullest world at this start time that still has room for the whole party (busy mountains feel
        alive); a new world when none has."""
        best = None
        for w in self.worlds.values():
            if w.hour == hour and len(w.players) + n <= self.world_cap and (best is None or len(w.players) > len(best.players)):
                best = w
        if best is None:
            best = World(wid="w-" + secrets.token_hex(4), hour=hour)
            self.worlds[best.wid] = best
        return best

    def _enter_world(self, p: Player, w: World) -> None:
        if p.world and p.world != w.wid:
            self._leave_world(p)
        p.world = w.wid
        w.players.add(p.pid)

    def _leave_world(self, p: Player) -> World | None:
        if not p.world:
            return None
        w = self.worlds.get(p.world)
        p.world = None
        if w is None:
            return None
        w.players.discard(p.pid)
        if not w.players:
            del self.worlds[w.wid]
        return w

    def set_pose(self, pid: str, x: float, y: float, z: float, yaw: float, anim: str, speed: float, flags: int) -> None:
        p = self._player(pid)
        vals = (x, y, z, yaw, speed)
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in vals):
            return
        if abs(x) > 30000 or abs(z) > 30000 or abs(y) > 9000:
            return
        p.pose = (float(x), float(y), float(z), float(yaw), str(anim)[:24], float(speed), int(flags) & 0xFF)
        p.pose_t = time.time()

    def set_mic(self, pid: str, mode: str) -> Player:
        if mode not in MIC_MODES:
            raise LobbyError("Mic mode is all, team or off.")
        p = self._player(pid)
        p.mic = mode
        return p

    # ---------- holding hands, carrying your partner ----------
    def _near(self, a: Player, b: Player) -> bool:
        if a.pose is None or b.pose is None:
            return False
        return (a.pose[0] - b.pose[0]) ** 2 + (a.pose[2] - b.pose[2]) ** 2 <= LINK_REACH ** 2

    def ask_link(self, pid: str, other: str, kind: str) -> Player:
        """pid asks other to hold hands / to be carried by pid. Returns the asked player."""
        me = self._player(pid)
        if kind not in LINK_KINDS:
            raise LobbyError("Hold hands or carry.")
        o = self.players.get(other)
        if o is None or other not in self.teammates(pid):
            raise LobbyError("Only with someone from your own group.")
        if pid in self.links or other in self.links:
            raise LobbyError("Let go first.")
        if not self._near(me, o):
            raise LobbyError("Walk up next to them first.")
        self.link_asks[other] = (pid, kind)
        return o

    def accept_link(self, pid: str, asker: str) -> Link:
        ask = self.link_asks.get(pid)
        if ask is None or ask[0] != asker:
            raise LobbyError("Nobody asked.")
        kind = ask[1]
        del self.link_asks[pid]
        if asker not in self.players or pid in self.links or asker in self.links:
            raise LobbyError("Too late.")
        if not self._near(self.players[pid], self.players[asker]):
            raise LobbyError("Walk up next to them first.")
        link = Link(kind=kind, lead=asker, other=pid)
        self.links[asker] = self.links[pid] = link
        return link

    def end_link(self, pid: str) -> Link | None:
        self.link_asks.pop(pid, None)
        for k in [k for k, v in self.link_asks.items() if v[0] == pid]:
            del self.link_asks[k]
        link = self.links.pop(pid, None)
        if link is not None:
            self.links.pop(link.partner(pid), None)
        return link

    def link_view(self, pid: str) -> dict | None:
        link = self.links.get(pid)
        return {"kind": link.kind, "with": link.partner(pid), "lead": link.lead == pid} if link else None

    def teammates(self, pid: str) -> list[str]:
        p = self.players.get(pid)
        party = self.parties.get(p.party) if p and p.party else None
        return [m for m in party.members if m != pid] if party else []

    def visible(self, pid: str, radius: float) -> list[Player]:
        """Players in the same world this one should see: everyone within `radius` metres, plus the team at any
        distance (they are on the watch map)."""
        me = self.players.get(pid)
        if me is None or not me.world:
            return []
        w = self.worlds.get(me.world)
        if w is None:
            return []
        team = set(self.teammates(pid))
        r2 = radius * radius
        out = []
        for oid in w.players:
            if oid == pid:
                continue
            o = self.players.get(oid)
            if o is None or o.pose is None:
                continue
            # before my own first pose arrives I only know where my team is
            if oid in team or (me.pose is not None and (o.pose[0] - me.pose[0]) ** 2 + (o.pose[2] - me.pose[2]) ** 2 <= r2):
                out.append(o)
        return out

    # ---------- views sent to clients ----------
    def party_view(self, party: Party) -> dict:
        return {
            "code": party.code, "mode": party.mode, "size": party.size, "host": party.host,
            "started": party.started, "route": party.route, "hour": party.hour,
            "members": [{"pid": m, "name": self.players[m].name, "ready": m in party.ready or m == party.host}
                        for m in party.members if m in self.players],
        }

    def _player(self, pid: str) -> Player:
        p = self.players.get(pid)
        if p is None:
            raise LobbyError("Say hello first.")
        return p

    def _party_of(self, pid: str) -> Party:
        p = self._player(pid)
        party = self.parties.get(p.party) if p.party else None
        if party is None:
            raise LobbyError("You are not in a room.")
        return party
