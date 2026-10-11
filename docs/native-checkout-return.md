# Native checkout return

Event links opened by the installed Android/iOS app include `native_app=1`.
After embedded Stripe Checkout, a free ticket checkout or an RSVP, the website
opens `/tickets/checkout-return?order=<public-order-id>` instead of loading the
Flutter web app. Stripe redirect payment methods use that same return page for
orders created in the native flow. Ordinary website purchases retain their web
ticket destination.

The return page attempts to open the matching installed app:

- Production: `events.pluto.app://tickets?order=<public-order-id>`
- Staging: `events.pluto.app.staging://tickets?order=<public-order-id>`

If the browser requires a tap, **Open my tickets in Pluto** repeats the handoff.
**Continue in browser** is an explicit fallback. The native app opens its Tickets
section and closes the iOS in-app browser. Android brings the existing app activity
to the foreground. App scheme links accept only a public order ID; ticket access
continues to require the authenticated account or the existing secure recovery
flow. No ticket credentials or order access keys travel through the handoff URL.

Deploy the backend/website and install a new Android/iOS build before testing;
older apps do not register these checkout schemes. Already-created Stripe sessions
keep their original return URL to preserve payment idempotency. Starting checkout
from the updated app uses the native completion screen; brand-new native orders
also receive the new Stripe redirect URL.

## Device acceptance check

1. Sign in to the updated app with a verified email.
2. Open an event from Home and purchase using that account's email. Check free
   ticket and RSVP flows as well, including approval-required RSVPs.
3. Confirm checkout returns to the installed Tickets section without rendering a
   second app inside the browser. If an automatic launch is blocked, tap the
   native return button.
4. Test a Stripe payment that leaves the embedded payment form and returns via
   Stripe's return URL. Confirm pending payments/RSVPs show their actual status.
5. Purchase from a regular browser tab and confirm it still opens the web Tickets
   page. Install both flavors and confirm each opens the matching app.

Regression coverage: `test/native_checkout_return_test.dart`,
`functions/test/checkout-return.test.cjs`, the fake-Stripe integration test, and
`scripts/ticketing/native-checkout-return-browser-test.cjs` in browser CI.
