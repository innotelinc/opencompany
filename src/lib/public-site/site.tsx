import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { publicStylesheet } from "@/lib/public-site/styles";

/**
 * The company's public site: React components rendered to static files.
 *
 * Still deliberately static — no client bundle, no hydration, no external assets
 * — so the site stays fast and works while the application behind it is busy.
 * The design is aimed at a technical audience: mono labels, measured metrics,
 * and claims that match what the software actually enforces.
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
  ["about.html", "Architecture", "about"],
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
        <header className="topbar">
          <a className="brand" href="index.html">
            <span className="brand-mark" aria-hidden="true" />
            <span>{facts.customer}</span>
          </a>
          <nav aria-label="Main navigation">
            {NAV.map(([href, label, key]) => (
              <a key={key} href={href} aria-current={key === active ? "page" : undefined}>
                {label}
              </a>
            ))}
          </nav>
          <span className="topbar-tag mono">v0.1 · live</span>
        </header>

        <main id="main">{children}</main>

        <footer className="foot">
          <div>
            <span className="mono tiny">
              {facts.customer} — {facts.industry}
            </span>
          </div>
          <div className="mono tiny">
            <a href={`mailto:${facts.contactEmail}`}>{facts.contactEmail}</a>
          </div>
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
      title={`${facts.customer} — AI employees, owner authority`}
      description="An operating system for AI staff: durable workers, enforceable authority, reviewed deliverables and a public site that is watched, not assumed."
    >
      <section className="hero">
        <p className="eyebrow mono">AI company operating system</p>
        <h1>
          Software that runs a company.
          <br />
          <span className="grad">You keep the authority.</span>
        </h1>
        <p className="lede">
          {facts.customer} gives every AI employee a role, a computer and a durable queue. Work moves through planning,
          execution, automated checks and independent review — and stops at your desk for anything that leaves the
          building.
        </p>
        <div className="cta-row">
          <a className="button" href="about.html">
            Read the architecture
          </a>
          <a className="button ghost" href="contact.html">
            Talk to the owner
          </a>
        </div>
        <dl className="spec">
          <div>
            <dt className="mono">worker</dt>
            <dd>durable, leased</dd>
          </div>
          <div>
            <dt className="mono">authority</dt>
            <dd>server-enforced</dd>
          </div>
          <div>
            <dt className="mono">completion</dt>
            <dd>checks + review</dd>
          </div>
          <div>
            <dt className="mono">approval</dt>
            <dd>hash-bound</dd>
          </div>
        </dl>
      </section>

      <section className="bands" id="loop">
        <p className="eyebrow mono">The loop</p>
        <h2>Four stages, no hidden handoffs</h2>
        <div className="grid">
          <article className="card">
            <span className="step mono">01</span>
            <h3>Direction</h3>
            <p>You state the goal. Requirements are stored as company knowledge before any work begins.</p>
          </article>
          <article className="card">
            <span className="step mono">02</span>
            <h3>Plan</h3>
            <p>The CEO proposes a project, owners, acceptance criteria and checks. Nothing runs until you approve it.</p>
          </article>
          <article className="card">
            <span className="step mono">03</span>
            <h3>Execution</h3>
            <p>Employees work in their own machines. Automated checks inspect the produced files, not a claim of success.</p>
          </article>
          <article className="card">
            <span className="step mono">04</span>
            <h3>Review</h3>
            <p>A different employee reviews the artifact. Failures return as bounded revisions; passes reach your report.</p>
          </article>
        </div>
      </section>

      <section className="split">
        <div>
          <p className="eyebrow mono">Guarantees</p>
          <h2>What the software refuses to do</h2>
          <ul className="checks">
            <li>
              <span className="tick" aria-hidden="true" />
              No &ldquo;done&rdquo; without a stored artifact and a passing independent review.
            </li>
            <li>
              <span className="tick" aria-hidden="true" />
              No external action, email or deployment without an owner decision bound to its exact contents.
            </li>
            <li>
              <span className="tick" aria-hidden="true" />
              No invented invoices: provider charges appear only when a provider reports them.
            </li>
            <li>
              <span className="tick" aria-hidden="true" />
              No silent widening of authority — every boundary change is written to the audit trail.
            </li>
          </ul>
        </div>
        <aside className="terminal" aria-label="Deployment status">
          <div className="terminal-head mono">
            <span className="dot red" />
            <span className="dot amber" />
            <span className="dot green" />
            <span className="terminal-title">public-site/status</span>
          </div>
          <pre className="mono">{`$ company status
site        serving latest passing build
checks      html · links · styles · a11y
uptime      watched every 15 minutes
publish     requires an owner decision`}</pre>
        </aside>
      </section>

      <section className="bands">
        <p className="eyebrow mono">Always on</p>
        <h2>This website is maintained by the company</h2>
        <p className="lede">
          A public site developer owns this page. A recurring routine probes availability, improves one reviewable thing
          at a time, and reports what it cannot fix rather than shipping a broken page.
        </p>
        <ul className="status-list">
          <li>
            <span className="mono">last good build</span>
            <strong>served if an improvement fails its checks</strong>
          </li>
          <li>
            <span className="mono">availability</span>
            <strong>probed on a schedule, reported either way</strong>
          </li>
          <li>
            <span className="mono">external publishing</span>
            <strong>owner decision, every time</strong>
          </li>
        </ul>
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
      description="How the system runs work: durable workers with leases, hash-bound approvals, company-scoped data and reviewed deliverables."
    >
      <section className="hero compact">
        <p className="eyebrow mono">Architecture</p>
        <h1>Boring where it matters.</h1>
        <p className="lede">
          SQLite in WAL mode, a separate worker process, and a policy layer that every dispatch and tool call must pass.
          The interesting part is what survives failure.
        </p>
      </section>

      <section className="bands">
        <h2>The runtime</h2>
        <div className="grid">
          <article className="card">
            <span className="step mono">durability</span>
            <h3>Leases, not hope</h3>
            <p>
              Runs are claimed with a lease and a heartbeat. An interrupted run is recovered exactly once instead of
              being resumed mid-flight or replayed twice.
            </p>
          </article>
          <article className="card">
            <span className="step mono">authority</span>
            <h3>Decided server-side</h3>
            <p>
              Company policy, the employee&apos;s authority, its tools and the owner&apos;s standing approvals are
              evaluated on the server before each action.
            </p>
          </article>
          <article className="card">
            <span className="step mono">approvals</span>
            <h3>Bound to contents</h3>
            <p>
              An approval carries a SHA-256 of the proposed action. Change the target or the payload and the approval no
              longer covers it.
            </p>
          </article>
          <article className="card">
            <span className="step mono">machines</span>
            <h3>Per-employee computers</h3>
            <p>
              Each employee gets a persistent workspace and a command runner. Guarded by default; wider access is an
              owner grant recorded with a reason.
            </p>
          </article>
        </div>
      </section>

      <section className="split">
        <div>
          <p className="eyebrow mono">Spending</p>
          <h2>History, not a leash</h2>
          <p className="lede">
            The budget is a planning figure the owner may set or remove. It never throttles work: usage is recorded as
            it happens and reported as analytics. Real money — paying an external party — is still an owner approval at
            any amount.
          </p>
        </div>
        <div className="panel-note">
          <p className="mono tiny">what is recorded</p>
          <ul className="checks">
            <li>
              <span className="tick" aria-hidden="true" />
              Estimates reserved before dispatch
            </li>
            <li>
              <span className="tick" aria-hidden="true" />
              Token usage per run
            </li>
            <li>
              <span className="tick" aria-hidden="true" />
              Provider-reported charges, when a provider reports them
            </li>
            <li>
              <span className="tick" aria-hidden="true" />
              Nothing invented to make a chart look full
            </li>
          </ul>
        </div>
      </section>

      <section className="bands">
        <p className="eyebrow mono">Principles</p>
        <h2>Small surface, stated limits</h2>
        <p className="lede">
          One owner, one company, company-scoped queries throughout. Sign-in, real payments and public deployment
          providers are explicit gaps that return a blocked state rather than a simulated success.
        </p>
        <a className="button" href="contact.html">
          Ask a direct question
        </a>
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
      description={`Questions about ${facts.customer}: the operating model, the architecture, or a deployment.`}
    >
      <section className="hero compact">
        <p className="eyebrow mono">Contact</p>
        <h1>Straight to the owner.</h1>
        <p className="lede">
          No trackers, no marketing automation, no inbox to get lost in. The form opens your own mail client; this site
          has no backend.
        </p>
      </section>

      <section className="split">
        <form className="contact-form" action={`mailto:${facts.contactEmail}`} method="post" encType="text/plain">
          <div>
            <label htmlFor="name">Your name</label>
            <input id="name" name="name" type="text" autoComplete="name" required />
          </div>
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div>
            <label htmlFor="message">What would you like to know?</label>
            <textarea id="message" name="message" rows={5} required />
          </div>
          <button type="submit">Send message</button>
        </form>
        <aside className="panel-note">
          <p className="mono tiny">direct</p>
          <p>
            <a href={`mailto:${facts.contactEmail}`}>{facts.contactEmail}</a>
          </p>
          <p className="lede small">
            The site is maintained by the public site developer and reviewed by the owner. Static files only: no
            cookies, no analytics, no third-party scripts.
          </p>
        </aside>
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

- \`index.html\` — positioning, the operating loop, guarantees and availability
- \`about.html\` — runtime, approvals, spending model and stated limits
- \`contact.html\` — enquiry form (mail client, no backend)
- \`styles.css\` — one stylesheet, responsive, no external assets

## Source

The pages are React components in \`src/lib/public-site/site.tsx\`, rendered to static
HTML with \`renderToStaticMarkup\`. Nothing is hydrated in the browser, which keeps the
site fast and a strict content-security policy workable.
`,
  };
}
