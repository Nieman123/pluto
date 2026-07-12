import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

if (!getApps().length) initializeApp();

const write = process.argv.includes("--write");
const db = getFirestore();
const bucket = getStorage().bucket();

function parseDataUrl(value) {
  if (typeof value !== "string") return null;
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/is.exec(value.trim());
  if (!match) return null;
  return { contentType: match[1], bytes: Buffer.from(match[2], "base64") };
}

function extension(contentType) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  return "jpg";
}

async function migrateCollection({ collection, dataField, urlField, pathField, directory }) {
  const snapshot = await db.collection(collection).get();
  let eligible = 0;
  let migrated = 0;

  for (const document of snapshot.docs) {
    const data = document.data();
    if (typeof data[urlField] === "string" && data[urlField].trim()) continue;
    const image = parseDataUrl(data[dataField]);
    if (!image) continue;
    if (image.bytes.length > 5 * 1024 * 1024) {
      console.warn(`${collection}/${document.id}: skipped because image exceeds 5 MB`);
      continue;
    }
    eligible += 1;
    const path = `public/${directory}/${document.id}/migration.${extension(image.contentType)}`;
    console.log(`${write ? "migrating" : "would migrate"} ${collection}/${document.id} -> ${path}`);
    if (!write) continue;

    const token = randomUUID();
    await bucket.file(path).save(image.bytes, {
      resumable: false,
      contentType: image.contentType,
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    });
    const encodedPath = encodeURIComponent(path);
    const downloadUrl =
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
    await document.ref.update({ [urlField]: downloadUrl, [pathField]: path });
    migrated += 1;
  }

  console.log(`${collection}: ${eligible} eligible, ${migrated} migrated`);
}

await migrateCollection({
  collection: "currentEvents",
  dataField: "flyerDataUrl",
  urlField: "flyerImageUrl",
  pathField: "flyerStoragePath",
  directory: "events",
});
await migrateCollection({
  collection: "linksPageItems",
  dataField: "imageDataUrl",
  urlField: "imageUrl",
  pathField: "imageStoragePath",
  directory: "links",
});

if (!write) console.log("Dry run complete. Pass --write to apply changes.");
