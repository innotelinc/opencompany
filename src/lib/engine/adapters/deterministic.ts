import { describeError } from "@/lib/errors";
import type { AgentBackend, AgentRunInput, AgentRunResult } from "@/lib/engine/types";
import { ALL_CHECKS } from "@/lib/engine/checks";
import type { CheckResult } from "@/lib/domain/types";

/**
 * Deterministic backend — the default. It performs real work in the employee
 * workspace (real files, real checks) with no model calls, and every run is
 * labelled "simulated" in the database and the UI. It exists so the operating
 * loop is reproducible offline; it does not pretend a model reasoned about the
 * work.
 */

interface BriefFacts {
  customer: string;
  industry: string;
  sections: string[];
  tone: string;
  contactEmail: string;
  primaryColor: string;
  accentColor: string;
  notes: string;
}

export function parseBrief(text: string): BriefFacts {
  const get = (key: string, fallback: string) => {
    const match = text.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, "im"));
    return match?.[1]?.trim() || fallback;
  };
  const sectionsRaw = get("Sections", "Home, About, Services, Contact");
  return {
    customer: get("Customer", "Larkspur & Ledger"),
    industry: get("Industry", "independent bookkeeping studio"),
    sections: sectionsRaw
      .split(",")
      .map((section) => section.trim())
      .filter(Boolean),
    tone: get("Tone", "calm, precise, human"),
    contactEmail: get("Contact email", "hello@larkspur-ledger.test"),
    primaryColor: get("Primary color", "#1f3d34"),
    accentColor: get("Accent color", "#d8a24a"),
    notes: get("Notes", "Small business owners who want clear numbers and no surprises."),
  };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(input: {
  facts: BriefFacts;
  title: string;
  description: string;
  active: string;
  body: string;
}): string {
  const { facts } = input;
  const nav = [
    ["index.html", "Home"],
    ["about.html", "About"],
    ["index.html#services", "Services"],
    ["contact.html", "Contact"],
  ]
    .map(
      ([href, label]) =>
        `<a href="${href}"${label.toLowerCase() === input.active ? ' aria-current="page"' : ""}>${label}</a>`,
    )
    .join("\n          ");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(input.title)}</title>
  <meta name="description" content="${esc(input.description)}">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <header class="site-header">
    <a class="brand" href="index.html">${esc(facts.customer)}</a>
    <nav aria-label="Main navigation">
      ${nav}
    </nav>
  </header>
  <main id="main">
${input.body}
  </main>
  <footer class="site-footer">
    <p>${esc(facts.customer)} · ${esc(facts.industry)}</p>
    <p><a href="mailto:${esc(facts.contactEmail)}">${esc(facts.contactEmail)}</a></p>
  </footer>
</body>
</html>
`;
}

function stylesheet(facts: BriefFacts): string {
  return `:root {
  --ink: #16201c;
  --muted: #57645e;
  --paper: #f7f4ee;
  --primary: ${facts.primaryColor};
  --accent: ${facts.accentColor};
  --line: #d9d3c6;
  --radius: 14px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  color: var(--ink);
  background: var(--paper);
  line-height: 1.65;
}

.skip {
  position: absolute;
  left: -9999px;
}

.skip:focus {
  left: 1rem;
  top: 1rem;
  background: var(--primary);
  color: #fff;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  z-index: 10;
}

.site-header {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 2rem;
  align-items: baseline;
  justify-content: space-between;
  padding: 1.5rem clamp(1rem, 5vw, 4rem);
  border-bottom: 1px solid var(--line);
}

.brand {
  font-size: 1.35rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--primary);
  text-decoration: none;
  font-weight: 700;
}

nav { display: flex; gap: 1.25rem; flex-wrap: wrap; }

nav a {
  color: var(--muted);
  text-decoration: none;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.92rem;
  letter-spacing: 0.02em;
}

nav a:hover, nav a[aria-current="page"] { color: var(--primary); }

