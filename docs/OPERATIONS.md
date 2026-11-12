# Operations

## Process model

| Process | Command | Must run for |
|---|---|---|
| Web + API | `npm start` (after `npm run build`) or `npm run dev` | Owner UI, decisions, previews |
| Worker | `npm run worker` | Any work to advance |

Both share `.data/opencompany.db` (SQLite WAL). Closing the browser does not stop
the worker. Stop the worker with `Ctrl+C`; it finishes the current tick and exits.

Health: `GET /api/health` reports company, backend, live-model status and worker
heartbeat. The sidebar shows “Worker alive/offline”; a heartbeat older than 20s is
offline.

## Environment

Copy `.env.example` to `.env`. Secrets belong in the server environment only.

| Variable | Default | Notes |
|---|---|---|
| `OPENCOMPANY_DB` | `.data/opencompany.db` | SQLite file |
| `OPENCOMPANY_DATA_DIR` | `.data` | Workspaces, artifacts, deployments |
| `OPENCOMPANY_OWNER_EMAIL` | demo owner | Seeded owner identity |
| `OPENCOMPANY_COMPANY_SLUG` | `northwind-studio` | Company resolved by the session |
| `OPENCOMPANY_AGENT_BACKEND` | `deterministic` | `llm` for live agent work |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENCOMPANY_MODEL` | — | OpenAI-compatible provider |
| `OPENCOMPANY_MONTHLY_BUDGET_CENTS` | 2500 | Hard dispatch ceiling |
| `OPENCOMPANY_AUTO_APPROVE_CENTS` | 300 | Owner-approval threshold |
| `OPENCOMPANY_MAX_DELEGATION_DEPTH` | 3 | |
| `OPENCOMPANY_MAX_REVIEW_ROUNDS` | 2 | |
| `OPENCOMPANY_MAX_ATTEMPTS` | 2 | Per task |
| `OPENCOMPANY_RUN_TIMEOUT_SECONDS` | 600 | Wall clock per run |
| `OPENCOMPANY_RUN_LEASE_SECONDS` | 120 | Worker lease |
| `OPENCOMPANY_BROWSER_ENABLED` | 0 | Requires Playwright + Chromium |

Budget and plan policies live in the `policies` table (visible in
Administration) and are enforced at dispatch, not in the UI.

## First run

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run build && npm start      # terminal 1
npm run worker                  # terminal 2
```

Reset demo data (stop both processes first for a full wipe):

```bash
npm run db:reset
```

`db:reset` truncates tables in place rather than deleting the database file, so a
stale Windows reader cannot block it with `EPERM`. Remove `.data/workspaces` and
`.data/deliverables` manually if you want a completely clean filesystem.

## Docker deployment (including a LAN server)

```bash
docker compose up -d --build
docker compose logs -f worker
```

Compose runs two containers from one image against a shared `opencompany-data`
volume: `web` on port 3000 and `worker`. `db:migrate` and `db:seed` run before the
web process; the worker seeds only if the company is missing.

For a remote host such as a LAN server, copy the project, create `.env` there
with the real provider key, then run the same commands. Do not expose port 3000
publicly without adding authentication: this version has a single owner resolved
from server configuration.

## Reference deployment (LAN server)

A working instance is installed at **http://192.168.1.112:3000** on the Ubuntu
26.04 host `copilotkit`:

| Item | Value |
|---|---|
| Code | `/opt/opencompany` (rsync/tar copy, not a git checkout) |
| Runtime | Node.js 22.23.4 (NodeSource), `build-essential` for the SQLite native build |
| Services | `opencompany-web.service`, `opencompany-worker.service` (enabled, restart on failure) |
| Unit files | `deploy/*.service` in this repository |
| Data | `/opt/opencompany/.data` (SQLite WAL, workspaces, deliverables) |
| Admin key | `~/.ssh/authorized_keys` entry for `.data/deploy_key` (gitignored, never commit it) |
| Backend | `deterministic` — simulated work, no model key, no cost |

Update procedure from a workstation:

```bash
tar -czf .data/opencompany.tar.gz --exclude=node_modules --exclude=.next \
  --exclude=.data --exclude=.upstream --exclude=.git --exclude=.env .
scp -i .data/deploy_key .data/opencompany.tar.gz root@192.168.1.112:/tmp/
ssh -i .data/deploy_key root@192.168.1.112 \
  'tar -xzf /tmp/opencompany.tar.gz -C /opt/opencompany && cd /opt/opencompany \
   && npm ci && npm run build && npm run db:migrate && npm run db:seed \
   && systemctl restart opencompany-web opencompany-worker'
```

Health: `curl http://192.168.1.112:3000/api/health` should report `ok: true` and a
worker heartbeat younger than 20 seconds. Logs: `journalctl -u opencompany-web -f`
and `journalctl -u opencompany-worker -f`.

This host is reachable on the LAN without authentication — keep it on the trusted
network segment until real sign-in is implemented.

## Recovery and incidents

