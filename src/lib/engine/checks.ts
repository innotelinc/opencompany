import type { CheckResult } from "@/lib/domain/types";

/**
 * Deliverable checks. These are real, deterministic inspections of the files an
 * employee produced — not an agent asserting success. A task without passing
 * required checks cannot be marked complete.
 */

export interface CheckContext {
  files: Map<string, string>;
}

type CheckFn = (ctx: CheckContext) => { passed: boolean; detail: string };

const LOCAL_SCHEME = /^(https?:|mailto:|tel:|data:|#|\/\/)/i;

function htmlFiles(files: Map<string, string>): [string, string][] {
  return [...files.entries()].filter(([name]) => name.endsWith(".html"));
}

function stripUnclosedVoid(html: string): string {
  return html.replace(/<(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)\b[^>]*>/gi, "");
}

const CHECKS: Record<string, { description: string; run: CheckFn }> = {
  files_exist: {
    description: "A primary document with real content exists.",
    run: ({ files }) => {
      const index = files.get("index.html");
      if (index) {
        if (index.trim().length < 400) return { passed: false, detail: "index.html is too small to be a real page." };
        return { passed: true, detail: `index.html is ${index.length} characters.` };
      }
      const largest = [...files.entries()].sort((a, b) => b[1].length - a[1].length)[0];
      if (!largest) return { passed: false, detail: "The deliverable contains no files." };
      if (largest[1].trim().length < 200) {
        return { passed: false, detail: `${largest[0]} is too small to be a real deliverable.` };
      }
      return { passed: true, detail: `${largest[0]} is ${largest[1].length} characters.` };
    },
  },
  html_structure: {
    description: "HTML has a document shell, a title and a single h1 per page.",
    run: ({ files }) => {
      const pages = htmlFiles(files);
      if (pages.length === 0) return { passed: false, detail: "No HTML pages found." };
      for (const [name, html] of pages) {
        if (!/<html[\s>]/i.test(html)) return { passed: false, detail: `${name} has no <html> element.` };
        if (!/<head[\s>]/i.test(html) || !/<body[\s>]/i.test(html))
          return { passed: false, detail: `${name} is missing <head> or <body>.` };
        if (!/<title>[^<]{3,}<\/title>/i.test(html))
          return { passed: false, detail: `${name} has no descriptive <title>.` };
        const h1 = (html.match(/<h1[\s>]/gi) ?? []).length;
        if (h1 !== 1) return { passed: false, detail: `${name} has ${h1} <h1> elements, expected exactly 1.` };
      }
      return { passed: true, detail: `${pages.length} page(s) have a valid document shell.` };
    },
  },
  balanced_tags: {
    description: "Block-level tags are balanced.",
    run: ({ files }) => {
      const tags = ["div", "section", "main", "header", "footer", "nav", "ul", "ol", "li", "p", "a", "form"];
      for (const [name, html] of htmlFiles(files)) {
        const cleaned = stripUnclosedVoid(html);
        for (const tag of tags) {
          const open = (cleaned.match(new RegExp(`<${tag}[\\s>]`, "gi")) ?? []).length;
          const close = (cleaned.match(new RegExp(`</${tag}>`, "gi")) ?? []).length;
          if (open !== close) {
            return { passed: false, detail: `${name}: <${tag}> opened ${open} times, closed ${close}.` };
          }
        }
      }
      return { passed: true, detail: "Container tags are balanced on every page." };
    },
  },
  internal_links: {
    description: "Every relative link and asset target exists in the deliverable.",
    run: ({ files }) => {
      const missing: string[] = [];
      for (const [name, html] of htmlFiles(files)) {
        const refs = [...html.matchAll(/(?:href|src)\s*=\s*"([^"]+)"/gi)].map((m) => m[1]);
        const dir = name.includes("/") ? name.slice(0, name.lastIndexOf("/") + 1) : "";
        for (const ref of refs) {
          if (!ref || LOCAL_SCHEME.test(ref)) continue;
          const clean = ref.split("?")[0].split("#")[0];
          if (!clean) continue;
          const target = clean.startsWith("/")
            ? clean.slice(1)
            : `${dir}${clean}`.replace(/^\.\//, "");
          if (!files.has(target) && !files.has(`${target}index.html`)) missing.push(`${name} → ${ref}`);
        }
      }
      if (missing.length) return { passed: false, detail: `Broken internal references: ${missing.join(", ")}` };
      return { passed: true, detail: "All relative links resolve to delivered files." };
    },
  },
  stylesheet_present: {
    description: "A stylesheet is linked and has real rules.",
    run: ({ files }) => {
      const css = [...files.entries()].filter(([name]) => name.endsWith(".css"));
      if (css.length === 0) return { passed: false, detail: "No CSS file was delivered." };
      const total = css.reduce((sum, [, body]) => sum + body.length, 0);
      if (total < 200) return { passed: false, detail: "Stylesheet is too small to be meaningful." };
      const linked = htmlFiles(files).some(([, html]) => /<link[^>]+rel="stylesheet"/i.test(html));
      if (!linked) return { passed: false, detail: "No page links a stylesheet." };
      return { passed: true, detail: `${css.length} stylesheet(s), ${total} characters, linked from HTML.` };
    },
  },
  accessibility_basics: {
    description: "Viewport meta, lang attribute, image alts and form labels.",
    run: ({ files }) => {
      for (const [name, html] of htmlFiles(files)) {
        if (!/<html[^>]+lang="[a-z-]+"/i.test(html)) return { passed: false, detail: `${name} has no lang attribute.` };
        if (!/<meta[^>]+name="viewport"/i.test(html)) return { passed: false, detail: `${name} has no viewport meta tag.` };
        for (const img of html.matchAll(/<img\b[^>]*>/gi)) {
          if (!/\balt\s*=/.test(img[0])) return { passed: false, detail: `${name} has an image without alt text.` };
        }
        for (const input of html.matchAll(/<input\b[^>]*>/gi)) {
          const tag = input[0];
          if (/type="(hidden|submit|button)"/i.test(tag)) continue;
          if (!/\b(aria-label|id)\s*=/.test(tag)) return { passed: false, detail: `${name} has an unlabelled input.` };
        }
      }
      return { passed: true, detail: "Basic accessibility markers are present." };
    },
  },
  no_placeholder_text: {
    description: "No lorem ipsum, TODO, TBD or undefined leaked into the deliverable.",
    run: ({ files }) => {
      const bad = /lorem ipsum|\bTODO\b|\bTBD\b|\[object Object\]|\bundefined\b/i;
      for (const [name, body] of files) {
        if (!/\.(html|css|js|md|json|txt)$/i.test(name)) continue;
        const match = body.match(bad);
        if (match) return { passed: false, detail: `${name} contains placeholder text: "${match[0]}".` };
      }
      return { passed: true, detail: "No placeholder text found." };
    },
  },
  customer_requirements_covered: {
    description: "The page names the customer and every required section from the brief.",
    run: ({ files }) => {
      const index = files.get("index.html") ?? "";
      const prose = [...files.values()].join("\n").toLowerCase();
      const required = ["about", "services", "contact"];
      for (const section of required) {
        if (!prose.includes(section)) return { passed: false, detail: `Missing required section: ${section}.` };
      }
      if (!/<h1[^>]*>[^<]{3,}<\/h1>/i.test(index)) return { passed: false, detail: "The landing page has no headline." };
      return { passed: true, detail: "About, services and contact content are present." };
    },
  },
};

export const ALL_CHECKS = Object.keys(CHECKS);

export function checkDescription(id: string): string {
  return CHECKS[id]?.description ?? id;
}

/** Run the requested checks plus the always-on baseline. */
export function runChecks(files: Map<string, string>, required: string[] = []): CheckResult[] {
  const hasHtml = [...files.keys()].some((name) => name.endsWith(".html"));
  const baseline = hasHtml
    ? ["files_exist", "html_structure", "internal_links"]
    : ["files_exist", "no_placeholder_text"];
  const ids = [...new Set([...baseline, ...required])];
  return ids.map((id) => {
    const check = CHECKS[id];
    if (!check) {
      return { id, name: id, passed: false, detail: `Unknown check "${id}" — treated as failed.` };
    }
    try {
      const result = check.run({ files });
      return { id, name: check.description, passed: result.passed, detail: result.detail };
    } catch (error) {
      return { id, name: check.description, passed: false, detail: `Check crashed: ${String(error)}` };
    }
  });
}

export function checksPassed(results: CheckResult[]): boolean {
  return results.length > 0 && results.every((result) => result.passed);
}