main { max-width: 68rem; margin: 0 auto; padding: clamp(2rem, 6vw, 5rem) clamp(1rem, 5vw, 4rem); }

.hero { display: grid; gap: 2rem; grid-template-columns: 1.4fr 1fr; align-items: end; }
.hero h1 { font-size: clamp(2.4rem, 6vw, 4rem); line-height: 1.05; margin: 0 0 1rem; color: var(--primary); }
.hero p { font-size: 1.15rem; color: var(--muted); max-width: 38ch; margin: 0; }
.hero .card { background: #fff; border: 1px solid var(--line); border-radius: var(--radius); padding: 1.5rem; }

.eyebrow {
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.78rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
  margin: 0 0 0.75rem;
}

section { margin-top: clamp(2.5rem, 6vw, 4.5rem); }

h2 { font-size: clamp(1.5rem, 3vw, 2.1rem); color: var(--primary); margin: 0 0 1rem; }
h3 { font-size: 1.1rem; margin: 0 0 0.5rem; }

.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); }

.card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 1.35rem;
}

.card p { margin: 0; color: var(--muted); }

.button {
  display: inline-block;
  margin-top: 1.25rem;
  padding: 0.8rem 1.4rem;
  border-radius: 999px;
  background: var(--primary);
  color: #fff;
  text-decoration: none;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.95rem;
}

.button.secondary { background: transparent; color: var(--primary); border: 1px solid var(--primary); }

.contact-form { display: grid; gap: 0.9rem; max-width: 32rem; }
.contact-form label { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 0.9rem; color: var(--primary); }
.contact-form input, .contact-form textarea {
  width: 100%;
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  font: inherit;
  background: #fff;
}
.contact-form button {
  justify-self: start;
  padding: 0.75rem 1.5rem;
  border: 0;
  border-radius: 999px;
  background: var(--primary);
  color: #fff;
  font: inherit;
  cursor: pointer;
}

.site-footer {
  border-top: 1px solid var(--line);
  padding: 2rem clamp(1rem, 5vw, 4rem);
  color: var(--muted);
  font-size: 0.9rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 2rem;
  justify-content: space-between;
}

.site-footer a { color: var(--primary); }

@media (max-width: 720px) {
  .hero { grid-template-columns: 1fr; }
}
`;
}

function siteFiles(facts: BriefFacts): Record<string, string> {
  const services = [
    ["Monthly bookkeeping", "Clean books, reconciled accounts and a plain-language summary you can actually read."],
    ["Payroll support", "Payroll runs, filings and questions handled before they become deadlines."],
    ["Cash-flow advisory", "A short monthly session on what the numbers mean and what to do next."],
  ];

  const home = shell({
    facts,
    active: "home",
    title: `${facts.customer} — clear books for ${facts.industry}s`,
    description: `Calm, precise bookkeeping for ${facts.industry}s. Monthly close, payroll support and straightforward cash-flow advice.`,
    body: `    <section class="hero">
      <div>
        <p class="eyebrow">Bookkeeping studio</p>
        <h1>Clear numbers. No surprises.</h1>
        <p>${esc(facts.customer)} keeps the books for ${esc(facts.industry)}s who would rather spend their evening on anything else.</p>
        <a class="button" href="contact.html">Book a intro call</a>
      </div>
      <div class="card">
        <h2>What a month looks like</h2>
        <p>Reconciled accounts by the 5th, a one-page summary by the 7th, and a short call if anything needs a decision.</p>
      </div>
    </section>

    <section id="services">
      <p class="eyebrow">Services</p>
      <h2>Three things, done properly</h2>
      <div class="grid">
