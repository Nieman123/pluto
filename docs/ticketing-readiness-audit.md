# Pluto readiness audit — October 3, 2026

## Event engagement and door checkpoint — October 4, 2026

Recommendations 4–7 now include email announcements/reminders, schedule/cancellation/location notices, unified door arrivals and audited exits/re-entry, free-event walk-up counts, public/app/email calendar links, and verified waitlists with expiring capacity reservations and approval-aware RSVP claims. This extends the earlier checkpoints; the original audit below remains historical evidence.

Local validation covers reservation races/expiry, queue deduplication, current-holder targeting, private-calendar/email filtering, approval gates and PIN scope. Deployed email delivery, index activation, physical calendar imports and gate/load rehearsals remain acceptance gates. Before staging deployment, grant the dedicated deployer `roles/datastore.indexAdmin`; the release now includes the required composite indexes. See [operation limits and acceptance checklist](event-engagement-and-door-tools.md).


Audited application revision: `a6aa9f6` on `native-ticketing`.

## Operations and attendee access checkpoint — October 4, 2026

Health diagnostics, manager support corrections/recovery/RSVP reopening, guest RSVP email proof, and offline attendee snapshots are implemented. See [operations and acceptance instructions](ticketing-operations.md). The health dashboard includes bounded queue/issuance checks, safe original-job retries, structured critical logs and maintenance timestamps. Resend delivery tracking is opt-in; its endpoint secret and Cloud Monitoring notification routing still require setup in each environment. A log alert template is included, but external alerts, scheduler absence monitoring, backups and restore rehearsal remain launch gates.

Previously loaded web tickets can now survive an offline app reload; account caches clear on identity changes and refreshes replace revoked admission. Native guest access uses a persistent secure-storage adapter rather than process-only memory. Actual installed Android/iOS builds and device acceptance remain unverified; offline gate preparation retains the existing staff procedure. These changes do not establish readiness for public paid sales or deploy anything to production.

Local validation: 76 Functions/root tests, 32 Flutter tests, clean analysis and a release web build; four support/delivery-signature tests, 21 admission/payment hardening tests and five wallet/location access tests in demo emulators; existing RSVP/order/free-event/rules suites; seven focused Chromium suites covering mobile health/support, offline reload and refund invalidation, RSVP email proof/approval, wallet recovery, orders, account checkout/navigation, location reveal and free events. Provider delivery and installed-device behavior still need deployed acceptance.

## Remediation checkpoint — October 3, 2026

The findings below describe the original audited revision. All eight source remediations are now implemented on `native-ticketing` and verified locally: A8 (`1bb5721`), A1/A2/A4/A7 (`fcda6bc`), A3 (`75e7ccf`), A5 (`4e9fe11`) and A6 (`86ac8e1`). **A3's deployed proxy acceptance is still open**, as are the external launch gates. These local changes have not been deployed to production. The readiness decision remains **functional beta / prelaunch**; the next milestone is a controlled staging/pilot acceptance run.

