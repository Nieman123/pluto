import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const firebase = JSON.parse(await readFile("firebase.json", "utf8"));
const manifest = JSON.parse(await readFile("web/manifest.json", "utf8"));
const firebaseOptions = await readFile("lib/firebase_options.dart", "utf8");
const appEntryPoint = await readFile("lib/main.dart", "utf8");
const manaFestPage = await readFile("lib/manafest_page.dart", "utf8");
const publicSiteEntryPoint = await readFile("site/src/site.js", "utf8");
const flutterWebShell = await readFile("web/index.html", "utf8");
const flutterBootstrap = await readFile("web/flutter_bootstrap.js", "utf8");

for (const lockfile of ["package-lock.json", "functions/package-lock.json"]) {
  test(`${lockfile} excludes vulnerable gRPC versions`, async () => {
    const lock = JSON.parse(await readFile(lockfile, "utf8"));
    const grpcPackages = Object.entries(lock.packages).filter(([path]) =>
      path.endsWith("node_modules/@grpc/grpc-js"),
    );
    assert.ok(grpcPackages.length > 0, "Expected the Firebase gRPC dependency");
    for (const [path, { version }] of grpcPackages) {
      assert.match(version, /^\d+\.\d+\.\d+$/);
      const [major, minor, patch] = version.split(".").map(Number);
      // GHSA-m9gg-hp2v-232j and GHSA-f596-whhp-79r4: fixes in 1.13.6 / 1.14.5.
      const patched = major > 1 || (major === 1 && (
        minor > 14 || (minor === 14 && patch >= 5) || (minor === 13 && patch >= 6)
      ));
      assert.ok(patched, `${path}@${version} must include both security fixes`);
    }
  });
}

test("lockfiles exclude vulnerable Busboy versions", async () => {
  for (const lockfile of ["package-lock.json", "functions/package-lock.json"]) {
    const lock = JSON.parse(await readFile(lockfile, "utf8"));
    const busboyPackages = Object.entries(lock.packages).filter(([path]) =>
      path.endsWith("node_modules/@fastify/busboy"),
    );
    if (lockfile.startsWith("functions/")) {
      assert.ok(busboyPackages.length > 0, "Expected Firebase Admin's Busboy dependency");
    }
    for (const [path, { version }] of busboyPackages) {
      assert.match(version, /^\d+\.\d+\.\d+$/);
      const [major, minor, patch] = version.split(".").map(Number);
      // GHSA-xjh9-v7x6-24jw / GHSA-x8mw-p69m-v3mx (3.2.1),
      // plus GHSA-gxm5-99cw-xjw9 (3.2.2).
      assert.ok(major > 3 || (major === 3 && (minor > 2 || (minor === 2 && patch >= 2))),
        `${lockfile}: ${path}@${version} must include all three security fixes`);
    }
  }
});

test("Hosting exposes public SSR routes and Flutter deep links", () => {
  assert.equal(firebase.hosting.appAssociation, 'NONE', 'Hosting must serve our association instead of auto-generating an empty one');
  const rewrites = firebase.hosting.rewrites;
  assert.deepEqual(rewrites.slice(0, 4), [
    { source: "/.well-known/apple-app-site-association", function: { functionId: "publicSite", region: "us-central1" } },
    { source: "/.well-known/assetlinks.json", function: { functionId: "publicSite", region: "us-central1" } },
    { source: "/app", destination: "/app/index.html" },
    { source: "/app/**", destination: "/app/index.html" },
  ]);
  for (const route of ["/", "/manafest", "/links", "/rentals", "/manafest-waiver", "/manafest-waiver/**"]) {
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
  assert.equal(redirects.get("/admin/rentals"), "/app/admin/rentals");
});

test("Flutter web manifest is scoped to /app", () => {
  assert.equal(manifest.start_url, "/app/");
  assert.equal(manifest.scope, "/app/");
});

test("Flutter web routes use the Pluto Google Analytics property", () => {
  assert.match(firebaseOptions, /measurementId: 'G-Y6GBW8P032'/);
  assert.match(appEntryPoint, /FirebaseAnalytics\.instance\.logScreenView/);
  assert.match(appEntryPoint, /'\/app\$path'/);
});

test("web accessibility activates without forcing Flutter semantics", () => {
  assert.doesNotMatch(appEntryPoint, /ensureSemantics\(\)/);
  assert.match(publicSiteEntryPoint, /event\.key !== "Escape"/);
  assert.match(publicSiteEntryPoint, /restoreFocus: true/);
  assert.doesNotMatch(flutterWebShell, /user-scalable=no/);
  assert.doesNotMatch(flutterWebShell, /maximum-scale=/);
  assert.match(flutterWebShell, /<html lang="en">/);
  assert.doesNotMatch(flutterWebShell, /id="flutter-app"/);
  assert.match(flutterBootstrap, /initializeEngine\(\)/);
  assert.doesNotMatch(flutterBootstrap, /hostElement/);
  assert.match(
    flutterBootstrap,
    /addEventListener\("flutter-first-frame", removeSplashOnFirstFrame/,
  );
  assert.match(
    flutterBootstrap,
    /requestAnimationFrame\(\(\) => \{\s*requestAnimationFrame\(removeSplashOnFirstFrame\)/,
  );
  assert.match(flutterBootstrap, /window\.removeSplashFromWeb\?\.\(\)/);
  assert.match(manaFestPage, /linkUrl: Uri\.tryParse\(item\.url\)/);
});