${services
  .map(
    ([title, copy]) => `        <article class="card">
          <h3>${esc(title)}</h3>
          <p>${esc(copy)}</p>
        </article>`,
  )
  .join("\n")}
      </div>
    </section>

    <section>
      <h2>Who we work with</h2>
      <p>${esc(facts.notes)}</p>
      <p>Engagements start with a 30-minute review of your current books. If we are not the right fit, we will say so and point you somewhere better.</p>
    </section>`,
  });

  const about = shell({
    facts,
    active: "about",
    title: `About ${facts.customer}`,
    description: `How ${facts.customer} works: plain language, fixed scope and books you can trust.`,
    body: `    <section>
      <p class="eyebrow">About</p>
      <h1>A small studio with a long memory</h1>
      <p>${esc(facts.customer)} has looked after the books for ${esc(facts.industry)}s since 2016. We keep a small client list on purpose: the same person closes your books every month.</p>
    </section>
    <section>
      <h2>How we work</h2>
      <div class="grid">
        <article class="card"><h3>Plain language</h3><p>Statements arrive with a short paragraph explaining what changed and why it matters.</p></article>
        <article class="card"><h3>Fixed scope</h3><p>Agreed monthly fee. Extra work is quoted before it starts.</p></article>
        <article class="card"><h3>Careful hands</h3><p>Every close is reviewed by a second set of eyes before it reaches you.</p></article>
      </div>
    </section>
    <section>
      <h2>Where to start</h2>
      <p>Send over last quarter's statements and we will tell you what we would fix first — no charge, no pitch.</p>
      <a class="button secondary" href="contact.html">Start a conversation</a>
    </section>`,
  });

  const contact = shell({
    facts,
    active: "contact",
    title: `Contact ${facts.customer}`,
    description: `Tell ${facts.customer} about your books and what you need help with.`,
    body: `    <section>
      <p class="eyebrow">Contact</p>
      <h1>Tell us what your books look like</h1>
      <p>We answer within one business day. Nothing is automated: a person reads this.</p>
      <form class="contact-form" action="mailto:${esc(facts.contactEmail)}" method="post" enctype="text/plain">
        <label for="name">Your name</label>
        <input id="name" name="name" type="text" autocomplete="name" required>
        <label for="business">Business</label>
        <input id="business" name="business" type="text" autocomplete="organization">
        <label for="message">What needs attention?</label>
        <textarea id="message" name="message" rows="5" required></textarea>
        <button type="submit">Send</button>
      </form>
      <p>Or email <a href="mailto:${esc(facts.contactEmail)}">${esc(facts.contactEmail)}</a>.</p>
    </section>`,
  });

  const readme = `# ${facts.customer} — website deliverable

Built by the OpenCompany demo team from the customer requirements document.

## Files

- \`index.html\` — landing page with services and positioning
- \`about.html\` — studio story and working style
- \`contact.html\` — enquiry form (opens the visitor's mail client; no backend)
- \`styles.css\` — single stylesheet, responsive, no external assets

## Known limits

- No analytics, CMS or form backend; the form uses \`mailto:\`.
- Copy is written from the supplied brief, not from a live brand interview.

## Preview

Open \`index.html\` locally, or use the Preview panel in OpenCompany.
`;

  return {
    "index.html": home,
    "about.html": about,
    "contact.html": contact,
    "styles.css": stylesheet(facts),
    "README.md": readme,
  };
}

/**
 * Generic marketing site for the company itself. Copy is intentionally factual:
 * it describes the operating model and makes no customer, pricing or security
 * claims that the company cannot support.
 */
