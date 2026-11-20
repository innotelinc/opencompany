import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { publicStylesheet } from "@/lib/public-site/styles";

/**
 * The company's public site: React components rendered to static files.
 *
 * Still deliberately static — no client bundle, no hydration, no external assets
 * — so the site stays fast, works while the application behind it is busy, and
 * can be served under a policy that allows nothing inline.
 *
 * This pass moves the design from a dark product page to a light editorial
 * dossier: a numbered index down the side, serif headlines, hairline rules and
 * prose that reads like documentation. The claims are the same ones the software
 * enforces; the voice is calmer and the hierarchy is built for reading, not for
 * scrolling past.
 */
export interface PublicSiteFacts {
  customer: string;
  industry: string;
  contactEmail: string;
  primaryColor: string;
  accentColor: string;
  tone?: string;
  notes?: string;
}

const NAV: [href: string, label: string, key: string][] = [
  ["index.html", "Overview", "home"],
  ["about.html", "About", "about"],
  ["contact.html", "Contact", "contact"],
];

function Layout({
  facts,
  title,
  description,
  active,
  children,
}: {
  facts: PublicSiteFacts;
  title: string;
  description: string;
  active: string;
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="stylesheet" href="styles.css" />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="masthead">
          <a className="wordmark" href="index.html">
            <span className="wordmark-rule" aria-hidden="true" />
            <span className="wordmark-text">{facts.customer}</span>
          </a>
          <p className="masthead-note mono">{facts.industry}</p>
          <nav aria-label="Main navigation">
            {NAV.map(([href, label, key]) => (
              <a key={key} href={href} aria-current={key === active ? "page" : undefined}>
                {label}
              </a>
            ))}
          </nav>
        </header>

        <main id="main">{children}</main>

        <footer className="colophon">
          <p className="mono tiny">
            {facts.customer} — {facts.industry}
          </p>
          <p className="mono tiny">
            <a href={`mailto:${facts.contactEmail}`}>{facts.contactEmail}</a>
          </p>
        </footer>
      </body>
    </html>
  );
}