- A1: provider ownership is resolved from authoritative objects; relevant unresolved events remain pending, unrelated events are explicitly ignored. Admission is held during refund/dispute reconciliation, including before first issuance, and maintenance revisits paid orders.
- A2: provider tax setup is validated before reservation. Definite first-request rejection releases stock; uncertain outcomes retain it. Customer cancellation does not create a payment session. Managers can resolve a known rejected/unsent request or an authoritative expired/paid Session, with an audit note; an empty provider search cannot release uncertain stock.
- A3: explicit proxy-address/subnet configuration replaces implicit assumptions; forged prefixes are ignored after the nearest untrusted peer. Minute network bursts use distributed counters; client/account, event, contact, order and PIN limits remain distinct. An HTTP emulator regression passes 75 purchasers, 45 RSVPs and 15 recovery requests on one simulated network while repeated contact/client activity is rejected. See [deployed acceptance procedure](ticketing-proxy-acceptance.md); no cloud topology or throughput claim follows from this local test.
- A4: wallet entries load independently. Revoked holder credentials are removed; order history and temporary failures retain access with recovery/retry guidance. Chromium covers valid tickets beside refunded/retransferred access and transient failures.
- A5: signed event/staff preparation leases and per-item proofs bound recorded admission times. Replay retains original ticket/guest timestamps and checks current revocations and versions. Managers can import revoked/late queues and confirm or reject with ledger updates and an audit record; invalid credentials cannot be restored. Eight emulator regressions and the scanner/guest-list Chromium suite pass. See [offline admission procedure](ticketing-offline-admission.md); physical-phone rehearsal remains open.
- A6: authenticated server transactions compute claims and reward costs, debit balances/inventory and write immutable logs with durable retry receipts. Direct balance/attendance/claim/counter/ledger forgeries are denied by rules, and ordinary users cannot list all event QR codes. The app uses these APIs; its shop reports the authoritative cost. Seven service/HTTP regressions, three negative-rule contexts, three Flutter retry tests and the real app shop/QR browser flow pass. See [deployment and historical balance review](rewards-security.md); preexisting client-written balances must be reviewed before economically valuable rewards.
- A7: unknown fees are stored separately from confirmed zero; repeat verification updates finances without issuing tickets again. Dashboard proceeds are labeled provisional while fees or financial reviews remain unresolved, and unmapped provider refunds are included in refund totals.
- A8: terminal refund status cannot regress, and completion validates ticket allocations and ledger bounds. Deterministic overlapping-worker and lost-response tests assert exactly-once money and stock updates.

Checkpoint validation: 21 demo-emulator ticketing hardening tests and seven rewards service/HTTP tests; existing ticketing and RSVP integration suites; three private-ticketing and three rewards rule contexts; 18 Flutter tests; clean Flutter analysis; wallet, scanner/guest-list, RSVP approval and rewards Chromium regressions; 30 Functions tests and eight configuration/reporting tests; TypeScript, site and release Flutter web builds. Payment tests use a controlled provider substitute. Real Stripe/Resend delivery, deployed proxy identity, phone gate rehearsals and bank/live setup remain acceptance gates.

Current readiness: the hardened web implementation is suitable for controlled sandbox acceptance. Public paid sales still require real payment/refund/webhook and email verification, bank/live/tax/policy setup, staging proxy/load checks and monitoring/restore procedures. Offline gate use needs a physical-phone rehearsal and one offline lane. Installed-app persistence remains incomplete. Existing production rewards remain vulnerable until the migrated backend/client/rules are deployed together; existing balances are not retroactively attested by the new rules. Rate counters now carry timestamp TTL fields, but cloud TTL policies still need configuration.

Order operations update: `/tickets/admin` now links an administrator-only All Orders view with bounded cursor pages and search/event/status filters. Each event retains a titled order list. Shared order details show buyer/payment/refund history, current holders and individual admission controls; manual check-in uses the QR ledger and records a staff audit entry. Local emulator and Chromium regressions cover separate arrivals, retries/concurrency, scanner duplicates, transferred-holder display, RSVP/payment/refund restrictions, role isolation, filters/deep links and mobile accessibility. Per-event order queries, global event revenue aggregation and admission manifests still load full event sets; this addition does not close the broader scale/load acceptance item.

Release safeguards update: PR and merge-queue validation, emulator browser CI, pinned Actions/CLI versions and manual staging/production releases are implemented. Staging targets the newly created `pluto-staging-92eb7` project; Flutter, SSR sign-in, uploads, notification configuration and worker links now use environment-specific Firebase settings. Staging rejects production settings/live payments and disables Analytics, wallet exports and Flutter push prompts. Production preflight requires reviewer protections and completed staging release evidence for the exact selected SHA; read-only deployment smoke checks verify project/revision and public configuration. See [setup, acceptance and rollback instructions](staging-and-releases.md). **Cloud environment variables/secrets, Auth/Firestore/Storage setup, GitHub environment/branch protections and a successful deployed staging acceptance run remain open.** These source safeguards do not establish that those external settings have been applied or that live ticket sales are ready.

