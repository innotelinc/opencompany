# Deploy OpenCompany with Coolify

This package runs the app on Coolify as two containers from one image:

- `web` — Next.js on container port `3000`, runs migrations and the idempotent seed on start.
- `worker` — the durable employee worker, starts after `web` is healthy.
- `opencompany-data` — one named volume holding SQLite, workspaces and artifacts.

Compose file: [`docker-compose.coolify.yaml`](../../docker-compose.coolify.yaml).

## Requirements

- A Coolify instance reachable on your network (the target here is
  `http://192.168.1.93:8000`).
- A Git repository Coolify can clone. The compose file builds from the repository
  root, so Coolify needs the source, not just this file. This workspace is not a
  Git repository today; push it to a Git provider (or your own Gitea/Forgejo)
  before creating the Coolify resource.
- One server destination in Coolify with Docker available.

## Create the resource

1. In Coolify: **Project → New Resource → Docker Compose**.
2. Select the repository and branch. Set **Compose file** to
   `docker-compose.coolify.yaml` and leave the base directory at the repository root.
3. Set the service/port Coolify should proxy to **`web` / `3000`**, and the health
   check path to **`/api/health`**.
4. Add the environment variables from the table below in Coolify's **Environment
   Variables** screen. Mark model keys and tokens as secrets. Do not commit them.
5. Deploy. The first build installs dependencies and runs `next build`; expect a
   few minutes.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `OPENCOMPANY_OWNER_EMAIL` | recommended | Owner identity used by the single-owner session. |
| `OPENCOMPANY_COMPANY_SLUG` | recommended | Company URL slug; must match seeded data. |
| `OPENCOMPANY_AGENT_BACKEND` | yes | `deterministic` (no model, simulated work) or `llm`. |
| `OPENAI_API_KEY` | for `llm` / chat | Any OpenAI-compatible key. Not a CopilotKit key. |
| `OPENAI_BASE_URL` | for local models | e.g. `http://host.docker.internal:11434/v1` for host Ollama. |
| `OPENCOMPANY_MODEL` | for `llm` | Model name used by the worker and chat. |
| `OPENCOMPANY_MODEL_FALLBACKS` | optional | Comma-separated fallback models. |
| `OPENCOMPANY_MONTHLY_BUDGET_CENTS` | recommended | Server-enforced spend ceiling. |
| `OPENCOMPANY_AUTO_APPROVE_CENTS` | recommended | Auto-approval threshold. |
| `OPENCOMPANY_BROWSER_ENABLED` | optional | Keep `0`; the image does not include Chromium/Playwright. |
| `OPENCOMPANY_DEPLOY_PROVIDER` + `VERCEL_*` | optional | Only for the app's `deployment_package` external action (currently Vercel). |

For Ollama on the Docker host, add this to both services if you use
`host.docker.internal` on Linux:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

The model key is optional. With no key the app still runs, the UI labels work as
simulated, and the chat panel explains what to set.

## Verify

```bash
curl -fsS http://<coolify-domain>/api/health
curl -fsS http://<coolify-domain>/site
```

`/api/health` must report `ok: true` and a worker heartbeat younger than about 20
seconds. `/site` serves the latest check-passing public site.

Persist and back up the `opencompany-data` volume: it contains the database and
all deliverable artifacts. Keep one `web` and one `worker` replica; SQLite and the
worker lease logic assume a single writer.

## Security notes

- This version has one server-resolved owner and **no sign-in**. Put it on a
  trusted network or behind an authenticating reverse proxy before public exposure.
- The worker executes allowlisted commands in workspace directories inside the
  container, not in a VM. Treat its container as untrusted and give it no host
  mounts beyond the data volume.
- Do not store the server root password or any model key in this repository.
  Coolify environment variables are the secret store.

## CopilotKit and CopilotKit Intelligence

This app uses the open-source CopilotKit runtime (`@copilotkit/*` 1.85.0) with an
OpenAI-compatible adapter. That needs no CopilotKit account or key — only a model
key (or a local OpenAI-compatible endpoint).

**CopilotKit Intelligence cannot be run locally without a key.** The local
evaluation stack requires:

- a CopilotKit account (the free Developer plan qualifies) and
  `npx copilotkit@latest login`, which issues an evaluation license
  (`CPK_INTELLIGENCE_API_KEY`, `cpk-...`), valid for 30 days and renewable;
- macOS with Docker Desktop (the CLI refuses Windows, and Linux runtime support is
  unverified outside the preview);
- at least 4 CPUs, 12 GiB RAM and 40 GiB free storage per stack.

Production self-hosting (Kubernetes/Helm or AWS ECS) also requires a valid
CopilotKit Intelligence license key. There is no keyless bypass.

## Coolify versus the app's `deployment_package`

`deployment_package` is an owner-approved external action inside OpenCompany that
publishes a deliverable artifact. It currently uses Vercel's REST API and has no
Coolify adapter: Coolify deploys from Git sources or container images, not from an
uploaded static artifact. Coolify here is the **hosting target for this app**, not
the deploy provider for employee deliverables. Supporting Coolify as a
`deployment_package` provider would need a dedicated adapter plus a Coolify API
token and a pre-created application UUID.
