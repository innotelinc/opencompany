# OpenMausBot — the bot server behind `bot.innotel.site`

[OpenMausBot](https://github.com/innotelinc/OpenMausBot) (upstream:
[`milind-soni/OpenMausBot`](https://github.com/milind-soni/OpenMausBot)) is the
open-source Grok Bot alternative: a chat app where every bot in the sidebar is a
real agent with its own personality, model, cloud computer and connected apps. This
folder is the integration point in this repository, not a fork — the code stays
upstream's, and the tenant runs the published image.

## What is here

| File | Why |
|---|---|
| `compose.yaml` | the socket-based tenant (server plus Caddy), kept for a compose deployment |
| `Caddyfile` | the socket hop and trusted-proxy header, copied from upstream `deploy/local` |
| `README.md` | how the live application is configured |

Nothing builds here. The image is upstream's published release
(`ghcr.io/milind-soni/openmausbot`).

## How the live application runs

The Coolify application is a **Docker image** application, not a compose one: the
panel's API creates compose applications with an empty compose body, so a compose
deploy there fails before it starts. The live shape is a single container of the
upstream image, with the edge terminating TLS:

| Setting | Value | Why |
|---|---|---|
| image | `ghcr.io/milind-soni/openmausbot:latest` | upstream's release, 1.76 GB, pulled by the panel |
| container port | `8799` | the harness server |
| host port | `8801 → 8799` | what the estate edge forwards to |
| `OMB_LAN` | `1` | without it the server binds only `127.0.0.1` inside the container; with it, it binds all interfaces and still refuses connections that are not from a private address |
| `OMB_PUBLIC_URL`, `OMB_WEBHOOK_PUBLIC_URL` | `https://bot.innotel.site` | pairing links and hook URLs the server prints |
| `OMB_SERVER_NAME` | `bot.innotel.site` | the name the desktop app shows |
| edge vhost | `bot.innotel.site` → `192.168.1.52:8801`, `*.innotel.site` certificate, HTTP forced to HTTPS | same front door as every other name |

`OMB_LAN=1` is the one deliberate compromise against upstream's loopback-trust
model: it exists for a server reached over a LAN, and the listener still destroys
any connection whose endpoints are not private. The estate edge and Coolify's
network are private, so those pass; a public client cannot reach `:8799` without
going through the edge.

## First sign-in

OpenMausBot pairs, it does not take a password. Make a one-time link on the
server and open it (or paste it into the desktop app's **＋ → Connect to a
server**):

```sh
docker exec <container> openmausbot pair --label "First admin"
```

The link is an administrator credential until it is used or expires — treat it like
a password. Signing in with an emailed code instead needs `OMB_SIGNIN_SMTP_URL` and
`OMB_SIGNIN_SMTP_FROM` plus the allowed addresses (`OMB_SIGNIN_EMAILS`), documented
upstream in `docs/self-hosting.md`.

## Health

`GET https://bot.innotel.site/api/health` answers `{"app":"openmausbot"}` without a
session; that is also the container health check.