Local release-safeguard validation: 41 Functions tests and 16 root/configuration/financial/release-policy tests passed; repository-wide Flutter analysis is clean and 22 Flutter tests passed. Demo and synthetic staging web builds succeeded. All eight CI browser suites passed across focused runs, covering the editor/customer wallet, wallet error isolation, scanner PIN/guest list, RSVP approval, account checkout, order operations, rewards and scheduled location reveal. Ticketing transaction/hardening/order/RSVP integrations, ticketing/rewards access rules, Storage/rental rules and waiver integration/privacy rules passed on demo emulators. Workflow syntax passed actionlint. The normal demo preview was rebuilt and restored. GitHub-hosted execution, real staging deployment and external provider acceptance are still unverified.

## Historical readiness decision at the audited revision

**Functional beta / prelaunch.** The event editor, public pages, ticketing configuration, customer web wallet, RSVP approval, guest list, scanner PINs and core transaction safeguards are implemented and have meaningful automated coverage. Controlled sandbox testing is appropriate. Public paid sales and complete replacement of POSH need the fixes and acceptance gates below.

| Use | Assessment |
| --- | --- |
| Event creation, page design and internal demonstrations | Ready for continued use in the isolated preview |
| Sandbox ticketing and RSVP rehearsals | Ready for controlled testing; include the failure scenarios below |
| Small real free-RSVP event | Pilot candidate after wallet/rate-limit fixes, verified email delivery, gate rehearsal and production setup |
| Public paid ticket sales | Hold until payment reconciliation, stock recovery, financial reporting and provider acceptance pass |
| Festival admission during network loss | Requires offline replay fix and physical-device rehearsal; one offline lane remains a design constraint |
| Installed iOS/Android guest ticket wallet | Incomplete; current verification is for Flutter web |
| Complete POSH replacement | Payments v1 is substantial; operations and deferred features remain |

This review examines source, rules, deployment configuration, dependencies and automated behavior. Cloud account readiness, live secret provisioning, bank/payout status, deployed proxy behavior, production backups and provider delivery were not established by this local audit.

## Verified strengths

- Server computes prices, promotion allocations and capacity consumption; browser values cannot override amounts. Reservations and fulfillment are transactional, with provider idempotency and durable webhook intake.
- Ticket credentials are signed and versioned. Online admission accepts the first scan once; transfer/refund/withdrawal invalidates admission credentials. Customer emails contain app links rather than ticket QR/PDF attachments.
- Pending approval RSVPs create no tickets, QR codes, stock holds or private venue access. Approval checks capacity transactionally. Scanner PINs cannot approve RSVPs or access financial/admin endpoints.
- Private ticketing collections and draft media are API-only, including for ordinary Firebase admins. Event content is sanitized, templates autoescape, public projections omit private venue and payment configuration, and private routes use no-store/no-referrer headers.
- Draft revisions prevent conflicting saves; publication is explicit. Guest-list edits and arrivals retain audit records. PIN revocation is checked inside admission transactions.

## Findings to address before the relevant launch

Priority **P1** means a release-blocking defect for the affected operation. **P2** means a material weakness or missing operational capability. “Confirmed” means reproduced locally; deployment risks and unverified external behavior are labeled separately.

### A1 — P1: Financial webhooks can be lost before order linkage

**Confirmed in the demo emulator with a controlled Stripe substitute.** A `refund.created` event can arrive before fulfillment stores the order's PaymentIntent ID. The worker cannot find the order but marks the inbox entry `done`. A subsequent `charge.refunded` event carrying the correct order metadata also finishes because refund reconciliation returns early without the saved PaymentIntent. Later paid-Session verification issues a valid ticket without reconciling the existing refund. The probe produced a fully refunded provider payment, an internal refund amount of zero and an accepted ticket scan. The same unresolved-order path also applies to disputes.

