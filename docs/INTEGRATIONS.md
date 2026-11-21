# Integrations: OpenMausBot, voice, and computers

Three hosted services in the OpenMausBot feature list are optional. This
repository replaces each with something the owner runs, and connects the whole
thing to the CopilotKit console that already exists here.

| Hosted service | What it did | What this repo uses instead |
|---|---|---|
| **Boat** | an isolated remote Linux desktop per bot | a self-hosted Docker container per bot, with a noVNC/KasmVNC desktop and a terminal (`src/lib/integrations/desktop`) |
| **ElevenLabs** | read replies aloud, call bots | **Speaches** (Kokoro/Piper voices) or **Chatterbox**, over the OpenAI-compatible speech API (`src/lib/integrations/voice`) |
| **Fish Audio** | voices and speech-to-text | **Speaches** / **faster-whisper** for recognition, **whisper.cpp** optional (`src/lib/integrations/voice`) |

No vendor account, key, or Cloudflare worker is involved. Every address points
at a server on the owner's machine or network, and every one of these features
stays off until its environment variable is set.

## 1. OpenMausBot as an agent backend

The employee loop still belongs to OPENco.: plans are approved by the owner,
deliverables are checked by the server, and a second employee reviews the work.
Only execution moves.

```bash
OPENCOMPANY_AGENT_BACKEND=openmaus
OPENMAUSBOT_URL=http://127.0.0.1:8799
OPENMAUSBOT_TOKEN=                 # only when the harness is behind an authenticated proxy
OPENCOMPANY_OPENMAUS_TIMEOUT_MS=120000
OPENCOMPANY_OPENMAUS_BOT_PREFIX=openco
```

`OpenMausBackend` (`src/lib/integrations/openmaus/backend.ts`):

- finds or creates one bot per employee (`openco:<employeeId>`), then opens a
  task thread and sends the assignment;
- gives the bot the employee's **workspace path**, and reads the deliverable
  back from that directory — not from the reply;
- asks for one JSON object for `plan` and `review` tasks, and fails closed if
  the reply does not parse;
- interrupts the turn when the owner stops the run, takes over the computer, or
  halts the company.

**Same filesystem requirement.** A bot writes into the path it is given. Run the
harness on the same machine, or mount the OPENco. data directory into the
harness container at the same absolute path. Without that, the bot can answer
but cannot produce a deliverable, and the server will (correctly) refuse to
complete the task.

Planning can stay local: set `OPENCOMPANY_AGENT_BACKEND=llm` and pin only the
employees you want to `openmaus` with `PATCH /api/employees/<id>`
(`backend: "llm"` also means the hosted model — pinning is per employee).

## 2. Voice without a voice vendor

```bash
OPENCOMPANY_TTS_PROVIDER=speaches       # or chatterbox
OPENCOMPANY_TTS_URL=http://127.0.0.1:8000
OPENCOMPANY_TTS_MODEL=speaches-ai/Kokoro-82M-v1.0-ONNX
OPENCOMPANY_TTS_VOICE=af_heart

OPENCOMPANY_STT_PROVIDER=speaches       # or whispercpp
OPENCOMPANY_STT_URL=http://127.0.0.1:8000
OPENCOMPANY_STT_MODEL=Systran/faster-whisper-base
```

Routes:

- `POST /api/voice/tts` `{ text, voice?, format? }` → audio bytes
- `POST /api/voice/stt` (raw `audio/wav`) → `{ text }`
- `POST /api/voice/stt?language=de`

Both require the owner session. The CopilotKit console gets a
`read_reply_aloud` action that plays the returned audio.

Start the servers with `deploy/integrations/docker-compose.yml`:

```bash
docker compose -f deploy/integrations/docker-compose.yml up -d
```

## 3. A desktop computer per bot (Boat replacement)

```bash
OPENCOMPANY_DESKTOP_PROVIDER=docker
OPENCOMPANY_DESKTOP_DOCKER_HOST=unix:///var/run/docker.sock
OPENCOMPANY_DESKTOP_IMAGE=lscr.io/linuxserver/webtop:ubuntu-kde
OPENCOMPANY_DESKTOP_PUBLIC_HOST=desk.example.com
OPENCOMPANY_DESKTOP_PORT=3000
OPENCOMPANY_DESKTOP_MEMORY_MB=2048
OPENCOMPANY_DESKTOP_CPUS=1
```

`POST /api/computers/desktop`:

```json
{ "action": "provision", "key": "employee-id" }
{ "action": "status",    "key": "employee-id" }
{ "action": "exec",      "key": "employee-id", "command": "uname -a && ls -la" }
{ "action": "stop",      "key": "employee-id" }
```

The container is named `<prefix>-<key>`, gets its own filesystem, 2 GB and one
CPU by default, `no-new-privileges`, and a published desktop port. It never sees
the owner's session, cookies or provider keys.

`OPENCOMPANY_DESKTOP_PUBLIC_HOST` is only the address printed in the URL. Put
TLS and per-desktop routing in front (Caddy/nginx) before exposing it beyond
the LAN; the container itself serves plain HTTP.

## 4. One console: CopilotKit + OpenMaus + OPENco.

`src/app/api/copilotkit/route.ts` stays the single runtime. Three actions are
added in `src/components/ChatPanel.tsx`:

| Action | Calls |
|---|---|
| `ask_openmaus_bot` | `POST /api/integrations/openmaus` |
| `read_reply_aloud` | `POST /api/voice/tts` |
| `open_bot_desktop` | `POST /api/computers/desktop` |

`GET /api/integrations/status` reports what is configured (never a key). The
model still cannot approve an owner decision: approvals remain server-side
decisions bound to an action hash.

## Repository note

`openmausbot-work/` is a checkout of `innotelinc/OpenMausBot`. This integration
does **not** modify that checkout. It speaks its public harness API, so pulling a
newer OpenMausBot release does not require patching it. The one coupling is the
endpoint shapes documented in `docs/mcp-server.md` and used by
`src/lib/integrations/openmaus/client.ts`.
