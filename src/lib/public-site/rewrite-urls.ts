/**
 * Public-site artifacts are authored with page-relative links ("styles.css",
 * "about.html"), which only resolve when a document is served from its own
 * directory. The site is mounted at /site, so a page at /site would otherwise
 * ask the browser for /styles.css and render unstyled. Rewrite relative links to
 * root-absolute /site/... URLs at serve time and leave the artifact untouched.
 */
const ATTRIBUTE_URL = /\b(href|src|action|poster)\s*=\s*(["'])([^"']*)\2/gi;

// Anchors, queries, root-absolute paths, protocol-relative URLs and real
// schemes (mailto:, https:, data:, ...) already resolve without help.
const ALREADY_ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#|\?)/i;

export function rewritePublicUrls(html: string, relative: string): string {
  const dir = relative.includes("/") ? relative.slice(0, relative.lastIndexOf("/") + 1) : "";
  return html.replace(
    ATTRIBUTE_URL,
    (match, attribute: string, quote: string, raw: string) => {
      const value = raw.trim();
      if (!value || ALREADY_ABSOLUTE.test(value)) return match;

      const hashAt = value.indexOf("#");
      const hash = hashAt === -1 ? "" : value.slice(hashAt);
      const beforeHash = hashAt === -1 ? value : value.slice(0, hashAt);
      const queryAt = beforeHash.indexOf("?");
      const query = queryAt === -1 ? "" : beforeHash.slice(queryAt);
      const target = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);

      const segments = dir.split("/").filter(Boolean);
      for (const segment of target.split("/")) {
        if (!segment || segment === ".") continue;
        if (segment === "..") segments.pop();
        else segments.push(segment);
      }
      if (target.endsWith("/") || target === "." || target === "..") segments.push("index.html");

      const resolved = `/${["site", ...segments].join("/")}`;
      return `${attribute}=${quote}${resolved}${query}${hash}${quote}`;
    },
  );
}
