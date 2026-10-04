# Event updates, attendance, calendars and waitlists

These tools use the existing email provider, ticket APIs and five-minute maintenance worker. No SMS account or new payment-provider credential is required. Deploy backend, client, rules and indexes together through the normal staging release.

## Before the first staging release

The release now deploys `firestore.indexes.json`. Grant the staging deployment service account **Cloud Datastore Index Admin** (`roles/datastore.indexAdmin`) in `pluto-staging-92eb7`; grant the production deployment account the same role in its own project before the production release. This is the [Firestore index-management role](https://firebase.google.com/docs/firestore/query-data/indexing). It belongs to the deployment account, not the website users. Wait until all new indexes show **Enabled** in Firestore before accepting the release. The emulator does not enforce composite indexes. Indexes deploy in a separate non-forced step, preserving cloud-only indexes and field overrides (including TTL settings). The coordinated function deployment retains its existing retry-policy acknowledgement. Index deletion requires a separate reviewed maintenance change.

Retain existing Resend/runtime secret permissions. Verify the scheduled maintenance function is enabled and System health has a recent successful heartbeat. Send controlled staging emails and follow their links before inviting testers. Local tests use synthetic data and never deliver real provider email.

## Announcements and email reminders

Open an event dashboard → **Announcements & reminders**. Write a heading and message, review the preview, then **Queue announcement emails**. Event managers can send updates; scanner PINs cannot. Retrying an uncertain response preserves the same immutable announcement attempt. The recent list reports queue progress, not confirmed delivery; email failures and delayed campaigns appear in System health.

Recipients are current confirmed admission-ticket holders and approved RSVP holders, once per email address per campaign. Transfers use the current holder address. Membership is checked again before sending: refunded/revoked tickets and stale contact addresses do not receive normal updates. A cancellation also reaches pending RSVP requesters. Guest lists contain names only; free walk-up events have no email audience. This feature does not add a marketing mailing list.

In **Ticketing setup → Reminders & waitlist**, enable/disable reminders, save and publish. Reminders default on and are scheduled approximately 24 hours and 4 hours before the published start. A two-hour catch-up window avoids sending a very late reminder after an outage. Publishing a changed start/end/timezone automatically queues a schedule update; marking an event cancelled queues cancellation information. Initial publication does not send a schedule-change campaign.

Schedule notices do not change admission windows on already issued passes. Those windows are preserved by the ticket ledger. Moving an event outside existing pass windows needs a separately controlled ticket reissue; sending an announcement alone does not make those passes valid on the new dates.

Scheduled private-location releases queue a notice when the reveal time arrives. Emails link to Pluto and include the public city/schedule only: exact private venue/directions, admission QR codes and PDF tickets are excluded. The public calendar is also safe to forward. Announcement text is plain escaped text; copying the configured private venue/address/directions into it is rejected. Staff still need to avoid manually describing confidential details using different wording.

Campaigns are deduplicated and tied to the current published schedule/location version. Old queued notices are cancelled when those details change. Background work processes bounded pages (50 events/campaigns and 25 attendee records per campaign per pass), so sending time depends on audience size, other jobs and provider availability. Large-event throughput needs staging load testing. There is no exact-minute delivery guarantee or SMS fallback. Inspect both the event panel and System health during rehearsals.

## Unified door attendance

Open **Door attendance** from the event dashboard or the PIN/account scanner. Ticket arrivals, approved RSVP arrivals, guest-list arrivals and free-event walk-ups share a recorded attendance view. Existing ticket scanning, manual order check-in and guest-list arrival controls record first admission. The new view records **exit** and **re-entry** against those first arrivals, with audited, versioned, idempotent actions. Re-entry cannot create a first admission or restore a revoked/refunded/unapproved pass.

For **Free event · Just show up**, use the walk-up counter to record first arrivals, exits and re-entry in groups of 1–500. Exits cannot exceed recorded inside; re-entry cannot exceed recorded outside. Count a returning person as re-entry to avoid inflating first arrivals. The counter does not collect identity or create tickets.

Scanner PINs remain scoped to one event and show attendance without order/payment details. Exit/re-entry and walk-up counts require connectivity. Offline first scans use the existing prepared-manifest procedure and appear in these totals after sync. **Recorded inside** depends on staff consistently recording exits and re-entry; it is not a measured venue-capacity guarantee. Historical refunded/removed attendees do not automatically count as physically leaving.

Attendance pages load up to 50 ticket and 50 guest records at a time; use **Load more attendees**. **Search shown attendees** searches the loaded pages. Aggregate totals cover all recorded arrivals, although separate reads during live scanning can briefly differ. Rehearse on real door phones and retain a wristband/capacity/outage procedure.

## Add to Calendar

Public event pages provide an ICS download and Google Calendar link. Branded confirmation/update emails include the public ICS link, and tickets in the Flutter app have **Add to Calendar**. Exported UTC start/end dates preserve the event timezone across daylight-saving changes and multi-day events. Calendar records contain a stable event ID, revision, public event link and cancellation state.

Private events export city/state and an instruction to open Pluto for the exact location, even after the reveal. Public venues can include the published address. Calendar downloads use the published projection, never an unpublished draft. These are one-time imports: publishing changes sends attendees an email but does not silently update their calendar. Users must import the updated event; calendar clients handle matching IDs differently. Apple/Android calendar import behavior still needs physical-device acceptance.

## Waitlists

Enable **waitlists** in Ticketing setup, choose a **15–120 minute** claim window (default 30), save and publish. Sold-out independent admission passes show a **Join waitlist** button. Dependent upgrades/add-ons, vehicle passes and free walk-up events do not have waitlists. Each offer is for one named admission pass, without promo codes.

Joining requires a matching verified account email or a six-digit email code. A join reserves no stock, collects no money and grants no QR. Browser storage keeps a scoped status/withdrawal key. A verified rejoin restores an active entry or places an expired/withdrawn entry at the end of the queue. Each event/pass/email has one entry. The current browser status card tracks the most recently joined pass; offer emails provide independent links for other joined passes.

The background worker offers available stock in join order for each pass. Approval-required RSVP entries must first be approved in the dashboard **Waitlist** panel; their approved queue is also ordered by join time. Approval alone does not consume capacity. Public buyers can still purchase unreserved stock before a maintenance pass offers it; FIFO applies among waitlist offers, not priority over all normal sales.

An offer holds capacity atomically and emails a private claim link. The customer opens it and explicitly chooses **Claim reserved spot**. Paid passes enter the normal Stripe checkout; the normal checkout reservation/payment expiry applies after claiming. Free/open RSVP passes are issued through the RSVP path, while approval-required RSVP claims preserve the prior organizer approval. No attendee is charged automatically. The claim link grants access to its named offer, so it should be kept private.

Expired, withdrawn, cancelled or materially edited offers cannot be claimed; maintenance releases their exact holds without releasing an overlapping purchase/new offer. Changed prices, admission windows, pool consumption or registration mode invalidate the old offer. Turning the waitlist off also invalidates outstanding claims and releases holds on maintenance. A customer whose offer expires can rejoin if the pass is still sold out. Admins can inspect queue status and approve requests; there is no staff queue-jumping control.

Waitlist scans are bounded to 100 offered/waiting records per rotating pass. Large queues and email congestion need load rehearsal. System health flags expired holds that remain unreleased. Token mappings, waitlist contacts, campaign jobs and door action audits are private API-only data; include them in the existing retention/backup policy. Their numeric expiry is enforced in code and is not a configured Firestore TTL policy.

## Acceptance checks

- Stage a private event, verify both calendar links and confirmation emails exclude the address, and import the ICS on an iPhone and Android phone.
- Queue one announcement; check current transferred holders, email delivery, duplicate retry and a bounced recipient. Change dates, cancel an event and test a scheduled location release.
- Sell out a small tier, join twice, release capacity, and claim an offer through real sandbox checkout. Check approval-required RSVP offers do not produce a QR before approval. Let a second offer expire and verify capacity returns.
- Use an event PIN to scan a ticket and guest, record exits/re-entry, and count a free-event group. Revoke the PIN and verify access closes. Repeat with an offline first-arrival queue and synchronize before relying on totals.
