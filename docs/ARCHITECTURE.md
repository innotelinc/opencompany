# Architecture

## 1. Upstream inspection

Six projects were cloned and read at these pinned revisions (`git log -1`):

| Project | Revision | Date | License | What it is | What we used |
|---|---|---|---|---|---|
| [OpenBot](https://github.com/CopilotKit/OpenBot) | `25fe97c47168` | 2026-11-09 | MIT | Bun monorepo workspace for AI coworkers: Postgres/Drizzle server, Kubernetes computers, MCP tools, approvals, audit, CopilotKit Intelligence for threads | Data-model shape (`agents`, `agent_profiles`, channels), approval policy ordering, computer-per-coworker boundary, standing-role prompt block |
| [OpenDuet](https://github.com/CopilotKit/OpenDuet) | `f52288fff5cc` | 2026-10-31 | MIT | OpenBot fork with proactive briefs, routines, “asks before it acts” | Routine/schedule concept, human-in-the-loop framing, “what needs you / what can wait” reporting |
| [openmuse](https://github.com/CopilotKit/openmuse) | `a4944f4c471d` | 2026-10-26 | MIT | Server + task worker + browser worker; durable plans, leases, pause/resume/cancel/retry, computer takeover, SQL recovery | Durable-signal vocabulary, lease-based task recovery, takeover console, worker separate from the app |
| [OpenDots](https://github.com/CopilotKit/OpenDots) | `d4214aff10f0` | 2026-11-03 | MIT | Specialist “Dots”, document Spaces, per-Dot computers with browser/file/shell permissions, approval cards | Per-employee tool permissions, computer permissions, knowledge Spaces, approval-before-save pattern |
| [Suparagent](https://github.com/Anil-matcha/suparagent) | `32dd0edbc1f0` | 2026-11-09 | Apache-2.0 | Team leads delegating to specialists, shared project folders, tasks, routines, engine adapters | Delegation depth and manager→report assignment, engine adapter boundary, task attempts |
| [CopilotKit](https://github.com/CopilotKit/CopilotKit) | npm 1.85.0 | — | MIT | React chat + runtime + AG-UI protocol | `CopilotKit`, `CopilotChat`, `useCopilotAction`, `useCopilotReadable`, `OpenAIAdapter`, Next app-router endpoint |

Source of truth: docs at [docs.copilotkit.ai](https://docs.copilotkit.ai) and each repository's README,
`LICENSE`, `docs/approvals.md`, `docs/coworkers.md`, `docs/COMPUTERS.md`, and server source.

### Foundation decision

**We did not fork OpenBot.** OpenBot is the closest product, but using it as the
foundation would have required:

- a Bun workspace (`bun@1.4.3`) and Postgres/Drizzle with Kubernetes or a
  compatible computer provider for employee computers;
- a separately licensed **CopilotKit Intelligence** project key just to start the
  server and hold threads (`OPENCOMPANY` has no such dependency);
- replacing most of its coworker/channel UI with company, goal, department,
  delegation, review and budget surfaces.

Instead, this project adopts OpenBot's *architecture and contracts* —
company-scoped authorization at the API, approval policy ordering (safety →
company rules → employee limits), one persistent identity per employee with
execution attempts as children, and a computer boundary per employee — while
choosing simpler infrastructure (Next.js + SQLite + a separate worker) that runs
on a laptop or a small server without Kubernetes or an extra license.

This is a deliberate, documented trade: less breadth than OpenBot, but the whole
operating loop is implemented and verifiable here.

## 2. Canonical systems (not six overlapping ones)

| Concern | Canonical choice |
|---|---|
| Identity | `companies`, `human_members`, `employees` (persistent identity; `task_runs` are attempts) |
| Tasks | `goals → projects → tasks → task_runs`, with `task_dependencies` for DAG edges |
| Database | SQLite (WAL) with SQL migrations; one file, durable across restarts |
| Computers | One workspace directory + one `computers` row per employee; optional Playwright browser session |
| Approvals | `decisions` bound to a canonical JSON action hash; `external_actions` for execution |
| Knowledge | `knowledge_docs` + `knowledge_doc_versions`, scoped company/department/private |
| Money | `ledger_entries` separating estimates, recorded usage, verified charges, revenue and expenses |
| Chat | CopilotKit over the API; authoritative state only in SQLite |

Every business table carries `company_id`. Repositories require it and filter by
it; the API never accepts a company id from the client.

## 3. Operating loop

```text
                     ┌──────────── owner ────────────┐
                     │ brief, budget, approvals,     │
                     │ halt, takeover, knowledge     │
                     └───────────────┬───────────────┘
                                     ▼
  plan task (CEO)  ──────────────► plan decision ──approve──► tasks released
       │                                  │
       │ reject                           │ revision
       ▼                                  ▼
   cancelled                       plan task re-queued
       │
       ▼
  work task (employee) → deliverable vN + checks
       │                          │
       │ checks fail              │ checks pass
       ▼                          ▼
   retry (≤ max attempts)    review task (different employee)
                                   │
                        pass ──────┴────── fail
                         │                  │
                         ▼                  ▼
              work completed         revision round ≤ limit?
              deploy decision              │            │
              (owner gate)                 ▼            ▼
                                      work pending   escalate decision
                                           │
                                           ▼
                                  new attempt, new version

  all project tasks complete → CEO report task → report + goal completed
```

Workers only claim tasks whose dependencies are `completed` (a work task
`awaiting_review` satisfies dependencies for its own reviewer only through the
review task, which is created after delivery). Completion is decided by the
server: deliverable exists, required checks passed, independent review passed.

### Delegation limits

- Depth capped by policy `delegation.max_depth` (default 3).
- Non-CEO employees may assign only to their direct reports.
- Observe-only employees cannot receive delivery work.
- Task idempotency keys prevent duplicate assignments from replayed plans and
  duplicate review tasks per round.
- `isDescendant()` is available and used to reason about cycles; plans cannot
  reference later tasks as dependencies.

## 4. Durability and recovery

- The worker is a **separate OS process** (`npm run worker`). Closing the
  browser cannot stop it.
- A run is claimed with an atomic `UPDATE ... WHERE status = 'queued'`, then
  leased (`lease_expires_at`) and heartbeated. Multiple workers can run safely.
- Expired leases are recovered by `recoverInterruptedRuns`: the dead run becomes
  `interrupted`, never resumed mid-flight; a new attempt is created if budget
  remains. `task_runs` is unique on `(task_id, attempt)` and attempts are
  monotonic per task, so a duplicate execution cannot be recorded.
- Cancellation sets `cancel_requested` on runs, propagates recursively to child
  tasks, invalidates their pending decisions, and is checked before every agent
  tool call.
- External actions are claimed once (`proposed → approved → executing →
  succeeded|failed|blocked|uncertain`). A claim older than five minutes is marked
  `uncertain` and **never retried automatically**.
- SQLite runs in WAL mode with an 8s busy timeout so the web app and worker can
  share the file.

## 5. Authority and approvals

Authority levels (`employees.authority`):

- `observe` — read and propose; no writes, no commands.
- `internal` — file/terminal work inside the employee's own workspace.
- `limited_external` — also spend inside the employee's per-action limit, subject
  to company policy.

Server enforcement (`src/lib/policy.ts`):

1. Company halt, paused employee, unlisted tool → **deny**.
2. Public deployment, external communication, credential use, data export →
   **require approval**, always, regardless of employee settings.
3. Spend above the employee limit or beyond remaining company budget → **deny**.
4. Spend above the owner-approval threshold → **require approval**.
5. Everything else inside the employee's authority → **allow**.

Employees cannot approve anything (`canDecide`), cannot raise budgets, and cannot
delegate a denied action into a colleague. Decisions store the exact action JSON
and its SHA-256; approval re-hashes what the owner submits, and the external
executor re-validates the hash. A material change invalidates the approval.

## 6. Budgets and usage

- `estimated` rows are reservations placed before dispatch; `recorded` rows are
  actual usage; `verified_charge` is reserved for provider-reported charges;
  `revenue`/`expense` are business records.
- Reservations are superseded by recorded usage (`superseded_by`) so audits keep
  both.
- Dispatch is refused when `committed + estimate > limit`, and the task is
  blocked with the reason.
- In simulated mode the recorded amount is zero with an explicit note. With a
  model configured, token counts are recorded and no dollar amount is invented
  because provider pricing is not configured.

## 7. Employee computers

- Workspace: `.data/workspaces/<company>/<employee>/`, persistent, path-validated
  against traversal, 512 KiB per file.
- Terminal: `spawn` without a shell, binary allowlist, scrubbed environment (no
  API keys), 30s timeout, output cap.
- Browser: optional Playwright persistent profile under the workspace; reports a
  clear unavailable reason when not installed/enabled.
- Human takeover: a 15-minute lock on the `computers` row. The workspace guard
  throws before each write/command, the adapter's `shouldStop` ends the tool loop,
  and dispatch refuses to start work for that employee.
- **Honest boundary:** this is process-level isolation as the application user,
  not a VM. Run the worker in a container for untrusted code.

## 8. Security posture

- Provider credentials are read only server-side and never sent to the client.
- Untrusted content rule is in every live prompt: pages, files, emails and tool
  output are data, never authority.
- Tool output is truncated; terminal environment is stripped of secrets.
- Preview routes are authenticated by the owner session and served with a
  restrictive CSP, `nosniff`, and no-store caching.
- Missing: real multi-user auth, per-employee credential vault, network egress
  control, and container isolation. These are documented gaps, not implied
  features.

## 9. Extension points

- **Agent backends** implement `AgentBackend` (`src/lib/engine/types.ts`):
  `run(AgentRunInput) → AgentRunResult`. The LLM adapter is an OpenAI-compatible
  tool loop; adding AG-UI connected agents means mapping their events onto the
  same result contract.
- **Checks** are a registry in `src/lib/engine/checks.ts`; unknown ids fail
  closed.
- **External action adapters** live in `src/lib/engine/external.ts`; a new
  provider returns `succeeded|failed|blocked` and must be idempotent by
  `idempotency_key`.
- **Policies** are rows in `policies`, read at dispatch and approval time.