function publicSiteFiles(brief: BriefFacts): Record<string, string> {
  // The public site is the company's own face, not a customer project. Keep the
  // brief's palette and address, but brand every page as OpenCompany.
  const facts: BriefFacts = { ...brief, customer: "OpenCompany" };
  const home = shell({
    facts,
    active: "home",
    title: `${facts.customer} — AI employees, owner authority`,
    description: `An AI company operating system: AI employees plan, build, check and review work while the owner holds budget, approvals and the stop button.`,
    body: `    <section class="hero">
      <div>
        <p class="eyebrow">AI company operating system</p>
        <h1>AI employees do the work. You keep the authority.</h1>
        <p>${esc(facts.customer)} runs goals end to end — plan, build, automated checks and an independent review — and stops at your desk for anything external.</p>
        <a class="button" href="about.html">How it works</a>
      </div>
      <div class="card">
        <h2>What you approve</h2>
        <p>Plans, budgets and every external action. Publishing, email and spend above your threshold wait for an explicit owner decision bound to the exact action.</p>
      </div>
    </section>

    <section>
      <p class="eyebrow">The loop</p>
      <h2>One operating loop, no hidden steps</h2>
      <div class="grid">
        <article class="card"><h3>1. Direction</h3><p>You state the goal and the budget. Requirements are stored as company knowledge before any work starts.</p></article>
        <article class="card"><h3>2. Plan</h3><p>The CEO proposes a small project with owners, acceptance criteria and checks. Nothing runs until you approve it.</p></article>
        <article class="card"><h3>3. Work</h3><p>Employees build in isolated workspaces. Automated checks run on the produced files, not on a claim of success.</p></article>
        <article class="card"><h3>4. Review</h3><p>A different employee reviews the artifact. Failures come back as bounded revisions; passing work reaches your report.</p></article>
      </div>
    </section>`,
  });

  const about = shell({
    facts,
    active: "about",
    title: `How ${facts.customer} works`,
    description: `The architecture and guarantees behind ${facts.customer}: durable workers, server-enforced authority and reviewed deliverables.`,
    body: `    <section>
      <p class="eyebrow">How it works</p>
      <h1>Durable by default</h1>
      <p>Work runs in a separate durable worker with leases, cancellation and recovery. Restarting the app does not lose the queue, and an interrupted run is retried exactly once rather than resumed mid-flight.</p>
    </section>
    <section>
      <h2>Rules the software enforces</h2>
      <div class="grid">
        <article class="card"><h3>Authority</h3><p>Every action is checked server-side against company policy, the employee's authority and remaining budget.</p></article>
        <article class="card"><h3>Approvals</h3><p>An approval is bound to a SHA-256 of the proposed action. If the details change, the approval no longer applies.</p></article>
        <article class="card"><h3>Evidence</h3><p>A task is complete only with a stored deliverable, passing checks and an independent review.</p></article>
        <article class="card"><h3>Stop</h3><p>An emergency stop halts new work immediately. The owner can also take over an employee's computer.</p></article>
      </div>
    </section>

    <section>
      <p class="eyebrow">Principles</p>
      <h2>What we refuse to do</h2>
      <p>No invented customers, invoices or metrics. No silent external actions. No “done” without an artifact and a review. Provider charges appear only when a provider reports them.</p>
      <a class="button secondary" href="contact.html">Talk to the owner</a>
    </section>`,
  });

  const contact = shell({
    facts,
    active: "contact",
    title: `Contact ${facts.customer}`,
    description: `Questions about ${facts.customer}, the operating model or a deployment.`,
    body: `    <section>
      <p class="eyebrow">Contact</p>
      <h1>Questions about the company</h1>
      <p>This site is maintained by ${esc("the public site developer")} and reviewed by the owner. It runs on static files with no trackers.</p>
      <form class="contact-form" action="mailto:${esc(facts.contactEmail)}" method="post" enctype="text/plain">
        <label for="name">Your name</label>
        <input id="name" name="name" type="text" autocomplete="name" required>
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email" required>
        <label for="message">What would you like to know?</label>
        <textarea id="message" name="message" rows="5" required></textarea>
        <button type="submit">Send</button>
      </form>
      <p>Or email <a href="mailto:${esc(facts.contactEmail)}">${esc(facts.contactEmail)}</a>. The form opens your mail client; there is no server-side inbox.</p>
    </section>`,
  });

  const readme = `# ${facts.customer} public site

Maintained by the public site developer from the \`${"Public site brief"}\` knowledge document.
Served by the application at \`/site\`; not deployed externally.

## Files

- \`index.html\` — positioning and the operating loop
- \`about.html\` — architecture, guarantees and principles
- \`contact.html\` — enquiry form (mail client, no backend)
- \`styles.css\` — one stylesheet, responsive, no external assets
`;

  return {
    "index.html": home,
    "about.html": about,
    "contact.html": contact,
    "styles.css": stylesheet(facts),
    "README.md": readme,
  };
}

