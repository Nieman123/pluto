# Native ticketing implementation and testing

Branch: `native-ticketing`. Implemented for Pluto's website and Flutter web app with Stripe sandbox payments. Nothing has been deployed or charged in live mode. This is a testing-ready implementation; external-provider and device acceptance remains below.

Admission tickets live at `/app/tickets`. Emails contain secure confirmation, recovery and transfer links back to the app, with no ticket PDF or QR attachment. The receipt PDF API produces financial receipts only. Accepted transfers revoke the old credential, and online duplicate scans are rejected. A current QR can still be screenshotted, so admission relies on the server's first accepted scan and the offline procedure.

## Requirement audit

| Area | Implemented behavior | Validation / limits |
| --- | --- | --- |
| Event editor | Hero/flyer/gallery/lineup uploads; alt text, captions, focal points; sanitized rich descriptions; dates/timezone, location/directions; FAQ/schedule/camping/parking/accessibility/custom sections with ordering/visibility; Pluto/Artwork Dark/Light themes, approved fonts and accent | Browser checks cover uploads, private preview, publication, duplication and responsive pages. Review artwork for private information before publishing. |
| Publication | Draft save/revision conflicts, preview, publish/unpublish/archive/cancel, content history restore, duplicate with inactive offers and fresh inventory | Browser and emulator cover draft isolation, conflicts, duplicate assets and archive preserving published content. Restore preserves financial configuration/ledgers. |
| Landing pages | SSR `/events/:slug`, discovery, canonical/social metadata, JSON-LD, sitemap, slug redirects, sale states and mobile purchase action | Desktop/mobile event pages pass automated WCAG A/AA checks. Existing POSH/ManaFest pages preserved. |
| Tickets/inventory/promos | Multiple tiers/day/weekend/camping/vehicle offers, dependencies, shared pools, sales/admission windows, purchaser limits; one promo per order with windows/scope/global caps and fixed/percentage discounts | Firestore concurrency checks cover last-ticket and promo limits; exact cents computed server-side. |
| Checkout | Full embedded Stripe Checkout, guest/account buyers, USD inclusive prices, immutable saved attempts, trusted app return, delayed methods excluded, no invoice creation | Real sandbox Session creation and form rendering verified. Completed real card/wallet payment and real refund remain unverified. |
| Payment reliability | Transactional reservations, idempotent provider calls, authoritative fulfillment, signed raw-body webhook inbox, repeated/stale delivery, expiry reconciliation and durable maintenance | Controlled Stripe substitute exercises transactions/money movement; actual SDK verifies HMAC. Uncertain creation outcomes retain holds for review. |
| Customer app | Tickets tab, account orders, verified email claims, neutral recovery, one-use links, accepted holder links and saved browser guest wallet | App order/transfer/reload exercised in Chromium. Native installed-app guest storage is currently process-local; persistent secure storage/app links need platform work before offering that guest flow. |
| Transfers | Acceptance until first admission, previous QR revoked, payer retains receipt, accepted guest capability allows access/retransfer | Backend and browser tested. Editing dates cannot extend an existing ticket's original transfer cutoff. |
| Refunds | Admin-approved whole-ticket partial/full refunds, original-payment idempotency, pending freeze, ledger/audit, unused active inventory reopening, admitted stock retained; Dashboard refund mapping | Backend tested, including cash tax reversals. Arbitrary Dashboard amounts that do not equal whole-ticket totals require manual support. |
| Taxes | Sandbox zero-tax fixture, inclusive manual rates, automatic Tax venue/product checks, per-unit allocations, cash calculation/recording and original-line reversal | Controlled integration tests pass. Real sourcing, registrations, automatic cash tax and mixed-tax reporting require sandbox validation. Stripe automatic-tax partial refunds are flagged for tax review. |
| Admin/promoters | Order views, financial dashboard, pool usage, cash/comps, CSV, event-scoped staff, audit; last eligible promoter link within 30 days locked at checkout and private aggregate stats | Role/cash checks pass. Assignment uses Firebase UID. No promoter payouts/Connect. |
| Admission | Signed versioned QR, event-scoped staff, online first admission, camera/manual input, wristband re-entry, offline manifest and durable queue | Offline reload/duplicate/replay/conflict review exercised in Chromium; physical cameras/gate devices need rehearsal. |
| Offline conflicts | Account-bound manifest, last-online authorization valid 24 hours, 15-minute freshness warning, persistent conflicts and audited review notes | One offline lane per event. Stale revocations/transfers can be locally admitted; first accepted server scan wins on sync. |
| Email | Durable Resend jobs, leases/backoff, stable idempotent payloads, secure recovery/transfer/refund notices, no ticket attachments | Provider substitute verifies retry/consumed-link behavior. Actual delivery needs Resend setup. Unresolved delivery beyond safe retry window moves to review. |
| Private data | Allowlisted public projections, API-only drafts/media/ledgers, event roles, trusted origins, request limits, no-referrer private pages, no buyer data in QR | Rules checks deny anonymous/buyer/admin direct private access. Local secrets and generated files ignored. |

