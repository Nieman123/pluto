import type { DocumentData, QueryDocumentSnapshot, Timestamp } from "firebase-admin/firestore";

export const publicHtmlCacheControl =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=300";

export interface PublicEvent {
  id: string;
  title: string;
  details: string;
  ticketUrl: string;
  flyerImageUrl: string;
  isManaFest: boolean;
  sortOrder: number;
  updatedAtMs: number;
}

export interface PublicLink {
  id: string;
  title: string;
  url: string;
  sectionHeading: string;
  sectionOrder: number;
  sortOrder: number;
  isImageCircular: boolean;
  imageUrl: string;
  icon: string;
}

export const defaultLinks: PublicLink[] = [
  {
    id: "instagram",
    title: "INSTAGRAM",
    url: "https://instagram.com/pluto.events.avl/",
    sectionHeading: "",
    sectionOrder: 0,
    sortOrder: 2,
    isImageCircular: false,
    imageUrl: "/assets/images/social/instagram.png",
    icon: "music",
  },
  {
    id: "facebook",
    title: "FACEBOOK",
    url: "https://www.facebook.com/people/Pluto-Events/100095100467395/",
    sectionHeading: "",
    sectionOrder: 0,
    sortOrder: 3,
    isImageCircular: false,
    imageUrl: "/assets/images/social/facebook.png",
    icon: "people",
  },
  {
    id: "tiktok",
    title: "TIKTOK",
    url: "https://www.tiktok.com/@pluto.events",
    sectionHeading: "",
    sectionOrder: 0,
    sortOrder: 4,
    isImageCircular: false,
    imageUrl: "/assets/images/social/tiktok.png",
    icon: "music",
  },
  {
    id: "just-nieman-instagram",
    title: "JUST NIEMAN",
    url: "https://www.instagram.com/justnieman/",
    sectionHeading: "PLUTO MEMBERS ON INSTAGRAM",
    sectionOrder: 1,
    sortOrder: 0,
    isImageCircular: true,
    imageUrl: "https://i.imgur.com/5I4TqyV.jpg",
    icon: "person",
  },
  {
    id: "divine-thud-instagram",
    title: "DIVINE THUD",
    url: "https://www.instagram.com/divine_thud_/",
    sectionHeading: "PLUTO MEMBERS ON INSTAGRAM",
    sectionOrder: 1,
    sortOrder: 1,
    isImageCircular: true,
    imageUrl: "https://i.imgur.com/FiHtYq3.jpeg",
    icon: "person",
  },
];

const fallbackEvent: PublicEvent = {
  id: "manafest-2026",
  title: "ManaFest 2026",
  details: "September 18-20, 2026 · Three Creeks Campground · Anderson, SC",
  ticketUrl: "https://posh.vip/e/manafest-2026",
  flyerImageUrl: "/assets/images/manafest-flyer.webp",
  isManaFest: true,
  sortOrder: 0,
  updatedAtMs: 0,
};

export const fallbackEvents: PublicEvent[] = [fallbackEvent];

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") return Number.parseInt(value, 10) || 0;
  return 0;
}

function timestampMs(value: unknown): number {
  const timestamp = value as Timestamp | undefined;
  return typeof timestamp?.toMillis === "function" ? timestamp.toMillis() : 0;
}

export function safeExternalUrl(value: unknown): string {
  const candidate = asString(value);
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    return ["https:", "http:", "mailto:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

export function safeImageUrl(value: unknown): string {
  const candidate = asString(value);
  if (candidate.startsWith("/")) return candidate;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(candidate)) {
    return candidate;
  }
  return safeExternalUrl(candidate);
}

export function isManaFestTitle(title: string): boolean {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "").startsWith("manafest");
}

export function normalizeEvent(id: string, data: DocumentData): PublicEvent | null {
  if (data.isActive === false) return null;
  const title = asString(data.title) || "Upcoming Event";
  const isManaFest = isManaFestTitle(title);
  const flyerImageUrl =
    safeImageUrl(data.flyerImageUrl) ||
    safeImageUrl(data.flyerDataUrl) ||
    (isManaFest ? "/assets/images/manafest-flyer.webp" : "");
  return {
    id,
    title,
    details: asString(data.details),
    ticketUrl: safeExternalUrl(data.ticketUrl),
    flyerImageUrl,
    isManaFest,
    sortOrder: asInt(data.sortOrder),
    updatedAtMs: timestampMs(data.updatedAt) || timestampMs(data.createdAt),
  };
}

export function sortEvents(events: PublicEvent[]): PublicEvent[] {
  return [...events].sort((a, b) => a.sortOrder - b.sortOrder || b.updatedAtMs - a.updatedAtMs);
}

function iconName(codePoint: number): string {
  const known: Record<number, string> = {
    57415: "ticket",
    57948: "document",
    57378: "music",
    57935: "person",
  };
  return known[codePoint] ?? "link";
}

export function mergeLinks(
  docs: Array<{ id: string; data: DocumentData }>,
): PublicLink[] {
  const merged = new Map(defaultLinks.map((item) => [item.id, item]));
  for (const doc of docs) {
    const current = merged.get(doc.id);
    const data = doc.data;
    if (data.isDeleted === true) {
      merged.delete(doc.id);
      continue;
    }
    if (data.isActive === false) {
      merged.delete(doc.id);
      continue;
    }
    const assetPath = asString(data.assetImagePath);
    const assetName = assetPath.split("/").pop();
    const assetImageUrl = assetName ? `/assets/images/social/${assetName}` : "";
    merged.set(doc.id, {
      id: doc.id,
      title: asString(data.title) || current?.title || "Link",
      url: safeExternalUrl(data.url) || current?.url || "",
      sectionHeading: asString(data.sectionHeading) || current?.sectionHeading || "",
      sectionOrder: data.sectionOrder == null ? current?.sectionOrder ?? 0 : asInt(data.sectionOrder),
      sortOrder: data.sortOrder == null ? current?.sortOrder ?? 0 : asInt(data.sortOrder),
      isImageCircular: data.isImageCircular == null
        ? current?.isImageCircular ?? false
        : data.isImageCircular === true,
      imageUrl:
        safeImageUrl(data.imageUrl) ||
        safeImageUrl(data.imageDataUrl) ||
        assetImageUrl ||
        current?.imageUrl ||
        "",
      icon: iconName(asInt(data.iconCodePoint)) || current?.icon || "link",
    });
  }
  return [...merged.values()]
    .filter((item) => item.url)
    .sort(
      (a, b) =>
        a.sectionOrder - b.sectionOrder ||
        a.sortOrder - b.sortOrder ||
        a.title.localeCompare(b.title),
    );
}

export function docsForLinks(
  docs: QueryDocumentSnapshot<DocumentData>[],
): Array<{ id: string; data: DocumentData }> {
  return docs.map((doc) => ({ id: doc.id, data: doc.data() }));
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
