/**
 * Stylesheet for the company's own public site.
 *
 * One file, no external assets and no trackers, so the published HTML can keep a
 * strict content-security policy. The palette comes from the public site brief.
 */
export interface SitePalette {
  primaryColor: string;
  accentColor: string;
}

export function publicStylesheet(palette: SitePalette): string {
  return `:root {
  --ink: #16201c;
  --muted: #57645e;
  --paper: #f7f4ee;
  --surface: #fff;
  --primary: ${palette.primaryColor};
  --accent: ${palette.accentColor};
  --line: #ded7c9;
  --radius: 16px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  color: var(--ink);
  background: var(--paper);
  line-height: 1.65;
}

.skip { position: absolute; left: -9999px; }
.skip:focus {
  left: 1rem; top: 1rem;
  background: var(--primary); color: #fff;
  padding: 0.5rem 1rem; border-radius: 8px; z-index: 10;
}

.site-header {
  display: flex; flex-wrap: wrap; gap: 1rem 2rem;
  align-items: baseline; justify-content: space-between;
  padding: 1.5rem clamp(1rem, 5vw, 4rem);
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}

.brand {
  font-size: 1.3rem; letter-spacing: 0.05em; text-transform: uppercase;
  color: var(--primary); text-decoration: none; font-weight: 700;
}

nav { display: flex; gap: 1.25rem; flex-wrap: wrap; }
nav a {
  color: var(--muted); text-decoration: none;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.92rem; letter-spacing: 0.02em;
}
nav a:hover, nav a[aria-current="page"] { color: var(--primary); }

main {
  max-width: 68rem; margin: 0 auto;
  padding: clamp(2rem, 6vw, 5rem) clamp(1rem, 5vw, 4rem);
}

.hero { display: grid; gap: 2rem; grid-template-columns: 1.4fr 1fr; align-items: end; }
.hero h1 { font-size: clamp(2.3rem, 5.5vw, 3.8rem); line-height: 1.06; margin: 0 0 1rem; color: var(--primary); }
.hero p { font-size: 1.15rem; color: var(--muted); max-width: 40ch; margin: 0; }

.eyebrow {
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.78rem; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--accent); margin: 0 0 0.75rem;
}

section { margin-top: clamp(2.5rem, 6vw, 4.5rem); }
h2 { font-size: clamp(1.5rem, 3vw, 2.1rem); color: var(--primary); margin: 0 0 1rem; }
h3 { font-size: 1.05rem; margin: 0 0 0.5rem; }

.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); }

.card {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 1.35rem;
}
.card p { margin: 0; color: var(--muted); }

main p a, main li a, .card a, .site-footer a {
  color: var(--primary); text-decoration: underline; text-underline-offset: 0.18em;
}
main p a:hover, main li a:hover, .card a:hover, .site-footer a:hover { color: var(--accent); }

.button {
  display: inline-block; margin-top: 1.25rem; padding: 0.8rem 1.4rem;
  border-radius: 999px; background: var(--primary); color: #fff;
  text-decoration: none; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 0.95rem;
}
.button.secondary { background: transparent; color: var(--primary); border: 1px solid var(--primary); }

.contact-form { display: grid; gap: 0.9rem; max-width: 32rem; }
.contact-form label { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 0.9rem; color: var(--primary); }
.contact-form input, .contact-form textarea {
  width: 100%; padding: 0.7rem 0.85rem;
  border: 1px solid var(--line); border-radius: 10px; font: inherit; background: var(--surface);
}
.contact-form button {
  justify-self: start; padding: 0.75rem 1.5rem; border: 0; border-radius: 999px;
  background: var(--primary); color: #fff; font: inherit; cursor: pointer;
}

.status-list { list-style: none; padding: 0; margin: 1rem 0 0; display: grid; gap: 0.5rem; }
.status-list li { display: flex; justify-content: space-between; gap: 1rem; border-bottom: 1px solid var(--line); padding-bottom: 0.5rem; }
.status-list strong { color: var(--primary); font-weight: 600; }

.site-footer {
  border-top: 1px solid var(--line);
  padding: 2rem clamp(1rem, 5vw, 4rem);
  color: var(--muted); font-size: 0.9rem;
  display: flex; flex-wrap: wrap; gap: 0.5rem 2rem; justify-content: space-between;
}

@media (max-width: 46rem) {
  .hero { grid-template-columns: 1fr; align-items: start; }
}
`;
}