## Verification evidence

- `npm test`: 28 Functions tests and 7 configuration checks pass, including existing ManaFest/rentals/waiver behavior.
- `flutter analyze lib test`: no issues. `flutter test`: 9 pass. Functions, public assets and release Flutter web builds pass.
- `test:ticketing:integration`: concurrency, immutable attempts, fulfillment/expiry/cancel, transfers/refunds/admission, cash/comps, manual/automatic cash tax, Dashboard mapping, recovery/claims, receipt-only PDF, drafts/roles, late creation recovery, one-use email retries and signed repeated/stale webhooks pass using demo Firestore and a controlled Stripe substitute.
- `test:ticketing:rules`: three access contexts pass; fixtures are removed afterward to avoid polluting previews.
- `test:ticketing:browser`: uploads/private preview/publish/duplicate/mobile accessibility, Flutter QR/transfer/reload, saved guest wallet, offline reload/duplicate/replay and revoked-ticket conflict review.
- Real sandbox API keys, embedded Checkout Session creation and form rendering verified. Automated payment stopped at Stripe's AI-agent acknowledgement; no successful real PaymentIntent/card charge is claimed.

## Local preview

Use Node 22, the repository's Flutter version and Java 21. Run from the repository root; keep emulators, webhook listener and preview in separate terminals.

1. Install: `npm ci`, `npm ci --prefix functions`, `flutter pub get --enforce-lockfile`.
2. If missing, copy `functions/.env.example` to `.env.local` and `.secret.local.example` to `.secret.local`, preserving existing keys. Sandbox restricted secret belongs in `.secret.local`; publishable key belongs in `.env.local`.
3. Run `npm run ticketing:key` once. It preserves other secrets. Keep the Ed25519 signing key stable while tickets remain valid.
4. Start isolated emulators:

   ```powershell
   npx firebase-tools@15.32.1 emulators:start --project demo-pluto-ticketing --config firebase.ticketing-test.json --only auth,firestore,storage
   ```

5. Build and seed:

   ```powershell
   flutter build web --release --base-href /app/ --dart-define=FIREBASE_EMULATOR_HOST=127.0.0.1 --dart-define=FIREBASE_EMULATOR_PROJECT=demo-pluto-ticketing
   npm run build:public
   npm run ticketing:seed
   ```

6. Run `npm run ticketing:webhooks` in a second terminal. The pinned CLI receives the sandbox key through its environment, redacts the signing secret and saves it into ignored `.secret.local`.
7. Run `npm run preview:ticketing` in a third terminal. Restart after secrets/compiled backend changes. This helper forces the demo Firebase project, local endpoints/bucket and test mode.

Under `http://127.0.0.1:4173`: `/events/pluto-ticketing-preview`, `/tickets/admin`, `/tickets/staff`, `/app/tickets`. The local staff sign-in button appears only on loopback with Auth emulator configuration. Seeding creates the fixture staff account and prints its local password; no production account is created.

For `/app/sign-on`, enter `staff@ticketing-preview.invalid`, select Continue, then enter `Local-ticketing-preview-2026!` and select Sign In. The Google button opens a mock provider in the local Auth emulator, not your real Google account. The seeded email account has admin access. Verify this flow with `node scripts/ticketing/browser-test.cjs --sign-in-only`.

