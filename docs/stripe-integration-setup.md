# Stripe integration preparation for Pluto Events

Prepared October 2, 2026 (America/New_York). This preserves the account and architecture snapshot taken before implementation. Its unchecked items and statements about source changes refer to that preparation session. Subsequent implementation, key setup, verification and current launch tasks are recorded in [Native ticketing implementation and testing](native-ticketing.md). No deployment has been performed.

Implementation steering: build the full testing-ready system on `native-ticketing`, using the Stripe sandbox while business banking is pending. Admission tickets remain in the Flutter app. Email contains confirmations and secure app recovery/transfer links; no ticket PDF attachments or ticket PDF downloads. Financial receipts may remain downloadable. The implementation status and outstanding validation will be tracked separately in `docs/native-ticketing.md`.

## Decision and execution status

Use **Stripe Payments with full embedded Checkout Sessions** for one-time event purchases on `https://pluto.events`. Pluto Events LLC receives every payment in USD, absorbs processing fees, and displays tax-inclusive prices. Support guests and Firebase-account buyers. Keep existing POSH orders in POSH and preserve the ManaFest archive.

The installed Stripe plugin and authenticated MCP tools work in this fresh session. `stripe_implementation_planner` actually ran with the supplied business, technical stack, event editor, ticketing, inventory, refund, admission, tax, and deferred-product requirements. It returned a decision tree, then accepted the context-based selections on a second call:

| Planner evidence | Result |
| --- | --- |
| Guide ID | `iguide_61VVcAgrYToB4br2G41DELViA2aSQ` |
| Decision path | Stripe-only new checkout → web browser → no digital-goods Managed Payments → standard checkout without invoices → integrated checkout rather than payment links → full embedded Checkout |
| Selected terminal node | `embedded_no_redirect` |
| Final status | `accepted` |
| Returned integration shape | `checkout_type: embedded`, `origin_context: web`, `provider: checkout_studio` |

This is a routing recommendation, not a complete engineering design or an account activation. The provider label refers to Stripe's Checkout tooling; no Checkout Studio resource was created. The planner did not recommend changing the agreed product scope. The reliability and tax details below are Pluto-specific engineering recommendations informed by official documentation, not additional planner output.

The authorized `npx skills add https://docs.stripe.com` fallback was unnecessary and was not run. The Stripe CLI was not found on PATH; documentation research used the plugin's MCP documentation search and official web sources. No additional Stripe authorization was requested by the read-only calls or planner.

## Verified configuration versus outstanding setup

All account-specific calls used the same sandbox context and `livemode: false`. No live account was exposed or inspected.

| Item | Verified result | Remaining action |
| --- | --- | --- |
| Installed plugin | Cache `C:\Users\Nieman\.codex\plugins\cache\openai-curated\stripe\5fd93af4`; manifest version `7.0.0`; enabled in local configuration | Keep plugin available for subsequent implementation |
| MCP connection | Configured at `https://mcp.stripe.com`; authenticated account reads succeeded | MCP OAuth is separate from the backend's future API credentials |
| Accessible account | One: **Pluto Events LLC sandbox**, `acct_1UMDWoDELViA2aSQ`, `livemode: false` | Use this sandbox for development; verify the production account separately before launch |
| Country and currency | Account API reports `US` and `usd` | Confirm production account also matches the agreed US/USD business |
| Account readiness | `details_submitted: false`, `charges_enabled: false`, `payouts_enabled: false`, empty capabilities; `requirements.disabled_reason: requirements.pending_verification` | Review Dashboard test capability/setup state. These sandbox fields do not establish production readiness or prove that every sandbox testing operation is unavailable |
| Requirement details | `currently_due`, `past_due`, and `pending_verification` lists were empty | The read result does not identify a specific missing verification document; inspect Dashboard rather than inventing a requirement |
| Stripe Tax settings | `status: pending`; missing `head_office`; default tax behavior and code unset | Resolve tax setup only after confirming the business address and event-specific treatment |
| Tax registrations | Complete sandbox list is empty (`has_more: false`) | No active registration is verified. Review obligations with the business's tax advisor; sandbox testing configuration and live registration are separate |
| Event delivery | Legacy webhook endpoint list empty (`has_more: false`); v2 event destination list also empty (`next_page_url: null`) | Register sandbox and production destinations only after the handlers and URLs exist |
| Credentials | Prior setup used OAuth and did not generate or paste API keys; this task did not retrieve or generate key material | Restricted backend key, frontend publishable key, and endpoint signing secret still need secure provisioning; no existing key inventory was inspected |
| Repository | Node 22, Express/Nunjucks, Firebase second-generation Functions, Firestore/Auth/Storage, Flutter web at `/app`; no Stripe dependency or payment integration found in the inspected application sources | Add integration during the implementation task |
| Firebase environment | `.firebaserc` points at `pluto-9b6ca` | A separate development Firebase project/emulator setup was not verified; isolate development data and secrets from production |

