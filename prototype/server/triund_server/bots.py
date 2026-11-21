"""Chatting with the people on the trail: hikers and chai-stall keepers answer what you type.

Walk up to someone, press Enter, type (Hindi, English or Hinglish). Claude answers as that person: a name, a home town,
a reason to be on the mountain, going up or down, where they stand, the time and the weather. The reply shows as
a subtitle. Key: ANTHROPIC_API_KEY. Without it the game falls back to short written lines (talk.js).
"""
from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass

log = logging.getLogger("triund.bots")

MODEL = "claude-opus-5-5"
MAX_TURNS = 8              # earlier lines of this conversation sent back to Claude
MAX_TEXT = 300             # characters you can type in one go

# what everyone on the mountain knows (real; the game follows OpenStreetMap and the Forest Department's rules)
FACTS = """Triund (2,838 m) is a grassy ridge above McLeod Ganj facing the Dhauladhar range, Moon Peak and Indrahar Pass.
Classic route: from Gallu Devi temple (about 2,100 m, reached from McLeod Ganj via Dharamkot by lane or taxi), about 5 km and 3-4 hours up, past Magic View Cafe (about halfway, last big chai stop) and then the steep final stretch called the 22 curves.
Other route: from Bhagsu past the Bhagsunag waterfall and Shiva Cafe, through Karthani, about 4.8 km, steeper and quieter.
The forest check post at Gallu takes Rs 100 entry per person and registers your name and the plastic you carry in; entry closes at 11:30. Carry the plastic back down.
Beyond Triund, about 2 km on is Snowline Cafe (about 3,170 m); Laka Got and the Indrahar Pass are further up for experienced trekkers.
Camping on the top: hired tents, bonfires, very cold at night in November, clear star skies. Late November: crisp mornings, clouds building by midday, sometimes mist, light snow high up on some afternoons, sunset around 17:25.
Stalls along the way sell chai, Maggi, lemon tea, Parle-G, water; prices rise the higher you go. Hanuman ji's small orange murti stands on a rock at the edge of the top. Dogs often walk with trekkers."""


class NotConfigured(RuntimeError):
    """No Claude key on this server."""


def configured() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def _clean(v: object, n: int, default: str) -> str:
    return re.sub(r"[<>{}\[\]]", "", str(v or default))[:n]


@dataclass
class Persona:
    name: str = "Rohit"
    sex: str = "m"
    age: int = 26
    home: str = "Delhi"
    who: str = "an office worker on a long weekend with college friends"
    role: str = "hiker"           # hiker | keeper

    @classmethod
    def from_dict(cls, d: dict) -> "Persona":
        try:
            age = max(8, min(80, int(d.get("age") or 26)))
        except (TypeError, ValueError):
            age = 26
        return cls(name=_clean(d.get("name"), 24, "Rohit"), sex="f" if d.get("sex") == "f" else "m", age=age,
                   home=_clean(d.get("home"), 32, "Delhi"), who=_clean(d.get("who"), 120, cls.who),
                   role="keeper" if d.get("role") == "keeper" else "hiker")


@dataclass
class Scene:
    place: str = "on the trail"
    alt: int = 2300
    clock: str = "10:00"
    weather: str = "clear"
    doing: str = "walking up"
    to_top_km: float | None = None
    player_tired: bool = False

    @classmethod
    def from_dict(cls, d: dict) -> "Scene":
        try:
            alt = int(d.get("alt") or 2300)
        except (TypeError, ValueError):
            alt = 2300
        try:
            km = round(float(d["to_top_km"]), 1) if d.get("to_top_km") is not None else None
        except (TypeError, ValueError):
            km = None
        return cls(place=_clean(d.get("place"), 80, "on the trail"), alt=alt, clock=_clean(d.get("clock"), 5, "10:00"),
                   weather=_clean(d.get("weather"), 40, "clear"), doing=_clean(d.get("doing"), 60, "walking up"),
                   to_top_km=km, player_tired=bool(d.get("player_tired")))


def system_prompt(p: Persona) -> str:
    role = ("You run a small chai and Maggi stall on the trail and have done so for years; you live in the village below and walk up every morning."
            if p.role == "keeper" else f"You are {p.who}.")
    return f"""You are {p.name}, {p.age}, from {p.home}, on the Triund trek above McLeod Ganj (Himachal Pradesh) today. {role}

What you know about this mountain:
{FACTS}

Another trekker has walked up to you and is chatting with you. Talk back the way a real person on a mountain trail would: warm, casual, a bit out of breath if you are climbing, curious about them, sometimes a small joke. Keep every reply short: one or two sentences, at most about 30 words, no lists, no emojis, no stage directions, no quotation marks around your reply.
Write in the language and script they use: if they type Hinglish in Roman letters, answer in Roman Hinglish the way people type on WhatsApp; Hindi in Devanagari gets Devanagari; English gets English.
You are a person, not an assistant. Never say you are an AI, a bot or a game character; if asked, laugh it off in character. If you do not know something, say so the way a person would; do not invent trail facts beyond what you know. If they seem tired or it is getting late, care about them like a fellow trekker would (water, rest, torch, turn back before dark). Keep it friendly and clean."""


def scene_line(sc: Scene) -> str:
    top = f", about {sc.to_top_km} km below the top" if sc.to_top_km else ""
    tired = " The trekker looks tired and out of breath." if sc.player_tired else ""
    return f"[Now: {sc.clock}, {sc.weather}. You are {sc.doing}, {sc.place}, at {sc.alt} m{top}.{tired}]"


def build_messages(history: list[dict], said: str, scene: Scene) -> list[dict]:
    """Earlier lines alternate user (the trekker) / assistant (this person); the newest line carries the scene."""
    msgs: list[dict] = []
    for h in history[-MAX_TURNS:]:
        role = "assistant" if h.get("who") == "them" else "user"
        text = str(h.get("text") or "")[:MAX_TEXT]
        if not text:
            continue
        if msgs and msgs[-1]["role"] == role:
            msgs[-1]["content"] += "\n" + text
        else:
            msgs.append({"role": role, "content": text})
    line = scene_line(scene) + "\nThey say: " + said[:MAX_TEXT]
    if msgs and msgs[-1]["role"] == "user":
        msgs[-1]["content"] += "\n" + line
    else:
        msgs.append({"role": "user", "content": line})
    if msgs[0]["role"] != "user":
        msgs.insert(0, {"role": "user", "content": "(You meet on the trail.)"})
    return msgs


class Brain:
    def __init__(self) -> None:
        self._claude = None

    def claude(self):
        if self._claude is None:
            import anthropic
            self._claude = anthropic.AsyncAnthropic(timeout=25.0, max_retries=1)
        return self._claude

    async def reply(self, persona: Persona, history: list[dict], said: str, scene: Scene) -> str:
        import anthropic
        try:
            r = await self.claude().beta.messages.create(
                model=MODEL, max_tokens=2000, betas=["server-side-fallback-2026-07-01"], fallbacks="default",
                system=system_prompt(persona), messages=build_messages(history, said, scene),
                output_config={"effort": "low"},
            )
        except anthropic.RateLimitError:
            return "Ek second, saans le loon."
        if r.stop_reason == "refusal":
            return "Arre chhodo yaar, upar ka view dekho."
        text = " ".join(b.text for b in r.content if b.type == "text").strip().strip('"')
        return text[:400] or "Hmm?"


async def chat(brain: Brain, said: str, persona: Persona, history: list[dict], scene: Scene) -> str:
    if type(brain) is Brain and not configured():
        raise NotConfigured("ANTHROPIC_API_KEY not set")
    return await brain.reply(persona, history, said, scene)
