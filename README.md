# OpenCompany — an AI Company Operating System

AI employees run authorized work. The human owner sets direction, budget and
approval boundaries, then returns to results, an operating report and a short
list of decisions.

This is a runnable first version: real database, durable worker, isolated
employee workspaces, server-enforced authority, independent review, and a
complete vertical slice from owner brief to reviewed deliverable. It is **not**
a mockup and not a set of screenshots.

```text
Owner goal → CEO plan → owner approval → projects & tasks → manager assignment
→ employee execution in its own workspace → automated checks → independent review
→ revision or completion → CEO operating report → deployment decision
```

## Quick start

Prerequisites: **Node.js 22+** (tested on 24), npm, and a terminal. No Docker,
model key, or cloud account is required for the default demo.

```bash
npm install
cp .env.example .env          # optional: defaults work as-is
npm run db:seed               # creates the fictional demo company
npm run dev                   # http://localhost:3000
npm run worker                # second terminal: advances authorized work
```

Or run both processes with one command:

```bash
npm run dev:all
```

Offline end-to-end proof (no UI, no model calls):

```bash
npm run demo
```

The demo seeds the company, submits the owner brief, approves the plan as the
owner, and runs the durable loop until a reviewed website, a CEO report and a
pending deployment decision exist.

### Enabling live agent work

```bash
# .env
OPENCOMPANY_AGENT_BACKEND=llm
OPENAI_API_KEY=...                    # or write it via the Desktop Account → Developer API
OPENAI_BASE_URL=https://api.openai.com/v1
OPENCOMPANY_MODEL=gpt-4.1-mini
```

Any OpenAI-compatible chat-completions endpoint works. The key stays on the
server: it is never sent to the browser and never placed in a prompt.

## What the first slice does

The seeded company is **Northwind Studio**, a fictional website studio:

| Employee | Role | Authority |
|---|---|---|
| Iris Kang | Chief Executive Officer | internal |
| Dana Whitfield | Operations Manager | internal |
| Rhea Okafor | Customer Researcher | internal |
| Milo Vance | Web Developer | internal |
| Priya Raman | Quality Reviewer | internal |

The owner submits: *“Prepare a small website for this customer using the
attached requirements.”* With fictional customer **Larkspur & Ledger**:

1. The brief and requirements are saved as a goal and a knowledge document.
2. The CEO proposes a project, two dependent tasks, acceptance criteria, required
   checks and a budget — and stops for the owner.
3. The owner approves the exact plan and budget.
4. Research and build run in each employee's own workspace.
5. Real checks inspect the produced files (structure, links, stylesheet,
   accessibility markers, placeholders, required sections).
6. Priya independently reviews the artifact. Passes, revisions and review-round
   limits are all real code paths.
7. A deployment decision waits for the owner. Approving it produces a **blocked**
   external action with an explicit “no deployment provider configured” result —
   nothing is published.

## Architecture at a glance

```text
┌─────────────────────────────┐        ┌──────────────────────────────┐
│ Next.js UI + API (owner)    │        │ Durable worker (separate     │
│ CopilotKit chat + forms     │        │ process, no browser)         │
└──────────────┬──────────────┘        └──────────────┬───────────────┘
               │  company-scoped reads/writes         │ leases, recovery
               ▼                                      ▼
        ┌───────────────────────────────────────────────────┐
        │ SQLite (WAL) — companies, employees, tasks, runs, │
        │ decisions, ledger, knowledge, activity, reports   │
        └──────────────┬───────────────────────┬────────────┘
                       │                       │
             ┌─────────▼────────┐   ┌──────────▼─────────────┐
             │ Employee computer │   │ Agent backend adapter  │
             │ workspace + files │   │ deterministic | llm    │
             │ allowlisted shell │   │ (OpenAI-compatible)    │
             └───────────────────┘   └────────────────────────┘
```

Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Licensing and upstream attribution: [docs/LICENSING.md](docs/LICENSING.md).

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js app on :3000 |
| `npm run worker` | Durable worker loop (leave running) |
| `npm run dev:all` | Both, for development |
| `npm run db:seed` | Create the demo company if missing |
| `npm run db:reset` | Clear company data and reseed |
| `npm run db:migrate` | Apply SQL migrations |
| `npm run demo` | Deterministic end-to-end slice |
| `npm test` | Policy, recovery, isolation and full-slice tests |
| `npm run typecheck` | TypeScript, no emit |
| `npm run build` | Production Next.js build |

## Verified vs. simulated vs. not built

**Verified by automated tests and the demo run**

- Owner brief → goal + knowledge → CEO plan → owner approval gate.
- Task dependencies, acceptance criteria, delegation depth and per-employee
  concurrency limits.
