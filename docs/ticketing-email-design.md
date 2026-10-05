# Ticketing emails

Receipts, recovery links, transfers, refunds, and RSVP pending / approved / declined notices share Pluto's dark palette, purple action buttons and orange status labels. Each sends HTML and a readable plain-text alternative through the existing Resend worker. Staging emails carry a visible test label; links use the current deployment's app URL.

Receipts group ticket quantities and show the original order total and inclusive tax. Transfer invitations omit the original purchaser's financial details. Dates use the published event's timezone. Emails use published schedule / city information and direct holders to the app for the exact venue, including scheduled location reveals. An unpublished editor draft is never used for email content.

Admission QR codes and ticket PDFs stay out of email. Pending and declined RSVPs explicitly grant no admission. Access-link expiry, transfer deadlines and server authorization remain in force.

## Preview locally

Run `npm run preview:ticketing:emails`, then open `tmp/ticketing-emails/index.html` for all eight variants and their plain-text alternatives. The script uses synthetic data and placeholder links; it does not connect to Firebase or Resend. A Functions build is required and is included in the command.

The HTML uses presentation tables, inline styles, system fonts and an Outlook table fallback. The layout is usable without images, web fonts, gradients or JavaScript. Browser previews cover narrow phone and desktop widths. Real Gmail, Apple Mail and Outlook inbox rendering remains a staging acceptance check.

## Delivery behavior

Stripe ticket reservations currently last 35 minutes from order creation. Webhooks and the five-minute maintenance worker reconcile the provider before releasing inventory; an overdue open order is not expired solely by its local clock. Expired records are retained in All Orders and CSV exports, but hidden from the per-event dashboard order list.

Maintenance queues one branded checkout follow-up per event and buyer email, one hour after confirmed expiry, while the expiry is less than 24 hours old. This also covers recent expired checkouts after deployment without emailing historical abandoned orders. The event must still be published, running or upcoming, with an available paid offer inside its sales window. Completed paid purchases, payment review flags, other active checkouts and newer expired attempts suppress the reminder. A free confirmed RSVP does not suppress an eligible paid VIP reminder, but an approval-required VIP still needs its valid approved RSVP.

The email worker checks eligibility again and re-verifies the expired Stripe session before every provider attempt. A late payment, newer purchase, cancelled event or sold-out event cancels the reminder. It links to the current public event page to start a fresh checkout at current availability and pricing; it does not restore an expired reservation, grant order access or issue an admission QR. Delivery uses the existing Resend idempotency and payload snapshot behavior. Deploy the included event/email order-query index before Functions, as the release workflow already does.

The worker snapshots the complete provider payload before its first send attempt so edits to an event or order cannot change a retry under the same Resend idempotency key. The snapshot is cleared after confirmed delivery. Jobs already attempted by an older release keep their previous plain-text format for that delivery; new jobs use the branded templates.

Renderer unit tests cover amounts, event timezones, escaping, private location omission and variant-specific actions. Emulator integration checks verify the actual HTML / text provider payload, stable retries after an event edit, consumed recovery links and approval boundaries. No real email is sent by these tests.

Firebase Authentication password-reset and verification emails are configured separately in the Firebase console's Authentication email templates.

Email/password signup requests a Firebase verification email automatically in both signup screens. The verification page's Continue action returns to Profile on the same website. Existing members can request a link and refresh verification status from Profile or the ticket wallet. Sending a link does not verify the account; ticket claiming still checks the refreshed verified-email token. A failed send keeps the new account and offers a resend path. Google signup retains its provider-verified email without sending a redundant signup verification message.
