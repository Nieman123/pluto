# Staging performance baseline — October 12, 2026

Measured staging revision: `f0f22e31aa9ab580aba449f66eaa9895e637d144`.
Driver: Windows workstation, Node 22.23.3, HTTPS API requests and Firestore REST
transport over WAN. These observations establish a tested workload, not a maximum
festival size or SLA. See [the repeat guide](staging-load-test.md) for scope,
commands, safeguards and cleanup.

Two completed measured runs used 250, 1,000 and 3,000 stored tickets, four tickets
per comp order, 60 admission samples at concurrency 1, 5, 10 and 25, ten paged
order requests per dataset, and three full manifests per dataset. The first run
shared one authenticated scanner session. The second used a separate Scanner PIN
session per worker, matching independent devices. They ran sequentially, so the
session comparison is informative rather than a controlled causal experiment.
The 3,000-ticket dataset still had pending financial projection work at the
initial 30-second observation; background work can affect comparisons.

## Admission through the deployed API

Separate scanner sessions; each cell is successful scans/second and p95 response
time in seconds. Every phase had 60 successes and zero failures.

| Stored tickets | 1 concurrent | 5 concurrent | 10 concurrent | 25 concurrent |
| --- | ---: | ---: | ---: | ---: |
| 250 | 2.81 / 0.42s | 12.72 / 0.52s | 13.14 / 0.68s | 25.23 / 1.24s |
| 1,000 | 2.96 / 0.39s | 10.81 / 0.47s | 20.93 / 0.66s | 21.17 / 1.65s |
| 3,000 | 2.98 / 0.40s | 12.10 / 0.61s | 21.43 / 0.58s | 26.78 / 1.25s |

Across the two measured runs, all **1,440 normal scan requests** succeeded.
For each dataset/run, ten concurrent scans of one additional fresh ticket admitted
it exactly once and returned nine duplicates. Recorded admissions matched the
successful requests. Duplicate races are correctness checks and are excluded
from normal admission throughput.

At 3,000 stored tickets, sharing one session produced 9.22 scans/second and 3.24s
p95 at concurrency 25, versus 26.78/s and 1.25s with separate sessions. The shared
per-session rate-limit document is a plausible contention point; this comparison
does not isolate it from warm instances and background worker load.

## Read paths and background summaries

Separate-session run:

| Stored tickets | Manifest p95 | Manifest uncompressed JSON | Order-page p95 | Order-page JSON |
| --- | ---: | ---: | ---: | ---: |
| 250 | 0.89s | 226,382 bytes | 1.68s | 24,379 bytes |
| 1,000 | 1.94s | 904,633 bytes | 1.20s | 24,479 bytes |
| 3,000 | 3.37s | 2,712,633 bytes | 1.42s | 24,479 bytes |

The manifest p95 is the slowest of only three samples. Byte counts measure JSON
after HTTP decoding, not compressed wire traffic. Manifest measurements include
database reads, offline signing, download and parse; they exclude phone rendering.
The paged order response remains roughly constant in size. Full manifest size
grows with attendance, so download/cache it before doors open and test real phones
on venue connectivity.

After bulk seeding, financial summaries were ready within the initial observation
window at about 12.2s for 250 tickets and 28.5s for 1,000. The 3,000-ticket summary
was not ready after 30.8s. Its eventual convergence time was **not measured** in
this run. This is a background observation, not an admission correctness failure.
Future runs also record summary state after scans.

## Inventory contention diagnostic

Actual `Orders.checkout` validation and inventory transactions against staging
Firestore, with a scoped provisional-status adapter preventing payment recovery
and email work. This runs from the workstation, **not the deployed checkout API**;
WAN round trips extend lock duration. Stripe access fails closed.

| Concurrent reservations | Successful reservations/s | p95 |
| ---: | ---: | ---: |
| 1 | 1.73 | 0.75s |
| 5 | 4.66 | 2.16s |
| 10 | 6.07 | 3.65s |
| 25 | 4.99 | 6.78s |

All 240 normal reservations succeeded and held inventory equaled created orders.
Thirty simultaneous attempts against capacity ten resulted in exactly ten holds
and twenty expected sold-out responses. No overselling occurred.

The flattening throughput and rising latency indicate inventory contention under
this workload. This disproves using a universal one-write/second ceiling for this
workload, but does not establish live checkout capacity. A regional runner and
controlled payment-provider stub are the next step for end-to-end checkout load.
Stripe [discourages sandbox load tests](https://docs.stripe.com/rate-limits#load-testing)
because sandbox limits and latency differ from live processing.

## Practical interpretation

Three thousand stored attendees are a demonstrated admission/read dataset.
For context, 3,000 arrivals spread over an hour average 0.83 scans/second; over
ten minutes they average 5/second. The short deployed scan bursts exceeded those
averages. Human handling, uneven queues, venue networks and phones still determine
door performance. Do not extrapolate 26.78/s indefinitely or call this a supported
maximum attendance.

Before a major onsale or festival, repeat a sustained regional workload with
realistic purchase bursts, group sizes, per-attendee point awards and phone/offline
replay tests. This baseline uses zero-point comp tickets and does not load-test
Stripe fulfillment, tax, refunds, email delivery, app UI or prolonged saturation.

## Safety and reproducibility

No production records were touched. Synthetic events were excluded from public
discovery. No email jobs were created for seeded attendees and no card charges or
Stripe sessions were created by the diagnostic. Both measured runs completed
cleanup; later verification queries found **zero residual scoped records** across
their eight synthetic events. Temporary Firebase Auth users were deleted.
A staging Cloud Run log query found zero entries at `ERROR` severity or above
between 17:26:00 and 17:44:30 UTC. This check does not substitute for long-term
monitoring or prove the financial projection had fully converged.

Aggregate evidence:

- [Shared-session run](benchmarks/2026-10-12-shared-scanner.json),
  `926696b533324e34`, 17:28–17:34 UTC.
- [Independent-session run](benchmarks/2026-10-12-independent-scanner.json),
  `e72b4ada8e034c47`, 17:36–17:44 UTC.

Original timing samples, HTML and CSV remain in the corresponding local
`output/load-tests/` directories. Generate portable comparison charts from the
committed evidence with:

```powershell
python scripts/load-test/plot.py docs/benchmarks/2026-10-12-shared-scanner.json docs/benchmarks/2026-10-12-independent-scanner.json --output=output/load-tests/comparison.png
```
