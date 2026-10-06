# Pluto codebase review — October 6, 2026

Reviewed source baseline: `3929799f642ab1154f56f9927f93aed765afd70f` on `main`.

Implementation follow-up: R1–R3 are addressed in the worker-recovery change: immediate durable campaign continuations, reminder/location expiry, independent budgeted recovery lanes, durable manual retries and independent health checks. Source regressions include a 1,000-person audience, duplicate/abandoned workers, uncertain delivery, interrupted pages and a stalled email provider. See [operations and staging acceptance](ticketing-operations.md). The original findings below describe the audited baseline; deployed trigger behavior and provider throughput still require staging acceptance. R4–R6 remain open.

Assessment: functional beta, with substantial payment, access-control, admission and release safeguards. Continue controlled staging testing. The most concrete remaining weaknesses are time-sensitive communication delivery, worker recovery under load, key rotation, and an unresolved production approval constraint. This review does not establish production readiness.

## Scope and evidence

Reviewed the website/event editor, Flutter configuration and ticket client/storage, Functions ticketing services, rewards and waiver boundaries, Firestore/Storage rules, dependency manifests, release policy and readiness documentation. This was a broad source review, not an exhaustive penetration test or live load test.

Fresh checks:

- Functions production dependency audit: zero high/critical findings; eight moderate dependency entries tracing to one underlying UUID advisory.
- Local, network-free probes using production service methods and fake database records: an event that ended yesterday still produces a pending “starts in approximately 4 hours” email; a QR signed with the old key fails verification under a replacement key; the same scanner PIN produces a different database lookup after rotation; production policy rejects self-approval.
- Campaign throughput and maintenance timeout findings follow directly from scheduler/page/timeout limits. No cloud throughput measurement was performed.

The existing required CI covers Flutter analysis/tests, unit tests, access rules, emulator integrations and browser regressions. Its successful result for the reviewed baseline is useful evidence; the complete suite was not rerun for this documentation-only review. Cloud deployment, alert routing, backups and restore behavior were not reverified here.

## Prioritized findings

### R1 — P1 for time-sensitive announcements: campaign delivery is too slow at festival scale

`functions/src/ticketing/communications.ts:91` calls `campaignPage` once per selected pending campaign. Its query at line 101 reads only 25 ticket records. `functions/src/ticketing/workers.ts:15` runs maintenance every five minutes; there is no separate campaign continuation worker.

For 500 distinct eligible ticket holders, the last page cannot be queued until about 95 minutes after the first page; for 1,000, about 195 minutes. Initial scheduling delay, other campaigns and provider latency add to that. This affects announcements, cancellations and private-location notices as well as reminders. The in-app location reveal itself does not depend on email delivery.

Recommendation: preserve recipient deduplication and provider idempotency, but give campaigns durable continuations with bounded concurrent work and an explicit delivery deadline. Test a representative festival-size campaign, including retries and a provider outage.

### R2 — P2: delayed reminders remain eligible after the event ends

`functions/src/ticketing/communications.ts:126` rechecks the campaign version and recipient eligibility, but never compares an event reminder with the current time. The message stores relative “24 hours” or “4 hours” text when the campaign is created. A service-method probe confirmed that an otherwise valid ticket for an event that ended yesterday still generates the four-hour reminder.

Recommendation: store notification deadlines and cancel obsolete reminders before their first provider attempt; prefer the actual event date/time over frozen relative wording. Preserve the existing payload/idempotency guarantees for uncertain sends rather than silently changing a message on retry. Location notifications also need an appropriate expiry.

Correction to the previous incident note: version/recipient checks suppress certain superseded or ineligible notices, but they do not currently suppress reminders solely because the event has passed.

### R3 — P2: maintenance has more potential work than its execution budget

`functions/src/ticketing/operations.ts:401` processes order reconciliation, refunds, webhooks, waitlists, campaigns, checkout follow-ups and up to 100 email jobs sequentially. Individual email requests can take 20 seconds (`operations.ts:372`), while the whole scheduled function has a 540-second timeout (`workers.ts:15`). A sufficiently slow pending-email batch alone can exceed that budget, before counting payment work.

The recent per-email exception isolation is valuable, but it cannot prevent a process timeout. Individual email creation triggers help normal delivery; this finding concerns backlog recovery and scheduled work under slow dependencies.

Recommendation: give each maintenance phase a time budget and resumable cursor, and isolate payment recovery from communication delivery. Exercise slow-provider and accumulated-backlog scenarios, not just healthy single-order tests.

### R4 — P2: there is no graceful signing-key rotation path

