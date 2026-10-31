# Health worker CPU benchmark

Completed October 30, 2026, 8:20 PM EDT, in `pluto-staging-92eb7`. Raw evidence: [health-cpu-benchmark-2026-10-30.json](health-cpu-benchmark-2026-10-30.json).

Two private, temporary Gen 2 functions ran the application's actual `collectHealth` implementation. Each had 256 MiB, concurrency one, maximum one instance and minimum zero. Each checked 50 synthetic paid orders with matching tickets in an isolated Firestore subcollection, plus the ordinary empty recovery queues. The driver alternated full/fractional request order across 25 pairs. Every response verified 50 checked orders and zero critical issues. There were no payment-provider calls or outgoing emails.

| Measurement | 1 CPU | 0.1666 CPU |
| --- | ---: | ---: |
| Median audit | 0.915 s | 3.307 s |
| 95th percentile audit | 1.967 s | 4.118 s |
| Peak process RSS | 180.7 MiB | 182.6 MiB |
| Allocated CPU × measured audit duration, 25 audits | 26.37 CPU-s | 13.61 CPU-s |
| Cloud Monitoring startup p95 | 1.169 s | 1.285 s |
| Cloud Monitoring memory utilization p95 | 61.9% | 63.8% |

Fractional CPU used approximately 48% fewer **modeled audit CPU-seconds** while taking longer to complete. This is not a 48% reduction in the app's bill: memory duration increases, cold starts and billing granularity add overhead, and other functions are unaffected. Both observed runtimes are comfortably below the health worker's 120-second timeout and five-minute schedule.

Cloud Monitoring's request counter contains all 27 fractional requests (setup, 25 audits, cleanup), but only 22 of the 27 successful full-CPU requests, even after widening the interval and recollecting. Its reported billable times, 88.2 and 20.17 seconds respectively, therefore **must not be used as a complete apples-to-apples invoice comparison**. The decision uses the complete per-audit timing samples, allocated CPU, memory and startup measurements. The JSON explicitly records `cloudMetricsComplete: false` rather than treating missing observations as zero. Recheck sustained billed usage after rollout.

Decision: use fractional CPU only for the independent scheduled health audit, with a release override back to one CPU. Keep payment, email, projection, account-deletion, campaign and API workers at one CPU: this benchmark does not measure their dependency latency, burst throughput or heavier workloads. Staging acceptance must use the same health CPU allocation as production. The representative workload covers the paid-order audit page limit, but not simultaneous maximum-sized failure queues; monitor that case during acceptance and retain the 200-issue output cap.

Cleanup was verified through the Functions API: both temporary functions were removed, and both synthetic Firestore roots were recursively removed by the benchmark endpoint before function deletion. Failed initial deployment attempts produced temporary build artifacts covered by the staging repository's seven-day cleanup policy.

Reproduce after building functions: run `node scripts/cost-benchmark/prepare.cjs`, install dependencies **from** `tmp/cost-cpu-benchmark`, and deploy only `functions:cost-benchmark` with `tmp/cost-benchmark.firebase.json` to staging. `run.py --gcloud PATH --samples 25` records the paired samples and removes synthetic records. `finish.py --gcloud PATH` collects cloud metrics and removes the two named functions. Use a complete monitoring export before asserting invoice savings; do not infer cold starts from the first-audit boolean alone.
