# Cloud cost audit — October 30, 2026

The main opportunity is reducing repeated background work. More visitors are not currently the main source of function usage. Staging accounts for approximately 74% of measured billable instance time, while the website/API function accounts for only 1.4% across the two projects.

Implementation follow-up: the recommendations below describe the original audit. The worker, reconciliation, cache, retention and release changes are now prepared on `codex/reduce-ticketing-cloud-costs`; see [the rollout instructions](cloud-cost-rollout.md). The approved $50 production/$20 staging budgets and seven-day build-image retention have been verified live. Staging has the new due-payment index and 15 active TTL policies. Application rollout and production TTL are still pending; do not count their savings before deployment. The health CPU benchmark and cloud-control receipts are in `docs/benchmarks/`.

## Scope and evidence

- Reviewed the function definitions, maintenance/recovery workers, payment reconciliation, public routes, media serving, frontend refresh behavior, deployment workflow, and retention configuration.
- Read live function configuration and Scheduler jobs in `pluto-9b6ca` and `pluto-staging-92eb7`. Read Cloud Monitoring totals from October 23, 2026, 13:07 EDT through October 30, 2026, 13:07 EDT (seven days, ending five minutes before collection).
- Evidence snapshot: [cloud-cost-snapshot-2026-10-30.json](benchmarks/cloud-cost-snapshot-2026-10-30.json). Metrics are usage observations, not an invoice or an allocation of credits. Request counts include background event deliveries, not just people visiting the site.
- At the original audit snapshot, no cloud resources, payment behavior, job schedules, or production deployments had been changed. Subsequent implementation status is recorded above and in the rollout instructions.
- Existing untracked work, including the earlier scalability audit, was left unchanged. Its conclusions were not treated as instructions or as verified current evidence.

## What the screenshot establishes

The supplied October 1–30 report shows $13.12 total: Cloud Run Functions $11.84 before $4.61 savings, or $7.23 net; App Engine $5.08; smaller amounts for other services. The console forecast is $14.39 for the month. The large percentage increase compares against a near-zero prior period and does not itself establish runaway growth.

The current daily bars are higher than the early-month bars. Neither the month-to-date total nor the console forecast should be treated as a guaranteed future monthly ceiling.

Subsequent user-supplied Cloud Assist analysis identified the App Engine label as Firestore, but its quoted production charges of $0.38 for reads and $0.26 for writes explained only $0.64. The later SKU CSV resolves the missing amount: reads total $3.09 and writes total $1.99, together exactly $5.08. Do not attribute the difference to staging as a verified fact: the CSV has no project column, and the earlier Cloud Assist figures may represent a different scope.

## Reconciliation with the supplied SKU export

Source: `01F4DD-2FFF51-5D4F90_Live costs, 2026-10-01 — 2026-10-30, (2026-10-30 10h25m18s PDT).csv`, supplied from the user's Desktop. The filename identifies October 1–30 and an export timestamp of October 30 at 13:25:18 EDT. All 39 SKU rows were read; their displayed subtotals sum exactly to the export's $17.91 footer, excluding that footer from the calculation.

| Cost item | Export subtotal |
| --- | ---: |
| Function CPU, us-central1 | $11.66 |
| Function CPU, us-east1 | $0.06 |
| Firestore reads (`FF6D-2156-62C2`) | $3.09 |
| Firestore writes (`4BFF-324E-4B50`) | $1.99 |
| Secret Manager, storage and access combined | $0.39 |
| Cloud Scheduler jobs | $0.32 |
| Function memory | $0.29 |
| Artifact Registry storage | $0.10 |
| Firestore backup storage | $0.01 |
| All other displayed SKU subtotals | $0.00 |
| **Total** | **$17.91** |

The App Engine-labeled rows total $5.09 in this later export: $5.08 of Firestore reads/writes plus $0.01 of Firestore backups. There is no unexplained $4.44 remaining in the SKU breakdown. Cloud Run Functions totals $12.01. CPU, Firestore reads and Firestore writes together account for $16.80, or 93.8% of the export total, supporting the focus on redundant worker activity.

The export contains Actual cost, Live cost and Subtotal columns, but no savings/credit columns, project identifiers or operation quantities. Its $17.91 total must not be presented as a replacement net payable amount for the screenshot's $13.12 after savings. Displayed actual costs sum to $17.75 and live costs to $0.15; the one-cent difference from $17.91 occurs in the us-east1 CPU row, whose rounded columns are $0.05 + $0.00 versus a $0.06 subtotal. Preserve the supplied subtotal rather than inventing precision. Minimum-instance CPU/memory, invocation fees, logging and data-transfer lines all display $0.00, which is not proof of zero underlying usage. The us-east1 CPU charge is small and was outside the earlier us-central1 live inventory.

## Live usage breakdown

Billable instance seconds over the measured seven days, rounded:

