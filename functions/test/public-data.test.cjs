const assert = require("node:assert/strict");
const test = require("node:test");
const nunjucks = require("nunjucks");
const {
  mergeLinks,
  normalizeEvent,
  safeExternalUrl,
  safeImageUrl,
  serializeJsonLd,
  sortEvents,
} = require("../lib/public-data.js");

test("URL validation accepts approved schemes and rejects executable URLs", () => {
  assert.equal(safeExternalUrl("javascript:alert(1)"), "");
  assert.equal(safeExternalUrl("ftp://example.com/file"), "");
  assert.equal(safeExternalUrl("mailto:crew@pluto.events"), "mailto:crew@pluto.events");
  assert.equal(safeImageUrl("data:text/html;base64,abc"), "");
  assert.equal(safeImageUrl("data:image/png;base64,abc"), "");
  assert.equal(safeImageUrl("mailto:crew@pluto.events"), "");
  assert.equal(safeImageUrl("/assets/image.webp"), "/assets/image.webp");
});

test("event normalization filters inactive records and prefers Storage URLs", () => {
  assert.equal(normalizeEvent("off", { isActive: false }), null);
  const event = normalizeEvent("event", {
    title: "Mana Fest 2026",
    flyerImageUrl: "https://cdn.example.com/flyer.webp",
    flyerDataUrl: "data:image/png;base64,old",
    sortOrder: "2",
    updatedAt: { toMillis: () => 99 },
  });
  assert.equal(event.flyerImageUrl, "https://cdn.example.com/flyer.webp");
  assert.equal(event.isManaFest, true);
  assert.equal(event.sortOrder, 2);
  assert.equal(event.updatedAtMs, 99);
});

test("event normalization never embeds legacy flyer data in public HTML", () => {
  const event = normalizeEvent("legacy", {
    title: "Subterranea",
    flyerDataUrl: "data:image/jpeg;base64,legacy-payload",
  });
  assert.equal(event.flyerImageUrl, "/assets/images/pluto-preview.jpg");
});

test("events sort by explicit order and then newest update", () => {
  const sorted = sortEvents([
    { id: "a", sortOrder: 1, updatedAtMs: 10 },
    { id: "b", sortOrder: 0, updatedAtMs: 1 },
    { id: "c", sortOrder: 1, updatedAtMs: 20 },
  ]);
  assert.deepEqual(sorted.map((event) => event.id), ["b", "c", "a"]);
});

test("links merge active Firestore overrides with defaults", () => {
  const links = mergeLinks([
    { id: "instagram", data: { title: "PLUTO IG", sortOrder: 8 } },
    { id: "facebook", data: { isDeleted: true } },
    {
      id: "tickets",
      data: {
        title: "TICKETS",
        url: "https://tickets.example.com",
        sectionHeading: "Tickets",
        sectionOrder: -1,
      },
    },
  ]);
  assert.equal(links.some((item) => item.id === "facebook"), false);
  assert.equal(links.find((item) => item.id === "instagram").title, "PLUTO IG");
  assert.equal(links[0].id, "tickets");
});

test("template autoescaping and JSON-LD serialization prevent markup injection", () => {
  const env = new nunjucks.Environment(undefined, { autoescape: true });
  const html = env.renderString("<h1>{{ title }}</h1>", {
    title: '<script>alert("x")</script>',
  });
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /&lt;script&gt;/);
  assert.equal(serializeJsonLd({ value: "</script>" }).includes("<"), false);
});