The Express preview does not run Firestore-triggered/scheduled Functions. Returning to an order verifies its Stripe Session; the admin retry action drains jobs locally. Deployed workers do this automatically with five-minute maintenance as fallback.

Tests against running emulators:

```powershell
$env:GCLOUD_PROJECT='demo-pluto-ticketing'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8185'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9095'
$env:FIREBASE_STORAGE_EMULATOR_HOST='127.0.0.1:9295'
npm run test:ticketing:integration
npm run test:ticketing:rules
```

For browser checks install Chromium once with `npx playwright install chromium`, then run `npm run test:ticketing:browser` with preview/emulators running. Set `PLAYWRIGHT_BROWSERS_PATH` if using a custom binary directory. The suite uses localhost/demo data only.

## The two requested keys

`STRIPE_WEBHOOK_SECRET` begins `whsec_`. The local listener obtains and saves it automatically; this has been configured locally. For a deployed environment create a snapshot event destination for `https://<environment-host>/tickets/webhook` in Stripe Workbench, and save that destination's secret in Secret Manager. Local and deployed credentials are separate. [Stripe listener](https://docs.stripe.com/cli/listen), [webhook setup](https://docs.stripe.com/webhooks).

`RESEND_API_KEY` comes from [Resend API Keys](https://resend.com/api-keys). Create a sending-access key scoped to a verified sending domain and save it in ignored `functions/.secret.local`. Set `TICKETING_EMAIL_FROM` in `.env.local` to an address on that domain. Until configured, payments/admission work and email jobs retry without claiming delivery. [Key management](https://resend.com/docs/dashboard/api-keys/introduction), [domain verification](https://resend.com/docs/dashboard/domains/introduction).

## Remaining acceptance and launch setup

1. Complete a human-driven embedded sandbox purchase: success/decline, wallet/3DS, reload, guest/account access and real full/per-ticket refunds; confirm actual webhooks/reconciliation. The optional `test:ticketing:payment` helper requires `TICKETING_SANDBOX_TEST=true` and does not bypass Stripe's acknowledgement.
2. Configure Resend/domain DNS and deliver confirmation/recovery/transfer/refund notices to test inboxes. Confirm no ticket attachments and one-use links.
3. Validate venue sourcing, classifications, registrations, inclusive totals, mixed-tax refunds and reporting with actual sandbox Tax configuration. Fixture prices intentionally use zero tax.
4. Rehearse on gate phones/cameras/network: offline preparation, staff revocation/stale manifests, conflict handling and wristbands; test Safari/wallets. Installed native-app guest storage/app links remain outside the verified web flow.
5. Complete live Stripe business/bank/payout setup, descriptor/support/policies, production Firebase secrets/environment and event destination. SDK/API pinned to Stripe 23.0.0 / `2026-09-30.endive`; configure matching webhook version. Verify restricted-key permissions for Checkout, PaymentIntents, Charges/balance transactions, Refunds, Products/tax rates and enabled Tax resources.
6. Separate sandbox/live databases/signing keys. Enable `TICKETING_MODE=live` and `TICKETING_LIVE_READY=true` only after acceptance, with confirmed event taxes. Back up the signing key; rotation invalidates existing credentials/manifests.

Snapshot events: `checkout.session.completed`, `.expired`, `.async_payment_succeeded`, `.async_payment_failed`; `payment_intent.succeeded`, `.payment_failed`, `.canceled`; `refund.created`, `.updated`, `.failed`; `charge.refunded`; `charge.dispute.created`, `.closed`. Unknown signed types are acknowledged/ignored.

The main workflow runs transaction/rules tests and deploys `publicSite`, `ticketingWebhookWorker`, `ticketingEmailWorker`, `ticketingMaintenance`, rules and hosting. Provision secrets/review deployment configuration before merging `main`. Production config must use production bucket/base URL, never local example values. No deployment was performed here.

Unresolved provider creation/refund outcomes, disputes, unmatched Dashboard refunds and tax-review flags appear in the order dashboard. Reconcile against Stripe before changing stock or retrying money movement. Email jobs past the safe retry window require private-job/provider-log review; a dedicated email operations UI is not included.

Payments-only v1. Invoicing, Terminal hardware, Connect/payouts and subscriptions deferred. Historical POSH orders stay in POSH.
