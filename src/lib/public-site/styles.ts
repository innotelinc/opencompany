/**
 * Stylesheet for the company's own public site.
 *
 * One file, no external assets and no trackers, so the published HTML can keep a
 * strict content-security policy. The brief's palette drives the accents; type
 * and spacing are set for a technical audience that reads on a wide screen.
 */
export interface SitePalette {
  primaryColor: string;
  accentColor: string;
}

export function publicStylesheet(palette: SitePalette): string {
  return `:root {
  --primary: ${palette.primaryColor};
  --accent: ${palette.accentColor};
  --ink: #e9eef6;
  --ink-dim: #9aa7b8;
  --ink-faint: #6b7789;
  --bg: #06080b;
  --surface: rgba(255, 255, 255, 0.03);
  --line: rgba(255, 255, 255, 0.09);
  --line-strong: rgba(255, 255, 255, 0.16);
  --radius: 16px;
  --sans: ui-sans-serif, -apple-system, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif;
  --mono: ui-monospace, "SFMono-Regular", "JetBrains Mono", Menlo, Consolas, monospace;
}

* { box-sizing: border-box; }

html { scroll-behavior: smooth; }

body {
  margin: 0;
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.65;
  color: var(--ink);
  background:
    radial-gradient(900px 460px at 78% -8%, color-mix(in srgb, var(--primary) 55%, transparent), transparent 62%),
    radial-gradient(700px 380px at 6% 4%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 60%),
    var(--bg);
  -webkit-font-smoothing: antialiased;
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(to right, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: radial-gradient(ellipse at 50% 0%, black, transparent 78%);
  pointer-events: none;
  z-index: 0;
}

a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; text-underline-offset: 0.2em; }

h1, h2, h3 { letter-spacing: -0.025em; line-height: 1.1; margin: 0 0 0.6rem; font-weight: 650; }
h1 { font-size: clamp(2.3rem, 5.6vw, 4.1rem); }
h2 { font-size: clamp(1.5rem, 2.8vw, 2.15rem); }
h3 { font-size: 1.02rem; }
p { margin: 0 0 1rem; }

.mono { font-family: var(--mono); }
.tiny { font-size: 0.78rem; }
.small { font-size: 0.9rem; }

.skip { position: absolute; left: -9999px; }
.skip:focus {
  left: 1rem; top: 1rem;
  background: var(--accent); color: #06080b;
  padding: 0.5rem 1rem; border-radius: 10px; z-index: 30;
}

.topbar {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap;
  padding: 0.95rem clamp(1rem, 4vw, 3.5rem);
  border-bottom: 1px solid var(--line);
  background: rgba(6, 8, 11, 0.72);
  backdrop-filter: blur(14px);
}

.brand {
  display: inline-flex; align-items: center; gap: 0.6rem;
  color: var(--ink); font-weight: 600; letter-spacing: -0.01em;
  text-decoration: none;
}
.brand:hover { text-decoration: none; }
.brand-mark {
  width: 22px; height: 22px; border-radius: 7px;
  background: linear-gradient(140deg, var(--accent), var(--primary));
  box-shadow: 0 0 22px color-mix(in srgb, var(--accent) 45%, transparent);
}

nav { display: flex; gap: 1.4rem; flex-wrap: wrap; margin-left: auto; }
nav a {
  color: var(--ink-dim); font-size: 0.92rem;
  transition: color 0.15s ease;
}
nav a:hover, nav a[aria-current="page"] { color: var(--ink); text-decoration: none; }
nav a[aria-current="page"] { box-shadow: inset 0 -2px 0 var(--accent); padding-bottom: 2px; }

.topbar-tag {
  font-size: 0.72rem; color: var(--ink-faint);
  border: 1px solid var(--line); border-radius: 999px; padding: 0.15rem 0.6rem;
}

main {
  position: relative; z-index: 1;
  max-width: 72rem; margin: 0 auto;
  padding: clamp(2rem, 6vw, 5rem) clamp(1rem, 4vw, 3.5rem) 4rem;
}

.hero { display: grid; gap: 1.1rem; max-width: 62rem; }
.hero.compact { max-width: 52rem; padding-top: 1rem; }

.eyebrow {
  font-family: var(--mono);
  font-size: 0.74rem; letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--accent); margin: 0;
}

.grad {
  background: linear-gradient(96deg, var(--accent), color-mix(in srgb, var(--accent) 45%, var(--ink)));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}

.lede { font-size: clamp(1.02rem, 1.5vw, 1.16rem); color: var(--ink-dim); max-width: 56ch; }

.cta-row { display: flex; gap: 0.7rem; flex-wrap: wrap; margin-top: 0.4rem; }

.button {
  display: inline-block;
  padding: 0.72rem 1.25rem; border-radius: 999px;
  background: var(--accent); color: #06080b;
  font-size: 0.94rem; font-weight: 600;
  transition: transform 0.14s ease, box-shadow 0.14s ease, background 0.14s ease;
  box-shadow: 0 10px 30px color-mix(in srgb, var(--accent) 22%, transparent);
}
.button:hover { text-decoration: none; transform: translateY(-1px); }
.button.ghost {
  background: transparent; color: var(--ink);
  border: 1px solid var(--line-strong); box-shadow: none;
}
.button.ghost:hover { border-color: var(--accent); color: var(--accent); }

.spec {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 0; margin: 1.6rem 0 0; padding: 0;
  border: 1px solid var(--line); border-radius: var(--radius);
  overflow: hidden; background: var(--surface);
}
.spec > div { padding: 0.9rem 1.1rem; border-right: 1px solid var(--line); }
.spec > div:last-child { border-right: none; }
.spec dt { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-faint); }
.spec dd { margin: 0.15rem 0 0; font-size: 0.95rem; }

section { margin-top: clamp(3rem, 7vw, 5.5rem); }

.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); }

.card {
  position: relative;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 1.3rem;
  background: linear-gradient(170deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.012));
  transition: border-color 0.18s ease, transform 0.18s ease;
}
.card:hover { border-color: var(--line-strong); transform: translateY(-2px); }
.card p { margin: 0; color: var(--ink-dim); font-size: 0.95rem; }

.step {
  display: inline-block; margin-bottom: 0.65rem;
  font-size: 0.72rem; letter-spacing: 0.16em;
  color: var(--accent);
}

.split { display: grid; gap: 2rem; grid-template-columns: 1.25fr 0.95fr; align-items: start; }

.checks { list-style: none; padding: 0; margin: 1rem 0 0; display: grid; gap: 0.7rem; }
.checks li { display: flex; gap: 0.7rem; align-items: flex-start; color: var(--ink-dim); font-size: 0.95rem; }
.tick {
  flex: none; width: 16px; height: 16px; margin-top: 0.28rem;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  border: 1px solid var(--accent);
  position: relative;
}
.tick::after {
  content: ""; position: absolute; left: 4.5px; top: 1.5px;
  width: 4px; height: 8px;
  border-right: 1.6px solid var(--accent); border-bottom: 1.6px solid var(--accent);
  transform: rotate(40deg);
}

.terminal {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: #04060a;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
}
.terminal-head {
  display: flex; align-items: center; gap: 0.35rem;
  padding: 0.6rem 0.8rem;
  border-bottom: 1px solid var(--line);
  font-size: 0.72rem; color: var(--ink-faint);
}
.terminal-title { margin-left: 0.5rem; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.red { background: #ff6159; }
.dot.amber { background: #ffbd2e; }
.dot.green { background: #28c840; }
.terminal pre {
  margin: 0; padding: 1rem;
  font-size: 0.8rem; line-height: 1.8; color: #b8c6d6;
  white-space: pre-wrap; word-break: break-word;
}

.status-list { list-style: none; padding: 0; margin: 1.2rem 0 0; display: grid; gap: 0.6rem; }
.status-list li {
  display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
  padding-bottom: 0.55rem; border-bottom: 1px solid var(--line);
  color: var(--ink-dim); font-size: 0.95rem;
}
.status-list .mono { color: var(--ink-faint); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.14em; }
.status-list strong { color: var(--ink); font-weight: 500; }

.panel-note {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 1.2rem;
  background: var(--surface);
}
.panel-note .mono.tiny { color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.16em; margin: 0 0 0.6rem; }

.contact-form { display: grid; gap: 1rem; }
.contact-form label { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-faint); }
.contact-form input, .contact-form textarea {
  width: 100%; margin-top: 0.35rem;
  padding: 0.75rem 0.9rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--line-strong); border-radius: 12px;
  color: var(--ink); font: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.contact-form input:focus, .contact-form textarea:focus {
  outline: none; border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}
.contact-form button {
  justify-self: start;
  padding: 0.72rem 1.4rem; border: 0; border-radius: 999px;
  background: var(--accent); color: #06080b;
  font: inherit; font-weight: 600; cursor: pointer;
  transition: transform 0.14s ease;
}
.contact-form button:hover { transform: translateY(-1px); }

.foot {
  position: relative; z-index: 1;
  border-top: 1px solid var(--line);
  padding: 1.6rem clamp(1rem, 4vw, 3.5rem);
  color: var(--ink-faint);
  display: flex; flex-wrap: wrap; gap: 0.6rem 2rem; justify-content: space-between;
}

@media (max-width: 52rem) {
  .split { grid-template-columns: 1fr; }
  .spec > div { border-right: none; border-bottom: 1px solid var(--line); }
  .spec > div:last-child { border-bottom: none; }
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
  html { scroll-behavior: auto; }
}
`;
}
