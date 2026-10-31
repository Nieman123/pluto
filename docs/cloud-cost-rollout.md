# Cloud cost controls

This implements the recommendations in [the October 30 audit](cloud-cost-audit-2026-10-30.md). Code changes need the coordinated release below; editing the repository alone does not reduce live worker usage.

## Runtime behavior

- Manual recovery writes three durable requests to `ticketingRecoveryRequests`. Only document creation invokes the new worker. Health heartbeats no longer trigger a recovery function. Duplicate deliveries share the existing per-lane leases; busy or failed requests retry.
- Each maintenance lane retains its independent heartbeat. An independent five-minute scheduled function performs the broad health audit, protected by a shared lease and cached result. Failures and explicit staff refresh can force an audit. An overdue due-payment queue is reported even when the payment heartbeat is current.
- Paid Stripe orders have an indexed `nextFinancialCheckAt`. Uncertain payments, pending fees and review cases retry after five minutes; settled first-day purchases after one hour; older settled purchases daily; purchases more than 180 days beyond payment and ticket validity weekly. Signed financial webhooks reconcile immediately. Pending refunds retain their existing recovery queue. A one-time, bounded historical migration performs a final pass after a 20-minute old-revision drain window.
- Financial projections ignore bookkeeping-only order updates while still detecting money, ticket-count, event, date and admission-hold changes. Their transactions continue reading the current ledger, preserving duplicate/out-of-order safety.
- Production recovery remains every minute for email and communications, and every five minutes for payments. Staging defaults to `quiet` (all three every five minutes); `active` restores production-equivalent cadence for acceptance. Public/API and webhook concurrency remain unchanged; scale-to-zero and webhook maximum 20 are explicit.
- The five known disposable staging load-test runs already have zero remaining synthetic events, orders or tickets, verified against live Firestore; see [the cleanup receipt](benchmarks/load-cleanup-2026-10-30.json). No unrelated staging purchases were removed.
- Provider secrets are bound only where used. Payment workers get Stripe; email/recovery workers get Stripe and Resend; campaign, financial and health workers need neither. Signing/rotation/wallet secrets remain on the API that serves credentials.
- Only the independent health worker uses fractional CPU (`gcf_gen1`, 256 MiB, concurrency 1). The [staging benchmark](benchmarks/health-cpu-benchmark-2026-10-30.md) supports this setting; other workers remain at one CPU. Set the environment's `TICKETING_HEALTH_CPU` release variable to `1` to restore full CPU, then validate that same allocation in active staging before production.

## Public cache policy

Homepage, links, rentals and ManaFest regain their existing 60-second shared cache and up to 300 seconds stale-while-revalidate. Published event pages, listings, calendars and sitemap use a 60-second shared cache without stale-while-revalidate. Approved public artwork caches for five minutes. Removed public content can therefore remain visible for that interval; urgent removal needs a Hosting cache invalidation/release. Draft previews, private ticket APIs, wallets, waivers, errors and deployment identity remain private or no-store. Checkout always validates current inventory and prices in the database; cached availability is informational.

## Retention

`firestore.indexes.json` enables TTL only for these temporary records:

| Records | TTL deadline |
| --- | --- |
| Ticketing/waiver rate limits, native checkout handoffs, wallet downloads | Existing timestamp `expiresAt` |
| Offline scanner leases | Existing `expiresAt`, seven days after offline validity; replay allowance remains unchanged |
| RSVP verification/upgrade grants, recovery/access links, transfers, waitlist tokens, scanner sessions | New timestamp `deleteAfter`, seven days after the numeric authorization deadline |
| Completed manual recovery requests | Seven days after completion |
| Completed/ignored payment webhook inbox records | 90 days after completion |
| Email delivery callback records | 90 days after receipt |

