# Ticket wallet performance and checkout follow-up

The ticket page's previous loading path did unnecessary network, database,
storage and rendering work. These changes apply to native Android and Flutter web.

| Area | Previous behavior | New behavior |
| --- | --- | --- |
| Account purchases | One account request, followed by repeated requests for matching locally saved orders | Account results are authoritative; matching receipt requests are skipped |
| Guest receipts | Up to 30 sequential requests | Up to four simultaneous requests, with the same 30-reference bound |
| Native purchase sync | Reload user, force token refresh, claim all email-matching orders, then fetch tickets | Verified-email guest claiming runs inside the existing wallet/order request; already owned orders are not rewritten |
| Server reads | Event and order fetched separately for every ticket | Shared events are batch-fetched once; owned order snapshots are reused; upgrade validation is shared per order |
| Ticket rendering | All orders, cards and QR matrices built immediately | Separate receipt view; event picker when needed; visible ticket rows are built lazily |
| QR encoding | QR matrix recomputed on every widget rebuild | Matrix retained until the ticket credential changes |
| Offline storage | Each response rewrote unrelated snapshots | Only affected snapshots are rewritten; authoritative revocation still invalidates cached access |

The emulator regression for five tickets from one owned order confirms one
shared event lookup and no extra order lookups. The guest-request regression
confirms a peak of four requests with all 12 test tickets retained. The UI test
uses 80 tickets and confirms offscreen rows are not initially built. Event-picker
and receipt views build no QR rows. These verify reduced work, not a measured
percentage improvement on a particular phone.

Receipt history and the account API still return the attendee's complete history.
Server pagination/event-specific fetching is the next scaling step for accounts
with unusually large histories. Auth initialization, function cold starts and
the Flutter web engine also affect first launch. Physical performance comparison
should use a profile/release build; the development APK uses debug mode.

## Completed checkout state

The event page now checks the original checkout attempt before offering Resume.
Paid, completed RSVP, expired and cancelled attempts clear the saved cart.
An unknown/network-failed outcome preserves the original idempotent attempt.
Browser Back/bfcache and tab returns recheck state. Ticket receipt loading also
clears a completed cart only when its original proof matches, so viewing an old
order cannot erase a new reservation for the same event. Order records remain
available for receipts and audit history.

## Android website association

Staging was deployed at revision 413b41cbda8b13d18f77922817b64277bbf776c8 but
`/.well-known/assetlinks.json` returned `[]`. Hosting's automatic association
response took precedence over the configured function route. Hosting now uses
`appAssociation: NONE` to serve Pluto's explicit environment-specific association.
Staging contains the registered debug certificate; production remains empty
until its Play App Signing certificate is configured.

After deploying this fix, verify the public endpoint contains the staging
package/certificate, then re-verify or reinstall the APK. Firefox Android must
allow native links under Settings → Open links in apps → Always or Ask before
opening, and Android's Open supported links setting must be enabled for Pluto.

References: [Firebase Hosting association configuration](https://firebase.google.com/docs/hosting/full-config#rewrite-dynamic-links),
[Firefox native link settings](https://support.mozilla.org/en-US/kb/set-firefox-android-open-links-native-apps).