Evidence: `functions/src/ticketing/operations.ts:240–262`, `functions/src/ticketing/orders.ts:172–217`. Maintenance scans unsettled orders, not all paid financial states (`operations.ts:299`). Stripe explicitly does not guarantee [webhook event ordering](https://docs.stripe.com/webhooks#event-ordering).

Fix: resolve ownership through authoritative PaymentIntent/Charge metadata; retain unresolved relevant events for retry/review rather than completing them; reconcile refunds/disputes during fulfillment and periodic paid-order reconciliation. Add refund/dispute-before-fulfillment regression tests, including Dashboard refunds without Pluto refund metadata. Unrelated account events should be explicitly classified as ignored rather than retried forever.

### A8 — P1: Concurrent refund workers can apply one refund twice locally

**Confirmed with two overlapping workers and one provider refund ID.** Both workers can read a pending refund before calling Stripe. The first finishes successfully; the delayed second then unconditionally writes `status: processing`, undoing the terminal status. `finishRefund()` now processes the record again, doubling `refundedAmount` and reopening unused stock twice. The probe refunded one of two paid tickets: the local refund total became twice the original order amount and pool sold count became zero while the other ticket remained valid. Stripe idempotency prevents a second provider refund, but does not protect these internal state changes.

Evidence: `functions/src/ticketing/operations.ts:118–171`, especially the unconditional update at line 144. API calls, webhook reconciliation and scheduled maintenance can all invoke this processor.

Fix: make terminal refund states monotonic with a transaction/conditional update, use an explicit processing lease if needed, and ensure ledger/stock application is exactly once regardless of worker overlap. Add deterministic concurrent-worker and crash-retry tests asserting both money and inventory.

### A2 — P1: Definitive setup failures leave reserved inventory stranded

**Confirmed.** Checkout reserves inventory before validating provider tax rates. An inactive manual tax rate fails before any Session is created but leaves the order provisioning and stock held. After the four-minute recovery threshold, no matching Session means permanent review with the hold retained. Customer cancellation also calls provisioning, so there is no working cancellation path for this failed setup case. Repeated failed purchases can exhaust availability.

Evidence: `functions/src/ticketing/orders.ts:79–95`, `orders.ts:114–126`, `orders.ts:231–242`.

Fix: preflight definitive configuration errors before reserving stock, distinguish requests never sent to Stripe from uncertain provider outcomes, and provide an audited safe resolution path. Preserve holds for genuinely uncertain payments; do not release them on an arbitrary timeout. Test recovery after repairing tax configuration and after provider permission failures.

### A3 — P1: Proxy identity and shared-network rate limits need correction

**Confirmed application configuration; deployed impact needs staging verification.** The Express app has `trust proxy=false`, and different forwarded client addresses resolve to the same socket IP in the audit probe. The API uses `req.ip` for anonymous limits: 60 checkout attempts/hour, 30 RSVP submissions/hour, 10 recovery requests/hour and 40 scanner logins/hour. Behind Hosting/Functions proxies this risks grouping unrelated visitors. Even with a correct client IP, attendees sharing venue Wi-Fi can hit those limits.

Evidence: `functions/src/index.ts:50`, `functions/src/ticketing/routes.ts:104–124`, `functions/src/ticketing/operations.ts:55–60`, `functions/src/ticketing/catalog.ts:22–28`. [Express proxy guidance](https://expressjs.com/en/guide/behind-proxies/) requires matching trust configuration to the actual proxy path; blindly trusting caller-controlled forwarded headers permits evasion.

Fix: verify trusted client identity on deployed staging, configure the actual trusted proxy path, and combine suitable per-session/account/event limits with IP burst protection. Rehearse many people behind one network and verify PIN brute-force protection remains effective. Current rate counters also create a shared Firestore transaction hot spot per identity/hour.

### A4 — P1: One invalid saved transfer can block the customer wallet

**Confirmed in Chromium using API-response substitutes.** A guest wallet with both a valid saved order and a revoked saved transfer receives `409` from the holder endpoint. `_wallet()` handles only `403/404` per saved entry, so it aborts the whole load and the other valid ticket is not displayed. Refunds and retransfers can produce this condition. A transient failure of one historical entry can also stop the full wallet load.

Evidence: `lib/tickets_page.dart:122–180`, `functions/src/ticketing/orders.ts:344–346`.

Fix: isolate errors per wallet item; handle terminal revoked/expired holder credentials without hiding valid tickets; show item-level warnings for transient failures. Add a valid-plus-refunded/retransferred-wallet browser regression. Keep financial order history available rather than treating every failure as grounds to delete it.

### A5 — P1 for offline admission: Replay uses sync time instead of admission time

**Confirmed.** The door client records `deviceTime` in its durable queue, but the route does not pass it to the scan service. The server checks `Date.now()` against the ticket window. An admission made offline before closing is rejected as `outside-window` if synchronized after closing, leaving no accepted admission on the ticket. Conflict notes record review but do not resolve the admission ledger. Guest arrival has the same sync-time behavior, with a separate six-hour grace window.

Evidence: `site/src/ticketing/admission.js:186–228`, `functions/src/ticketing/routes.ts:133,160`, `functions/src/ticketing/orders.ts:355–374`, `functions/src/ticketing/guests.ts:44–62`.

Fix: design an authenticated offline replay protocol with a prepared lease/manifest identity, bounded recorded times and manager resolution of legitimate late sync. Do not simply trust arbitrary client timestamps. Test replay after sales/admission close, lease expiry, PIN revocation, transfer/refund and event cancellation. If this is deferred, require online scanning and a documented manual fallback for the first pilot.

### A6 — P1 for the rewards system: Users can forge their own points

**Confirmed in the rules emulator. Existing app weakness outside the native ticketing ledger.** `knownProfileKeys()` includes `pointsBalance`, `lifetimePoints` and `eventsAttended`, and self-writes are allowed for those keys without authoritative transaction checks. A normal authenticated user changed their own balance from zero to one million and attendance to 1,000. This undermines reward eligibility. Client-writable points transaction and claim-rate records provide additional weak boundaries.

Evidence: `firestore.rules:33–48,215–244`, `lib/user_profile_repository.dart:456–568,570–798`.

Fix: make balances, attendance, reward debits and claim limits server-authoritative; permit users to edit only personal profile fields. Add negative security-rule tests for direct balance changes, forged transaction entries, claim-counter resets and inventory abuse. This finding does not grant access to private ticketing orders or payment money.

### A7 — P2: Fee reporting can permanently understate processing costs

**Confirmed.** If the expanded Charge balance transaction is absent at first fulfillment, the saved Stripe fee becomes zero. Once an order is paid, `fulfill()` returns without refreshing financial fields. The probe supplied the real fee on a later Session verification but the stored fee stayed zero. The dashboard subtracts that zero when showing proceeds, which matters directly to Pluto's fee-saving goal.

Evidence: `functions/src/ticketing/orders.ts:191–205`, `site/src/ticketing/editor.js:223–225`.

Fix: distinguish unknown fees from zero, reconcile settled balance transactions independently of ticket issuance, and label provisional proceeds. Verify totals against actual Stripe payments, refunds and payouts; include Tax and infrastructure/email costs in business reporting where applicable.

## Other weak points and operating limits

| Area | Evidence / impact | Next action |
| --- | --- | --- |
| External payment acceptance — launch gate | Existing evidence establishes real sandbox Session/form creation, but no completed real card/wallet payment or real refund. Integration tests substitute Stripe. | Human-complete sandbox success/decline/3DS/wallets, reload, real full/per-ticket refunds and actual webhook delivery/retry; reconcile provider money to internal tickets and fees. |
| Email operations — launch gate | Worker retries and has leases/idempotency, but real delivery is unverified. No dedicated failed-email/recovery-job UI, bounce/delivery status handling or repository-defined alerts. `operations.ts:264–322`. | Verify Resend sender/domain and real test inboxes; expose failures/queue age and alert on review jobs. Test delayed email and consumed/expired app links. |
| Production deployment — launch gate | One workflow runs on main push/manual dispatch and deploys site, rules and workers. No PR trigger, browser test step, staging deployment or explicit environment approval is defined in the workflow. `.firebaserc` defaults to the production project. | Add PR validation and browser coverage; isolated cloud staging; explicit deployment/rollback gate. Provision all bound secrets before deploying the shared public Function. Verify cloud queries/indexes, HTTPS, authorized domains and deployed client IP. |
| Monitoring and support — P2 | Maintenance emits aggregate counts; caught order/refund failures often lose the useful cause. No repository-defined alarms, operational health panel or tested restore procedure found. | Alert on stale holds, paid/unfulfilled orders, inbox retries, pending refunds, email review and maintenance failure. Add safe staff actions/runbooks and a backup/restore rehearsal. Cloud settings may exist externally and must be checked. |
| Dependencies — P2 | Root production npm audit: zero advisories. Functions production audit: 13 affected dependency entries, 3 high/10 moderate. Two underlying packages are implicated: `@fastify/busboy@3.2.0` and `uuid@9.0.1`; parent entries repeat those risks. | Upgrade/override to compatible patched dependencies and test SDK behavior. This audit found Firebase Admin's busboy usage in outbound multipart response parsing; direct exploitation through Pluto's JSON ticket API was not demonstrated. Avoid equating package count with independent exploitable bugs. |
| Installed native app — P2 / platform gate | `lib/src/ticket_access_store_stub.dart` uses an in-memory map. A guest's access disappears when the process ends; secure persistence and native app-link routing remain unverified. | Keep the initial release scoped to web; implement secure storage and app/universal links before advertising the installed guest wallet. |
| Attendee connectivity — P2 | Scanner has an offline cache; customer wallet requires API fetches and has no dedicated offline credential cache. Browser-local guest credentials are lost if site storage is cleared or a different browser/device is used. | Rehearse attendee access on poor networks, provide clear recovery/account guidance and a staffed fallback; design an offline attendee wallet with explicit stale-credential handling if needed. |
| Scale and cost — P2 | Dashboard/orders, guest lists, discovery and manifests read entire collections/event sets. Account tickets fetch event records individually. Guest wallet serially loads up to 30 saved entries. Maintenance sequentially handles up to 200 orders/100 refunds per pass. | Use event-size load tests, batch/cache per-event reads and paginate support screens. Add a queue age metric and verify maintenance meets its timeout with provider slowness; no measured production throughput claim is justified yet. |
| Occupancy — P2 | Guest-list arrival intentionally does not consume ticket pools. Offline devices cannot coordinate duplicate detection; one offline lane is required. | Track paid/RSVP/guest occupancy together for the venue; give door staff a capacity and outage procedure. Re-entry currently relies on wristbands rather than a multi-day entry/exit ledger. |
| RSVP identity and support — P2 | Email is not proven before it locks the per-event RSVP contact. Declined/withdrawn requests cannot resubmit and decisions cannot be reversed. `rsvps.ts:20–45,53–78,90–97`. | Add appropriate email proof/abuse protection and audited correction/reopen controls, or deliberately document how staff resolve typo, impersonation and changed-decision cases. Current approval limits do not allow plus-ones/waitlists. |
| Retention and keys — P2 | Rate counters store numeric `expiresAtMs`; no cleanup policy is implemented. Old sessions/access records/media revisions can accumulate. One signing key also provides PIN lookup and QR verification. | Add timestamp TTL for expendable records, explicit financial/audit retention and media cleanup. [Firestore TTL](https://firebase.google.com/docs/firestore/ttl) requires a timestamp field. Back up signing material and design versioned key rotation before needing an emergency rotation. |
| Customer policies / POSH parity | Landing-page fine print says refunds require approval, but no complete ticket cancellation/refund/terms/privacy policy flow was found. Invoicing, Terminal hardware, Connect/promoter payouts, historical POSH imports and subscriptions remain deferred. | Confirm the actual first-release scope and publish customer policies/support instructions. Keep historical POSH orders in their existing system. Operational feature parity requires more than the current dashboard. |
| Maintainability — P2 | `Catalog → Orders → Guests → Rsvps → Operations` couples payment, admission, guest and scanner workflows; persistent records frequently use `any` and string statuses. | Harden behavior first, then introduce typed persisted records, explicit state transitions and smaller composed services. Preserve the transaction boundaries and regression coverage during refactoring. |

Dependency references: [busboy boundary advisory](https://github.com/advisories/GHSA-xjh9-v7x6-24jw), [busboy header advisory](https://github.com/advisories/GHSA-x8mw-p69m-v3mx), [uuid bounds advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq). These advisories should be evaluated against the application call paths rather than treated as proof of an attack.

## Validation completed during this audit

- `npm test`: 29 Functions tests and 7 configuration tests passed; TypeScript build passed as part of the command.
- `flutter analyze lib test`: no issues. `flutter test`: 11 passed.
- `npm run test:ticketing:integration`: passed on existing demo emulators, with a controlled provider substitute.
- `npm run test:ticketing:rsvp`: passed.
- `npm run test:ticketing:rules`: three access contexts passed. The permission-denied log entries are expected assertions.
- `npm run test:ticketing:rsvp-browser`: passed in Chromium, including approval/no-QR-before-approval, withdrawal, PIN admission and desktop/mobile accessibility.
- Additional isolated emulator probes reproduced A1, A2, A5, A6, A7 and A8, and verified the Express proxy configuration for A3. The probe removed its own event/order/points fixtures afterward.
- An isolated Chromium probe with controlled API responses reproduced A4. No real customer data was used.
- Production dependency audits completed for both Node packages; findings recorded above.

Physical iOS/Android cameras, Safari, completed real Stripe payments/refunds, real Resend delivery, live cloud deployment, load testing and restoration were not validated by these local checks. No implementation fix, production change or payment was performed as part of this audit.

## Next release sequence after source remediation

1. Deploy the remediated backend/client/rules to isolated staging and verify the actual proxy path, spoof protection and shared-network load. Review historical rewards balances and configure expendable-record TTL. The A1–A8 source work and local regressions are complete; deployed acceptance is separate.
2. Activate the new PR checks and protected GitHub environments, configure staging secrets/web app settings, and exercise the manual staging/release/rollback process. Add operational visibility and compatible dependency patches. Resolve abandoned holds through audited actions.
3. Complete real sandbox payment/refund/Tax/email acceptance. Bank verification can proceed separately while these sandbox tasks run.
4. Rehearse a small event on actual gate phones with expected shared-network load, guest/RSVP capacity and outage/recovery scenarios.
5. Verify live account/bank/tax/policies, production secrets and webhook destination, backup/restore and rollback. Enable the existing live-sales gates only after those checks pass.

The next milestone should be **production hardening and a controlled event pilot**, with the above results as acceptance criteria.

October 5 profile accessibility follow-up: account-verification testing found two unlabeled Flutter textarea nodes in a whole-profile Axe scan while empty profile fields were below the mobile viewport. Recheck the profile form's off-screen accessible names as a P2 follow-up. The new verification regression checks mobile layout and the account action controls; it does not establish accessibility of the entire profile form.
