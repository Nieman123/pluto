const assert = require("node:assert/strict");
const test = require("node:test");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const nunjucks = require("nunjucks");
const {
  publicHtmlCacheControl,
  serializeJsonLd,
} = require("../lib/public-data.js");

test("ManaFest source is complete without client-side rendering", () => {
  const templates = join(__dirname, "../lib/templates");
  const content = JSON.parse(
    readFileSync(join(__dirname, "../lib/content/manafest.json"), "utf8"),
  );
  const env = nunjucks.configure(templates, { autoescape: true });
  const html = env.render("manafest.njk", {
    path: "/manafest",
    manaFest: content,
    meta: {
      title: "ManaFest 2026 | Pluto Events",
      description: content.description,
      canonical: "https://pluto.events/manafest",
      image: "https://pluto.events/assets/images/manafest-flyer.webp",
    },
    firebaseConfigJson: "{}",
    jsonLd: serializeJsonLd({ "@type": "MusicEvent" }),
  });

  assert.match(publicHtmlCacheControl, /s-maxage=60/);
  assert.match(html, /<h1[^>]*>ManaFest 2026<\/h1>/);
  assert.match(html, /Around the festival/);
  assert.match(html, /Sunrise sound bath/);
  assert.match(html, /21\+ event/);
  assert.match(
    html,
    /href="https:\/\/www\.instagram\.com\/pyro\.possum\/"/,
  );
  assert.match(
    html,
    /href="https:\/\/www\.instagram\.com\/banh\.gvl\/"/,
  );
  assert.match(html, /ManaFest principles/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /rel="canonical" href="https:\/\/pluto.events\/manafest"/);
});