function Home({ facts }: { facts: PublicSiteFacts }) {
  return (
    <Layout
      facts={facts}
      active="home"
      title={`${facts.customer} — AI staff with the owner's signature on it`}
      description="An operating model for AI employees: named roles, enforceable authority, work checked against the artifact, and a public site that is watched rather than assumed."
    >
      <section className="opening">
        <p className="kicker mono">
          <span className="kicker-mark" aria-hidden="true" />
          AI company operating system
        </p>
        <h1>
          AI staff, with your signature still on it.
        </h1>
        <p className="lede">
          {facts.customer} gives each AI employee a role, a machine and a durable queue. Work moves through planning,
          execution, automated checks and an independent review — then stops at your desk for anything that leaves the
          building.
        </p>
        <div className="actions">
          <a className="button" href="about.html">
            How it is built
          </a>
          <a className="button quiet" href="contact.html">
            Ask the owner a question
          </a>
        </div>
        <dl className="ledger">
          <div>
            <dt className="mono">worker</dt>
            <dd>leased, never duplicated</dd>
          </div>
          <div>
            <dt className="mono">authority</dt>
            <dd>decided server-side</dd>
          </div>
          <div>
            <dt className="mono">completion</dt>
            <dd>artifact plus review</dd>
          </div>
          <div>
            <dt className="mono">external</dt>
            <dd>owner decision</dd>
          </div>
        </dl>
      </section>

      <section className="chapter" id="services">
        <header className="chapter-head">
          <span className="chapter-no mono">01 — Services</span>
          <h2>What we actually run</h2>
          <p className="chapter-note">
            Three engagements, all of them the same engine pointed at a different kind of work.
          </p>
        </header>
        <div className="entries">
          <article className="entry">
            <p className="entry-tag mono">delivery</p>
            <h3>A working team for a defined job</h3>
            <p>
              The owner states the outcome. The CEO turns it into a project with owners, acceptance criteria and the
              checks that will judge the output. Nothing starts until the plan is approved.
            </p>
          </article>
          <article className="entry">
            <p className="entry-tag mono">governance</p>
            <h3>Authority that exists outside the prompt</h3>
            <p>
              Roles, tools, spending limits and standing approvals are evaluated by the server before every dispatch and
              every tool call. An employee cannot talk its way past them, and a widened boundary is written to the log.
            </p>
          </article>
          <article className="entry">
            <p className="entry-tag mono">presence</p>
            <h3>A public surface nobody has to remember</h3>
            <p>
              A named employee owns this website: one reviewable improvement per pass, availability probed on a schedule,
              and the last passing version left online when an attempt fails.
            </p>
          </article>
        </div>
      </section>

      <section className="chapter" id="method">
        <header className="chapter-head">
          <span className="chapter-no mono">02 — Method</span>
          <h2>Four stages, no quiet handoffs</h2>
          <p className="chapter-note">Each stage leaves a record, and the record is what the next stage reads.</p>
        </header>
        <ol className="process">
          <li>
            <span className="process-no mono">01</span>
            <div>
              <h3>Direction</h3>
              <p>The goal and its constraints are stored as company knowledge before a single task exists.</p>
            </div>
          </li>
          <li>
            <span className="process-no mono">02</span>
            <div>
              <h3>Plan</h3>
              <p>Owners, criteria, budgets and checks are proposed as one plan, and it waits for a signature.</p>
            </div>
          </li>
          <li>
            <span className="process-no mono">03</span>
            <div>
              <h3>Execution</h3>
              <p>Employees work in their own machines on a leased queue. The checks inspect the produced files.</p>
            </div>
          </li>
          <li>
            <span className="process-no mono">04</span>
            <div>
              <h3>Review</h3>
              <p>Someone who did not build it reviews the artifact. Failures return as bounded revisions; passes reach you.</p>
            </div>
          </li>
        </ol>
      </section>

      <section className="chapter" id="guarantees">
        <header className="chapter-head">
          <span className="chapter-no mono">03 — Guarantees</span>
          <h2>What the software refuses to do</h2>
        </header>
        <div className="split">
          <ul className="rules">
            <li>No &ldquo;done&rdquo; without a stored artifact and a passing independent review.</li>
            <li>No external message, payment or deployment without a decision bound to that exact content.</li>
            <li>No invented invoices — provider charges appear only when a provider reports one.</li>
            <li>No silent widening of authority; every boundary change lands in the audit trail.</li>
          </ul>
          <aside className="note">
            <p className="mono tiny">recorded, not asserted</p>
            <p>
              Every run keeps its lease, its inputs, its checks and its reviewer. If a claim cannot be traced to one of
              those, it is not treated as true here either.
            </p>
            <p className="mono tiny">
              <a href="about.html">Read the architecture</a>
            </p>
          </aside>
        </div>
      </section>

      <section className="chapter" id="about">
        <header className="chapter-head">
          <span className="chapter-no mono">04 — About</span>
          <h2>Small surface, stated limits</h2>
        </header>
        <p className="lede">
          {facts.customer} is built by Innotel Labs as a single-owner company: one human, a roster of AI employees, and a
          policy layer in front of every action. Sign-in, real payments and public deployment providers are named gaps
          that return a blocked state rather than a simulated success.
        </p>
        <p className="lede">
          The whole site is static files rendered from React components, served by the same application the employees
          work in. No trackers, no third-party scripts, no cookies.
        </p>
        <div className="actions">
          <a className="button quiet" href="about.html">
            The runtime in detail
          </a>
        </div>
      </section>

      <section className="closing">
        <h2>Bring a job that has to be right.</h2>
        <p className="lede">
          Describe the outcome and the boundaries. You will get a plan with the checks attached before any work begins.
        </p>
        <a className="button" href="contact.html">
          Start with a question
        </a>
      </section>
    </Layout>
  );
}

