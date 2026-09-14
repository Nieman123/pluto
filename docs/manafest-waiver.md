# ManaFest electronic waiver

## Implemented routes and infrastructure

- `/manafest-waiver`: accessible server-rendered waiver, attendee fields, three independent unchecked acknowledgments, pointer signature and typed alternative.
- `/manafest-waiver/staff`: staff shell. Every access check, search and download requires a current Firebase ID token and an existing `adminUsers/{uid}` document. Signing in as an ordinary attendee does not grant access.
- `/manafest-waiver/original.pdf`: the unmodified blank paper form, safe for public download.
- `/manafest-waiver/api/**`: POST-only JSON operations through the existing `publicSite` Function and Firebase Hosting. Secrets and personal data are never placed in URLs.

The existing Express/Nunjucks public framework, Firebase Authentication, Cloud Firestore, Cloud Storage, hosting rewrites and CI deployment are reused. No separate signing vendor, email service, tracking, identity uploads or medical questions were added. The project has no suitable outbound-email integration; the UI explicitly tells attendees to download their copy.

## Source of truth and legal review

The user-provided `ManaFest_2026_Attendee_Waiver.pdf` is copied byte-for-byte to `functions/src/waiver/legal/`. Its SHA-256 is `4c0e8fd35af4bc2f6d252f6bac3bfab044e89c4f8b2b051268227dd4960debb2`.

`waiver.txt` contains the complete PDF text, including headings, form labels and footer. Its UTF-8 SHA-256 is `29bccc05099af4e5c330e4ed3ec2b4fce1fe4d070f51fe2e700ff874f5f0c634`. The webpage reflows whitespace only. An automated test compares every source word, in order, with the rendered legal article. The original PDF is retained as the first page of every signed PDF, including its original typography and emphasis. Additional pages identify the electronic signature and the signing record. The original paper labels are not filled in or silently rewritten.

**Added electronic-signing wording requires legal review separately from the original waiver.** The source waiver is unchanged. The new wording is in `functions/src/waiver/document.ts`, version `electronic-consent-2026-09-14-v1`:

1. “I confirm that I am at least 21 years old.”
2. “I have read and understand the complete waiver above, agree to its terms, and sign voluntarily.”
3. “I consent to use an electronic signature and receive an electronic record of this waiver. I intend my drawn or typed signature to be my signature on this agreement.”

The accompanying disclosure is:

> Electronic signing is optional. You may instead sign a paper waiver at event check-in. To sign online, you need a browser with JavaScript and the ability to open and save a PDF. After submission, download and keep your signed PDF; no email copy is sent. You may choose paper signing any time before you submit. Signing does not purchase a ticket or guarantee entry.

Have counsel review these additions and their suitability for this process before publishing. No certification, verified identity, legal guarantee, or equivalence to a commercial electronic-signature provider is asserted. The document hashes identify content; they are not cryptographic signatures by the attendee.

## Saving, privacy, and recovery

The browser creates a random 256-bit receipt secret and retains it in memory only. Its SHA-256 identifies the record; the secret itself is not stored server-side. It is submitted in a POST body and acts as a private attendee download credential. Confirmation numbers are random UUIDs prefixed with `MF26-`; a confirmation number alone cannot download an attendee record.

The backend reserves one immutable record per receipt secret in `manafestWaivers`. It stores the exact submitted values, serialized signature vectors or typed signature, accepted acknowledgments and their exact wording, electronic-consent disclosure/version, full original waiver text/version, source-PDF hash, text hash, request hash, unique confirmation, and server-generated UTC signing timestamp. Signature vectors are serialized as JSON because Firestore disallows nested arrays.

The original PDF is archived at `private/waiverVersions/{sourcePdfHash}.pdf`. Signed PDFs live at `private/waivers/{confirmationId}.pdf`. Creation-only Storage preconditions prevent retry overwrites. The backend reads the saved PDF back, hashes it, and only then marks the record completed. A pending record never appears as a completed waiver and cannot be downloaded. Downloads verify the saved PDF hash.

Retries with the same receipt and payload reuse the original record, timestamp, waiver snapshot and confirmation, including after a later deployment changes the waiver. A changed payload with an existing receipt is rejected. On an uncertain network or server failure, the browser freezes the original attempt and offers retry. Only explicit validation rejection unlocks editing. Refreshing or closing an uncertain attempt loses the in-memory receipt: staff should search for completion before asking the attendee to sign again. Duplicate signatures from separate browser sessions are possible; there is no claim that this verifies attendee identity or enforces one signature per human.

Existing Firestore and Storage catch-all rules deny direct reads, lists and writes to these private paths even for staff clients. Staff access goes through the server only. No public Storage URLs or signed download URLs are generated. Waiver pages, APIs and PDFs use `private, no-store`, no-referrer, frame denial, and noindex headers. Analytics are disabled on the waiver and staff pages. Both HTML forms use POST even if their JavaScript cannot run.

Staff searches are case-insensitive prefixes of a full legal name, email, or confirmation number; up to 25 completed results appear. Narrow a query when there are more matches. There is no public roster or bulk export. Staff search/download audit events in `waiverAccessLog` contain staff UID, server time and action; download events include the confirmation. Search terms are not logged.

## Abuse limits and operations

