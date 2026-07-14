import { readFileSync } from "node:fs";
import { join } from "node:path";
import compression from "compression";
import express, { type Request, type Response } from "express";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import nunjucks from "nunjucks";
import {
  docsForLinks,
  fallbackEvents,
  mergeLinks,
  normalizeEvent,
  publicHtmlCacheControl,
  serializeJsonLd,
  sortEvents,
  type PublicEvent,
  type PublicLink,
} from "./public-data";

if (!getApps().length) initializeApp();

const db = getFirestore();
const runtimeRoot = __dirname;
const templates = join(runtimeRoot, "templates");
const googleAnalyticsId = "G-Y6GBW8P032";
const manaFest = JSON.parse(
  readFileSync(join(runtimeRoot, "content/manafest.json"), "utf8"),
) as Record<string, unknown>;

const app = express();
app.use(compression());
const env = nunjucks.configure(templates, { autoescape: true, noCache: true });
env.express(app);
app.set("view engine", "njk");

async function loadEvents(): Promise<PublicEvent[]> {
  if (process.env.PUBLIC_SITE_PREVIEW === "true") return fallbackEvents;
  try {
    const snapshot = await db.collection("currentEvents").get();
    const events = snapshot.docs
      .map((doc) => normalizeEvent(doc.id, doc.data()))
      .filter((event): event is PublicEvent => event !== null);
    return events.length ? sortEvents(events) : fallbackEvents;
  } catch (error) {
    console.error("Unable to load currentEvents", error);
    return fallbackEvents;
  }
}

async function loadLinks(): Promise<PublicLink[]> {
  if (process.env.PUBLIC_SITE_PREVIEW === "true") return mergeLinks([]);
  try {
    const snapshot = await db.collection("linksPageItems").get();
    return mergeLinks(docsForLinks(snapshot.docs));
  } catch (error) {
    console.error("Unable to load linksPageItems", error);
    return mergeLinks([]);
  }
}

function pageMeta(path: string) {
  if (path === "/manafest") {
    return {
      title: "ManaFest 2026 | Pluto Events",
      description: manaFest.description,
      canonical: "https://pluto.events/manafest",
      image: "https://pluto.events/assets/images/manafest-flyer.webp",
    };
  }
  if (path === "/links") {
    return {
      title: "Pluto Events Links",
      description: "Tickets, social channels, artists, and official Pluto Events links.",
      canonical: "https://pluto.events/links",
      image: "https://pluto.events/assets/images/pluto-preview.jpg",
    };
  }
  return {
    title: "Pluto Events | Underground Events in Asheville",
    description: "Underground parties, camping festivals, and special events from Pluto Events.",
    canonical: "https://pluto.events/",
    image: "https://pluto.events/assets/images/pluto-preview.jpg",
  };
}

function commonContext(path: string) {
  const firebaseConfig = {
    apiKey: "AIzaSyBLv7MumBOjUHpmAUiu9nLfhWvwmAYKorE",
    appId: "1:763906028056:web:c1261eba96f8b0c792896d",
    messagingSenderId: "763906028056",
    projectId: "pluto-9b6ca",
    authDomain: "pluto-9b6ca.firebaseapp.com",
    storageBucket: "pluto-9b6ca.appspot.com",
    measurementId: googleAnalyticsId,
  };
  return {
    path,
    meta: pageMeta(path),
    googleAnalyticsId,
    firebaseConfigJson: serializeJsonLd(firebaseConfig),
  };
}

app.use((request, response, next) => {
  response.set("Cache-Control", publicHtmlCacheControl);
  response.set("Content-Type", "text/html; charset=utf-8");
  next();
});

app.get("/", async (_request: Request, response: Response) => {
  const events = await loadEvents();
  const jsonLd = serializeJsonLd([
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Pluto Events",
      url: "https://pluto.events/",
      logo: "https://pluto.events/assets/images/pluto-logo.webp",
      sameAs: [
        "https://instagram.com/pluto.events.avl/",
        "https://www.facebook.com/people/Pluto-Events/100095100467395/",
        "https://www.tiktok.com/@pluto.events",
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Pluto Events",
      url: "https://pluto.events/",
    },
  ]);
  response.render("home", { ...commonContext("/"), events, jsonLd });
});

app.get("/manafest", (_request: Request, response: Response) => {
  const jsonLd = serializeJsonLd({
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: manaFest.name,
    description: manaFest.description,
    startDate: `${manaFest.startDate}T00:00:00-04:00`,
    endDate: `${manaFest.endDate}T23:59:59-04:00`,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    image: ["https://pluto.events/assets/images/manafest-flyer.webp"],
    location: {
      "@type": "Place",
      name: manaFest.venue,
      address: {
        "@type": "PostalAddress",
        addressLocality: manaFest.locality,
        addressRegion: manaFest.region,
        addressCountry: "US",
      },
    },
    offers: {
      "@type": "Offer",
      url: manaFest.ticketUrl,
      availability: "https://schema.org/InStock",
    },
    organizer: {
      "@type": "Organization",
      name: "Pluto Events",
      url: "https://pluto.events/",
    },
  });
  response.render("manafest", { ...commonContext("/manafest"), manaFest, jsonLd });
});

app.get("/links", async (_request: Request, response: Response) => {
  const links = await loadLinks();
  const groupedLinks = links.reduce<Record<string, PublicLink[]>>((groups, link) => {
    const heading = link.sectionHeading || "Pluto online";
    (groups[heading] ??= []).push(link);
    return groups;
  }, {});
  response.render("links", {
    ...commonContext("/links"),
    groupedLinks,
    jsonLd: serializeJsonLd({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Pluto Events",
      url: "https://pluto.events/",
    }),
  });
});

app.use((_request: Request, response: Response) => {
  response.status(404).render("404", {
    ...commonContext("/404"),
    jsonLd: "",
  });
});

export { app };
export const publicSite = onRequest(
  { region: "us-central1", memory: "256MiB", maxInstances: 10 },
  app,
);