export class DeterministicBackend implements AgentBackend {
  readonly id = "deterministic";

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const facts = parseBrief(`${input.brief}\n${input.knowledge.map((doc) => doc.body).join("\n")}`);

    if (input.task.kind === "plan") {
      return {
        summary: `Prepared a ${facts.customer} website plan: research, build, independent review, then a deployment decision for the owner.`,
        plan: {
          projectName: `Website for ${facts.customer}`,
          projectDescription: `A three-page marketing site for ${facts.industry}, built from the owner's brief and reviewed before anything leaves the building.`,
          summary: `Research the brief, build the site, have a second employee review it against the acceptance criteria, and bring the deployment decision to the owner.`,
          budgetCents: 40,
          tasks: [
            {
              title: "Research the customer brief and define the site outline",
              description:
                "Turn the owner's brief and the customer requirements document into a short research brief: audience, tone, required sections, constraints.",
              acceptanceCriteria: [
                "Names the customer and the industry",
                "Lists the required sections and the tone",
                "Calls out that the form has no backend",
              ],
              requiredChecks: [],
              assigneeName: "Rhea Okafor",
              estimateCents: 4,
            },
            {
              title: "Build the customer website",
              description:
                "Create index.html, about.html, contact.html and a stylesheet in the employee workspace. Every page must link only to delivered files.",
              acceptanceCriteria: [
                "Landing page names the customer and has one h1",
                "Pages for about, services and contact exist",
                "Stylesheet is linked and responsive",
                "No placeholder copy",
              ],
              requiredChecks: [
                "balanced_tags",
                "stylesheet_present",
                "accessibility_basics",
                "no_placeholder_text",
                "customer_requirements_covered",
              ],
              assigneeName: "Milo Vance",
              estimateCents: 18,
              dependsOn: [0],
            },
          ],
        },
        simulated: true,
      };
    }

    if (input.task.kind === "review") {
      const upstream = input.upstream;
      if (!upstream) {
        return { summary: "No deliverable version to review.", review: { verdict: "fail", findings: ["Nothing was delivered."] }, simulated: true };
      }
      const files = new Map<string, string>();
      const { readArtifactFiles } = await import("@/lib/engine/artifacts");
      for (const [name, body] of readArtifactFiles(upstream.artifactPath)) files.set(name, body);
      const failures = upstream.checks.filter((check) => !check.passed);
      const findings: string[] = [];
      if (failures.length) {
        findings.push(`Automated checks failed: ${failures.map((check) => check.id).join(", ")}`);
      }
      const isWebsite = upstream.entryFile.endsWith(".html") || files.has("index.html");
      if (isWebsite) {
        const html = decodeEntities(files.get("index.html") ?? "");
        if (!html.toLowerCase().includes(facts.customer.toLowerCase())) {
          findings.push(`The landing page does not name the customer (${facts.customer}).`);
        }
        if (!/<form[\s>]/i.test(files.get("contact.html") ?? "")) {
          findings.push("The contact page has no enquiry form.");
        }
        if (!files.has("about.html")) findings.push("The about page is missing.");
        if (files.size < 4) findings.push("The deliverable has fewer than four files.");
      } else {
        const body = files.get(upstream.entryFile) ?? [...files.values()].join("\n");
        if (body.trim().length < 200) findings.push("The written deliverable has too little content to review.");
        if (!body.toLowerCase().includes(facts.customer.toLowerCase())) {
          findings.push(`The written deliverable does not name the customer (${facts.customer}).`);
        }
        for (const section of facts.sections) {
          if (!body.toLowerCase().includes(section.toLowerCase())) {
            findings.push(`The written deliverable does not address the "${section}" requirement.`);
          }
        }
      }

      return {
        summary: findings.length
          ? `Independent review found ${findings.length} issue(s).`
          : `Independent review passed: ${files.size} files, all checks green, customer content present.`,
        review: { verdict: findings.length ? "fail" : "pass", findings },
        simulated: true,
      };
    }

