import assert from "node:assert/strict";
import test from "node:test";
import { runChecks } from "../src/lib/engine/checks";
import { renderPublicSite } from "../src/lib/public-site/site";

const facts = {
  customer: "OPENco.",
  industry: "AI company operating system",
  contactEmail: "hello@openco.innotel.tech",
  primaryColor: "#1f3d34",
  accentColor: "#d8a24a",
};

test("the React public site ships the same files and passes the deliverable checks", () => {
  const files = renderPublicSite(facts);
  assert.deepEqual(Object.keys(files).sort(), [
    "README.md",
    "about.html",
    "contact.html",
    "index.html",
    "styles.css",
  ]);

  const results = runChecks(
    new Map(Object.entries(files)),
    ["html_structure", "balanced_tags", "stylesheet_present", "accessibility_basics"],
  );
  const failed = results.filter((result) => !result.passed);
  assert.deepEqual(failed, [], `checks failed: ${JSON.stringify(failed)}`);
});

test("each page has one h1, a lang attribute and a viewport meta tag", () => {
  const files = renderPublicSite(facts);
  for (const page of ["index.html", "about.html", "contact.html"]) {
    const html = files[page];
    assert.match(html, /<html lang="en">/, `${page} should declare its language`);
    assert.match(html, /name="viewport"/, `${page} should be responsive`);
    assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${page} should have exactly one h1`);
    assert.match(html, /href="styles.css"/, `${page} should link the stylesheet`);
  }
});

test("the rendered pages carry the brief's palette, not hardcoded defaults", () => {
  const files = renderPublicSite({ ...facts, primaryColor: "#123456", accentColor: "#abcdef" });
  assert.match(files["styles.css"], /--primary: #123456/);
  assert.match(files["styles.css"], /--accent: #abcdef/);
});

test("copy is escaped rather than injected", () => {
  const files = renderPublicSite({ ...facts, customer: '<script>alert("x")</script>' });
  assert.doesNotMatch(files["index.html"], /<script>alert/);
  assert.match(files["index.html"], /&lt;script&gt;/);
});
