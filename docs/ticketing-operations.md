# Ticketing operations and customer support

## Ticket settings and venue-based tax

Saving ticket settings in an event dashboard immediately updates the published event's offers, pools, promotions, tax setup, registration mode, reminders and waitlist settings in one transaction. Studio artwork, description, schedule, slug and private venue edits remain drafts until published. Draft, archived and cancelled events are not automatically published. Existing orders retain their purchased prices, tax configuration and admission windows. Revision and inventory checks reject concurrent edits or capacity below sold/reserved stock; failed saves leave both draft and live settings unchanged. The Studio publication indicator tracks content differences even when a ticket-only save advances the public revision.

For US venues, choose **Automatic · Use event address** and confirm the venue/category/registration checkbox. Enter the street address, city, two-letter state and ZIP in Studio; publish venue changes before updating tax settings on a live event. Automatic setup uses the published venue, caches one Stripe performance location per address/payment mode, and creates immutable ticket products with that location. Changing an address, category or product name creates a new product rather than changing the product used by an outstanding order. Private venue ZIPs and tax IDs are omitted from public projections.

Stripe Tax must already be enabled in the selected sandbox/live account, with an active state sales-tax registration for that venue. Pluto checks the exact state and environment and does not create tax registrations or substitute a guessed flat NC rate. The application Stripe key needs permission to read tax codes/settings/registrations and to create/retrieve tax locations and products. Default admission classification is the verified **Admission to Amusement, Entertainment and Recreation Venues** category (`txcd_50010001`); the organizer confirms it, and camping/vehicle passes require appropriate explicit classifications in their advanced settings. Manual inclusive Stripe rate configuration remains available. [Stripe location-based sales](https://docs.stripe.com/tax/location-sales), [NC admission sourcing](https://www.ncdor.gov/taxes-forms/sales-and-use-tax/filing-requirements-payment-options/sourcing-sales-sales-and-use-tax).

An uncertain tax-location creation retries its frozen request with the same idempotency key. After 23 hours, automatic retries stop for administrator review. Inspect the sandbox's tax locations and the API-only `ticketingTaxLocations` record before repairing an interrupted setup; never blindly delete its pending record and create duplicates. Real Stripe acceptance must verify location creation, product classification, the venue state registration, inclusive checkout totals, an out-of-state buyer, tax reversal on refund, and venue edits with an already-open order. Provider calls in local/CI tests are substituted. No deployment or cloud account changes are made by the source tests.

Tickets enlarge when their QR is tapped, with a short scale/fade transition, keyboard access, a close control and reduced-motion support. The enlarged view keeps the original signed QR and its quiet zone. Existing wallet export controls remain disabled pending issuer setup.

## Paged orders and server revenue summaries

Event orders and RSVP queues load 50 records at a time. **Load more** continues through older orders; searches run on the server and can continue across pages. Each request scans at most 500 indexed candidates, so a sparse search can show no matches on one page while still offering **Load more**. Event/status predicates use Firestore indexes. Order cursors belong to their filter/event scope; changing filters restarts the list. Event order tables hide expired checkouts, while All Orders and full CSV exports retain that history. CSV export streams pages independently of the current search or loaded table rows.

Revenue and RSVP counts come from API-only `ticketingFinancialSummaries`, rather than the browser's current order page. `ticketingFinancialWorker` reads the current order ledger and transactionally replaces its previous contribution in `ticketingOrderSummaries`. Duplicate/out-of-order triggers therefore cannot count a payment or refund twice. Updates include paid orders, issued units, cash/comps, discounts, tax/refund adjustments, confirmed/pending Stripe fees and payment reviews. The order ledger remains authoritative; summaries do not authorize payments or admission.

Historical orders and timezone edits use `ticketingFinancialBackfillWorker`, processing up to 100 orders per continuation with a lease and a 90-second soft budget. Communications recovery wakes abandoned pending backfills. Initial summaries are marked **being prepared** until history is complete; the UI refreshes while waiting. New payments/refunds are reflected asynchronously, and dashboards show the summary's update time plus **Refresh performance**. Lifetime totals are retained; daily gross chart buckets retain the last 90 event-local calendar days for the 7/28/90-day chart and Monday-based weekly totals. A missing summary or schema upgrade starts a new generation and replays the ledger, so cached per-order contributions cannot suppress rebuilding or double-count it.

Release must include both new financial workers and the added `ticketingOrders` indexes. These workers need no payment or email secrets. Existing history backfills automatically when an event's revenue is first requested. After staging deployment, check an event with more than 50 orders, a cross-page buyer search, an RSVP queue, a full CSV export, and a refunded/fee-pending order. Confirm totals do not change when loading another table page and that the initial preparation status clears.

Revenue preparation refreshes the index's figures in place, preserving loaded flyers and card focus. Polling backs off from two seconds to a maximum thirty seconds while history is still being prepared, and stops when summaries are ready or the user leaves the index. **Refresh totals** requests an immediate update. Current/history flyer downloads share one queue with at most two requests in flight, including during catalog changes; visiting Studio directly does not load hidden catalog artwork.

## Campaign delivery and recovery workers

Campaign creation and committed page progress trigger `ticketingCampaignWorker` immediately. Each page handles up to 100 ticket/order records; stable recipient job IDs deduplicate holders across pages, duplicate triggers and retries. Lease tokens fence stale workers. Communication maintenance wakes pending campaigns whose leases expired, including jobs created before this release. Normal pagination does not wait for a scheduled tick.

Recovery runs independently:

- `ticketingMaintenance`: payment/order/refund/webhook reconciliation every five minutes.
- `ticketingCommunicationMaintenance`: notice creation, campaign recovery, waitlists and checkout follow-up scheduling every minute.
- `ticketingEmailMaintenance`: pending email recovery every minute.
- `ticketingRecoveryWorker`: executes durable administrator-requested recovery for each lane. **Retry pending jobs** queues this work and returns immediately.

Each lane has its own lease and health heartbeat. Phases stop starting records after a 60-second soft budget, checkpoint only visited records and await in-flight work. Function timeouts retain substantial headroom for provider calls; this is not a promise that an unavailable dependency will recover within 60 seconds. One failed record is logged, the rest of its page can proceed, and the phase remains visibly failed for operator review. Payment checks and message delivery can overlap: temporary payment reconciliation defers attendee emails instead of discarding recipients. Admission still respects financial holds.

Email triggers have bounded concurrency. A shared per-project delivery limiter spaces provider attempts by at least 500 milliseconds and respects `Retry-After`; provider idempotency keys and snapshotted retry payloads are retained. Provider quotas and outages can still delay actual delivery. Resend documents its [rate limits and retry headers](https://resend.com/docs/api-reference/rate-limit).

Reminders use the actual event date, time and timezone. New 24-hour reminders expire when the four-hour reminder window begins, four-hour reminders expire at the start, and location notices expire at the end. Legacy reminders/location jobs without explicit deadlines are also checked against event times. Expired notices that have never been attempted are cancelled. An expired notice with an uncertain earlier provider attempt goes to **review**, preserving its original payload; inspect the provider outcome instead of sending another copy. Cancellation notices and organizer announcements remain available after an event.

Deployment uses the existing Firebase project and secrets. The release workflow includes all four added functions (`ticketingCampaignWorker`, `ticketingRecoveryWorker`, `ticketingCommunicationMaintenance`, `ticketingEmailMaintenance`); do not deploy only the website or the old maintenance function. After staging deployment, verify all three recovery heartbeats, run a controlled announcement, confirm queued recipient counts stop changing at the expected audience size, and check that retries retain the original provider references. Monitor the new Scheduler jobs alongside the original one. A successful local test does not verify cloud trigger delivery or external alert routing.

The public `/events` page shows upcoming and ongoing events until their end time. Completed and archived events appear at `/past-events`, linked below the event grid; that page links back to upcoming events. Historical cards use **View event** rather than a purchase/RSVP call to action.

Successful door scans show a floating **Ticket scanned** confirmation with the current attendee name and ticket type. It dismisses after two seconds or with the close button; camera scanning can continue with the next QR. Duplicate and rejected scans show separate warnings. Offline acceptance explicitly says it is queued pending server confirmation. Prepare offline admission again after this release to include attendee names in the manifest; older prepared snapshots show **Attendee name unavailable** rather than guessing a name.

Ticketing console errors and status messages appear in a floating notification at the bottom of the screen, including while scrolling or using an order dialog. Errors stay until dismissed or replaced by the next message. Ordinary status messages dismiss after eight seconds; hovering or keyboard focus pauses that timer. Public event checkout retains its form-specific inline feedback.

In Event Studio, the page actions appear above the section navigation. The sticky save bar includes **Publish event** for an unpublished event, **Publish changes** for edits waiting to go live, and a disabled **Published** button when the current revision is live. Publishing saves unsaved edits first. Saving a draft alone does not publish it; a failed publish leaves the draft available to retry.

## RSVP and VIP options

In the event dashboard, **Ticketing setup → Ticket types & passes → Add paid VIP option** adds a $100 option. Edit its price and capacity, save ticket types, then publish the changes.

- **Open RSVP:** Guests choose one free RSVP or one paid VIP admission ticket. VIP includes event entry and needs no separate RSVP. Both options use the admission capacity pools.
- **Organizer approval required:** Guests first obtain an approved free RSVP. VIP is an additional upgrade for that named attendee; it uses a separate VIP capacity pool, initially 100 and editable. It does not consume another admission place. Pending, declined and withdrawn RSVPs cannot purchase an upgrade.

The approved RSVP email must be verified before VIP checkout, through a matching verified account or a six-digit email code. VIP inherits the approved attendee's name and admission window and cannot be transferred separately. The approved RSVP order includes **Browse VIP upgrades** when upgrades are available.

Door staff can scan the VIP QR once to check in both VIP access and the underlying approved RSVP. This counts one attendee. Scanning that RSVP's admission QR afterward reports a duplicate. Prepare offline admission again after deployment so the manifest includes the link between VIP and RSVP; offline acceptance remains pending server reconciliation.

Refunds remain organizer-controlled. Refunding VIP leaves the free RSVP valid; unused VIP stock is returned under the existing refund policy, while scanned stock stays consumed. Guests must close an open VIP checkout or contact Pluto about an issued upgrade before withdrawing the linked RSVP. This includes upgrades discounted to $0, which admins close through the same refund controls without a provider refund. An already-arrived RSVP cannot be withdrawn. Revoking or reissuing the parent RSVP makes older VIP credentials unavailable.

Local coverage includes payment/order integration tests, approval and email gates, refunds, door scanning, and browser purchase routing. Browser payment sessions are simulated; run a real Stripe sandbox purchase in staging before enabling these options for customers.

## Health and recovery

Global administrators have **System health** on `/tickets/admin`. The navigation badge refreshes once a minute. The dashboard reports stalled payment events, unresolved refunds, checkout reservations, missing ticket issuance, email failures and the maintenance heartbeat. **Run health check** refreshes diagnostics; it does not issue tickets or release stock.

Maintenance stores its last successful run and emits structured Cloud Logging events for critical issues and actionable warnings. Checks are bounded: up to 500 records per queue, a rotating batch of 50 paid orders, and 200 visible alerts. The dashboard explicitly labels limited coverage. A clean sampled pass does not establish that every historical order is correct.

- **Payment event:** Retry safely processes the original inbox item and retrieves authoritative Stripe objects.
- **Refund:** Retry safely uses the original approved allocation and provider idempotency key. An already-recorded external Stripe refund is mapped locally rather than charged again.
- **Pending email:** Retry safely keeps the same payload and provider idempotency key. Uncertain sends older than 23 hours require review. Look at Resend before sending a new access link.
- **Missing tickets or payment review:** Open the order, compare its Stripe payment and allocation, and use the existing reconciliation controls. The health dashboard cannot mint replacement tickets or erase a financial hold.

Email history in order details distinguishes queued/sent messages from delivery results. A message accepted by Resend is not proof of inbox delivery. Correct a bad contact before sending another link; suppressions or complaints need provider review.

## Cloud notifications

The dashboard and logs work without new secrets. Email/text notifications require a Cloud Monitoring notification channel and an alert policy in **each** environment. No notification channel is created or contacted by this change.

1. In the selected project's Monitoring → Alerting → Edit notification channels, create and verify the desired channel.
2. In Logs Explorer, use this filter, then **Create alert**:

   ```text
   resource.type="cloud_run_revision"
   severity>=WARNING
   jsonPayload.event=("ticketing-health-alert" OR "ticketing-maintenance-failed")
   ```

3. Name it `Pluto ticketing operations`, select the verified channel, and set a 15-minute notification limit. Test it in staging using a controlled failed job and confirm that it reaches the operator. Restore the fixture afterward.
4. Separately monitor the `ticketingMaintenance`, `ticketingCommunicationMaintenance` and `ticketingEmailMaintenance` Cloud Scheduler jobs for failed executions and prolonged missing executions. An application cannot emit a failure log while its scheduler or runtime is completely stopped. The dashboard checks the three heartbeats independently when opened, but this does not replace external missing-execution alerts.

An API-compatible log alert template is provided in [ticketing-alert-policy.json](ticketing-alert-policy.json). Replace its notification channel resource name with the verified channel in the selected project before creating the policy. Check existing policies first to avoid duplicates. Google documents [log alert policy fields](https://docs.cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.alertPolicies) and [creating policies](https://docs.cloud.google.com/sdk/gcloud/reference/monitoring/policies/create).

## Optional Resend delivery webhook

Configure staging before production:

1. In Resend → Webhooks, create `https://pluto-staging-92eb7.web.app/tickets/email-webhook`. Subscribe to `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.failed`, `email.complained` and `email.suppressed`.
2. Save that endpoint's signing secret as **RESEND_WEBHOOK_SECRET** in staging Secret Manager and grant the public-site runtime service account access, following the existing secret setup. Use a separate endpoint/secret for production.
3. Set the staging GitHub environment variable **TICKETING_RESEND_WEBHOOK_ENABLED=true**, then release through the normal staging workflow. The secret is declared and bound only when enabled, and only on `publicSite`. With the flag unset/false, deployments do not require this secret and the endpoint returns 503.
4. Send a controlled staging email and check delivered/bounced status in its order history. Replay a delivery event to confirm idempotency. Bad or expired signatures must return 400. Signed events are persisted before correlation to cover delivery arriving before the send response.

Signature verification preserves the original bytes, including Firebase's `rawBody`. See [Resend webhook setup](https://github.com/resend/resend-skills/blob/main/skills/resend/references/webhooks.md). Provider acceptance, actual delivery and cloud notification routing still need deployed acceptance.

## Customer support

Event managers can use **Customer support** in order details to correct the buyer's name/email, send a fresh secure access email, or reopen a declined/withdrawn RSVP. Every action requires a reason and records an audit entry. Refund permissions remain separate.

Verify the customer's identity before correcting email. Email changes invalidate previous order access/recovery links and unused purchaser-held QR versions, retain account ownership and preserve transferred holders. Send a new access link to the corrected address; the original purchaser should refresh tickets too. Financial amounts, inventory and payment references are not editable here. Pending checkouts must be resolved first.

Reopening an RSVP reserves no stock and grants no QR. It returns to awaiting approval even for an originally automatic RSVP. Reapproval allocates current capacity and advances the QR version; the old pass remains invalid. An arrived RSVP cannot be reopened.

Guest RSVP submission now requires a six-digit emailed code before the address can reserve an RSVP. Codes expire after 15 minutes, are single-use, have bounded verification attempts and are scoped to the event/email. A signed-in account with the matching verified email skips this step. Approval is still required where configured. Ticket QR codes stay in the app; support emails contain secure app links.

## Offline attendee tickets

Open **My tickets** while online before leaving for the event. The app saves successful ticket/order/holder views and the web shell. After losing connectivity, previously loaded tickets can be displayed following an app reload, with a **Saved tickets · Offline** banner and the last synchronization time.

Cached admission expires at the ticket's admission end and snapshots expire after seven days. Offline transfer and RSVP mutations are disabled. A server rejection never falls back to an older QR; successful refund/revocation updates replace cached admission state. Account switching/sign-out clears the previous account's snapshots. Refreshed account lists clear older views to remove tickets transferred away. Web guest access persists in browser storage; installed native targets use platform secure storage rather than process-only memory.

Offline phones cannot learn a new refund, event cancellation, transfer or venue edit until reconnecting. Scanners still enforce current server state, or the existing prepared offline manifest policy. A hidden scheduled venue does not become visible from a cached snapshot just because its reveal time passes. Refresh online to receive the release.

The service worker caches the app shell, fonts and public SDK assets. It does not cache payment/auth APIs or order responses; ticket snapshots use the app's scoped store. Browser offline reload/refund checks and native persistence adapter tests do not establish physical Android/iOS behavior. This repository has no native platform projects yet; signing, backup/Keychain configuration and device tests remain work for native releases. Follow the separate [offline door admission procedure](ticketing-offline-admission.md) for staff scanners.

## Retention

New private collections are `ticketingHealth`, `ticketingHealthAudit`, `ticketingEmailDelivery`, `ticketingRsvpVerification` and `ticketingRsvpUpgradeAccess`. Direct client access is denied, including for admins. Numeric challenge and VIP grant expiry is enforced in the API; it is not a Firestore TTL policy. Include expired challenge/grant cleanup and delivery-event retention in the project's retention job/policy before high-volume use. Email payloads/codes are scrubbed after successful send or cancellation; support audits retain the correction reason and before/after contact for accountability.

## Event engagement and door tools

See [announcements, reminders, attendance, calendar and waitlist operations](event-engagement-and-door-tools.md). The next coordinated release includes composite Firestore indexes and needs `roles/datastore.indexAdmin` on the environment deployment account. System health reports delayed campaigns and expired waitlist holds alongside existing email failures.
