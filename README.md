# Pluto Events

Pluto is the website and signed-in attendee app for Pluto Events. It supports public event discovery, the ManaFest festival guide, account profiles, Pluto Points, rewards, QR check-ins, festival updates, and administrative content management.

The repository intentionally contains two web surfaces:

| Surface | Technology | Routes | Purpose |
| --- | --- | --- | --- |
| Public site | Firebase Function, Express, Nunjucks, CSS, vanilla JavaScript | `/`, `/manafest`, `/links` | Fast, semantic, server-rendered pages for SEO and event discovery |
| Attendee app | Flutter web | `/app/**` | Authentication, dashboard, ManaFest hub, rewards, profiles, QR check-ins, and admin tools |

Production is hosted at [pluto.events](https://pluto.events).

## Architecture

Firebase Hosting serves a composed `dist/` directory and routes requests according to [firebase.json](firebase.json):

1. Static assets, `robots.txt`, `sitemap.xml`, the messaging service worker, and `404.html` are served directly by Hosting.
2. `/`, `/manafest`, and `/links` are rewritten to the second-generation `publicSite` Firebase Function in `us-central1`.
3. `/app` and `/app/**` are rewritten to the Flutter entry point at `dist/app/index.html`.
4. Legacy Flutter routes such as `/profile`, `/shop`, `/sign-on`, and `/admin/**` redirect to their `/app` equivalents.

The public Function reads active events and links from Firestore, normalizes and escapes the data, and renders complete HTML. Public HTML uses this CDN policy:

```text
Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300
```

Firestore edits can therefore take up to 60 seconds to appear publicly. If Firestore is temporarily unavailable, the Function logs the error and renders usable fallback content.

## Repository Layout

| Path | Responsibility |
| --- | --- |
| `lib/` | Flutter application, repositories, signed-in shell, admin tools, authentication, rewards, and ManaFest attendee experience |
| `web/` | Flutter web bootstrap, manifest, splash assets, root messaging service worker, and web-specific images |
| `site/` | Public-site JavaScript, CSS, static SEO files, and versioned ManaFest content |
| `functions/src/` | Express Function, Firestore normalization, SEO metadata, JSON-LD, and Nunjucks templates |
| `functions/scripts/` | Function asset copying, local preview server, and media migration tooling |
| `scripts/compose-web.mjs` | Combines public assets and the Flutter build into `dist/` |
| `assets/` | Shared Flutter artwork, event flyers, gallery images, logos, and local fonts |
| `docs/manafest-guide.md` | Editable Markdown copy of the ManaFest guide |
| `firestore.rules` | Firestore authorization rules |
| `storage.rules` | Public-image read rules and admin-only upload rules |
| `.github/workflows/build.yml` | Main-branch test, build, and Firebase deployment pipeline |

## Routes

### Public

| Route | Content |
| --- | --- |
| `/` | Event homepage with Firestore-backed current events and rotating gallery |
| `/manafest` | ManaFest landing page, festival guide, lineup flyer, principles, tickets, and applications |
| `/links` | Firestore-backed official links and member links |

### Flutter App

| Route | Content |
| --- | --- |
| `/app/` | Signed-in dashboard; signed-out users redirect to `/app/sign-on` |
| `/app/shop` | Pluto Points rewards and QR scan entry point |
| `/app/manafest` | Signed-in ManaFest guide, updates, lineup, and schedule surfaces |
| `/app/profile` | User profile and attendee stats |
| `/app/sign-on` | Sign-in and account access |
| `/app/sign-up` | Account creation page with email and Google authentication |
| `/app/scan-qr` | Standalone event QR check-in flow |
| `/app/admin/**` | Admin tools for ManaFest, events, rewards, links, and QR codes |

## Firebase Services

This project uses:

- Firebase Authentication for email/password and Google sign-in.
- Cloud Firestore for event, account, rewards, QR, links, and ManaFest content.
- Firebase Storage for public event flyers and links-page images.
- Firebase Cloud Messaging for web push notifications.
- Firebase Hosting for static assets, redirects, app rewrites, and CDN delivery.
- Cloud Functions for Firebase for server-rendered public HTML.

The Firebase web client configuration is intentionally committed because it identifies the public Firebase project; it is not an administrative credential. Service-account JSON and other private credentials must never be committed.

### Main Firestore Collections

| Collection | Purpose | Public visibility |
| --- | --- | --- |
| `currentEvents` | Homepage events, ticket links, ordering, and flyer media | Public read; admin write |
| `linksPageItems` | Links page sections, ordering, URLs, icons, and images | Public read; admin write |
| `userProfiles` | Profile details, Pluto Points, tiers, and attendance stats | Owner/admin read |
| `rewardItems` | Rewards shop inventory and point costs | Signed-in read |
| `eventQrCodes` | Event check-in codes, points, and claims | Signed-in claim flow; admin management |
| `adminUsers` | Admin authorization documents keyed by Firebase UID | Self-check only; no client writes |
| `manaFestSettings` | ManaFest publish controls | Signed-in read; admin write |
| `manaFestGuideSections` | Signed-in guide content | Active signed-in read; admin write |
| `manaFestUpdates` | Normal and urgent attendee updates | Active signed-in read; admin write |
| `manaFestScheduleItems` | Stage schedule for Main Stage and Renegade Stage | Published signed-in read; admin write |
| `manaFestArtists` | Hidden/publishable lineup records | Controlled by lineup publish settings |
| `manaFestMapPins` | Hidden/publishable map records | Controlled by map publish settings |

Nested profile collections store point transactions, redemption requests, and QR claim rate-limit state.

### Public Media

New admin uploads are written to:

```text
public/events/{eventId}/...
public/links/{linkId}/...
```

Storage rules allow public reads and admin-only writes. Uploads must use an image MIME type and cannot exceed 5 MB.

The app currently supports both Storage URLs and legacy Firestore data URLs:

- Events prefer `flyerImageUrl` and retain `flyerDataUrl` as a migration fallback.
- Links prefer `imageUrl` and retain `imageDataUrl` as a migration fallback.
- `flyerStoragePath` and `imageStoragePath` retain the underlying object path for future cleanup or replacement.

## Prerequisites

- Flutter stable with Dart `>=3.6.0 <4.0.0`
- Node.js 22
- npm
- Java 21 for Firebase emulator tests
- Firebase CLI
- Access to the `pluto-9b6ca` Firebase project for production operations
- Firebase Blaze billing for second-generation Functions and Hosting rewrites

The repository currently contains web support only. Native `ios/` and `android/` targets, signing, APNs/FCM configuration, app links, and store metadata are a separate app-store readiness phase.

## Initial Setup

Install all three dependency sets from the repository root:

```bash
npm ci
npm ci --prefix functions
flutter pub get
```

For Firebase CLI operations, authenticate with either `firebase login` or Application Default Credentials. CI uses the `FIREBASE_SERVICE_ACCOUNT_PLUTO_9B6CA` GitHub secret.

## Local Development

### Flutter App

Run Flutter web normally during app development:

```bash
flutter run -d chrome
```

Flutter's local development URL does not reproduce the production `/app/` Hosting prefix. Validate the production base path with a release build before merging routing changes.

### Complete Public-Site Preview

Build Flutter beneath `/app/`, compose the complete deployment directory, and start the preview server:

```bash
flutter build web --release --base-href /app/
npm run build:public
PUBLIC_SITE_PREVIEW=true npm --prefix functions run preview
```

The preview is available at [http://127.0.0.1:4173](http://127.0.0.1:4173). `PUBLIC_SITE_PREVIEW=true` uses deterministic fallback events and links instead of requiring Firestore credentials.

Without `PUBLIC_SITE_PREVIEW`, the local Function uses Firebase Admin default credentials and reads the configured Firestore project.

### Editing Public ManaFest Content

Public ManaFest copy lives in [site/content/manafest.json](site/content/manafest.json). The Function build copies this file into its runtime package. The attendee app also bundles the `festivalExperience` block from this file so the public and signed-in ManaFest pages share the same festival highlights, notices, and links. The crew-editable Markdown equivalent is [docs/manafest-guide.md](docs/manafest-guide.md).

Signed-in ManaFest content is managed separately through Firestore and the Flutter admin panel.

## Build

The production build has two required stages:

```bash
flutter build web --release --base-href /app/
npm run build:public
```

`npm run build:public`:

1. Bundles the small public JavaScript entry point with esbuild.
2. Compiles the TypeScript Firebase Function and copies templates/content into `functions/lib/`.
3. Recreates `dist/`.
4. Copies the Flutter build to `dist/app/`.
5. Copies public CSS, gallery media, fonts, SEO files, artwork, and the root messaging worker into `dist/`.

Generated `build/`, `dist/`, `site/dist/`, and `functions/lib/` directories are ignored by Git.

## Tests and Quality Checks

Run the public-site, Function, normalization, escaping, metadata, routing, and manifest tests:

```bash
npm test
```

Run Flutter analysis and tests:

```bash
flutter analyze .
flutter test
```

Run Firestore and Storage emulator-backed rule tests:

```bash
npx firebase-tools@latest emulators:exec \
  --project pluto-storage-rules-test \
  --only firestore,storage \
  "npm run test:storage"
```

Format touched Dart files before committing:

```bash
dart format path/to/file.dart
```

## Media Migration

The media migration uploads legacy event and link data URLs to Firebase Storage. It is idempotent and skips documents that already have a Storage-backed URL.

Always start with a dry run:

```bash
npm --prefix functions run migrate:media
```

Apply the migration only after reviewing the output:

```bash
npm --prefix functions run migrate:media -- --write
```

The script requires Firebase Admin credentials and leaves the legacy data URL fields intact for production verification.

## Deployment

Pushing to `main` starts [Build and Deploy (Main)](.github/workflows/build.yml). The workflow:

1. Installs Node 22, Java 21, Flutter, root dependencies, and Function dependencies.
2. Runs Node tests, Firebase rule tests, Flutter analysis, and Flutter tests.
3. Builds Flutter with `--base-href /app/`.
4. Composes the complete `dist/` directory.
5. Authenticates with the Firebase service account stored in GitHub Actions.
6. Enforces a seven-day Artifact Registry cleanup policy in `us-central1`.
7. Deploys Firestore rules, Storage rules, `publicSite`, and Hosting to `pluto-9b6ca`.

Deployment concurrency is enabled, so a newer `main` commit cancels an obsolete in-progress deployment.

For an intentional manual deployment, build `dist/` first and use the same targets as CI:

```bash
npx firebase-tools@latest deploy \
  --only firestore:rules,storage,functions:publicSite,hosting \
  --project pluto-9b6ca
```

Do not deploy Hosting before generating `dist/`.

## Operational Notes

- Public content can lag Firestore by up to 60 seconds because of CDN caching.
- The Function runs in `us-central1` with 256 MiB of memory and a maximum of 10 instances.
- Function container images older than seven days are removed automatically.
- The Firebase messaging service worker must remain available at `/firebase-messaging-sw.js`, outside the Flutter `/app/` scope.
- Public navigation from Flutter performs full browser navigation to `/`, `/manafest`, or `/links`.
- The Renegade Stage exists in schedule data, but its location remains hidden until map content is explicitly published.
- Unknown Hosting paths use the static `404.html`; unknown Function paths use the Nunjucks 404 template.

## Product and Design Context

[PRODUCT.md](PRODUCT.md) defines the product audience, brand personality, accessibility expectations, and interface principles. Pluto is designed mobile-first for attendees who may be outdoors, in low light, moving between stages, or using an inconsistent connection.

Public pages should remain semantic and useful without JavaScript. JavaScript on those routes is limited to progressive enhancements such as the mobile menu, five-second gallery rotation, and auth-aware navigation.