- Real file work in per-employee workspaces; artifacts copied into immutable
  versioned deliverable directories.
- Deterministic checks on produced files (structure, balanced tags, internal
  links, stylesheet, accessibility markers, placeholders, required sections).
- Independent review by a different employee, with bounded revision rounds.
- Completion requires a deliverable with passing checks and a passing review;
  an agent's “done” is not enough.
- Durable workers: leases, heartbeat, interrupted-run recovery without duplicate
  execution, cancellation propagation to delegated work, retry limits.
- Approval bound to a SHA-256 hash of the exact action; changed details
  invalidate the approval (tested, including at execution time).
- Budget reservations, usage ledger, dispatched-work blocking on exhaustion.
- Human takeover lock blocks competing agent actions before the next tool call.
- Company-scoped data access and knowledge permissions (company / department /
  private).
- Owner report compiled from recorded data; deployment decision; explicit
  blocked state when no provider exists.
- Persistence across process restarts (SQLite WAL, migrations).

**Simulated and visibly labelled**

- The default `deterministic` backend: real files and checks, but no model
  reasoning and no model cost. Every run is stored with `mode = 'simulated'`,
  the UI shows “SIMULATED work”, and the ledger records a zero-cost record
  rather than a fake charge.
- CopilotKit chat is only enabled when a model key exists; without it the UI
  says so and every action remains available through forms and buttons.

**Not built (deliberate gaps for this version)**

- Multi-user sign-in. One owner is resolved on the server from configuration;
  all queries are company-scoped, but there is no auth provider yet.
- Real public deployment, email or payments. Adapters return a clear `blocked`
  state; nothing is sent or published.
- Browser sessions require optional Playwright and are off by default.
  Terminal isolation is an allowlisted OS process in a workspace directory, not
  a VM — run the worker in a container for untrusted code.
- Voice, mobile apps, marketplace, rich document Spaces, chart/metrics rollups.
- Verified provider invoices. Tokens are recorded; dollar amounts appear only
  from estimates and recorded usage, never invented.

## Production notes

`npm run build` is verified. A reference instance runs at
**http://192.168.1.112:3000** under systemd (`deploy/*.service`, install notes in
`docs/OPERATIONS.md`). `Dockerfile` and `docker-compose.yml` run the web app and
worker against a shared `.data` volume. Before exposing this beyond a
trusted machine: add real authentication, put the worker in a container, set
`OPENCOMPANY_MONTHLY_BUDGET_CENTS`, and configure a secret store for provider
credentials. See [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Deploying

Production runs from a git checkout, never from copied files. On the host:

```bash
cd /opt/opencompany
npm run deploy          # fetch origin/main, reset, build, restart, health check
```

`scripts/deploy.sh` hard-resets the working tree to `origin/main`, installs dependencies only when `package.json` or `package-lock.json` moved, builds, restarts the web and worker services, then verifies `/api/health`. A failed build stops before the restart, so the previous build keeps serving.

Pushing to the host's bare mirror deploys too: the mirror's `post-receive` hook runs the same script.

```bash
git remote add deploy ssh://root@<host>/srv/opencompany.git   # once
git push deploy main
```

The mirror is `/srv/opencompany.git`. On a host that was deployed by copying files, `deploy/install-git-deploy.sh` adopts the directory as a checkout and seeds the mirror from a `git bundle`, because the host has no GitHub credentials of its own.

## License

Application code is MIT (see [LICENSE](LICENSE)). Upstream projects were
inspected for architecture, not copied. CopilotKit Intelligence is separately
licensed and is not used here. Details: [docs/LICENSING.md](docs/LICENSING.md).

## Live model mode

Set `OPENCOMPANY_AGENT_BACKEND=llm` with `OPENAI_BASE_URL`, `OPENAI_API_KEY` and
`OPENCOMPANY_MODEL` to run the same loop against a real model through any
OpenAI-compatible gateway. The model plans, delegates and writes deliverables; the
owner still approves plans and external actions, budgets are reserved before work,
required checks run against the stored artifact, and a separate employee performs
the independent review. Token usage per run is recorded in `task_runs`.

## The company's public site

`npm run db:seed` also creates a Public Site Developer, a standing brief and a
recurring `Public site: improvement pass` routine, so the company website is always
being worked on. The latest check-passing version is served read-only at `/site`
with no owner session; until one exists the route returns a "being built" page.

## Automated browsers

Playwright is optional: `npm i -D playwright && npx playwright install chromium`,
then set `OPENCOMPANY_BROWSER_ENABLED=1`. Browser sessions run only inside the
employee workspace and are disabled by default.
