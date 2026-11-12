// The import is also the classic JSX runtime that tsx/esbuild expects when
// tsconfig keeps `jsx: preserve` for Next.js.
import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { publicStylesheet } from "@/lib/public-site/styles";

/**
 * The company's own public site, written as React components and rendered to
 * static files by the server. The public site stays static (no client bundle, no
 * hydration, no external assets) so it keeps loading when everything else is
 * unavailable, but the pages are now composed the same way as the rest of the
 * application instead of being assembled from template strings.
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
  ["index.html", "Home", "home"],
  ["about.html", "About", "about"],
  ["index.html#services", "Services", "services"],
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
        <header className="site-header">
          <a className="brand" href="index.html">
            {facts.customer}
          </a>
          <nav aria-label="Main navigation">
            {NAV.map(([href, label, key]) => (
              <a key={key} href={href} aria-current={key === active ? "page" : undefined}>
                {label}
              </a>
            ))}
          </nav>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <p>
            {facts.customer} · {facts.industry}
          </p>
          <p>
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
      title={`${facts.customer} — AI employees, owner authority`}
      description="An AI company operating system: AI employees plan, build, check and review work while the owner holds budget, approvals and the stop button."
    >
      <section className="hero">
        <div>
          <p className="eyebrow">AI company operating system</p>
          <h1>AI employees do the work. You keep the authority.</h1>
          <p>
            {facts.customer} runs goals end to end — plan, build, automated checks and an independent review — and
            stops at your desk for anything external.
          </p>
          <a className="button" href="about.html">
            How it works
          </a>
        </div>
        <div className="card">
          <h2>What you approve</h2>
          <p>
            Plans, budgets and every external action. Publishing, email and spend above your threshold wait for an
            explicit owner decision bound to the exact action.
          </p>
        </div>
      </section>

      <section id="services">
        <p className="eyebrow">The loop</p>
        <h2>One operating loop, no hidden steps</h2>
        <div className="grid">
          <article className="card">
            <h3>1. Direction</h3>
            <p>You state the goal and the budget. Requirements are stored as company knowledge before any work starts.</p>
          </article>
          <article className="card">
            <h3>2. Plan</h3>
            <p>The CEO proposes a small project with owners, acceptance criteria and checks. Nothing runs until you approve it.</p>
          </article>
          <article className="card">
            <h3>3. Work</h3>
            <p>Employees build in isolated workspaces. Automated checks run on the produced files, not on a claim of success.</p>
          </article>
          <article className="card">
            <h3>4. Review</h3>
            <p>A different employee reviews the artifact. Failures come back as bounded revisions; passing work reaches your report.</p>
          </article>
        </div>
      </section>

      <section>
        <p className="eyebrow">Always on</p>
        <h2>The public site is watched, not just built</h2>
        <p>
          A public site developer owns this website. A recurring routine checks that it answers, improves one reviewable
          thing at a time, and reports anything it cannot fix instead of quietly shipping a broken page.
        </p>
        <ul className="status-list">
          <li>
            <span>Availability target</span>
            <strong>24/7, checked on a schedule</strong>
          </li>
          <li>
            <span>Last known good version</span>
            <strong>served if an improvement fails its checks</strong>
          </li>
          <li>
            <span>External publishing</span>
            <strong>requires an owner decision</strong>
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
      title={`How ${facts.customer} works`}
      description={`The architecture and guarantees behind ${facts.customer}: durable workers, server-enforced authority and reviewed deliverables.`}
    >
      <section>
        <p className="eyebrow">How it works</p>
        <h1>Durable by default</h1>
        <p>
          Work runs in a separate durable worker with leases, cancellation and recovery. Restarting the app does not
          lose the queue, and an interrupted run is retried exactly once rather than resumed mid-flight.
        </p>
      </section>

      <section>
        <h2>Rules the software enforces</h2>
        <div className="grid">
          <article className="card">
            <h3>Authority</h3>
            <p>Every action is checked server-side against company policy, the employee&apos;s authority and the budget on record.</p>
          </article>
          <article className="card">
            <h3>Approvals</h3>
            <p>An approval is bound to a SHA-256 of the proposed action. If the details change, the approval no longer applies.</p>
          </article>
          <article className="card">
            <h3>Evidence</h3>
            <p>A task is complete only with a stored deliverable, passing checks and an independent review.</p>
          </article>
          <article className="card">
            <h3>Stop</h3>
            <p>An emergency stop halts new work immediately. The owner can also take over an employee&apos;s computer.</p>
          </article>
        </div>
      </section>

      <section>
        <p className="eyebrow">Principles</p>
        <h2>What we refuse to do</h2>
        <p>
          No invented customers, invoices or metrics. No silent external actions. No &ldquo;done&rdquo; without an
          artifact and a review. Provider charges appear only when a provider reports them.
        </p>
        <a className="button secondary" href="contact.html">
          Talk to the owner
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
      title={`Contact ${facts.customer}`}
      description={`Questions about ${facts.customer}, the operating model or a deployment.`}
    >
      <section>
        <p className="eyebrow">Contact</p>
        <h1>Questions about the company</h1>
        <p>
          This site is maintained by the public site developer and reviewed by the owner. It runs on static files with
          no trackers.
        </p>
        <form className="contact-form" action={`mailto:${facts.contactEmail}`} method="post" encType="text/plain">
          <label htmlFor="name">Your name</label>
          <input id="name" name="name" type="text" autoComplete="name" required />
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <label htmlFor="message">What would you like to know?</label>
          <textarea id="message" name="message" rows={5} required />
          <button type="submit">Send</button>
        </form>
        <p>
          Or email <a href={`mailto:${facts.contactEmail}`}>{facts.contactEmail}</a>. The form opens your mail client;
          there is no server-side inbox.
        </p>
      </section>
    </Layout>
  );
}

/** Render a page to a complete HTML document. */
function document(page: ReactElement): string {
  return `<!doctype html>\n${renderToStaticMarkup(page)}\n`;
}

/**
 * The deliverable the public site developer ships: the same five files as before,
 * built from React components.
 */
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

- \`index.html\` — positioning, the operating loop and availability promises
- \`about.html\` — architecture, guarantees and principles
- \`contact.html\` — enquiry form (mail client, no backend)
- \`styles.css\` — one stylesheet, responsive, no external assets

## Source

The pages are React components in \`src/lib/public-site/site.tsx\`, rendered to static
HTML with \`renderToStaticMarkup\`. Nothing is hydrated in the browser: the output is
plain HTML and CSS, which keeps the site fast and keeps a strict content-security
policy workable.
`,
  };
}