| Function | Staging | Production | Combined share |
| --- | ---: | ---: | ---: |
| Payment maintenance | 35,957 | 2,384 | 29.3% |
| Communication maintenance | 17,950 | 10,466 | 21.7% |
| Email maintenance | 16,106 | 10,110 | 20.0% |
| Manual-recovery trigger | 8,767 | 9,280 | 13.8% |
| Financial-summary trigger | 17,223 | 2 | 13.2% |
| Website/API (`publicSite`) | 278 | 1,573 | 1.4% |
| Remaining functions | 401 | 460 | 0.7% |
| **Total** | **96,682** | **34,274** | **100%** |

Both projects have 12 functions. All use one CPU, no configured minimum instances, and request concurrency of one for most workers. `publicSite` uses 512 MiB, concurrency 8, maximum 10 instances. Other functions use 256 MiB. The deployed webhook worker has maximum 20 instances and concurrency 80; its source does not explicitly set those limits.

At the published us-central1 active CPU rate of $0.000024 per CPU-second, extrapolating this observed week gives roughly **$13.47 of CPU usage over 30 days before credits**, plus memory and other services. This is a rough planning calculation, not a bill forecast: startup CPU boost, traffic changes, billing details, and credits can change the outcome. Cloud Run's free tier is shared across projects on a billing account. [Cloud Run pricing](https://cloud.google.com/run/pricing).

## Savings in priority order

### 1. Separate manual recovery requests from routine health writes

Evidence: `functions/src/ticketing/workers.ts:30` subscribes to every write to `ticketingHealth/{healthId}`. `operations.ts:452` writes lease/heartbeat state, and `health.ts:40` plus `operations.ts:519` write the issuance cursor and health snapshot. These writes invoke the recovery function even though its handler normally returns because `requestId` did not change.

Measured recovery deliveries: **88,693 staging + 88,460 production = 177,153 in seven days**. Their combined billable time was 18,047 seconds, or 13.8% of all observed function time. Source behavior strongly explains this pattern; the aggregate metrics do not identify the exact no-op percentage.

Recommendation: create explicit manual-recovery queue documents in a separate collection and trigger only on their creation. Keep independent lane leases, durable requests, retry behavior, and staff authorization. Migrate the trigger with the API and Firestore access rules; merely adding another early return does not prevent billed invocations.

The observed recovery worker's CPU alone extrapolates to about $1.86/month before credits. Most of that is a plausible savings opportunity if genuine manual requests remain rare. Do not add this estimate to other overlapping savings estimates without remeasuring.

### 2. Run the broad health audit once, instead of after every recovery lane

Evidence: every successful maintenance lane invokes `refreshHealth()` (`operations.ts:462`). The communications and email lanes run every minute; payments runs every five minutes. Each health audit reads multiple queues, scans up to 50 paid orders, and counts their issued tickets (`health.ts:7–40`). All three repeat the same broad audit.

This schedules approximately **95,040 broad audits per 30-day month per project** before retries/manual runs. A single coordinated audit every five minutes would schedule 8,640: about **91% fewer broad audits**, not 91% less total cloud spend.

Recommendation: retain each lane's heartbeat and independent recovery work, but coordinate/cache the expensive cross-system audit. Preserve prompt failure alerts, the 15-minute heartbeat checks, and explicit staff refresh. A shared lease is necessary so different instances do not all refresh at once. Do not simply attach the only audit to the payment lane: a stalled payment lane must remain detectable.

Also skip cursor writes for already-empty queues where the cursor is already reset (`worker-batch.ts:30`). They currently create database writes even with no queued work.

### 3. Stop continuously reconciling every historical paid order

Evidence: the payments pass rotates through up to 100 `paid` orders every five minutes (`operations.ts:492`). `orders.ts:337` retrieves the Stripe session and line items, lists refunds and disputes, and invokes another refund-listing pass. It also updates the order's financial-check fields and timestamps, causing financial-summary triggers (`workers.ts:10`).

Staging recorded **78,588 financial-summary invocations** in seven days despite only **192 website/API requests**. Together, payment maintenance and financial-summary processing consumed about 55% of staging billable time. This is consistent with old test purchases being repeatedly reconciled, although individual order contents were not read to attribute it conclusively.

Recommendation: use a due-work query with a `nextFinancialCheckAt` field and index, scheduled according to order state/age. Keep immediate signed webhook processing and fast retries for uncertain payments, pending fees, refunds and disputes; reconcile settled older orders less frequently. Historical records should eventually leave the frequent recovery path while retaining an appropriate reconciliation policy. Filter nonfinancial order changes before running projection database transactions.

This is the most important change for long-term ticketing costs. The current loop is bounded per run, so it does not grow without limit in direct proportion to total orders; instead, it can keep the worker busy indefinitely and lengthen the time between checks as history grows. Changes need missed-webhook, refund/dispute, duplicate-delivery and admission tests.

### 4. Give staging a cheaper quiet mode

