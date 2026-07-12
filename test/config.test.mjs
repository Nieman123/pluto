import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const firebase = JSON.parse(await readFile("firebase.json", "utf8"));
const manifest = JSON.parse(await readFile("web/manifest.json", "utf8"));

test("Hosting exposes public SSR routes and Flutter deep links", () => {
  const rewrites = firebase.hosting.rewrites;
  assert.deepEqual(rewrites.slice(0, 2), [
    { source: "/app", destination: "/app/index.html" },
    { source: "/app/**", destination: "/app/index.html" },
  ]);
  for (const route of ["/", "/manafest", "/links"]) {
    const rewrite = rewrites.find((entry) => entry.source === route);
    assert.equal(rewrite.function.functionId, "publicSite");
    assert.equal(rewrite.function.region, "us-central1");
  }
});

test("legacy routes redirect beneath /app", () => {
  const redirects = new Map(
    firebase.hosting.redirects.map((entry) => [entry.source, entry.destination]),
  );
  assert.equal(redirects.get("/home"), "/");
  assert.equal(redirects.get("/profile"), "/app/profile");
  assert.equal(redirects.get("/shop"), "/app/shop");
  assert.equal(redirects.get("/scan-qr"), "/app/scan-qr");
  assert.equal(redirects.get("/admin/manafest"), "/app/admin/manafest");
});

test("Flutter web manifest is scoped to /app", () => {
  assert.equal(manifest.start_url, "/app/");
  assert.equal(manifest.scope, "/app/");
});