- **Interrupted work**: leave the worker running; expired leases are recovered on
  the next tick, marked `interrupted`, and retried within the task's attempt
  budget. Nothing resumes mid-flight.
- **Emergency stop**: Boardroom → Emergency stop, or
  `POST /api/company {"action":"halt"}`. New dispatch stops immediately and
  queued/running runs get a cancellation flag. Already-executing external effects
  cannot be recalled; the response says so.
- **Uncertain external action**: an action stuck in `executing` for five minutes
  becomes `uncertain` and is never auto-retried. Inspect the provider, then create
  a new decision if the effect is needed.
- **Provider down**: runs fail with `Provider unavailable: …`, the task is blocked
  with that reason, and nothing is reported as successful.
- **Human takeover**: Computers → Take control. The agent stops before its next
  action; the lock expires after 15 minutes or can be released.
- **Budget exhausted**: tasks block with the exact committed/limit numbers. Raise
  `budget.monthly_limit_cents` deliberately; employees cannot.

## Security checklist before real use

1. Add real sign-in and replace the configuration-resolved owner session.
2. Run the worker in a container with resource and network limits.
3. Use a secret manager for provider keys; rotate them outside the repo.
4. Set a realistic monthly budget and per-employee limits.
5. Keep `.data` out of version control and back it up (database + artifacts).
6. Review `docs/LICENSING.md` before adding Intelligence or paid providers.

## Live model backend (OpenAI-compatible gateway)

`OPENCOMPANY_AGENT_BACKEND=llm` promotes every employee to live work; an employee
pinned to `llm` stays live even in deterministic mode. The endpoint, key and model
come from `OPENAI_BASE_URL`, `OPENAI_API_KEY` and `OPENCOMPANY_MODEL`. Nothing about
the model is hard-coded, so any OpenAI-compatible gateway works.

This installation was verified against the Innotel gateway
(`https://gateway.innotel.us/v1`) with a key issued by the OmniRoute management API
on `192.168.1.71`. The key is only ever in `.env` (mode 600) and never reaches the
browser or the logs. Live runs record real token counts in `task_runs`; approvals,
budget reservations, required checks and independent review run exactly as they do
in deterministic mode.

If a live deliverable fails its checks it becomes `blocked` with the failing check
name and is never silently accepted. Retry it after fixing the prompt or input with
`npx tsx scripts/retry-blocked.ts`; the owner can approve the newest proposed plan
with `npx tsx scripts/approve-plan.ts`.

## Public site and browser sessions

The public face of the company is served, read-only and without an owner session, at
`/site` (and `/site/<asset>`). It renders the latest **check-passing** version of the
`OpenCompany public site` deliverable. Before such a version exists it returns a
"being built" page, and an unapproved or failed version is never exposed.

`scripts/public-site.ts` seeds the `Public Site Developer` employee, the public-site
brief, the recurring `Public site: improvement pass` routine and the employee's
computer. The routine is work, not a plan, so it does not wait for a plan approval;
its deliverable still has to pass the automated checks, and the standard independent
review task is created for it. Publishing the site to an external provider remains an
owner decision and is blocked while no provider is configured.

Browser steps are optional: install Playwright and Chromium (`npm i -D playwright &&
npx playwright install chromium`) and set `OPENCOMPANY_BROWSER_ENABLED=1`. Browsers
launch inside the employee workspace only. The local install was verified by
launching Chromium and rendering a page; the server deploy currently has
`OPENCOMPANY_BROWSER_ENABLED=0` because no Chromium is installed there.

## Publishing through Coolify

`deployment_package` publishes an owner-approved deliverable through Coolify's
REST API on `deploy.innotel.us`; no CLI is needed at runtime. Set these on the
worker's host (never in the browser or a tracked file):

```sh
OPENCOMPANY_DEPLOY_PROVIDER=coolify
COOLIFY_BASE_URL=https://deploy.innotel.us
COOLIFY_TOKEN=...      # Coolify → Keys & Tokens → API tokens
COOLIFY_APP_UUID=...   # the application's uuid, not its name
OPENCOMPANY_DEPLOY_NAME=opencompany-site
```

Coolify publishes from its own sources, so it cannot be handed the artifact
files: the executor assembles the package locally (with `DEPLOYMENT.md`, for the
audit trail), triggers a deployment of the configured application, waits for it
to finish, then fetches the public domain once. The outcome records whether the
URL was reachable, so `succeeded` means published rather than merely accepted.
Until both `COOLIFY_TOKEN` and `COOLIFY_APP_UUID` are present, an approved
deployment is packaged locally and recorded as **blocked** with the provider
reason; it is not published. The action is still claimed exactly once: a failed
or uncertain publication is never retried automatically, and a changed artifact
invalidates the approval hash.

### Vercel instead

Set `OPENCOMPANY_DEPLOY_PROVIDER=vercel` with `VERCEL_TOKEN` and
`VERCEL_PROJECT_ID` (optional `VERCEL_TEAM_ID`). That path uploads the approved
artifact files directly through Vercel's REST API. Vercel's Hobby plan is for
non-commercial use; confirm the plan fits before treating a deployment as
production.
