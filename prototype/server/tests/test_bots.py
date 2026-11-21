"""Chatting with bots: the endpoint, its limits, and what goes to Claude (Claude faked, no network)."""
import collections
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from triund_server import app as appmod
from triund_server import bots


class FakeBrain(bots.Brain):
    def __init__(self):
        super().__init__()
        self.calls = []

    async def reply(self, persona, history, said, scene):
        self.calls.append((persona.name, said, scene.place, len(history)))
        return "Bas do km aur, chalte raho!"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(appmod, "_talks", collections.defaultdict(collections.deque))
    with TestClient(appmod.app) as c:
        yield c


def post(c, **kw):
    body = {"text": "Bhai Triund kitna door hai?", "persona": {"name": "Priya", "sex": "f", "home": "Pune"},
            "scene": {"place": "at Magic View Cafe", "alt": 2450, "clock": "10:40", "to_top_km": 2.4}, "history": []}
    body.update(kw)
    return c.post("/bot/chat", content=json.dumps(body))


def test_round_trip(client, monkeypatch):
    brain = FakeBrain(); monkeypatch.setattr(appmod, "BRAIN", brain)
    r = post(client, history=[{"who": "me", "text": "Hi"}, {"who": "them", "text": "Hello!"}])
    assert r.status_code == 200 and r.json()["reply"].startswith("Bas do km")
    assert brain.calls == [("Priya", "Bhai Triund kitna door hai?", "at Magic View Cafe", 2)]


def test_bad_inputs(client, monkeypatch):
    monkeypatch.setattr(appmod, "BRAIN", FakeBrain())
    assert post(client, text="   ").status_code == 400
    assert client.post("/bot/chat", content="{nope").status_code == 400
    assert post(client, text="x" * 30000).status_code == 413


def test_long_text_is_cut(client, monkeypatch):
    brain = FakeBrain(); monkeypatch.setattr(appmod, "BRAIN", brain)
    post(client, text="a " * 400)
    assert len(brain.calls[0][1]) <= bots.MAX_TEXT


def test_rate_limit(client, monkeypatch):
    monkeypatch.setattr(appmod, "BRAIN", FakeBrain()); monkeypatch.setattr(appmod, "TALK_PER_MIN", 3)
    assert [post(client).status_code for _ in range(4)] == [200, 200, 200, 429]


def test_not_configured(client, monkeypatch):
    monkeypatch.setattr(appmod, "BRAIN", bots.Brain())
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False); monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    r = post(client)
    assert r.status_code == 503 and r.json()["error"] == "not_configured"


def test_persona_is_cleaned():
    p = bots.Persona.from_dict({"name": "<script>Raj</script>" * 5, "sex": "x", "age": "999"})
    assert "<" not in p.name and len(p.name) <= 24 and p.sex == "m" and p.age == 80


def test_messages_alternate_and_carry_the_scene():
    hist = [{"who": "them", "text": "Namaste!"}, {"who": "me", "text": "Kahan se ho?"}, {"who": "them", "text": "Pune se."}]
    m = bots.build_messages(hist, "Upar kitna time?", bots.Scene(place="at Magic View Cafe", to_top_km=2.4))
    assert [x["role"] for x in m] == ["user", "assistant", "user", "assistant", "user"]
    assert "Upar kitna time?" in m[-1]["content"] and "Magic View" in m[-1]["content"] and "2.4 km" in m[-1]["content"]


@pytest.mark.asyncio
async def test_request_sent_to_claude():
    seen = {}

    class Msgs:
        async def create(self, **kw):
            seen.update(kw)
            return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text='"Haan bhai, 2 ghante aur."')])

    brain = bots.Brain(); brain._claude = SimpleNamespace(beta=SimpleNamespace(messages=Msgs()))
    out = await brain.reply(bots.Persona(name="Priya", sex="f"), [], "Kitna time?", bots.Scene())
    assert out == "Haan bhai, 2 ghante aur."                     # quotes around the reply are dropped
    assert seen["model"] == "claude-opus-5-5" and seen["fallbacks"] == "default"
    assert seen["output_config"] == {"effort": "low"} and "Priya" in seen["system"]


@pytest.mark.asyncio
async def test_refusal_gives_in_character_line():
    class Msgs:
        async def create(self, **kw):
            return SimpleNamespace(stop_reason="refusal", content=[])
    brain = bots.Brain(); brain._claude = SimpleNamespace(beta=SimpleNamespace(messages=Msgs()))
    assert await brain.reply(bots.Persona(), [], "...", bots.Scene())