Both environments currently run the same four always-enabled scheduled jobs: two once per minute and two every five minutes. That is **103,680 scheduled executions per project per 30 days**, before triggered follow-on work. Staging's function usage is almost three times production's.

Recommendation: use an explicit quiet-mode schedule outside active testing, restore production-equivalent timing for release acceptance, and clean up disposable load-test purchases with the existing safe test cleanup process. For example, changing the two minute jobs to five minutes reduces scheduled executions by two thirds; it also delays deferred emails, reminders and other recovery, so it should be a documented staging choice. Adjust health expectations if any interval reaches 15 minutes or longer. Do not disable production recovery to save money.

### 5. Benchmark smaller CPU allocations for serial background workers

The scheduled workers use a full CPU while allowing only one request per instance. Much of their work waits on Firestore and external services. Candidate workers could use explicit 256 MiB memory and `cpu: 'gcf_gen1'` after a staging benchmark. Firebase documents a 1/6 CPU allocation at this memory size; fractional CPU disables multi-request concurrency. [Function runtime guidance](https://firebase.google.com/docs/functions/manage-functions).

Measure billable CPU-seconds, completion time, cold starts, memory and backlog recovery under a realistic workload before applying it. Lower per-second allocation is not automatically a lower total bill if work takes sufficiently longer. Keep full CPU/concurrency for the public API and benchmark image/PDF/signing work separately.

### 6. Restore public caching, then address event artwork traffic

**Local fix prepared:** the root-mounted ticketing router was overwriting the homepage, ManaFest archive, links and rental pages' intended public cache header with `private, no-store`, even though it did not handle those routes. The cache restriction now applies to its own route families. Existing ticketing/event responses, private APIs, waivers and deployment identity remain uncached. Regression tests check real HTTP responses, including case-insensitive ticketing paths.

The public pages regain their existing policy: a 60-second shared cache with up to 300 seconds of stale-while-revalidate. This tradeoff was already specified in `public-data.ts`. Hosting can serve cached dynamic responses without invoking the function on every visit. [Firebase cache behavior](https://firebase.google.com/docs/hosting/manage-cache).

**Further opportunity:** every public event image currently goes through `publicSite`, checks several documents and downloads from private Storage (`routes.ts` media handler; `catalog.ts:204`). Images and event discovery pages are explicitly uncached. Introduce short, explicit public cache policies or publish approved immutable artwork to CDN-backed storage, with a defined removal/invalidation policy. Do not make drafts or private ticket/wallet endpoints public. Real checkout must continue to validate current inventory regardless of any displayed cached availability.

## Other cost controls and open questions

- **Firestore attribution reconciled by the SKU export.** Reads ($3.09) and writes ($1.99) explain the earlier $5.08; the later CSV additionally lists $0.01 for backups. Prioritize reducing redundant health scans, cursor writes and repeated payment reconciliation. The export does not attribute these costs to projects or individual code paths; per-project billing evidence is still needed for that split. Backups cost only one displayed cent and are not a meaningful savings target.
- **Retention:** `firestore.indexes.json` has no checked-in TTL policies, and transient rate-limit records carry `expiresAt`. Cloud-only policies were not inspected; do not assume none exist. Verify cleanup for rate limits, verification challenges, stale jobs and deployment artifacts. Numeric expiry fields must not be mistaken for automatically enabled Firestore TTL. Retain payment/audit records according to the application's requirements.
- **Secrets:** several workers bind the entire ticketing secret set even when they use only some of it. Narrow bindings when splitting workers; prioritize the measured compute issues over the screenshot's $0.39 Secret Manager charge.
- **Limits and alerts:** keep scale-to-zero, set the webhook maximum explicitly in source to avoid relying on deployment defaults, and load-test any tighter limit. A maximum-instance setting limits concurrency, not total monthly spend. Configure per-project actual/forecast billing alerts with a chosen monthly threshold; ordinary alert-only budgets do not cap usage. Review service-specific spend-cap support and availability implications separately. [Budget guidance](https://docs.cloud.google.com/billing/docs/how-to/budgets).
- Avoid adding an always-running cache/database or buying a committed-use contract at this usage level solely for savings. Reduce redundant work first.

## Verification and rollout

The local cache patch is the only runtime change in this audit. Validation completed: `npm --prefix functions test` rebuilt the functions and passed all 94 tests; `git diff --check` passed. The first restricted run could not connect to its own local HTTP test servers; rerunning with local network access passed. Next, deploy through the existing staging/release workflow and inspect live `Cache-Control`/cache-hit behavior before production rollout. No savings are realized from a local patch until it is deployed.

For the larger worker changes, compare the same metrics for seven days after release: billable instance time by function, Firestore operations, recovery-trigger deliveries, payment reconciliation age, email queue age and heartbeat failures. The expected result is lower idle background activity while purchases, refunds, emails and admission continue meeting their existing reliability requirements. Exact savings per ticket cannot be inferred from this low-traffic week; measure a representative purchase-to-email-to-check-in workload separately.
