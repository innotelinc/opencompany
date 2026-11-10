# Licensing and attribution

## This application

OpenCompany application code is released under the **MIT License** (see
`LICENSE`). It was written for this project. No source files from the inspected
repositories were copied into this repository; their ideas, data-model shapes and
operational contracts informed the design, and the code here is an independent
implementation.

## Direct dependencies

| Package | Version | License | Role |
|---|---|---|---|
| `next` | 15.5.29 | MIT | App router, server components, API routes |
| `react`, `react-dom` | 19.1.1 | MIT | UI |
| `@copilotkit/react-core` | 1.85.0 | MIT | Chat state, frontend actions, readable state |
| `@copilotkit/react-ui` | 1.85.0 | MIT | `CopilotChat` surface |
| `@copilotkit/runtime` | 1.85.0 | MIT | CopilotKit runtime + `OpenAIAdapter` + Next app-router endpoint |
| `better-sqlite3` | 13.0.3 | MIT | SQLite driver |
| `zod` | 3.25.76 | MIT | Validation of agent/plan payloads |

`openai` is installed as a dependency of the CopilotKit runtime and is used
server-side for the OpenAI-compatible adapter. Playwright is **not** installed by
default; if an operator installs it, its own Apache-2.0 license applies.

## Upstream projects inspected

| Project | Revision | License | Used how |
|---|---|---|---|
| CopilotKit/OpenBot | `25fe97c47168` | MIT | Architecture and approval/coworker concepts |
| CopilotKit/OpenDuet | `f52288fff5cc` | MIT | Proactive briefs, routines, approvals framing |
| CopilotKit/openmuse | `a4944f4c471d` | MIT | Durable workers, leases, computer takeover |
| CopilotKit/OpenDots | `d4214aff10f0` | MIT | Per-agent tool/computer permissions, Spaces |
| Anil-matcha/suparagent | `32dd0edbc1f0` | Apache-2.0 | Delegation, engine adapters, task attempts |
| CopilotKit/CopilotKit | npm 1.85.0 | MIT | Chat, AG-UI interaction |

Copies of the upstream repositories were cloned into `.upstream/` for inspection
and are excluded from version control. They are not part of the distributed
application.

## CopilotKit Intelligence — separately licensed

OpenBot, OpenDuet, OpenDots and OpenMuse all depend on **CopilotKit
Intelligence** for durable threads, memory and governance. Intelligence is
**not** MIT and is **not** included or required here:

- This project stores conversations in its own SQLite-backed CopilotKit runtime
  and does not use Intelligence APIs, an Intelligence project key, or the
  `@copilotkit/channels` / Intelligence packages.
- If you later adopt Intelligence, review its self-hosting/production license
  terms at docs.copilotkit.ai. Do not describe a deployment as fully open source
  if Intelligence is added.

## What is and isn't freely redistributable

Freely redistributable as MIT: this repository's application code and its MIT
dependencies (subject to their own notices).

Not covered by this repository's MIT license:

- CopilotKit Intelligence, if you add it.
- Your model provider's API and terms.
- Any deployment, email, payment or connected-app provider you wire in.
- Third-party assets or customer content you load into a deployment.

No claim is made that an assembled production stack including those services is
free to redistribute. Keep this file with any fork.
