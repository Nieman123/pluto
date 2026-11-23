# Firebase App Check

App Check lets the ticket API tell real Pluto clients apart from scripts. It
works alongside the existing rate limits, one-unpaid-cart-per-buyer lock and
per-contact limits.

| Client | Provider | Debug path |
| --- | --- | --- |
| Website (`site/src/app-check.js`) | reCAPTCHA Enterprise, invisible | On `localhost`, the SDK prints a debug token in the console. Register it, or store a registered token in `localStorage['pluto-app-check-debug-token']`. |
| Flutter web `/app` | reCAPTCHA Enterprise | `flutter run` (debug) uses the web debug provider. |
| iOS | App Attest, falling back to DeviceCheck | Debug builds and simulators use the debug provider. |
| Android | Play Integrity | Debug builds use the debug provider. |

Debug tokens: run a debug build once, copy the token the SDK logs, and add it
under Firebase console > App Check > Apps > (app) > Manage debug tokens. You can
pin one with `--dart-define=APP_CHECK_DEBUG_TOKEN=<token>`. Treat registered
debug tokens like passwords.

The production reCAPTCHA Enterprise site key is public and lives in
`functions/src/deployment-config.ts` and `lib/src/app_check.dart`. Staging needs
its own key from the staging project, set as the GitHub environment variable
`APP_CHECK_SITE_KEY`. Without it, staging runs without web App Check.

## What the API checks

`functions/src/ticketing/app-check.ts` verifies the `X-Firebase-AppCheck`
header on these customer actions only: checkout, RSVP, RSVP and waitlist
verification emails, waitlist join, order recovery, native checkout handoff,
and Pluto Points claim and redeem. Scanner, staff, webhook and order-viewing
routes are not checked, so door scanning and email links keep working on older
app versions.

The mode comes from the GitHub environment variable `TICKETING_APP_CHECK`:

- `monitor` (default): verify every token and log failures as
  `App Check token rejected`, but never block.
- `enforce`: reject requests to those routes without a valid token (HTTP 401,
  code `app-check-failed`).
- `off`: skip verification. Local emulators always default to `off`.

## Rollout

1. Deploy with the default `monitor` mode and ship app version 1.0.3.
2. Watch Cloud Logging for `jsonPayload.message="App Check token rejected"`,
   grouped by `jsonPayload.path` and `jsonPayload.native`. Requests without an
   `Origin` header come from the native apps.
3. Also check Firebase console > App Check > APIs for verified versus
   unverified request ratios.
4. Set `TICKETING_APP_CHECK=enforce` and redeploy once rejections are close to
   zero, which means most people have updated past 1.0.2.
5. Firestore and Storage enforcement in the console is separate. The website
   only fetches App Check tokens for the API, so leave Firestore enforcement
   off until the website also initializes App Check before it reads Firestore.

To roll back, set `TICKETING_APP_CHECK=monitor` (or `off`) and redeploy.

## Pluto Points event QR claims

A QR claim now needs:

- a verified account email, and
- a valid ticket for the ticketing event linked to the QR code, owned by the
  account or held under the account's verified email. Refunded, transferred
  away, financially blocked or unapproved RSVP tickets don't count.

In the admin QR editor, "Ticket holders only" is on by default and needs a
ticketed event. Turn it off only for walk-in events without tickets. QR codes
saved before this change have no linked event, so they are rejected
(`qr-needs-event`) until an admin edits and saves them.

App Store review demo accounts keep their isolated demo QR codes and skip
these checks.
