import { createHash } from "node:crypto";

/**
 * Content-Security-Policy for the files this application serves.
 *
 * The published pages carry their own styling — a `<style>` block in the fallback
 * page, `style="…"` attributes in the delivered pages — so a bare `style-src 'self'`
 * makes the browser drop every rule and the site renders unstyled. Rather than
 * allowing `'unsafe-inline'` (which permits any injected style), the policy names
 * the exact styles the page contains: one sha256 per `<style>` block and one per
 * style attribute value.
 *
 * Style attributes additionally require `'unsafe-hashes'`; it is only honoured
 * together with those hashes, so it does not open the door to arbitrary inline
 * declarations. Scripts are never allowed inline here.
 */
const STYLE_ELEMENT = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const STYLE_ATTRIBUTE = /<[a-z][^>]*?\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

function sha256(text: string): string {
  return `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
}

export function inlineStyleHashes(html: string): { elements: string[]; attributes: string[] } {
  const elements = new Set<string>();
  for (const match of html.matchAll(STYLE_ELEMENT)) {
    const contents = match[1];
    if (contents.trim()) elements.add(sha256(contents));
  }
  const attributes = new Set<string>();
  for (const match of html.matchAll(STYLE_ATTRIBUTE)) {
    const value = match[1] ?? match[2] ?? "";
    if (value.trim()) attributes.add(sha256(value));
  }
  return { elements: [...elements].sort(), attributes: [...attributes].sort() };
}

/**
 * `html` is the page being served; omit it for non-HTML files, which get a policy
 * with no style exceptions at all.
 */
export function contentSecurityPolicy(html?: string): string {
  const { elements, attributes } = html
    ? inlineStyleHashes(html)
    : { elements: [] as string[], attributes: [] as string[] };

  const style = ["'self'", ...elements];
  if (attributes.length > 0) style.push("'unsafe-hashes'", ...attributes);

  return [
    "default-src 'none'",
    `style-src ${style.join(" ")}`,
    "img-src 'self' data:",
    "font-src 'self'",
    // The contact page posts to a mailto: address. `'none'` blocked that, so the
    // button did nothing at all while the page told the visitor it would open their
    // mail client. Only the scheme is named: a form still cannot reach a server.
    "form-action 'mailto:'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}