    // Generic work task (including routines).
    if (input.task.kind === "work" && /routine|review|brief/i.test(input.task.title) && input.siblings.length > 0) {
      const body = `# ${input.task.title}\n\nPrepared by ${input.employee.name} (${input.employee.title}).\n\n## Context\n\n${input.task.description}\n\n## Findings\n\n- ${facts.customer} operates as a ${facts.industry}.\n- Required sections: ${facts.sections.join(", ")}.\n- Tone: ${facts.tone}.\n- Constraint: ${facts.notes}\n`;
      input.workspace.writeFile("work-report.md", body);
      return {
        summary: `Produced a written work report for "${input.task.title}".`,
        deliverable: {
          name: input.task.title,
          kind: "document",
          entryFile: "work-report.md",
          notes: "Deterministic work report.",
          files: { "work-report.md": body },
        },
        simulated: true,
      };
    }

    // The company's own public face. A dedicated generator so the site describes
    // the company rather than reusing customer-service copy.
    if (input.task.kind === "work" && /public site/i.test(input.task.title)) {
      const files = publicSiteFiles(facts);
      for (const [name, body] of Object.entries(files)) input.workspace.writeFile(name, body);
      return {
        summary: `Updated the company public site (${Object.keys(files).length} files) and ran ${ALL_CHECKS.length} available checks.`,
        deliverable: {
          name: "OpenCompany public site",
          kind: "website",
          entryFile: "index.html",
          notes: "Static public site generated from the public site brief. Served at /site after checks pass; nothing is published externally.",
          files,
        },
        requiredChecks: [
          "balanced_tags",
          "stylesheet_present",
          "accessibility_basics",
          "no_placeholder_text",
          "customer_requirements_covered",
        ],
        simulated: true,
      };
    }

    if (input.task.kind === "work") {
      const isWebsite = /website|site/i.test(input.task.title) || /website|site/i.test(input.task.description);
      if (isWebsite) {
        const files = siteFiles(facts);
        for (const [name, body] of Object.entries(files)) input.workspace.writeFile(name, body);
        return {
          summary: `Built ${Object.keys(files).length} website files for ${facts.customer} and ran ${ALL_CHECKS.length} available checks.`,
          deliverable: {
            name: `Website for ${facts.customer}`,
            kind: "website",
            entryFile: "index.html",
            notes: "Three pages plus a stylesheet. Contact form posts through the visitor's mail client; no backend is included.",
            files,
          },
          requiredChecks: [
            "balanced_tags",
            "stylesheet_present",
            "accessibility_basics",
            "no_placeholder_text",
            "customer_requirements_covered",
          ],
          simulated: true,
        };
      }

      const body = `# ${input.task.title}\n\nPrepared by ${input.employee.name} (${input.employee.title}).\n\n## Context\n\n${input.task.description}\n\n## Findings\n\n- ${facts.customer} operates as a ${facts.industry}.\n- Required sections: ${facts.sections.join(", ")}.\n- Tone: ${facts.tone}.\n- Constraint: ${facts.notes}\n`;
      input.workspace.writeFile("work-report.md", body);
      return {
        summary: `Produced a written work report for "${input.task.title}".`,
        deliverable: {
          name: input.task.title,
          kind: "document",
          entryFile: "work-report.md",
          notes: "Deterministic work report.",
          files: { "work-report.md": body },
        },
        simulated: true,
      };
    }

    return { summary: "Deterministic backend has no handler for this task kind.", simulated: true };
  }
}

export function summarizeRunFailure(error: unknown): string {
  return describeError(error);
}

/** Exposed for tests: the deterministic site generator is deterministic. */
export function generateDemoSite(requirements: string): Record<string, string> {
  return siteFiles(parseBrief(requirements));
}

export type { CheckResult };
