/**
 * Stylesheet for the company's own public site.
 *
 * One file, no external assets and no trackers, so the published HTML can keep a
 * strict content-security policy. This pass is a light editorial treatment: paper
 * ground, ink from the brief's primary colour, gold as the only accent, serif
 * headlines over a sans body and a numbered index for the chapters. Rules are
 * hairline rather than boxes, so the page reads like a printed dossier.
 */
export interface SitePalette {
  primaryColor: string;
  accentColor: string;
}

export function publicStylesheet(palette: SitePalette): string {
  return `:root {
  --primary: ${palette.primaryColor};
  --accent: ${palette.accentColor};
  --paper: #f7f4ec;
  --paper-deep: #efe9dc;
  --ink: #16211d;
  --ink-soft: #45524c;
  --ink-faint: #7b867f;
  --rule: rgba(22, 33, 29, 0.16);
  --rule-soft: rgba(22, 33, 29, 0.09);
  --sans: ui-sans-serif, -apple-system, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif;
  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  --mono: ui-monospace, "SFMono-Regular", "JetBrains Mono", Menlo, Consolas, monospace;
  --measure: 38rem;
}

* { box-sizing: border-box; }

html { scroll-behavior: smooth; }

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 17px;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
  background-image:
    radial-gradient(1200px 520px at 88% -12%, color-mix(in srgb, var(--primary) 9%, transparent), transparent 68%),
    radial-gradient(900px 420px at 2% 6%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 62%);
  background-repeat: no-repeat;
}

a { color: var(--primary); text-decoration-thickness: 1px; text-underline-offset: 0.18em; }
a:hover { color: var(--accent); }

h1, h2, h3 {
  font-family: var(--serif);
  font-weight: 500;
  letter-spacing: -0.015em;
  line-height: 1.14;
  margin: 0 0 0.7rem;
  text-wrap: balance;
}
h1 { font-size: clamp(2.4rem, 5.4vw, 4rem); }
h2 { font-size: clamp(1.6rem, 3vw, 2.3rem); }
h3 { font-size: 1.18rem; letter-spacing: -0.005em; }

p { margin: 0 0 1.15rem; }

.mono { font-family: var(--mono); }
.tiny { font-size: 0.78rem; letter-spacing: 0.02em; }

.skip { position: absolute; left: -9999px; }
.skip:focus {
  left: 1rem; top: 1rem; z-index: 30;
  background: var(--ink); color: var(--paper);
  padding: 0.5rem 1rem; border-radius: 2px;
}

/* Masthead: a rule, the name, the subject, then the index of pages. */
.masthead {
  display: flex; align-items: baseline; gap: 1.2rem 2rem; flex-wrap: wrap;
  padding: 1.4rem clamp(1.1rem, 5vw, 4.5rem);
  border-bottom: 1px solid var(--rule);
  background: color-mix(in srgb, var(--paper) 88%, transparent);
  backdrop-filter: blur(8px);
  position: sticky; top: 0; z-index: 10;
}

.wordmark {
  display: inline-flex; align-items: center; gap: 0.6rem;
  color: var(--ink); text-decoration: none;
  font-family: var(--serif); font-size: 1.28rem; letter-spacing: -0.01em;
}
.wordmark:hover { color: var(--ink); }
.wordmark-rule {
  width: 26px; height: 3px; display: inline-block;
  background: var(--accent);
}
.wordmark-text { border-bottom: 1px solid transparent; }
.wordmark:hover .wordmark-text { border-bottom-color: var(--accent); }

.masthead-note {
  margin: 0; color: var(--ink-faint);
  font-size: 0.72rem; letter-spacing: 0.16em; text-transform: uppercase;
}

nav { display: flex; gap: 1.6rem; flex-wrap: wrap; margin-left: auto; }
nav a {
  color: var(--ink-soft); text-decoration: none;
  font-size: 0.78rem; letter-spacing: 0.14em; text-transform: uppercase;
  padding-bottom: 2px; border-bottom: 1px solid transparent;
}
nav a:hover { color: var(--ink); border-bottom-color: var(--rule); }
nav a[aria-current="page"] { color: var(--ink); border-bottom-color: var(--accent); }

main {
  max-width: 76rem; margin: 0 auto;
  padding: clamp(2.4rem, 7vw, 6rem) clamp(1.1rem, 5vw, 4.5rem) 5rem;
}

/* Opening spread */
.opening { max-width: 52rem; }
.opening.compact { max-width: 44rem; padding-top: 0.5rem; }

.kicker {
  display: inline-flex; align-items: center; gap: 0.55rem;
  margin: 0 0 1.1rem;
  color: var(--ink-faint);
  font-size: 0.72rem; letter-spacing: 0.2em; text-transform: uppercase;
}
.kicker-mark { width: 18px; height: 1px; background: var(--accent); display: inline-block; }

.lede {
  font-size: clamp(1.05rem, 1.5vw, 1.2rem);
  color: var(--ink-soft);
  max-width: var(--measure);
  line-height: 1.68;
}

.actions { display: flex; gap: 0.7rem; flex-wrap: wrap; margin: 1.6rem 0 0; }

.button {
  display: inline-block;
  padding: 0.7rem 1.25rem;
  border: 1px solid var(--ink);
  border-radius: 2px;
  background: var(--ink); color: var(--paper);
  font-size: 0.9rem; text-decoration: none;
  transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}
.button:hover { background: var(--accent); border-color: var(--accent); color: var(--ink); }
.button.quiet { background: transparent; color: var(--ink); border-color: var(--rule); }
.button.quiet:hover { border-color: var(--ink); color: var(--ink); background: transparent; }

/* The four facts as a ruled ledger, not cards. */
.ledger {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 0; margin: 2.6rem 0 0; padding: 0;
  border-top: 1px solid var(--rule);
}
.ledger > div {
  padding: 0.95rem 1rem 0.95rem 0;
  border-bottom: 1px solid var(--rule-soft);
}
.ledger dt {
  color: var(--ink-faint); font-size: 0.7rem;
  letter-spacing: 0.16em; text-transform: uppercase;
  margin-bottom: 0.3rem;
}
.ledger dd { margin: 0; font-size: 0.95rem; color: var(--ink); }

/* Chapters: numbered index column beside the prose. */
.chapter {
  margin-top: clamp(3.2rem, 7vw, 6rem);
  padding-top: 1.6rem;
  border-top: 1px solid var(--rule);
  display: grid;
  grid-template-columns: minmax(9rem, 13rem) minmax(0, 1fr);
  gap: 1.2rem clamp(1.2rem, 4vw, 3.5rem);
  align-items: start;
}
.chapter > * { grid-column: 2; }
.chapter > .chapter-head { grid-column: 1; position: sticky; top: 5.5rem; display: block; }
.chapter > .split, .chapter > .entries, .chapter > .process, .chapter > .rules, .chapter > .actions,
.chapter > .closing-inner { grid-column: 2; }
.chapter > p { grid-column: 2; }

.chapter-no {
  display: block; margin-bottom: 0.55rem;
  color: var(--accent);
  font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase;
}
.chapter-head h2 { margin: 0 0 0.5rem; }
.chapter-note {
  margin: 0; color: var(--ink-faint);
  font-size: 0.92rem; line-height: 1.6; max-width: 22ch;
}

/* Services / runtime entries: hairline-separated, three across on wide screens. */
.entries {
  display: grid; gap: 0;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
}
.entry {
  padding: 1.15rem 1.3rem 1.3rem 0;
  border-top: 1px solid var(--rule-soft);
}
.entry:first-child { border-top: none; padding-top: 0; }
.entry-tag {
  margin: 0 0 0.5rem;
  color: var(--accent); font-size: 0.68rem;
  letter-spacing: 0.18em; text-transform: uppercase;
}
.entry h3 { margin-bottom: 0.45rem; }
.entry p { color: var(--ink-soft); font-size: 0.98rem; margin: 0; }

/* Method: a numbered column, one line per stage. */
.process { list-style: none; margin: 0; padding: 0; }
.process li {
  display: grid; grid-template-columns: 2.6rem minmax(0, 1fr);
  gap: 1rem; padding: 1rem 0;
  border-top: 1px solid var(--rule-soft);
}
.process li:first-child { border-top: none; padding-top: 0; }
.process-no { color: var(--ink-faint); font-size: 0.8rem; padding-top: 0.2rem; }
.process h3 { margin-bottom: 0.25rem; }
.process p { margin: 0; color: var(--ink-soft); font-size: 0.98rem; }

/* Guarantees: prose list with a gold rule marker. */
.rules { list-style: none; margin: 0; padding: 0; }
.rules li {
  position: relative; padding: 0.7rem 0 0.7rem 1.4rem;
  border-top: 1px solid var(--rule-soft);
  color: var(--ink-soft); font-size: 0.98rem;
}
.rules li:first-child { border-top: none; }
.rules li::before {
  content: ""; position: absolute; left: 0; top: 1.35rem;
  width: 7px; height: 1px; background: var(--accent);
}

.split {
  display: grid; gap: clamp(1.4rem, 4vw, 3rem);
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  align-items: start;
}

.note {
  border-left: 2px solid var(--accent);
  padding: 0.2rem 0 0.2rem 1.15rem;
  background: color-mix(in srgb, var(--paper-deep) 55%, transparent);
}
.note .tiny {
  margin: 0 0 0.5rem; color: var(--ink-faint);
  text-transform: uppercase; letter-spacing: 0.16em;
}
.note p { font-size: 0.95rem; color: var(--ink-soft); }
.note p:last-child { margin-bottom: 0; }
.note .rules li { font-size: 0.92rem; }

.closing {
  margin-top: clamp(3.2rem, 7vw, 6rem);
  padding: clamp(1.8rem, 4vw, 3rem);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--accent);
  background: color-mix(in srgb, var(--paper-deep) 42%, transparent);
}
.closing h2 { margin-bottom: 0.6rem; }
.closing .lede { max-width: 34rem; }
.closing .actions { margin-top: 1.1rem; }

/* Contact */
.contact-form { display: grid; gap: 1.1rem; }
.field { display: grid; }
.contact-form label {
  color: var(--ink-faint); font-size: 0.72rem;
  letter-spacing: 0.16em; text-transform: uppercase;
  margin-bottom: 0.4rem;
}
.contact-form input, .contact-form textarea {
  width: 100%;
  padding: 0.7rem 0.85rem;
  background: color-mix(in srgb, #ffffff 62%, var(--paper));
  border: 1px solid var(--rule);
  border-radius: 2px;
  color: var(--ink); font: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.contact-form input:focus, .contact-form textarea:focus {
  outline: none; border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 26%, transparent);
}
.contact-form button {
  justify-self: start; cursor: pointer;
  padding: 0.7rem 1.4rem;
  border: 1px solid var(--ink); border-radius: 2px;
  background: var(--ink); color: var(--paper);
  font: inherit; font-size: 0.9rem;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}
.contact-form button:hover { background: var(--accent); border-color: var(--accent); color: var(--ink); }

.colophon {
  display: flex; justify-content: space-between; align-items: baseline; gap: 0.8rem 2rem; flex-wrap: wrap;
  padding: 1.7rem clamp(1.1rem, 5vw, 4.5rem);
  border-top: 1px solid var(--rule);
  color: var(--ink-faint);
}
.colophon p { margin: 0; }
.colophon a { color: var(--ink-faint); }
.colophon a:hover { color: var(--accent); }

@media (max-width: 58rem) {
  .chapter { grid-template-columns: 1fr; }
  .chapter > *, .chapter > .chapter-head { grid-column: 1; }
  .chapter > .chapter-head { position: static; display: grid; grid-template-columns: 1fr; }
  .chapter-note { max-width: var(--measure); }
  .split { grid-template-columns: 1fr; }
}

@media (max-width: 34rem) {
  body { font-size: 16px; }
  .masthead { position: static; }
  nav { margin-left: 0; width: 100%; gap: 1.1rem; }
  .ledger { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
  html { scroll-behavior: auto; }
}
`;
}
