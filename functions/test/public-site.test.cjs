const assert = require("node:assert/strict");
const test = require("node:test");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { gzipSync } = require("node:zlib");
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
    googleAnalyticsId: "G-Y6GBW8P032",
    firebaseConfigJson: "{}",
    jsonLd: serializeJsonLd({ "@type": "MusicEvent" }),
  });

  assert.match(publicHtmlCacheControl, /s-maxage=60/);
  assert.match(html, /<h1[^>]*>ManaFest 2026<\/h1>/);
  assert.match(html, /What else can I do at Manafest\?/);
  assert.match(html, /Sunrise sound bath/);
  assert.match(html, /21\+ event/);
  assert.match(html, /Main Stage will be powered by BASSBOSS speakers/);
  assert.match(html, /Gate Times/);
  assert.match(html, /Thursday Early Arrival: 2–9 PM/);
  assert.match(html, /Friday and Saturday: 10 AM–9 PM/);
  assert.match(html, /Thursday Early Arrival pass is required/);
  assert.match(html, /leave and re-enter during the day/);
  assert.match(html, /Festival tickets are digital/);
  assert.match(html, /Car camping passes are also digital/);
  assert.match(html, /valid government-issued photo ID/);
  assert.match(html, /Food by In Woking Distance and/);
  assert.match(html, /No generators, please/);
  assert.match(html, /No glass/);
  assert.match(html, /No weapons/);
  assert.match(html, /No pets/);
  assert.match(html, /No campfires or grills/);
  assert.match(html, /Personal sound systems are allowed/);
  assert.match(
    html,
    /href="https:\/\/www\.instagram\.com\/pyro\.possum\/"/,
  );
  assert.match(
    html,
    /href="https:\/\/www\.instagram\.com\/banh\.gvl\/"/,
  );
  assert.match(html, /ManaFest principles/);
  assert.match(
    html,
    /<article class="guide-item" aria-labelledby="guide-item-1-title">/,
  );
  assert.match(html, /<h3 id="guide-item-1-title">/);
  assert.match(
    html,
    /<section class="action-band" aria-labelledby="applications-title">/,
  );
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /rel="canonical" href="https:\/\/pluto.events\/manafest"/);
  assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-Y6GBW8P032/);
  assert.match(html, /gtag\("config", "G-Y6GBW8P032"\)/);
});

test("day passes link to Posh with shared camping details below both options", () => {
  const content = JSON.parse(
    readFileSync(join(__dirname, "../lib/content/manafest.json"), "utf8"),
  );
  const env = nunjucks.configure(join(__dirname, "../lib/templates"), { autoescape: true });
  const html = env.render("manafest.njk", { manaFest: content, meta: {} });
  assert.match(html, /day passes are now available/);
  assert.doesNotMatch(html, /Online sales coming soon|Purchases are handled by Posh|Review the final total and fee breakdown/);
  assert.match(html, /href="#tickets">Compare passes/);
  assert.ok(html.includes(`href="${content.ticketUrl}" target="_blank" rel="noopener noreferrer">Get tickets`));
  assert.ok(html.includes(`href="${content.ticketUrl}" target="_blank" rel="noopener noreferrer">Get weekend passes`));
  assert.ok(html.indexOf('id="weekend-pass-title"') < html.indexOf('class="day-pass-options"'));
  const options = [...html.matchAll(/<article class="day-pass"[\s\S]*?<\/article>/g)];
  assert.equal(options.length, 2);
  for (const [index, [option]] of options.entries()) {
    const day = index === 0 ? "Friday" : "Saturday";
    assert.ok(option.includes(`${day} Day Pass`));
    assert.ok(option.includes(`${day}, September ${18 + index}, 2026`));
    assert.ok(option.includes(`${day}-night camping only`));
    assert.match(option, /\$60/);
    assert.match(option, /not a full-weekend pass/);
    assert.match(option, /aria-describedby="day-pass-camping"/);
    assert.doesNotMatch(option, /designated day parking lot/);
    assert.ok(option.includes(`href="${content.ticketUrl}" target="_blank" rel="noopener noreferrer" aria-label="View ${day} Day Pass on Posh">View on Posh</a>`));
  }
  const tickets = html.match(/<section class="section tickets-section"[\s\S]*?<\/section>/)[0];
  assert.equal(tickets.split(content.tickets.parking).length - 1, 1);
  assert.ok(tickets.indexOf('id="day-pass-camping"') > tickets.indexOf('id="day-pass-2-title"'));
  assert.match(tickets, /Parking is included in the ticket price/);
  assert.match(tickets, /Camping beside your vehicle is not included/);
});

test("homepage prioritizes its hero without embedding event media", () => {
  const templates = join(__dirname, "../lib/templates");
  const env = nunjucks.configure(templates, { autoescape: true });
  const html = env.render("home.njk", {
    path: "/",
    events: [
      {
        title: "Subterranea",
        details: "Underground sound in Asheville.",
        flyerImageUrl: "/assets/images/pluto-preview.jpg",
        ticketUrl: "https://tickets.example.com",
        isManaFest: false,
      },
    ],
    meta: {
      title: "Pluto Events",
      description: "Underground events in Asheville.",
      canonical: "https://pluto.events/",
      image: "https://pluto.events/assets/images/pluto-preview.jpg",
    },
    googleAnalyticsId: "G-Y6GBW8P032",
    firebaseConfigJson: "{}",
    jsonLd: serializeJsonLd({ "@type": "Organization" }),
  });

  assert.doesNotMatch(html, /data:image\//);
  assert.match(html, /rel="preload" as="image" href="\/gallery\/1\.webp"/);
  assert.match(html, /src="\/gallery\/1\.webp"[^>]*fetchpriority="high"/);
  assert.match(
    html,
    /id="home-gallery" role="group" aria-roledescription="carousel"/,
  );
  assert.match(
    html,
    /aria-label="Previous photo" aria-controls="home-gallery"/,
  );
  assert.match(
    html,
    /role="status" aria-live="polite" aria-atomic="true"/,
  );
  assert.match(
    html,
    /<article class="event-card" aria-labelledby="event-1-title">/,
  );
  assert.match(html, /<h3 id="event-1-title">Subterranea<\/h3>/);
  assert.match(
    html,
    /class="brand footer-brand" href="\/" aria-label="Pluto Events home"/,
  );
  assert.match(html, /data-deferred-src="\/assets\/images\/pluto-preview\.jpg"/);
  assert.doesNotMatch(html, /<link rel="stylesheet" href="\/assets\/site\.css">/);
  assert.ok(gzipSync(html).byteLength < 10_000);
});

test("link collections expose native list and navigation semantics", () => {
  const templates = join(__dirname, "../lib/templates");
  const env = nunjucks.configure(templates, { autoescape: true });
  const html = env.render("links.njk", {
    path: "/links",
    groupedLinks: {
      Social: [
        {
          title: "Instagram",
          url: "https://www.instagram.com/plutopresents/",
          imageUrl: "",
          isImageCircular: false,
        },
      ],
    },
    meta: {
      title: "Links | Pluto Events",
      description: "Find Pluto online.",
      canonical: "https://pluto.events/links",
      image: "https://pluto.events/assets/images/pluto-preview.jpg",
    },
    firebaseConfigJson: "{}",
  });

  assert.match(html, /<ul class="link-list">/);
  assert.match(html, /<li>\s*<a class="link-row"/);
  assert.match(html, /href="\/links" aria-current="page">Links<\/a>/);
});
