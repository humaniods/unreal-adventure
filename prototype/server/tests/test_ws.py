"""The whole flow over real WebSockets: create, join by code, ready, start, poses, friends."""

import pytest
from fastapi.testclient import TestClient

from triund_server import app as appmod
from triund_server.friends import Friends
from triund_server.rooms import Lobby


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(appmod, "HUB", appmod.Hub(Lobby(), Friends(":memory:")))
    with TestClient(appmod.app) as c:
        yield c


def recv_until(ws, t):
    for _ in range(50):
        m = ws.receive_json()
        if m["t"] == t:
            return m
    raise AssertionError("no " + t)


def hello(ws, pid, name):
    ws.send_json({"t": "hello", "pid": pid, "name": name})
    return recv_until(ws, "welcome")


def test_couple_flow(client):
    with client.websocket_connect("/ws") as a, client.websocket_connect("/ws") as b:
        hello(a, "alice0001", "Asha"); hello(b, "bobby0001", "Bunty")
        a.send_json({"t": "party.create", "mode": "couple", "size": 2})
        code = recv_until(a, "party")["code"]
        b.send_json({"t": "party.join", "code": code})
        view = recv_until(b, "party")
        assert [m["name"] for m in view["members"]] == ["Asha", "Bunty"]
        a.send_json({"t": "party.start"})
        assert "Not ready" in recv_until(a, "error")["msg"]
        b.send_json({"t": "party.ready", "ready": True})
        a.send_json({"t": "party.plan", "route": "shiva", "hour": 9})
        a.send_json({"t": "party.start"})
        sa, sb = recv_until(a, "start"), recv_until(b, "start")
        assert sa["world"] == sb["world"] and sa["route"] == "shiva" and sa["hour"] == 9
        assert sa["team"] == ["bobby0001"] and sa["voice"]["token"]
        roster = recv_until(a, "roster")["players"]
        assert roster[0]["name"] == "Bunty" and roster[0]["team"] is True
        a.send_json({"t": "pose", "p": [1, 2000, 3, 0.5, "Walk", 1.1, 1]})
        snap = recv_until(b, "snap")["p"]
        assert snap[0][0] == "alice0001" and snap[0][1:4] == [1, 2000, 3] and snap[0][5] == "Walk"


def test_friends(client):
    with client.websocket_connect("/ws") as a, client.websocket_connect("/ws") as b:
        hello(a, "alice0001", "Asha"); hello(b, "bobby0001", "Bunty")
        a.send_json({"t": "friend.ask", "pid": "bobby0001"})
        ask = recv_until(b, "friend.ask")
        assert ask["name"] == "Asha"
        b.send_json({"t": "friend.accept", "pid": "alice0001"})
        assert recv_until(a, "friends")["list"] == [{"pid": "bobby0001", "name": "Bunty"}]


def test_accept_without_ask_does_nothing(client):
    with client.websocket_connect("/ws") as a, client.websocket_connect("/ws") as b:
        hello(a, "alice0001", "Asha"); hello(b, "bobby0001", "Bunty")
        b.send_json({"t": "friend.accept", "pid": "alice0001"})
        b.send_json({"t": "ping", "at": 1})
        assert recv_until(b, "pong")["at"] == 1     # no "friends" message came first
        assert appmod.HUB.friends.of("bobby0001") == []


def test_bad_hello_closes(client):
    with client.websocket_connect("/ws") as a:
        a.send_json({"t": "hello", "pid": "x"})
        with pytest.raises(Exception):
            a.receive_json()


def test_leaving_tells_the_other(client):
    with client.websocket_connect("/ws") as a:
        hello(a, "alice0001", "Asha")
        a.send_json({"t": "party.create", "mode": "bakchods", "size": 4})
        code = recv_until(a, "party")["code"]
        with client.websocket_connect("/ws") as b:
            hello(b, "bobby0001", "Bunty")
            b.send_json({"t": "party.join", "code": code})
            recv_until(a, "party")
        view = recv_until(a, "party")
        assert [m["name"] for m in view["members"]] == ["Asha"]


def test_hand_in_hand_over_the_socket(client):
    with client.websocket_connect("/ws") as a, client.websocket_connect("/ws") as b:
        hello(a, "alice0001", "Asha"); b.send_json({"t": "hello", "pid": "bobby0001", "name": "Bunty", "sex": "m"}); recv_until(b, "welcome")
        a.send_json({"t": "party.create", "mode": "couple", "size": 2}); code = recv_until(a, "party")["code"]
        b.send_json({"t": "party.join", "code": code}); b.send_json({"t": "party.ready", "ready": True}); recv_until(a, "party")
        a.send_json({"t": "party.start"}); recv_until(a, "start"); recv_until(b, "start")
        a.send_json({"t": "pose", "p": [0, 2000, 0, 0, "Idle", 1, 0]}); b.send_json({"t": "pose", "p": [1, 2000, 0, 0, "Idle", 1, 0]})
        b.send_json({"t": "link.ask", "pid": "alice0001", "kind": "carry"})
        ask = recv_until(a, "link.ask")
        assert ask["name"] == "Bunty" and ask["kind"] == "carry" and ask["sex"] == "m"
        a.send_json({"t": "link.accept", "pid": "bobby0001"})
        assert recv_until(a, "link")["link"] == {"kind": "carry", "with": "bobby0001", "lead": False}
        assert recv_until(b, "link")["link"]["lead"] is True
        roster = recv_until(a, "roster")["players"]
        assert roster[0]["link"] == {"kind": "carry", "with": "alice0001", "lead": True}
        a.send_json({"t": "link.end"})
        assert recv_until(b, "link")["link"] is None