`functions/src/ticketing/config.ts:25` loads one key; verification at line 40 accepts only that key. Credentials have no key identifier. `functions/src/ticketing/operations.ts:20` also derives scanner PIN lookup hashes from the ticket signing private key. Offline preparation proofs use the same signing configuration.

Rotating this secret therefore rejects previously displayed/cached QRs and changes the lookup for existing scanner PINs. Refreshed online tickets can receive new signatures, but this is disruptive during an event and especially for offline devices.

Recommendation: use versioned keys and a planned verification overlap for routine rotation; separate PIN lookup secrets from ticket signing. Document emergency revocation separately, and rehearse rotation and key restoration with cached tickets and prepared scanners.

### R5 — P2 as order history grows: dashboard reads are unbounded

The event index asks for revenue (`site/src/ticketing/editor.js:126`). `functions/src/ticketing/catalog.ts:34` loads all accessible events and every order for each event to calculate their revenue, including historical events. The per-event orders method (`functions/src/ticketing/orders.ts:688`) also returns the entire event order collection. The newer all-orders view already has bounded pagination.

Recommendation: maintain reconciliable daily/event revenue summaries and paginate event orders. Filter archived/current event collections on the server so opening the current-events dashboard does not repeatedly read the complete order history.

### R6 — production release blocker if the repository still has one maintainer

`scripts/release/policy.mjs:42` requires an environment reviewer, disallows self-review and disallows administrator bypass. `scripts/release/prepare.mjs:14` enforces it for production. This is intentional protection, but conflicts with the earlier solo-maintainer setup: a release initiated by the sole eligible reviewer cannot receive that person's approval.

Recommendation: decide before the first production release whether to add another eligible reviewer or explicitly adopt a reviewed solo-maintainer release policy. Retain required CI, the exact successful staging revision and environment isolation. No protection settings were changed during this review; current GitHub reviewer membership was not rechecked.

## Other improvements

- **Dependencies:** the remaining moderate findings originate in [UUID buffer bounds handling](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq), propagated through Google/Firebase SDK packages. They are not eight separate vulnerabilities, and this review did not demonstrate an exploitable Pluto call path. Plan a tested SDK dependency update rather than forcing a major upgrade automatically.
- **Native application scope:** `lib/firebase_options.dart:25` explicitly rejects installed Android/iOS configurations, and `lib/ticketing_repository.dart:21` defaults non-web clients to the production API origin. Flutter web/PWA testing does not establish App Store/Play Store readiness. Before native releases, add environment-specific Firebase options and API endpoints and test on actual devices.
- **Maintainability:** the service inheritance chain is `Catalog → Orders → Guests → Rsvps → Waitlists → Support → Door → Communications → Operations`. Together with loosely typed database records, this makes distant dependencies easy to miss. Gradually introduce typed record decoders and focused services; a full rewrite is unnecessary.
- **Device acceptance:** CI installs Chromium. Include real iPhone Safari/PWA and Android Chrome tests for authentication, purchasing, camera scanning, cached ticket reloads and interrupted-network door operation.
- **Operational acceptance:** verify deployed proxy/IP rate-limit behavior, external failure alerts, missed scheduler alerts, delivery tracking, backups and a restore rehearsal using the existing operations guides. Their documentation is not proof that cloud acceptance has passed.
- **Readiness tracking:** retain historical checkpoints, but keep one short current checklist with owner, status, tested revision and evidence. Avoid treating an older source fix or a written setup guide as verification of deployed behavior.

Suggested work order: R1/R2 communication delivery, R3 backlog recovery, production approval decision and operational rehearsal, R4 rotation, then R5 dashboard scaling. Native application work can remain a separate milestone while the website/PWA is tested.

## Playful product ideas

- **Cosmic passport:** each successful admission stamps a different artist-designed planet into the attendee's Pluto passport. A season of shows becomes a constellation.
- **Secret transmission:** turn the existing scheduled venue reveal into a mission countdown and an animated transmission inside the ticket, respecting the existing holder-only access rules.
- **Crew constellation:** an opt-in group of friends gets one star per person, lighting up when each checks in. Show arrival only to that consenting group, without continuous location tracking.
- **Alien customs:** let attendees choose a silly space alias or avatar. A successful scan can briefly show it alongside the actual holder name and ticket type; keep the QR itself clear and scanner feedback fast.
- **Afterglow tickets:** after the event, transform the ticket's decorative area into a collectible poster with a playlist, lineup and memories. Admission state remains authoritative and separate from the keepsake.

The cosmic passport and afterglow ticket are particularly good first experiments: they make repeated attendance feel special without complicating checkout or door decisions.
