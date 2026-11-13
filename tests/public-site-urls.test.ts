import assert from "node:assert/strict";
import test from "node:test";
import { rewritePublicUrls } from "../src/lib/public-site/rewrite-urls";

const rewrite = (html: string, relative = "index.html") => rewritePublicUrls(html, relative);

test("root pages load their stylesheet and siblings from /site", () => {
  assert.equal(
    rewrite(
      `<link rel="stylesheet" href="styles.css"><a href="index.html">Home</a><a href="about.html">About</a>`,
    ),
    `<link rel="stylesheet" href="/site/styles.css"><a href="/site/index.html">Home</a><a href="/site/about.html">About</a>`,
  );
});

test("nested pages resolve against their own directory", () => {
  assert.equal(
    rewrite(
      `<link href="styles.css"><img src="img/logo.png"><a href="../about.html">Up</a>`,
      "guides/setup/index.html",
    ),
    `<link href="/site/guides/setup/styles.css"><img src="/site/guides/setup/img/logo.png"><a href="/site/guides/about.html">Up</a>`,
  );
});

test("fragments, queries and directory links stay usable", () => {
  assert.equal(rewrite(`<a href="#main">Skip</a>`), `<a href="#main">Skip</a>`);
  assert.equal(
    rewrite(`<a href="index.html#services">Services</a>`, "about.html"),
    `<a href="/site/index.html#services">Services</a>`,
  );
  assert.equal(
    rewrite(`<a href="about.html?ref=nav#team">Team</a>`),
    `<a href="/site/about.html?ref=nav#team">Team</a>`,
  );
  assert.equal(rewrite(`<a href="?q=1">Search</a>`), `<a href="?q=1">Search</a>`);
  assert.equal(rewrite(`<a href="./">Docs</a>`, "docs/page.html"), `<a href="/site/docs/index.html">Docs</a>`);
  assert.equal(rewrite(`<a href="../">Root</a>`, "docs/page.html"), `<a href="/site/index.html">Root</a>`);
});

test("external, absolute and in-page targets are left alone", () => {
  const html = [
    `<a href="mailto:hello@openco.innotel.tech">Mail</a>`,
    `<form action="mailto:hello@openco.innotel.tech" method="post"></form>`,
    `<a href="https://example.com/about">Elsewhere</a>`,
    `<link href="//cdn.example.com/site.css">`,
    `<a href="/site/contact.html">Contact</a>`,
    `<img src="data:image/svg+xml;base64,AAAA">`,
  ].join("");
  assert.equal(rewrite(html), html);
});

test("single-quoted attributes keep their quoting", () => {
  assert.equal(rewrite(`<a href='contact.html'>Contact</a>`), `<a href='/site/contact.html'>Contact</a>`);
});

test("prose that mentions a file name is not rewritten", () => {
  const html = `<p>Open about.html for the story.</p><a href="about.html">About</a>`;
  assert.equal(rewrite(html), `<p>Open about.html for the story.</p><a href="/site/about.html">About</a>`);
});
