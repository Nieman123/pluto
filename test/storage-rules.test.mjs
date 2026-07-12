import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "pluto-storage-rules-test",
    firestore: { rules: await readFile("firestore.rules", "utf8") },
    storage: {
      rules: await readFile("storage.rules", "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.clearStorage();
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "adminUsers", "admin"), {
      role: "admin",
    });
    await uploadBytes(
      ref(context.storage(), "public/events/existing/flyer.png"),
      new Uint8Array([1, 2, 3]),
      { contentType: "image/png" },
    );
  });
});

after(async () => environment?.cleanup());

test("public media can be read anonymously", async () => {
  const context = environment.unauthenticatedContext();
  const bytes = await getBytes(
    ref(context.storage(), "public/events/existing/flyer.png"),
  );
  assert.equal(bytes.byteLength, 3);
});

test("anonymous writes are denied", async () => {
  const context = environment.unauthenticatedContext();
  await assert.rejects(
    uploadBytes(
      ref(context.storage(), "public/events/new/flyer.png"),
      new Uint8Array([1]),
      { contentType: "image/png" },
    ),
  );
});

test("admins can upload valid images", async () => {
  const context = environment.authenticatedContext("admin");
  await uploadBytes(
    ref(context.storage(), "public/links/new/image.webp"),
    new Uint8Array([1, 2]),
    { contentType: "image/webp" },
  );
});

test("invalid MIME types and oversized files are denied", async () => {
  const context = environment.authenticatedContext("admin");
  await assert.rejects(
    uploadBytes(
      ref(context.storage(), "public/links/new/file.txt"),
      new Uint8Array([1]),
      { contentType: "text/plain" },
    ),
  );
  await assert.rejects(
    uploadBytes(
      ref(context.storage(), "public/links/new/large.png"),
      new Uint8Array(5 * 1024 * 1024 + 1),
      { contentType: "image/png" },
    ),
  );
});