Read-only evidence came from `list_available_accounts_or_orgs`, `GET /v1/accounts/{id}`, `GET /v1/tax/settings`, `GET /v1/tax/registrations`, `GET /v1/webhook_endpoints`, and `GET /v2/core/event_destinations`. Account IDs and planner IDs are identifiers, not API credentials. No secret values belong in this document.

## Product scope and current API choices

| Stripe product | Pluto decision |
| --- | --- |
| Payments / Checkout Sessions | Required for v1. Full embedded page mounted with Stripe.js on a Pluto page |
| Stripe Tax | Candidate tax engine, subject to event-specific sourcing, registration, coverage, and refund validation |
| Invoicing | Separate later equipment-rental or business-invoice use case. Do not enable post-purchase paid invoice generation for ticket orders |
| Terminal / Tap to Pay / readers | Later. No hardware purchase or reader integration in v1 |
| Connect / subscriptions / Billing | Outside this single-business, one-time ticketing scope |
| Managed Payments | Not selected for real-world event admission |
| Payment Links | Not the main flow: each purchase must first reserve Pluto inventory and promotion capacity |
| Sigma / paid analytics products | Not required for v1 dashboards and CSV exports; use Pluto's order ledger plus Stripe reconciliation |

Full embedded Checkout includes the payment UI and order summary. It differs from the newer embedded form and custom Elements options. The current official guide and MCP schema use `ui_mode: 'embedded_page'` with `mode: 'payment'`; the planner's abstract `checkout_type: embedded` is not an API parameter. Mount it into the public page's DOM, without nesting it in another iframe. Flutter supplies administrative/account views and can link to the canonical Pluto checkout page. [Full embedded page guide](https://docs.stripe.com/payments/accept-a-payment?payment-ui=checkout&ui=embedded-page).

### Checkout appearance

New paid Stripe orders use Pluto's dark purple panel (`#211a2b`), purple action buttons (`#c4a2ff`), Montserrat, rounded controls and the display name **Pluto Events**, supplied through the Checkout Session's `branding_settings`. No account-wide Dashboard change or new secret is required. Each order snapshots these settings before provider creation; retries keep the same Stripe parameters. Legacy orders without a snapshot omit the new parameter so an in-flight creation retry cannot conflict with Stripe idempotency. Existing Sessions retain their original appearance.

Stripe owns the embedded iframe, so the site's CSS cannot style its internal fields. Full embedded Checkout supports Stripe's branding controls; arbitrary field CSS, bespoke layout and the Elements Appearance API would require an integration using Elements or the newer embedded form. The actual sandbox preview shows a dark order-summary background, Montserrat and purple Pay button; Stripe's payment-fields card remains white. Branding is platform-wide rather than copied from editable event themes. Logos and other omitted settings continue using the Stripe account's Dashboard defaults. [Full embedded page branding](https://docs.stripe.com/payments/checkout/customization/appearance?payment-ui=embedded-page).

Validation: new and legacy uncertain-creation retry regressions pass in the demo emulators, along with the existing hardening suite. Real unpaid sandbox Checkout Sessions accepted all five settings, and the embedded form was rendered at desktop and phone widths. Preview Sessions were explicitly expired without submitting a payment. Real customer completion remains part of staging acceptance.

Use dynamic payment methods managed through a dedicated Dashboard payment-method configuration. For v1, enable cards and eligible wallets with prompt payment confirmation; exclude delayed-settlement methods until their inventory policy has been implemented and tested. Omit `payment_method_types` in non-Terminal requests. A payment-method redirect may still be needed for authentication; configure a trusted `return_url` and suitable completion behavior. “Embedded” does not guarantee every payment authentication stays on the page. [Dynamic payment methods](https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods).

At implementation, instantiate the Stripe SDK client with a restricted backend credential, explicitly pin API/webhook versions, and commit the SDK lockfile. Official references checked today show Node SDK `v23.0.0` and API `2026-09-30.endive`; recheck at implementation time. The cached skill lists older versions (`22.4.0`, `2026-07-29.dahlia`) and the MCP API-search schema identifies itself as `2026-08-26.preview`. Do not copy that preview version into production merely because MCP used it. Verify event-tax fields against the chosen SDK/API and any feature-access requirements. [Official SDK release](https://github.com/stripe/stripe-node/releases/tag/v23.0.0), [API versioning guidance](https://docs.stripe.com/upgrades).

Tag Checkout Sessions with an `integration_identifier` appropriate to the supported API, such as a fixed Pluto flow label plus a generated eight-letter suffix. Put only opaque internal event/order/attempt IDs and non-sensitive attribution IDs in Session and PaymentIntent metadata. Set `client_reference_id` to the internal order ID. Metadata is for correlation, not ownership authorization.

Keep the currency USD, avoid optional currency conversion, leave invoice creation disabled, and avoid storing payment methods for later charges unless a later use case explicitly requires it. Stripe handles payment credentials; Pluto stores payment references and business records.

## Event editor and publication architecture

Build generic future-event models alongside the existing ManaFest archive. Current `currentEvents` documents are publicly readable and Storage `/public/**` is public; neither can hold draft content, private flyers, or holder-only addresses. Firestore rules cannot hide individual fields in an otherwise readable document.

Proposed logical records (names may be refined during implementation):

| Record | Purpose and access |
| --- | --- |
| Private event draft and revisions | Admin-only complete editor content, validation, publication history, exact venue/address, tax location, operational notes |
| Public event projection | Explicitly allowlisted published fields, unique slug, public location summary, visible sections, safe media and metadata |
| Private event media | Draft originals and assets accessible only to authorized editors; authenticated previews |
| Published media | Approved derived copies with deliberate public access; no private-address metadata or draft URLs |
| Ticket offers and price revisions | Types, early-bird tiers, immutable USD prices/tax policy, sales windows, purchaser limits, required pass/add-on relationships |
| Capacity pools and reservations | Shared daily/weekend admission, camping, vehicle or other limits and units consumed by each offer |
| Orders, payment attempts and refunds | Private financial/ownership ledger, snapshots, authorization and audit history |
| Tickets, transfers and admission scans | Individual entitlements, versioned QR credentials, ownership, admission-window state |
| Promotions / guest lists / attribution | Scoped discounts and reservations, comps, promoter reporting without payouts |
| Webhook inbox / jobs / reconciliation runs | Durable delivery records, fulfillment/email retries, exception review |

The editor includes draft/save, preview, publish, unpublish, archive, duplicate and content-version restoration actions; flyer, hero, gallery and lineup media uploads with captions, alt text and focal points; sanitized rich descriptions; dates, IANA timezone, configurable public or ticket-holder-only venue/address and directions; parking, camping and accessibility information; lineup, schedule, FAQ, information and custom content blocks; reorderable and hideable sections; and Pluto Default, Artwork Dark and Light themes. Restrict color/font controls to safe tokens and approved fonts, check contrast and responsive layout, and allow no arbitrary executable markup or CSS. Restore content and theme versions without rolling inventory, prices or financial records back.

The landing page includes a prominent ticket selector and a mobile sticky purchase action, with coming-soon, live, sold-out, cancelled and past-event states. Keep public city/region visible when exact venue details are private. Unpublishing removes public discovery and closes new sales through the coordinated server workflow while preserving authorized access to existing orders.

Publish validates required content, slug uniqueness, dates and timezone/DST behavior, section configuration, media readiness, ticket sales/capacity rules, and applicable tax settings. A server creates a versioned public projection. Preview remains authenticated and non-indexable. Duplicate copies editable content into a new private draft and resets slug, sales state and dates; it never copies orders, tickets, reservations or active Checkout Sessions. Archive closes sales through the server workflow while retaining order access and the event's historical page.

Add canonical `/events/:slug` pages and Firebase Hosting rewrites to the Express renderer during implementation. Generate canonical tags, social previews, JSON-LD and sitemap entries from the safe projection. When exact venue/address is holder-only, exclude it from HTML, JSON-LD, public Firestore, JavaScript payloads, galleries/EXIF, map URLs, SEO/social images and logs. Serve private directions through authenticated, entitlement-checked endpoints for valid holders. Stripe product labels/images must also avoid revealing the private address before purchase; the tax engine receives the venue privately. Check buyer-visible Stripe surfaces for leaks in sandbox.

Publication is an explicit data boundary, not a client-side hidden flag. Sales-changing edits require versioning and coordination with existing reservations. Preserve the existing `/manafest` archive and its assets; POSH historical purchases remain managed in POSH.

## Pricing, capacity, promotions and checkout lifecycle

1. The client submits offer IDs, quantities, a promotion code and an optional authenticated identity. The server verifies event publication, sales windows, quantity/dependency limits, capacity, price revision, tax policy and attribution. It computes all cents and discounts itself; it never accepts client-supplied totals, Stripe price IDs, ownership IDs or approval flags as authoritative.
2. A Firestore transaction creates an order/payment attempt and reserves every affected capacity pool and promo usage counter together. A weekend pass can consume multiple daily pools; an add-on can consume a separate camping/vehicle pool and require an eligible admission pass. Comps and cash orders use the same capacity constraints. Validate global promo redemption caps and allow one promotion per order.
3. Stripe Session creation occurs **outside** the Firestore transaction, using a deterministic idempotency key for that order attempt. Record provisioning state before the external call, then attach the returned Session ID and expiry safely. Use stable offer Product/Price mappings or server-generated inline price data with immutable order snapshots. Provision these objects only during later authorized development.
4. The backend returns only the attempt-scoped Checkout client secret and safe order summary to its authorized buyer. Stripe.js mounts the full embedded page. Do not log client secrets or put them in analytics, URLs or shared caches.
5. Signed events and verified Stripe retrieval transition the order to paid and atomically consume the reservation/create individual tickets once. The return page displays server-confirmed status and can request the same idempotent verification path. Browser success alone cannot issue tickets. Receipt/ticket email is a retriable outbox job, separate from successful fulfillment.

Reserve inventory for approximately **30 minutes of usable Checkout time**. Stripe's supported scheduled expiry is 30 minutes to 24 hours after Session creation. Start with a short bounded provisioning reservation, then align the final hold to the Session's returned `expires_at`, allowing creation/clock/network margin. Do not start a strict local 30-minute deadline before creating a Session whose expiry is later. The UI countdown uses the server deadline. This is an implementation refinement of the agreed hold, not a recommendation to lengthen normal checkout to 24 hours. [Limited inventory and expiration](https://docs.stripe.com/payments/checkout/managing-limited-inventory?payment-ui=embedded-page).

Use a recoverable sequence across Firestore and Stripe; neither system participates in the other's transaction. A crash or API timeout after Session creation can leave an outcome uncertain. Retry with the same idempotency key, retain ownership of the provisioning reservation while resolving the outcome, and let reconciliation recover orphan attempts. If cancellation wins before the Session is attached, expire any discovered open Session before releasing its reservation. Do not create a second payable attempt while the first can still succeed.

Expiration is driven by `checkout.session.expired` plus a scheduled sweeper. A timer or Firestore TTL deletion alone must not release stock while Stripe still accepts payment. If an earlier sales-close/cancellation requires release, expire the open Session first, then retrieve its state; a payment may have won the race. Keep uncertain or processing attempts reserved and visible for review. Terminal unpaid/expired attempts release capacity and promo holds exactly once; paid fulfillment consumes them exactly once. Define conservative exception handling for a paid attempt whose hold was erroneously released: never silently oversell or discard the customer's payment.

Prompt-confirmation methods still have authentication and webhook latency. Retain the relevant reservation until the verified outcome. If delayed methods are later enabled, introduce an explicit `payment_processing` state and longer reservation/cancellation policy; a completed Checkout Session can remain unpaid. Handle `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed` even when v1 excludes those methods. [Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment?payment-ui=embedded-page).

Apply limited-use promotions on Pluto before creating the Session, with transactionally reserved usage. Do not expose Stripe's independent promotion entry or adjustable quantities without equivalent reservation synchronization. For a Stripe-backed discount, pass the server-approved discount and verify the resulting allocation/total. Persist per-unit allocated discounts and inclusive tax with deterministic rounding so partial refunds are reproducible. Automatic Stripe abandoned-cart recovery creates copied Sessions; keep it off unless recovery first revalidates and reserves Pluto stock/promos. Order recovery is a separate secure flow.

Zero-total orders and admin comps follow an idempotent internal fulfillment path with no charge or fake PaymentIntent. Enforce sales/issuance permissions and capacity, record why the order is free, and apply the confirmed tax treatment. Staff online cash issuance records actual cash received and staff identity in Pluto's ledger, consumes stock and issues tickets; it creates no Stripe card payment. Cash refunds are an audited cash workflow, not a Stripe refund. Include applicable cash tax reporting separately.

## Webhooks, recovery and reconciliation

Use a dedicated second-generation HTTPS Function for Stripe events, or an isolated route with verified raw-body handling. Firebase exposes `req.rawBody`; verify the exact original Buffer with `Stripe-Signature` and the correct endpoint secret before processing. Avoid verifying JSON serialization or a parser-modified body. Accept Stripe delivery without Firebase user login, validate signatures and environment/account context, and bind secrets only to functions that need them. [Webhook security and delivery behavior](https://docs.stripe.com/webhooks).

Persist a durable inbox record keyed by environment/account/event ID and acknowledge quickly **only after durable acceptance**. Failed persistence returns a retriable error. A worker leases records, retrieves authoritative Stripe state where needed, checks internal attempt ownership, expected USD amount, currency, item/discount/tax snapshots and terminal outcome, and runs the shared fulfillment/refund transition. Retry failures with bounded backoff and surface exhausted or inconsistent records for staff review. An inbox flag alone is not proof fulfillment finished.

Subscribe to the supported equivalents of these events on the pinned webhook version:

- `checkout.session.completed`, `checkout.session.expired`.
- `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`.
- `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled` as corroborating/recovery signals, using the same transition engine.
- `refund.created`, `refund.updated`, `refund.failed`, `charge.refunded`.
- Relevant dispute lifecycle events for financial exceptions and the agreed admission policy.

Deduplicate individual deliveries and business transitions. Events can arrive concurrently, repeatedly and out of order; never regress paid/refunded state because an older event arrives later. Payment failure does not automatically make a retryable open Session safe to release. Separate `paid`, `fulfilled`, email delivery, transfer and admission state.

Reconciliation scans aging provisioning, open, processing, paid-but-unfulfilled and refund-pending orders. Retrieve Sessions/PaymentIntents/refunds, repair recoverable state through the same idempotent handlers, match money to the internal ledger, and find unmatched payments using metadata and creation-time cursors. Use overlapping checkpoints and alert on discrepancies; do not depend exclusively on receiving one event type. Support manual resend/replay, webhook failure dashboards and a staff retry control. Stripe retries live delivery for up to three days, whereas sandbox delivery receives a few retries over hours; application reconciliation remains necessary. [Webhook retries](https://docs.stripe.com/webhooks#automatic-retries).

## Ownership, ticket operations and admission

Guests receive secure email order recovery: short-lived, high-entropy, one-use tokens stored hashed; neutral responses that avoid exposing whether an email/order exists; rate limits and a retriable transactional email provider. Recovery grants only the intended order/holder scope. Claiming orders into Firebase requires verified email control or explicit transfer/claim proof, then an audited server-side association. A Stripe email, Session ID, receipt URL or matching unverified profile email is insufficient authorization.

Issue an individual QR credential for each admission ticket and scannable camping/vehicle add-on, with explicit entitlements and configured validity windows. Festival re-entry uses wristbands after the first successful admission. Use strong random identifiers and versioned, signed admission credentials; keep personal information and private directions out of the QR. Order ownership, ticket holder and original payer are distinct records.

Transfers are allowed until the **event's first admission window opens**, checked against server time. Use recipient acceptance/proof, atomically change holder/version, revoke the prior credential and retain transfer history. Transfers do not change the original payer or refund destination. Refund/transfer/admission transitions must prevent conflicting operations.

Admin-approved full or per-ticket refunds use a durable approval/request record and a deterministic Stripe refund idempotency key. Calculate the refundable amount from original unit allocations, include the relevant inclusive tax, and cap cumulative refunds at the original paid amount. Block/refund-pend affected tickets before money movement, reconcile the actual Stripe refund status, and define a staff recovery path for failure. Unused refunded inventory reopens while sales remain active; do not reissue already admitted capacity automatically. Recognize Dashboard-initiated refunds in reconciliation; unmatched partial refunds require item-mapping review. Stripe supports partial refunds and asynchronous refund status updates. [Refund lifecycle](https://docs.stripe.com/refunds).

Online scanning checks current ticket version, entitlement, admission window, refund/revocation state and prior admission through a server transaction. Ticket admission remains separate from the existing points-awarding `eventQrCodes` scanner, its tokens and its collections.

Offline scanning requires a pre-synced, scoped manifest/public verification keys, cached Flutter engine and barcode dependencies, local durable duplicate tracking and revocation state, IndexedDB scan queues with device sequence numbers, authenticated replay and conflict review. Show snapshot age and warn staff when it is stale. On replay, the first server-accepted scan wins; conflicting queued scans require staff review. Use one offline scanning lane. If other lanes also admit tickets while that lane is disconnected, cross-lane duplicates remain possible; establish an operating procedure that funnels entry through the offline lane or clearly partitions entitlements. Transfers, refunds and newly issued cash tickets also need updated manifests. Do not promise global duplicate prevention, immediate revocation or availability of unsynced tickets while disconnected. Cash issuance stays online; offline mode is admission only.

Customer/admin order views show fulfillment, ownership, refund and admission status, appropriate payment references, retry actions and audit history. Event dashboards/CSV exports distinguish paid orders from ticket units, gross sales, discounts, inclusive tax, refunds, cash, comps, Stripe fees and net proceeds. Include promoter attribution and guest-list issuance without automated promoter payouts. Attribute the last valid event promoter link followed within 30 days and lock attribution when checkout begins. Restrict staff access and protect CSV exports from spreadsheet formula injection.

Use Resend for transactional ticket, recovery, transfer and refund emails, with durable jobs and retries and a verified Pluto sending domain. Use Pro during selling periods to avoid the free plan's daily sending cap. Run reconciliation and stalled-job maintenance every five minutes. [Resend pricing](https://resend.com/pricing).

## Tax-inclusive event pricing and event-specific review

No tax rate, legal obligation, exemption or registration has been selected in this task. Prior ManaFest in Anderson, South Carolina and future events around Asheville, North Carolina require separate venue/jurisdiction review; the business's service area does not establish the tax location of every event.

Stripe now documents event-ticket tax based on a venue **performance location**, supported with Checkout Sessions. Ticket tax codes require that location; customer billing address alone is insufficient. Store a private event venue → Stripe Tax Location mapping, and attach the location to each applicable Product's tax details. Classify tickets and each camping/vehicle add-on separately and set prices to `tax_behavior: inclusive`. The canonical list includes participant and spectator admission codes; the correct classification remains for Pluto and its advisor to confirm. Do not classify music admission as a digital download because tickets are delivered electronically. [Location-based tax](https://docs.stripe.com/tax/location-sales), [Ticket tax integration](https://docs.stripe.com/tax/tax-for-tickets/integration-guide?tax-api-path=checkout), [Canonical product tax codes](https://docs.stripe.com/tax/tax-codes).

Before enabling `automatic_tax`, confirm the head-office setting, valid venue, confirmed product codes and active registrations for each applicable tax type/jurisdiction. Sales tax, admissions/entertainment taxes and camping/accommodation or vehicle/parking charges may have different registration and treatment requirements. Confirm current Stripe coverage for the exact venue and tax type, supported SDK fields and account access. If a required tax is unsupported, design an advisor-approved inclusive manual-rate/reporting path rather than substituting the buyer's address or a generic zero-tax code. Do not combine manual `tax_rates` and automatic tax on the same Session.

The South Carolina events guidance specifically discusses admissions licensing and tax-inclusive charges; North Carolina's guidance addresses admission charges for live entertainment. Use these sources for review, without assuming the same tax mechanism applies in both states. [SCDOR events and festivals](https://www.dor.sc.gov/tax-education/guides-flyers/events-festivals), [NCDOR admission charges](https://www.ncdor.gov/taxes-forms/sales-and-use-tax/taxable-items/admission-charges).

Sandbox registrations/settings do not prove live compliance. Recording a registration in Stripe does not itself register the business with the tax authority. Confirm who files/remits, reporting periods for advance ticket sales, cancellations/refunds, and POSH's treatment of historical orders separately. Review cash sales, discounts, comps and bundles as well as card orders.

Per-ticket refunds on mixed-tax orders need a sandbox validation of Stripe's resulting tax reversal against Pluto's unit allocations. An amount-only refund does not itself tell Stripe which Pluto ticket was refunded. Define correct adjustment/reporting before launch and prevent duplicate automatic/manual reversals. Preserve the original tax breakdown and tax transaction references where available; inspect zero-tax reasons rather than interpreting every zero as exemption. Tax-inclusive revenue includes tax owed and is not all available operating revenue.

## Credentials and environment setup

| Configuration | Visibility / storage | Planned responsibility |
| --- | --- | --- |
| `STRIPE_RESTRICTED_KEY` | Backend only, sandbox and production separated; Firebase/Google Secret Manager | Checkout creation/retrieval/expiration and reconciliation, with the smallest tested permissions |
| Optional separate refund restricted key | Backend only, Secret Manager; admin-only refund worker | Refund permissions separated from public checkout capability where practical |
| `STRIPE_PUBLISHABLE_KEY` | Public frontend configuration, matching the environment/account | Stripe.js initialization; safe to include in the web build |
| `STRIPE_WEBHOOK_SECRET` | Backend only, Secret Manager, unique per endpoint/environment | Verify Stripe delivery signatures; a local CLI listener secret differs from a deployed endpoint secret |
| Stripe account/environment IDs, API version, URLs | Non-secret server/build configuration | Assert correct account/mode, restrict return URLs, avoid mixed test/live writes |
| Ticket signing key and email-provider credential | Separate backend secrets with rotation | Admission credentials and transactional recovery/ticket delivery |

Plan a restricted-key permission inventory around actual endpoints: Checkout Session create/read/expire; relevant Product/Price read or provisioning write; Coupon/Promotion read/use only if needed; PaymentIntent read; refund creation/read for the authorized worker; Events and financial transaction read for reconciliation; and applicable tax settings/location/code/registration reads or tax operations. Confirm exact Dashboard permission names and inherited permissions with sandbox calls. Keep catalog/tax setup writes out of the public runtime key where possible. Do not grant account administration, Connect, Billing or Terminal permissions by default. [Restricted keys](https://docs.stripe.com/keys/restricted-api-keys).

Provide secrets through secure Dashboard/Secret Manager or an interactive local terminal workflow, never chat. Bind Firebase `defineSecret` parameters to individual functions and limit Secret Manager access to the relevant service account. Do not commit keys, webhook secrets, local secret files or tokens. Before development, harden ignore rules: the current `.gitignore` has `dotenv` but lacks a general `.env*`/`.secret.local` exclusion. The publishable key is intentionally public; every other key listed above has distinct storage and access. [Firebase secret parameters](https://firebase.google.com/docs/functions/config-env?gen=2nd#secret_parameters).

Use an isolated development Firebase project or emulators with this Stripe sandbox, then a separate live deployment configuration. Do not use a sandbox key against production orders. Add Stripe-compatible CSP directives, trusted-origin/CSRF controls for customer routes, Firebase authentication for account/admin routes, role checks, abuse protection and log redaction. Firebase Admin SDK bypasses Firestore rules, so authorization must also be enforced in server handlers.

## Economics

The supplied historical figures are approximately $4,700 ticket revenue and $500 POSH deductions; actual paid-order count and the composition of those deductions are unknown. Stripe's published US standard domestic-card processing is 2.9% plus $0.30 per successful transaction. At $4,700 across 100 paid orders, the processing-only estimate is `4700 × 0.029 + 100 × 0.30 = $166.30` (about 3.54%), leaving $4,533.70 before tax liability and operating costs. The difference from $500 is approximately $333.70 under those assumptions, not a verified like-for-like saving. [US Stripe pricing](https://stripe.com/us/pricing).

Use `0.029 × gross card charges + 0.30 × successful paid orders` for this domestic-card scenario; count orders/charges, not ticket units. Additional payment-method/international fees, disputes, non-returned original processing fees on refunds, tax services, email, Firebase, support and development affect the result. Tax-inclusive gross receipts must be separated from net sales.

Current published Checkout Tax Basic pricing is 0.5% per applicable transaction; at $4,700 entirely applicable, that illustrative fee is $23.50, taking the processing-plus-Tax illustration to $189.80 before other costs. Standalone Tax API and filing services have different pricing. Invoicing Starter lists 0.4% per paid invoice; ticket checkout should not incur that by enabling unnecessary invoice creation. Account-specific pricing was not inspected. [Tax and Invoicing pricing](https://stripe.com/us/pricing).

## Concise setup checklist

### Verified in this preparation

- [x] Installed Stripe plugin is enabled; fresh-session MCP tools are available and authenticated.
- [x] One Pluto sandbox is exposed; country US and currency USD verified by read-only API.
- [x] Planner executed and accepted full embedded Checkout for standard web ticket purchases.
- [x] Account readiness, pending Tax settings, empty registrations and absent webhook/event destinations documented.
- [x] Repository stack and public-data/media boundaries inspected; no ticketing code or Stripe SDK added.

### User/business setup still outstanding

- [ ] Review sandbox Dashboard setup/capabilities and confirm Checkout test payments work; verify live readiness separately.
- [ ] Verify the real US Pluto business/live account, onboarding, payment capability, bank/payout details, support contacts and statement descriptor; require strong team authentication.
- [ ] Confirm event venues, ticket/add-on tax classifications, registrations/coverage, inclusive prices and filing/remittance responsibilities with the tax advisor.
- [ ] Publish customer-facing policies reflecting admin-approved refunds, transfers until the first admission window opens, wristband re-entry, configurable venue disclosure and the offline admission procedure.
- [ ] Supply sandbox restricted/publishable keys through secure local configuration; provision production credentials directly into Secret Manager later. Do not paste secrets into chat.
- [ ] Verify Resend sending-domain authentication for tickets, recovery, transfers and refund notices.

### Implementation and validation work, after preparation

- [ ] Isolate Firebase development, harden secret-file ignores, pin current Stripe SDK/API and webhook versions, and test restricted-key permissions.
- [ ] Build private event editing/public projections, media handling, canonical event pages and server-controlled ticket offers/pools.
- [ ] Implement atomic reservation/promo logic and crash-safe, idempotent Session creation with matched expiry.
- [ ] Implement raw-body signed webhook inbox/workers, fulfillment/email outbox, reconciliation and admin exception views.
- [ ] Implement ownership/recovery/claims, transfers, per-ticket refunds, cash/comps and separate ticket QR admission.
- [ ] Register a sandbox event destination once a handler exists; store its secret securely and test actual delivery, retries and replay.
- [ ] Validate event-location tax, tax-inclusive totals, add-ons, discounts, mixed-tax per-ticket refunds and tax reporting in sandbox.
- [ ] Run concurrent last-ticket/promo tests; timeout/crash-after-create recovery; payment-versus-expiry races; duplicate/out-of-order/missing events; wrong account/amount/currency rejection; repeated fulfillment/refunds; guest claim/transfer abuse; draft/address leaks; and stale/offline manifest/conflict scenarios.
- [ ] Verify mobile browsers, keyboard/accessibility behavior, wallet authentication/redirects and guest/account purchases on Pluto pages.
- [ ] Prepare separate live secrets, capabilities, registrations, production event destination and final reconciliation checks before any explicitly authorized launch/deployment.

## Changes and limits of this preparation

The planner confirms the agreed embedded Checkout choice and proposes no change to Payments-only v1 scope. Documentation and repository inspection refine the plan: use the current full-page UI parameter and versions; source ticket tax at the venue with appropriate performance-location support; reserve stock through verified Stripe expiry/payment outcomes; control limited promotions before Checkout; and protect drafts/private addresses through separate records/media rather than the existing public collections.

The sandbox connection is verified; live readiness, key permissions, test charges, tax correctness and webhook delivery are not yet validated. This task changed only this document. It created no Stripe products, prices, coupons, Sessions, payments, invoices, refunds, credentials, tax registrations, locations or webhook destinations; it changed no account settings, purchased no hardware and deployed nothing. No outstanding tool-consent request exists from this session.