JSON requests are size-limited to 180 KB; field lengths, phone/email format, signature coordinates/complexity and all consent booleans are validated on the server. Cross-origin submissions are denied, including direct function requests with unapproved origins. A honeypot provides an additional bot signal. Firestore transactions enforce hourly limits per server-observed network address: 120 submission attempts, 180 attendee downloads and 600 staff authorization requests. Only an hourly hash of the address is stored, separate from signing records; raw addresses and user-agent fingerprints are not collected.

The existing Function is capped at eight concurrent requests per instance to bound PDF-generation memory use. These are baseline abuse controls, not a guarantee against distributed bots. Check the server-observed address behavior through Firebase Hosting during production smoke testing and tune limits for shared campground networks if needed. Do not trust arbitrary client-supplied forwarded-address headers.

Enable automatic expiry for `waiverRateLimits.expiresAt` in the existing Firestore database. This is housekeeping, not a prerequisite for correct enforcement; old counters are never reused:

```sh
gcloud firestore fields ttls update expiresAt \
  --collection-group=waiverRateLimits --enable-ttl --project=pluto-9b6ca
```

No TTL is applied to signed records, archived source PDFs or staff access logs. Agree on a retention/deletion policy with the organizer and counsel and use existing backup controls. Pending records can be investigated by an authorized backend operator; do not mark them completed manually without the matching PDF. The paper alternative requires the event team to bring forms and store completed paper records privately.

## Local preview and tests

Use fictional details only. No production credentials are required. Firebase emulators must be running; the preview does not fake successful saving when they are unavailable.

```sh
npm ci
npm ci --prefix functions
# Requires the project's normal Flutter build under build/web first.
npm run build:public
firebase emulators:start --project demo-pluto-waiver \
  --only auth,firestore,storage --config firebase.waiver-preview.json \
  --import=tmp/waiver-emulator-data --export-on-exit=tmp/waiver-emulator-data
# Omit --import on the first run.
# In another terminal:
node scripts/waiver/seed-preview.cjs
npm run preview:waiver
```

Open `http://127.0.0.1:4173/manafest-waiver`. The preview sets the demo project and all three local emulator endpoints explicitly. It displays a test-only banner. On the preview staff page, “Sign in as preview staff” uses the fictional account seeded above, through the local Firebase Authentication emulator. This button is absent outside emulator mode and also requires a loopback hostname and a connected auth emulator. The browser tests additionally create isolated emulator-only identities to verify nonstaff denial and revocation. Production staff use their existing Pluto sign-in.

Run these checks with the emulators running:

```sh
npm test
export GCLOUD_PROJECT=demo-pluto-waiver
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
export WAIVER_STORAGE_BUCKET=demo-pluto-waiver.appspot.com
mkdir -p tmp/pdfs
npm run test:waiver:integration
npm run test:waiver:rules
# Browser test uses an installed Google Chrome by default.
npm run test:waiver:browser
```

The browser test covers desktop mouse input, mobile touch input, typed-signature matching, empty/unchecked inputs, a server save followed by a lost response, unchanged retry payloads, confirmation, PDF downloads, unauthenticated/nonstaff denial, authorized staff search/download, access revocation, no tracking requests and horizontal overflow. It runs automated WCAG A/AA accessibility checks. This is browser-based mobile emulation, not a claim of testing on physical iPhones or Android devices.

The integration test also injects a Storage outage and failure of the final Firestore completion transaction, exercises concurrent retries, verifies PDF hashes, and tests server-side validation and rate limits. Firebase rule tests prove private records cannot be read/listed/written directly by anonymous users, attendees or staff. Outputs/screenshots are confined to ignored `tmp/`.

## Before publishing

1. Review the added electronic consent above; the original waiver remains unchanged.
2. Confirm the deployed `publicSite` service identity has access to Firestore and read/create access to the existing private Storage bucket, `pluto-9b6ca.appspot.com`. The existing CI deployment credentials are reused. Do not grant public bucket access or add Firebase download tokens. No new external-service keys are required.
3. Confirm the intended check-in staff already have `adminUsers/{uid}` entries. This implementation intentionally grants the same existing administrator role access; it does not introduce a new role or authorize users automatically.
4. Enable rate-counter TTL housekeeping and decide record retention. Bring paper forms to check-in.
5. Build using the existing production workflow, then deploy only after publication approval. Run a production smoke test with an authorized staff account to confirm Hosting rewrites, real service permissions, caching headers, successful save/download and nonstaff denial. Local emulators do not verify production IAM, DNS or deployed Firebase configuration.

Nothing in this change has been published. No production attendee data has been created or modified during verification.

## Dependency-review limitation

Installation reported existing backend dependency advisories. A fresh online `npm audit` was rejected by automatic approval review because it would transmit the project's package names and versions to npm. Local cached advisory results from September 14, 2026 identify an existing high-severity advisory for `fast-xml-parser@5.10.0`, reached through Firebase Admin's Storage client, plus existing moderate backend advisories. The parser warning concerns repeated DOCTYPE declarations resetting entity-expansion limits. This change does not accept XML from attendees. The existing backend versions were retained; no clean dependency-audit claim is made. Review these existing dependencies before launch. The new PDF libraries were not identified in the cached warnings, which is not a substitute for a fresh full audit.
