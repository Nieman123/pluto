import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "app"), { recursive: true });
await mkdir(resolve(dist, "assets/images/social"), { recursive: true });

await cp(resolve(root, "build/web"), resolve(dist, "app"), { recursive: true });
await cp(resolve(root, "site/static"), dist, { recursive: true });
await cp(resolve(root, "site/dist/site.js"), resolve(dist, "assets/site.js"));
await cp(resolve(root, "web/gallery"), resolve(dist, "gallery"), { recursive: true });
await cp(resolve(root, "assets/fonts"), resolve(dist, "assets/fonts"), { recursive: true });
await cp(resolve(root, "web/firebase-messaging-sw.js"), resolve(dist, "firebase-messaging-sw.js"));
await cp(resolve(root, "web/favicon.png"), resolve(dist, "favicon.png"));
await cp(resolve(root, "web/pluto-preview.jpg"), resolve(dist, "assets/images/pluto-preview.jpg"));
await cp(
  resolve(root, "assets/experience/pluto-logo-public.webp"),
  resolve(dist, "assets/images/pluto-logo.webp"),
);
await cp(
  resolve(root, "assets/events/Mana-Fest-2026-Flyer-half.webp"),
  resolve(dist, "assets/images/manafest-flyer.webp"),
);
await cp(
  resolve(root, "assets/events/manafest-2026-lineup-v1.webp"),
  resolve(dist, "assets/images/manafest-lineup.webp"),
);

for (const name of ["email", "facebook", "instagram", "link", "tiktok"]) {
  await cp(
    resolve(root, `assets/home/constant/${name}.png`),
    resolve(dist, `assets/images/social/${name}.png`),
  );
}
