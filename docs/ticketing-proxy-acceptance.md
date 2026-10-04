# Ticketing proxy and shared-network acceptance

The application supports `TICKETING_TRUSTED_PROXIES` as a comma-separated list of explicit proxy addresses/subnets. Empty configuration ignores forwarded headers. Blanket `true`, arbitrary hop counts and whole-internet CIDRs are rejected. [Express proxy guidance](https://expressjs.com/en/guide/behind-proxies/) describes how addresses are evaluated from the socket toward the nearest untrusted peer. Google load balancers can append multiple addresses and preserve an untrusted prefix; see [Google header handling](https://docs.cloud.google.com/load-balancing/docs/https#x-forwarded-for_header).

## Staging gate (not completed by local tests)

1. Deploy to an isolated sandbox project with the normal Hosting rewrite and the intended Functions/Cloud Run ingress. Include the direct Function/Cloud Run URL if it remains publicly reachable. Do not substitute the production project.
2. As a staging administrator, POST JSON to `/tickets/api/staff/network-context` using the normal Firebase bearer token. The private response contains only this request's client IP, trusted chain and socket IP; it is not a public diagnostic endpoint.
3. From two genuinely different networks, compare the observed chain with the platform routing configuration. Configure only proxies managed by that deployment. Do not infer a universal hop count from one request.
4. Repeat via every reachable ingress. Supply a forged `X-Forwarded-For` prefix and confirm it cannot change the resolved client IP. An untrusted nearest peer must stop the chain. Restrict or disable any shorter ingress that invalidates the trust configuration.
5. Repeat from venue Wi-Fi with representative attendee devices and door scanners. Many purchasers must remain independent; repeat abuse from one client/contact and PIN guessing must still receive 429. Capture latency, provider/Firestore errors and queue age alongside results.
6. Record the verified subnet configuration, ingress paths, date and observed results in release acceptance before enabling live sales. The local suite checks trust behavior, shared-network independence and PIN limits; it does not establish cloud routing or measured festival capacity.

## Limits and storage

- Network protection is a short minute burst, distributed over 16 counters. Purchases have an additional 512/minute burst over eight counters. Shard limits are conservative: a full shard may reject before the aggregate ceiling. Counters have Firestore Timestamp `expiresAt` fields; configure TTL for `ticketingRateLimits` in the deployed project.
- General limits use an authenticated account, a scanner session, or a persisted anonymous client ID. The anonymous ID is a rate-counter hint and grants no authorization. Older proof-bearing clients have a compatibility identity.
- Checkout/RSVP limits combine client+event and normalized contact+event limits. Recovery is limited by both client and recipient; resend is limited by order. A rotated anonymous ID does not evade contact, PIN or network limits.
- PIN login retains strict 40/minute network and 20/hour per-PIN limits. Each authenticated scanner session has a separate general counter, so door people sharing a PIN do not share one general Firestore counter.
- Application counters provide abuse protection, not a complete bot defense or a production capacity guarantee. Tune burst thresholds using the staging measurements and operational alerts.