TTL is asynchronous cleanup, not authorization. Existing deadline checks remain in place. The recurring native-handoff deletion scan is removed once this configuration is deployed. Pending payment callbacks have no expiration. Email send records are retained as idempotency tombstones; deleting them could recreate an old receipt or announcement. Orders, tickets, refunds, financial summaries, audit trails and unresolved jobs are retained. Scanner PIN records and lookup records remain available for administration/audit.

`node scripts/migrate-cost-retention.cjs --project=PROJECT --pages=100` previews old records; add `--apply` to backfill metadata. Pages contain at most 100 documents, with a resumable checkpoint per collection and conditional transactional updates. It does not directly delete data. Each release resumes unfinished pages. Re-run until every reported collection has `done: true`; a large historical collection can require more than one bounded run.

## Deployment order and acceptance

1. Run the repository checks and merge the reviewed commit. The normal main push deploys quiet staging. Use the Release workflow's `worker_mode: active` on that exact merged SHA for production acceptance.
2. Release deploys indexes/TTL without `--force`, preserving unrelated cloud indexes. It waits until the due-payment query is executable before deploying dependent code.
3. Release deploys the API, new `ticketingRecoveryRequestWorker`, independent health schedule, workers, access rules and client together. It verifies project/revision identity and public/private cache headers.
4. On the first cutover, the migration waits 545 seconds for old 540-second workers to finish. It transfers any legacy manual request idempotently, verifies the replacements are active on the selected SHA, and deletes **only** the old `ticketingRecoveryWorker` after confirming its audited trigger. Later releases skip the drain when the old function is absent. Expiration metadata backfill follows the drain.
5. Confirm a sandbox purchase, receipt, refund/dispute reconciliation, missing-webhook recovery, manual recovery and admission; confirm all lane heartbeats and the independent health snapshot advance. Confirm the financial schedule's final migration pass finishes after its 20-minute window, and retention checkpoints finish. Check new worker secrets and effective resource settings.
6. Production retains the existing protected-environment approval and exact successful staging-SHA requirement. Quiet-mode staging evidence cannot qualify the backend production release. No production gate is bypassed by these scripts. After acceptance, rerun the same staging SHA in quiet mode to restore cheaper idle operation.

Rollback uses the existing Release workflow and an accepted previous SHA. Keep the new request worker until its queue is drained if rolling back the API; schedules still recover normal queues. Redeploying the old code may restore the noisy health-write trigger. TTL does not delete payment/audit records; old code can ignore added fields, but reverted code will not add expiration metadata to newly created numeric grants. Prefer a forward fix if the issue is confined to a cost control.

## Billing controls and measurement

The approved alert-only budgets are $50/month for `pluto-9b6ca` and $20/month for `pluto-staging-92eb7`, including credits. Actual-spend alerts fire at 50%, 90%, and 100%; forecast alerts at 100%. Default billing IAM recipients receive notifications. These alerts do not disable ticket sales or cap spending.

`python scripts/cost-controls.py` previews the exact managed controls; `--apply` persists and verifies them. It preserves unrelated budgets and existing Artifact Registry policies and adds seven-day retention for old function build images. The production repository also has a preexisting Firebase seven-day policy; duplicate equivalent policies do not imply additional savings. Use the repository **get** endpoint for verification because its list response can omit cleanup details.

The isolated health benchmark is reproducible with `scripts/cost-benchmark/prepare.cjs`, the two-function staging-only codebase, `run.py` and `finish.py`. It uses actual audit code, synthetic isolated records, private invokers, scale-to-zero, and no provider secrets. The first-audit `cold` flag in its result is an application-first-call marker, not proof of a Cloud Run cold start; use the separate startup metric. It cannot justify changing payment, email, image/PDF or API CPU allocations.

Compare the same seven-day metrics after release against `docs/benchmarks/cloud-cost-snapshot-2026-10-30.json`: billable runtime, Firestore operations, old recovery-trigger deliveries (should stop), reconciliation/queue age and heartbeat failures. The expected 91% reduction concerns scheduled broad audits, not the whole cloud bill. Do not multiply current spend by user count or claim a per-ticket cost from this low-traffic baseline.
