# Triund multiplayer server

Rooms, shared worlds, positions, friends and voice tokens for the Triund walk test (`../walk-test`).

- **Play modes** (start screen): Solo (offline, as before) · Couple (2) · Bakchods (4, 6 or 8).
- **Ludo-style rooms**: the host creates a room and gets a 6-letter code plus an invite link (`?join=CODE`).
  Friends join with the code or the link, everyone taps Ready, and the host starts. A friend can still join later
  with the same code and drops in at the start.
- **PUBG-style shared mountain**: parties that start at the same time share one world of up to 100 players.
  Positions go out 10 times a second, only for players within 220 m plus your team at any distance.
- **Voice** (LiveKit, one room per world). Press **N** in game to switch:
  - All: everyone within 45 m, louder the closer, plus your team anywhere.
  - Team: only your party.
  - Off.
- **Music**: a player walking with their speaker on (B) is heard as they pass.
- **Male / Female**: chosen on the start screen, under your name, and required before you start or join a room.
  It sets your body; your jacket, bag and cap come from your player id, so everyone sees you in the same clothes.
- **Couple moves** (with someone from your own group, standing next to them; they press the same key to say yes,
  and either of you presses it again to stop):
  - **J**: hold hands. You walk side by side about 75 cm apart. Whoever walks leads, and the one standing still is
    led along and walks with them.
  - **U**: carry your partner on your shoulders. They ride along at about 2.1 m with the view from up there, holding
    your head, while your hands hold their shins. Their weight (55 kg for a woman, 68 kg for a man) is added to your
    bag: you slow down, and your heart rate and energy use go up.
- **Friends**: press E next to a player to ask, G to accept. Friends are stored in SQLite (`data/triund.db`).
- **Chatting with bots**: press Enter next to a hiker or a stall keeper and type in Hindi, English or Hinglish.
  They stop, turn to you, and answer as a subtitle. Each of them has a name, a home town and a reason to be on the
  trek, and knows where they stand, the time and the weather. Replies come from Claude (`claude-opus-5-5`, effort
  low, refusal fallback on) through `POST /bot/chat`. Without the server or a Claude key they still answer, with short
  written lines. Each IP is limited to `TRIUND_TALK_PER_MIN` lines a minute (default 20).

## Run locally

For real conversations with bots, put a Claude key in `server/.env` (it is gitignored):

```bash
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env
```

```bash
./dev.sh          # LiveKit (dev keys) and this server on :8787, which also serves the game
```

Open http://127.0.0.1:8787/ in two browsers (for example one normal window and one private window).
Choose Couple, create a room in one, and join with the code in the other.
On one laptop, set one of the two windows to Graphics: Low: two games on High can run the 1 GB GPU out of memory.
Serve the game from this server and not from a separate static server: browsers block a page from calling a
local server on another port (Chrome's local network access rules), so `/bot/chat` would fail.
To play from another device on the same Wi-Fi, open `http://<laptop-ip>:8787/`.
Voice also needs LiveKit to be reachable at `LIVEKIT_URL`, so set it to `ws://<laptop-ip>:7880` before running.

### Without this server (Ludo style)

Opened from GitHub Pages (`../deploy/pages.sh`), or from anywhere `/health` is missing, the game runs rooms itself.
The browser that creates the room acts as this server for its group: the same messages and rules (`../walk-test/js/net/p2p.js`).
Friends connect to that browser over WebRTC, through PeerJS's public broker and its TURN relay. This covers Couple and
Bakchods (2-8) with voice. There is no 100-player world, and the room ends when its host leaves.

### Playing with friends anywhere, from this laptop

`127.0.0.1` means "this computer", so a link with it only opens on your own laptop. Run `./share.sh` next to
`./dev.sh`: it opens a free Cloudflare quick tunnel and prints a public `https://….trycloudflare.com/` link.
Open that link yourself, create the room, and send your friends the invite link from **Copy invite link**; it now
carries the public address. Your friends can be anywhere.

- The link works only while `dev.sh` and `share.sh` run, and it changes every time `share.sh` restarts.
- Walking together, rooms and chat with bots work. Voice does not reach friends through the tunnel, because the
  LiveKit server is on this laptop and WebRTC needs its own ports; that needs the online server (Deploying, below).
- Everything loads from your laptop's upload: about 18 MB the first time.

Tests: `uv run --group dev pytest -q`

## Settings (environment)

| Variable | Default | |
|---|---|---|
| `LIVEKIT_URL` | `ws://127.0.0.1:7880` | what browsers connect to for voice |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | `devkey` / `secret` | the `livekit-server --dev` keys; **change in production** |
| `TRIUND_DB` | `data/triund.db` | friends |
| `TRIUND_ORIGINS` | any | comma-separated page origins allowed to connect, e.g. `https://triund.example.com` |

## Deploying (`../deploy`)

Everything runs on one VM: this server (which also serves the game), LiveKit for voice with TURN, and Caddy for
automatic HTTPS. Vercel cannot host it, because its functions cannot keep the long-lived WebSocket and WebRTC
connections open.

1. Get a VM (2 vCPU / 4 GB is plenty to start; Ubuntu with Docker) and two DNS names pointing at it, for example
   `triund.example.com` and `voice.triund.example.com`.
2. Open these ports:
   - 80 and 443 (TCP)
   - 7881 (TCP)
   - 7882 (UDP)
   - 3478 (UDP)
3. `cd prototype/deploy && cp env.example .env`, then fill in the domains, a long random LiveKit secret, and the
   Anthropic key.
4. `docker compose up -d --build`. Friends then open `https://triund.example.com/`.

## Protocol

JSON frames `{"t": type, ...}` over `/ws`. The message list is at the top of `triund_server/app.py`.
`GET /health` shows the players, parties and worlds.

## Not built yet

- **Shared clock**: each party keeps its own game clock. Worlds only group parties by start time.
- **Reconnects**: a page refresh mid-trek drops you from the room. Join again with the code.
