# Repeatable staging measurements

This harness measures staging without deploying new functions, changing any real
event, charging cards or invoking an email provider. It creates private synthetic
events, a temporary Firebase Auth member, event-scoped manager/admission roles,
Scanner PINs and comp tickets. It never grants global administrator privileges.
Fixtures are absent from `publishedEvents`, `currentEvents` and `eventSlugs`, so
they do not appear on public event pages. Comp tickets award zero Pluto Points.

## Run

From the repository root, after updating to the deployed code:

```powershell
npm --prefix functions run build
node scripts/load-test/staging.cjs --gcloud --sizes=250,1000,3000 --concurrency=1,5,10,25 --samples=60
```

Use an existing `gcloud auth login` with staging access, or omit `--gcloud` to use
Application Default Credentials. The harness sets the staging quota project for
user OAuth credentials. It does not log/store access tokens, passwords, QR codes,
Scanner PINs, client secrets or payment keys. It fetches the public Firebase web
configuration from staging and gets ticket QR credentials from the deployed API.

`--help` lists commands. Defaults are bounded to 18 minutes, at most 5,000 tickets
per event, four attendee sizes, six concurrency levels, concurrency 50 and 200
samples per phase. An incomplete phase or over 10% unexpected failures stops new
work. A staging deployment change also stops timed work. These are protective
bounds, not promises of supported traffic.

The exact project `pluto-staging-92eb7`, HTTPS origin and deployed staging/test
identity are enforced. Production and emulator targets are rejected. PR CI only
runs the pure unit tests; it never runs the cloud benchmark automatically.
The local backend and fixture source must match the advertised staging revision.
Rebuild functions before each run. Cloud measurements consume normal staging
Firestore and Cloud Functions usage.

## Scenarios and limitations

- **Inventory core:** calls the actual `Orders.checkout` code against real staging
  Firestore. An isolated transaction adapter marks only this run's newly created
  orders `load-test-reserved`, preventing payment recovery/fulfillment/receipt
  workers from processing them. Stripe access fails closed. Validation, preflight
  reads and inventory transactions run normally. This diagnostic runs from the
  operator's computer using REST transport, so WAN latency extends lock duration.
  Its throughput is **not deployed checkout throughput**. Near-sellout tests assert
  exactly ten holds from thirty attempts, and pool/order counts must match.
- **Admission:** real deployed API requests, signed tickets and Scanner PIN
  sessions. Each concurrent worker has its own session by default, matching
  separate door devices. PIN setup is paced below existing login limits. Every
  measured scan must be accepted, admitted counts must match, and ten simultaneous
  scans of one fresh ticket must yield one acceptance and nine duplicates.
- **History/read path:** each dataset has four tickets per synthetic comp order.
  Measures the first paged order response and three full offline manifests. The
  manifest includes database reads, signing, transfer and JSON parsing; mobile
  UI/camera/rendering performance is not measured. Revenue-summary convergence
  is observed for up to 30 seconds before scanner setup; pending background
  work is reported rather than hidden.

The load generator is closed-loop: a worker starts its next request when the last
one completes. Results show successful operations/second, p50/p95/p99 latency,
sample counts and failures. They do not prove sustainable open-loop capacity or
model an unlimited waiting queue. Background staging workers and other testers
can influence measurements. Small samples and one run do not establish an SLA.
Manifest percentiles use only three downloads; their p95 is the slowest sample.

The measured phases do not test paid Stripe fulfillment, tax, refunds, RSVP
verification email, delivery, offline replay or app UI. Existing functional suites
cover those paths separately. Stripe itself recommends mocking provider calls
for load tests because sandbox limits/latency differ from live processing:
[Stripe load-testing guidance](https://docs.stripe.com/rate-limits#load-testing).

Use `--shared-scanner` to stress one shared scanner session. Use `--skip-inventory`
to repeat only deployed admission/history measurements. Do not compare runs with
different session models as if they had the same workload.

## Results and reruns

Each run writes `output/load-tests/<timestamp>-<run-id>/`:

- `run.json`: raw timing samples, deployment/source revisions, scope, outcomes,
  correctness checks, errors and cleanup status. No credentials.
- `phases.csv`: phase-level metrics for spreadsheets and historical comparison.
- `report.html`: portable responsive charts, exact values and limitations.

The [first measured baseline](staging-load-test-results-2026-10-12.md) includes
committed aggregate JSON in `docs/benchmarks/`. These omit raw samples and cleanup
scope; use the original `run.json` for cleanup. `cleanupVerification` records
post-cleanup queries for remaining scoped records.

Regenerate a report or export comparable PNG/SVG plots:

```powershell
node scripts/load-test/report.cjs output/load-tests/RUN/run.json
python scripts/load-test/plot.py output/load-tests/RUN/run.json --output=output/load-tests/RUN/performance.png
# Compare multiple actual runs; matplotlib is required.
python scripts/load-test/plot.py PATH/first/run.json PATH/second/run.json --output=output/load-tests/comparison.png
```

For useful comparisons, keep origin, code revision, driver location, attendee
counts, order grouping, session model, concurrency and samples documented. Run
several repetitions. Retain raw failures; do not silently retry away contention.
Attendee headcount is a storage/read dimension. Purchase and arrival *rates*,
door count and acceptable latency determine the practical operating envelope.

## Cleanup and interruption

Normal completion, caught failures and Ctrl+C stop new work and attempt cleanup.
Only this run's marked event/uid namespace is eligible. Any unrelated order,
live-mode flag or payment identifier stops deletion for inspection. Synthetic
roles, PIN lookup/session/lease records, tickets, orders and revenue projections
are removed. Existing events and global health/rate-limit records remain intact.
Cloud workers may finish already queued no-op callbacks after cleanup.

After a forced process kill or partial failure, use its durable run manifest:

```powershell
node scripts/load-test/staging.cjs --gcloud --cleanup=output/load-tests/RUN/run.json
```

Cleanup supports partially deleted fixtures. Verify `cleanupComplete` in the
report. Do not manually expire or delete unrelated Stripe sessions to repair a
benchmark. The inventory adapter creates none.

Synthetic event windows end after 25 minutes with reminders disabled. Inventory
fixtures never become open/paid Stripe orders; expired checkout follow-ups are
ineligible. Seeding deliberately bypasses purchase fulfillment, which is why this
can exclude all email calls while testing real admission and history paths.
