# OpenMausBot — the bot server behind `bot.innotel.site`

[OpenMausBot](https://github.com/innotelinc/OpenMausBot) (upstream:
[`milind-soni/OpenMausBot`](https://github.com/milind-soni/OpenMausBot)) is the
open-source Grok Bot alternative: a chat app where every bot in the sidebar is a
real agent with its own personality, model, cloud computer and connected apps. This
folder is the integration point in this repository, not a fork — the code stays
upstream's, and the tenant is deployed from its published image.

## What is here

| File | Why |
|---|---|
| `compose.yaml` | the tenant Coolify runs: the harness server plus Caddy, over Unix sockets |
| `Caddyfile` | the socket hop and the trusted-proxy header, copied from upstream `deploy/local` |

Nothing builds here. `compose.yaml` pulls
`ghcr.io/milind-soni/openmausbot:${OMB_IMAGE}`; the panel pins the tag and records
the deployed digest.

## Why two services for one bot server

OpenMausBot binds only `127.0.0.1` inside its container and publishes two Unix
sockets. That loopback trust **is** its login model: a request on a socket is never
a local one, so it needs a session, and the first browser sees the pairing page.
Publishing the server's port directly would put an unauthenticated surface on the
estate network. Caddy in the same volume, in front of those sockets, is upstream's
answer and it is kept here unchanged.

## Deploying it

The Coolify application uses this folder as its base directory with the
`dockercompose` build pack:

- **Repository** `innotelinc/opencompany`, branch `main`, base directory
  `/bots/openmausbot`
- **Domain** `bot.innotel.site`, container port `8080` (Caddy)
- **Environment** `DOMAIN=bot.innotel.site`, `OMB_IMAGE=<pinned release tag>`,
  `OMB_TRUSTED_PROXY_CIDRS=172.16.0.0/12 10.0.0.0/8 192.168.0.0/16`

The name resolves to the estate edge, which terminates TLS and forwards to the
application; the certificate is not Caddy's.

## First sign-in

OpenMausBot pairs, it does not take a password. Make a one-time link on the
server and open it (or paste it into the desktop app's **＋ → Connect to a
server**):

```sh
docker compose exec omb openmausbot pair --label "First admin"
```

The link is an administrator credential until it is used or expires — treat it like
a password. Signing in with an emailed code instead needs the SMTP settings on the
server (`OMB_SIGNIN_SMTP_URL`, `OMB_SIGNIN_SMTP_FROM`) and the addresses allowed to
use them (`OMB_SIGNIN_EMAILS`), documented upstream in `docs/self-hosting.md`.
