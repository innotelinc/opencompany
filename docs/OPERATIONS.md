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
| `OPENCOMPANY_ANNUAL_BUDGET_CENTS` | 100000 | Yearly budget; measured monthly, adjusted quarterly. Recorded, never enforced |
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

A working instance is installed at **http://192.168.1.51:3000** on the Ubuntu
26.04 host `i1` (public: https://opencompany.innotel.site):

| Item | Value |
|---|---|
| Code | `/opt/opencompany` (git checkout, auto-deploy timer polls `origin/main`) |
| Runtime | Node.js 22.23.4 (official tarball in `/usr/local`), `build-essential` for the SQLite native build |
| Services | `opencompany-web.service`, `opencompany-worker.service` (enabled, restart on failure) |
| Unit files | `deploy/*.service` in this repository |
| Data | `/opt/opencompany/.data` (SQLite WAL, workspaces, deliverables) |
| Deploy key | `/root/.ssh/opencompany_deploy_i1` (read-only GitHub deploy key "i1 auto-deploy") |
| Auto-deploy | `deploy/install-auto-deploy.sh`, `opencompany-autodeploy.timer` |
| Backend | `deterministic` — simulated work, no model key, no cost |

Update procedure from a workstation:

```bash
tar -czf .data/opencompany.tar.gz --exclude=node_modules --exclude=.next \
  --exclude=.data --exclude=.upstream --exclude=.git --exclude=.env .
scp .data/opencompany.tar.gz root@192.168.1.51:/tmp/
ssh root@192.168.1.51 \
  'tar -xzf /tmp/opencompany.tar.gz -C /opt/opencompany && cd /opt/opencompany \
   && npm ci && npm run build && npm run db:migrate && npm run db:seed \
   && systemctl restart opencompany-web opencompany-worker'
```

Health: `curl http://192.168.1.51:3000/api/health` should report `ok: true` and a
worker heartbeat younger than 20 seconds. Logs: `journalctl -u opencompany-web -f`
and `journalctl -u opencompany-worker -f`.

The console requires sign-in. Set the owner password before handing the host over
(see Signing in), and serve it over TLS so the password and the session cookie are
not on the wire in clear.

## Signing in

One human signs in: the company's owner, whose email is `OPENCOMPANY_OWNER_EMAIL`.
There is no self-service registration and no second role yet.

While signed in, Administration → Password changes it: it asks for the current
password, refuses one under 10 characters, and signs other browsers out while keeping
the one you typed it in. To set or reset it without signing in — the first time, or
after a lockout — use the server:

```
npm run auth:password -- owner@example.com                  # prompts for the password
npm run auth:password -- owner@example.com --password-file /root/pw   # or from a file
```

Either way only a salted scrypt hash is stored, never the password, and other
sessions are revoked. Seeding creates the owner without a password, so a fresh
database cannot be signed into until one of these is used.

A session is a random 32-byte token in an `HttpOnly`, `SameSite=Lax` cookie, valid for
30 days, and the database keeps only its SHA-256. Signing out deletes the row. Every
page redirects to `/signin` without one, every API route answers 401, and any
state-changing request from another origin is refused with 403 — including sign-in.
Failed sign-ins are counted per address and email; after five in fifteen minutes the
account's address is answered 429 until the window passes.

`/api/health`, `/api/public-site/health`, `/site` and `/signin` stay reachable
without a session, because monitors and the public site need them.

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
- **Budget**: there is no exhausted state and nothing blocks on spend. The yearly
  figure is recorded history, measured monthly and reviewed quarterly with
  `budget.annual_limit_cents`; only the owner changes it.

## Security checklist before real use

1. Put TLS in front of the app, and rotate the owner password with
   `npm run auth:password -- <email>` (which also signs other browsers out).
2. Run the worker in a container with resource and network limits.
3. Use a secret manager for provider keys; rotate them outside the repo.
4. Set a realistic yearly budget. It is measured monthly and reviewed quarterly on performance; it never stops work.
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

### Changing a policy from the shell

Policy changes made in the app record their own audit entry. When one has to be made
straight from the shell — retiring a legacy row, correcting a value — use
`npm run policy` so the change and its entry are written together in one transaction:

```
npm run policy -- list [<substring>]
npm run policy -- set budget.annual_limit_cents 1200000 --note "owner's yearly budget"
npm run policy -- remove budget.monthly_limit_cents --note "retired; yearly budget replaces it"
```

Values are parsed as JSON when they can be (numbers, `true`/`false`, objects) and kept
as strings otherwise. Each set or remove writes a `policy.updated` activity event with
the old and new value, attributed to `system`, so a direct database edit never drops
out of the history. Removing a key that is not set writes nothing.

## HTTP API

Everything the console does goes through routes under `/api`, and they are usable
from a shell or a monitor as well as from the browser. Successful responses are
`{"ok":true, …}` — the deployment feed and the deliverable preview return their own
bodies instead; failures are `{"ok":false,"error":"…"}` with a status of 400 for a
validation problem, 404 for something not in this company, 409 when a decision was
already decided, 500 for an unexpected error, and 503 for health when the database
cannot be opened. Bodies are read as JSON; a body that does not parse is treated as
empty, so the field validation reports what is missing.

### Who a request is

A request is whoever holds the session cookie. Each route calls `await getSession()`,
which reads the `oc_session` token, resolves it to a human member and company in the
database, and filters every query by that company id — never by a header or body.
Without a live session the call throws and the route answers 401; pages redirect to
`/signin`. State-changing requests from another origin are refused with 403 by the
middleware, so the cookie alone is not enough to drive the API from a third-party
page. The only routes reachable signed out are `/api/health` and
`/api/public-site/health` (plus `/site` and the sign-in endpoints).

### Reading

| route | returns |
| --- | --- |
| `GET /api/health` | database reachable, company slug, agent backend, whether a live model is configured, worker heartbeat, provider health. 503 with a `hint` when the database is not seeded. |
| `GET /api/live` | the cheap snapshot the live strip polls: `halted`, worker, counts of employees/working/open/running/completed/blocked, and the 8 newest activity rows in compact form. |
| `GET /api/activity` | the activity trail plus `runEvents`, `worker` and `halted`. Paging is below. |
| `GET /api/budget` | `annualLimitCents`, the monthly and quarterly pace, spend recorded this month and quarter, committed/estimated/recorded/verified cents, and model tokens. |
| `GET /api/goals`, `GET /api/employees`, `GET /api/tasks` | the goals, the roster with departments, and every task. |
| `GET /api/autonomy` | the owner's standing approval, or null. |
| `GET /api/deployments` | this host's deployments, newest first, `no-store`. |
| `GET /api/public-site/health` | whether the public site answers right now — unauthenticated and deliberately thin, 200 or 503. `HEAD` is the same answer from the last recorded probe without making a request. |
| `GET /api/preview/<deliverableId>/<path>` | one file from the latest version of a deliverable, from inside the artifact directory, with a restrictive CSP and `private, no-store`. A private preview, not a deployment. |

### Writing

| route | body |
| --- | --- |
| `POST /api/brief` | `title`, `brief`, `requirements`, optional `budgetCents` — the owner brief that becomes a goal, a CEO plan and tasks. All three strings are required. |
| `POST /api/company` | `action`: `halt` or `resume` (emergency stop), `update` (`name`, `mission`, `operatingPrinciples`), `department.create` (`name`, `charter`), `department.rename` (`departmentId`, `name`), `position.save` (`key`, `alias`, …), `position.reset` (`key`), `employee.title` (`employeeId`, `title`). |
| `POST /api/employees` | `name`, `title`; optional `roleInstructions`, `departmentId`, `managerId`, `backend` (`deterministic` or `llm`), `allowedTools`, `authority`, `spendLimitCents` (clamped to 0–10000). |
| `POST /api/employees/<id>` | `action`: `pause`, `resume`, or `fire` with an optional `reason`. Firing terminates the person and removes them from the company; their open tasks are handed to their manager, otherwise the CEO, rather than cancelled. |
| `POST /api/tasks` | `title`, `employeeId`; optional `description`, `acceptanceCriteria`, `projectId` — work assigned by hand. |
| `POST /api/tasks/<id>` | `action`: `cancel`, `retry`, or `reassign` with `employeeId`. |
| `POST /api/goals` | `title`, optional `description`, `budgetCents`. `PATCH /api/goals/<id>` accepts `title`, `description`, `budgetCents`, `status`; `DELETE /api/goals/<id>` removes it. |
| `POST /api/knowledge` | `action`: `edit` or `delete` with `id`; otherwise a create with `title`, `body`, `accessScope` (`company`, `department`, `private`), `departmentId`, `ownerEmployeeId`. |
| `POST /api/routines` | `name`, `instructions`, `employeeId`, optional `intervalMinutes` (default 1440). |
| `POST /api/decisions/<id>` | `action`: `approve`, `reject`, or `revise` with `note`; `approve` may carry `actionDetails`, which must match the proposal or the approval is refused (409). |
| `POST /api/autonomy` | `action`: `grant` with `kinds` and optional `note`, or `revoke` — the owner's standing approval, stored as policy so it survives restarts. |
| `POST /api/budget` | `annualBudgetCents` (whole cents; `0` removes the budget). The older `monthlyLimitCents` is still accepted and read as twelve months. |
| `POST /api/computers/<employeeId>` | `action`: `takeover`, `release`, or `autonomy` with `mode` `guarded`, `yolo` or `host_control`, optional `reason`. |
| `PATCH /api/projects/<id>` | `goalId` — which goal a project serves, or null. |
| `POST /api/deployments` | `commit` (7–40 hex), `phase` `start` or `finish`, optional `source`, `status`, `detail` — what `scripts/deploy.sh` posts so a deploy appears in the console while it runs. |
| `POST /api/copilotkit` | the owner chat. Answers 503 with an explanation when no model key is configured; the forms and decision buttons do not need one. |

### Paging the activity trail

`GET /api/activity` returns the activity, newest first, in the shape the Activity
panel renders: each row has `byline` ("5m ago · system") and `text`, and a policy
change also carries `policy` with `key`, `from`, `to` and `note` — the same formatted
values shown on the page.

Page size is `?limit=`, 1–500, default 40. There are two ways to go further back:

| mode | request | when to use it |
| --- | --- | --- |
| cursor | `?limit=50&cursor=<nextCursor>` | Preferred. Events landing between calls cannot shift the window, so nothing repeats or is missed. |
| offset | `?limit=50&offset=50` | Simple, and fine for a quick look. The window moves as events land, so a long walk can repeat or skip a row. |

A page carries `nextCursor` while older history exists and `null` on the last page;
`nextOffset` is the offset equivalent and is `null` when paging by cursor. The cursor
is opaque — pass back exactly what you were given. Its readable form is
`?before=<ISO>&beforeId=<event id>`, matching the `nextBefore` and `nextBeforeId`
fields. Ordering is by `(created_at, id)`, so several events written in the same
millisecond cannot repeat or vanish.

```
curl -s 'https://opencompany.innotel.site/api/activity?limit=20'
curl -s 'https://opencompany.innotel.site/api/activity?limit=20&cursor=<nextCursor>'
curl -s 'https://opencompany.innotel.site/api/health'
```

Bad input comes back as a 400 with a reason: a `limit` outside 1–500, a negative
`offset`, a cursor this endpoint did not issue, or a `before` that is not an ISO
timestamp.

## Public site and browser sessions

The public face of the company is served, read-only and without an owner session, at
`/site` (and `/site/<asset>`). It renders the latest **check-passing** version of the
`OPENco. public site` deliverable. Before such a version exists it returns a
"being built" page, and an unapproved or failed version is never exposed.

`scripts/public-site.ts` seeds the `Public Site Developer` employee, the public-site
brief, the recurring `Public site: improvement pass` routine and the employee's
computer. The routine is work, not a plan, so it does not wait for a plan approval;
its deliverable still has to pass the automated checks, and the standard independent
review task is created for it. The newest version that passed its checks is what
`/site` serves; nothing is published anywhere else.

Browser steps are optional: install Playwright and Chromium (`npm i -D playwright &&
npx playwright install chromium`) and set `OPENCOMPANY_BROWSER_ENABLED=1`. Browsers
launch inside the employee workspace only. The local install was verified by
launching Chromium and rendering a page; the server deploy currently has
`OPENCOMPANY_BROWSER_ENABLED=0` because no Chromium is installed there.

## Publishing

The company's own site is **served by this application** at `/site`, from the newest
version that passed its checks. A pass therefore publishes nothing externally: it
records `site.published` and the version is live.

### Coolify is the deployment centre

Coolify owns the running copy of this application. It is configured with exactly one
application — one uuid, one public domain, one data volume — and Administration →
Deployments shows its status, its domain and an **Update in place** button. An update
asks Coolify to rebuild that same application: the running container is replaced by
the new one, the domain and the `.data` volume do not change, and the site is never
served from two copies at once. Nothing in this repository creates, clones or deletes
a Coolify application; a second application with its own database behind the same
domain is what went wrong here before.

```sh
COOLIFY_BASE_URL=http://192.168.1.52:8000    # no trailing slash
COOLIFY_TOKEN=…                              # server-side only
COOLIFY_APP_UUID=…                           # the application uuid, not its name
COOLIFY_APP_NAME=opencompany                 # label in the console
OPENCOMPANY_DEPLOY_PROVIDER=coolify          # Coolify owns the running copy
```

`POST /api/deployments/update` queues the same rebuild for a script or a monitor. It
needs an owner session and returns the Coolify deployment uuid rather than waiting,
because the caller is usually the container being replaced;
`updateInPlace()` in `src/lib/engine/coolify.ts` is the waiting variant, for workers.

Only one host runs the application, and here it is i2: Coolify runs it as one
container with the `opencompany-data` volume and publishes port 3001. The public
front still forwards to i1 on port 3000, so i1 runs `opencompany-forward.service`,
a plain TCP forward to `192.168.1.52:3001`. That keeps one public origin and one copy
of the application; i1's `opencompany-web`, `opencompany-worker` and
`opencompany-autodeploy.timer` are disabled, and its `.data` directory stays as it
was for rollback.

The forward lives in this repository, so a rebuilt host gets the public path back:

```sh
bash deploy/install-forward.sh --take-over   # once, as root, from a checkout
```

It installs `deploy/forward/opencompany-forward.mjs` as
`/usr/local/bin/opencompany-forward.mjs` and the unit as
`/etc/systemd/system/opencompany-forward.service`, stops the local web, worker and
auto-deploy timer, then proves `/api/health` answers through the forward. Without
`--take-over` it never stops the local application; if port 3000 is taken it fails
and says so rather than taking the site down. `FORWARD_HOST` and
`FORWARD_TARGET_PORT` override the destination. After a rebuild, this service is the
only thing between the public domain and the application, so check it first:

```sh
systemctl status opencompany-forward.service
journalctl -u opencompany-forward.service -n 30
curl -fsS http://127.0.0.1:3000/api/health
```

### Moving the public port back to this host

The cutover is reversible from i1, and its `.data` directory is the database as it
stood at the move:

```sh
systemctl disable --now opencompany-forward.service
systemctl enable --now opencompany-web.service opencompany-worker.service opencompany-autodeploy.timer
```

Anything the company did after the move lives in the `opencompany-data` volume on
i2, not on i1, so copy the database across before rolling back if that work matters.
i1's `.env` names the deployment centre it would talk to: `COOLIFY_BASE_URL`,
`COOLIFY_APP_UUID` and `COOLIFY_TOKEN` point at the i2 instance and its application,
and `OPENCOMPANY_DEPLOY_PROVIDER=none` because that host serves itself. The old
192.168.1.113 values were stale and have been replaced.

Coolify's own Traefik could not start on i2 because oauth2-proxy already owns host
port 8080 (it also wants 80 and 443), which is why the application publishes a port
instead of a domain. The proxy is therefore stopped deliberately, with Coolify's own
stop action, so its server check leaves it down:

```sh
docker exec coolify php artisan tinker --execute="App\Actions\Proxy\StopProxy::run(App\Models\Server::first(), true);"
```

That removes the `coolify-proxy` container and sets `force_stop` on the server's
proxy, which is the flag `ServerCheckJob` and `PushServerUpdateJob` read before
starting it again. Verify with `docker ps -a | grep coolify-proxy` (nothing) and
`docker exec coolify php artisan tinker --execute="echo App\Models\Server::first()->proxy->force_stop;"`
(`1`). The application is unaffected either way: it publishes port 3001 through
Docker, not through the proxy, and its volume is mounted by the container, not by the
proxy. If the required ports are ever freed, start the proxy from Server → Proxy and
the domain route can be switched on; until then it must stay stopped rather than
retry every check.

A customer deliverable keeps **one** publish decision. A standing approval covers the
class, so the first pass records the decision and every later pass queues only its own
version under it (`deploy.queued` in the feed) instead of proposing v1, v2, v3… A
decision the owner made by hand covers exactly the version they reviewed, and a pending
one waits for them.

This host runs with `OPENCOMPANY_DEPLOY_PROVIDER=none`, so an approved customer
deployment is assembled into a local package (with its `DEPLOYMENT.md`) and recorded as
**blocked** with the reason. Nothing leaves the box. To publish for real, configure a
provider below. Coolify deploys from its own sources, so it cannot take delivered
artifact files even when it owns the application: the package stays local.

A provider publishes from its own sources, so it cannot be handed the artifact
files: the executor assembles the package locally (with `DEPLOYMENT.md`, for the
audit trail), triggers a deployment, waits for it to finish, then fetches the
public domain once. The outcome records whether the URL was reachable, so
`succeeded` means published rather than merely accepted. The action is claimed
exactly once: a failed or uncertain publication is never retried automatically,
and a changed artifact invalidates the approval hash.

### Auto-deploy on push

A push to `main` rebuilds the same Coolify application in place. The repository has
one GitHub webhook, `push` only:

```
https://deploy.innotel.us/webhooks/source/github/events/manual
```

`deploy.innotel.us` is the public front's route to Coolify; it proxies to
`192.168.1.113:8000`, which forwards to Coolify on `192.168.1.52:8000`. Coolify
matches the delivery to the application by repository (`innotelinc/opencompany`) and
branch (`main`), checks the `X-Hub-Signature-256` HMAC against the application's
`manual_webhook_secret_github`, and queues a normal deployment of that application —
same uuid, same domain, same `.data` volume, one container replaced by its
successor. Nothing creates or clones an application.

Auto deploy must stay enabled in the application's settings for a delivery to start
a build; the webhook alone does not override that.

The timer below is the self-hosted alternative, disabled on i1 because Coolify owns
deployments here.

`bash deploy/install-auto-deploy.sh` (once, as root) installs
`/usr/local/bin/opencompany-autodeploy` and a systemd timer that runs it every
minute: it fetches `origin/main`, and when the branch has moved it runs
`scripts/deploy.sh`, which builds, restarts web and worker, and waits for
`/api/health`. A push is live within about a minute.

The box has a read-only GitHub deploy key and no inbound access, so it polls
rather than receiving a webhook. Nothing is fetched or built when the branch has
not moved. `scripts/deploy.sh` holds `/run/opencompany-deploy.lock`, so a manual
deploy and the timer cannot build over each other. The watcher refuses to reset a
checkout with modified tracked files, leaving that decision to a human.

```sh
journalctl -u opencompany-autodeploy -n 50   # what it did, and when
systemctl list-timers opencompany-autodeploy.timer
```

Deployments report themselves. `scripts/deploy.sh` appends a start and a finish to
`$OPENCOMPANY_DATA_DIR/deploy-events.jsonl` and POSTs the same JSON to
`OPENCOMPANY_DEPLOY_NOTIFY_URL` when that is set, and Administration →
Deployments lists them. A start with no finish is shown as running rather than
hidden, and a failure keeps the reason.
`/api/deployments` returns the same feed for a monitor; no journal reading.

### The public site

The company's own site is React (`src/lib/public-site/site.tsx`), rendered to
static files with `renderToStaticMarkup` and served at `/site`. It is not
hydrated: plain HTML and CSS, which keeps a strict content-security policy
workable.

Two duties keep it online. `Public site: improvement pass` (hourly) rebuilds the
site and only a version that passed its checks is served; `Public site:
availability watch` (every fifteen minutes) asks `/api/public-site/health`
whether the site answers and reports what it saw. `OPENCOMPANY_PUBLIC_SITE_URL`
is what both check, defaulting to this app's own `/site`.

Employee browsers are on by default (`OPENCOMPANY_BROWSER_ENABLED=1`) and the
image installs Playwright's Chromium, so "Browser: not configured" cannot come
back after a redeploy. The owner edits the budget in Administration; a ceiling of
0 means no ceiling, which silences overrun warnings but not the approval in front
of real money.

### Vercel

Set `OPENCOMPANY_DEPLOY_PROVIDER=vercel` with `VERCEL_TOKEN` and
`VERCEL_PROJECT_ID` (optional `VERCEL_TEAM_ID`). That path uploads the approved
artifact files directly through Vercel's REST API. Vercel's Hobby plan is for
non-commercial use; confirm the plan fits before treating a deployment as
production.