function About({ facts }: { facts: PublicSiteFacts }) {
  return (
    <Layout
      facts={facts}
      active="about"
      title={`Architecture — ${facts.customer}`}
      description="How the system runs work: leased workers, hash-bound approvals, company-scoped data, checked deliverables and the limits it states out loud."
    >
      <section className="opening compact">
        <p className="kicker mono">
          <span className="kicker-mark" aria-hidden="true" />
          About the architecture
        </p>
        <h1>Boring where it has to be.</h1>
        <p className="lede">
          SQLite in WAL mode, a separate worker process, and a policy layer every dispatch and tool call passes through.
          The interesting part is what survives a restart.
        </p>
      </section>

      <section className="chapter">
        <header className="chapter-head">
          <span className="chapter-no mono">01 — Runtime</span>
          <h2>Four decisions that carry the system</h2>
        </header>
        <div className="entries">
          <article className="entry">
            <p className="entry-tag mono">durability</p>
            <h3>Leases, not hope</h3>
            <p>
              A run is claimed with a lease and renewed by a heartbeat. An interrupted run is recovered exactly once
              instead of being resumed mid-flight or replayed twice.
            </p>
          </article>
          <article className="entry">
            <p className="entry-tag mono">authority</p>
            <h3>Decided on the server</h3>
            <p>
              Company policy, the employee&apos;s authority, its allowed tools and your standing approvals are read before
              the action, not after it.
            </p>
          </article>
          <article className="entry">
            <p className="entry-tag mono">approvals</p>
            <h3>Bound to contents</h3>
            <p>
              An approval carries a SHA-256 of the proposed action. Change the target or the payload and the approval no
              longer covers it.
            </p>
          </article>
          <article className="entry">
            <p className="entry-tag mono">machines</p>
            <h3>A computer per employee</h3>
            <p>
              Each employee gets a persistent workspace and a command runner, guarded by default. Wider access is an
              owner grant recorded with a reason.
            </p>
          </article>
        </div>
      </section>

      <section className="chapter">
        <header className="chapter-head">
          <span className="chapter-no mono">02 — Spending</span>
          <h2>History, not a leash</h2>
        </header>
        <div className="split">
          <p className="lede">
            The budget is a yearly figure you set or remove. It is measured monthly and adjusted quarterly on
            performance, and it never throttles work: there is no per-call ceiling, usage is recorded as it happens and
            reported as analytics, and any task or goal that is set gets completed. Real money — paying an outside party
            — is still your decision at any amount.
          </p>
          <aside className="note">
            <p className="mono tiny">what is recorded</p>
            <ul className="rules">
              <li>Estimates reserved before dispatch</li>
              <li>Token usage for every run</li>
              <li>Provider-reported charges, when a provider reports them</li>
              <li>Nothing invented to make a chart look full</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="chapter">
        <header className="chapter-head">
          <span className="chapter-no mono">03 — Limits</span>
          <h2>What is not built yet</h2>
        </header>
        <ul className="rules">
          <li>One owner, one company; multi-tenant onboarding is not implemented.</li>
          <li>Sign-in exists for the owner only; there is no team invitation flow.</li>
          <li>A deployment provider is configured per installation, and an unconfigured one reports blocked.</li>
          <li>Nothing in this site claims a customer, a certification or a price that does not exist.</li>
        </ul>
        <div className="actions">
          <a className="button quiet" href="contact.html">
            Ask a direct question
          </a>
        </div>
      </section>
    </Layout>
  );
}

function Contact({ facts }: { facts: PublicSiteFacts }) {
  return (
    <Layout
      facts={facts}
      active="contact"
      title={`Contact — ${facts.customer}`}
      description={`Questions about ${facts.customer}: the operating model, the architecture, or running a job with AI staff.`}
    >
      <section className="opening compact">
        <p className="kicker mono">
          <span className="kicker-mark" aria-hidden="true" />
          Contact
        </p>
        <h1>Straight to the owner.</h1>
        <p className="lede">
          No trackers, no marketing automation, no inbox to disappear into. The form opens your own mail client; this
          site has no backend and stores nothing.
        </p>
      </section>

      <section className="chapter">
        <div className="split">
          <form className="contact-form" action={`mailto:${facts.contactEmail}`} method="post" encType="text/plain">
            <div className="field">
              <label htmlFor="name">Your name</label>
              <input id="name" name="name" type="text" autoComplete="name" required />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="field">
              <label htmlFor="message">What would you like to know?</label>
              <textarea id="message" name="message" rows={6} required />
            </div>
            <button type="submit">Open in mail client</button>
          </form>
          <aside className="note">
            <p className="mono tiny">direct</p>
            <p>
              <a href={`mailto:${facts.contactEmail}`}>{facts.contactEmail}</a>
            </p>
            <p className="lede">
              The site is maintained by the public site developer and reviewed by the owner. Static files only: no
              cookies, no analytics, no third-party scripts.
            </p>
            <p className="mono tiny">response</p>
            <p>A question about a job gets an answer with the plan, the checks and the boundaries attached.</p>
          </aside>
        </div>
      </section>
    </Layout>
  );
}

function document(page: ReactElement): string {
  return `<!doctype html>\n${renderToStaticMarkup(page)}\n`;
}

/** The deliverable the public site developer ships: five files, no dependencies. */
export function renderPublicSite(facts: PublicSiteFacts): Record<string, string> {
  return {
    "index.html": document(<Home facts={facts} />),
    "about.html": document(<About facts={facts} />),
    "contact.html": document(<Contact facts={facts} />),
    "styles.css": publicStylesheet(facts),
    "README.md": `# ${facts.customer} public site

Maintained by the public site developer from the \`Public site brief\` knowledge document.
Served by the application at \`/site\` and checked on a recurring availability routine.

## Files

- \`index.html\` — positioning, services, method, guarantees and about
- \`about.html\` — runtime, spending model and stated limits
- \`contact.html\` — enquiry form (mail client, no backend)
- \`styles.css\` — one stylesheet, responsive, no external assets

## Source

The pages are React components in \`src/lib/public-site/site.tsx\`, rendered to static
HTML with \`renderToStaticMarkup\`. Nothing is hydrated in the browser, which keeps the
site fast and a strict content-security policy workable.
`,
  };
}
