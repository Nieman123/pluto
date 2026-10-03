# Digital wallet tickets

Apple Wallet and Google Wallet are implemented but disabled until issuer account setup is complete. In-app admission works independently. The Add to Wallet action is currently hidden by default; it uses the purple filled-button style when enabled. Enable it with a Flutter build using `--dart-define=TICKETING_WALLET_UI_ENABLED=true` after issuer setup/device acceptance. Its dialog then shows available providers and explains when setup is pending. This client flag is separate from the backend secret-binding flag below.

## Account setup

Apple requires an Apple Developer membership, a Pass Type ID, its pass signing certificate and matching RSA private key, your 10-character Team ID, and the current Apple Worldwide Developer Relations intermediate certificate that issued the pass certificate. Export the certificate/key to PEM. The backend checks identity, expiration, key match and the issuing intermediate's signature. Apple verifies its trust chain on the device. Follow [Apple's Wallet setup](https://developer.apple.com/wallet/get-started/) and [pass packaging requirements](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Creating.html).

Google requires a Wallet issuer account, an enabled Google Wallet API project, and a service account granted issuer access in the Google Wallet console. Save its service-account JSON privately. Demo issuers must add test users; public use requires publishing access. Follow [Google's authentication setup](https://developers.google.com/wallet/tickets/events/web).

## Credentials

Set `TICKETING_WALLET_CREDENTIALS` to base64-encoded UTF-8 JSON with this structure. Each provider is optional; configure one or both. This value contains private keys and is a secret, even though it is base64 encoded.

```json
{
  "apple": {
    "passTypeIdentifier": "pass.events.pluto.ticket",
    "teamIdentifier": "YOURTEAMID",
    "signerCert": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
    "signerKey": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
    "wwdr": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
  },
  "google": {
    "issuerId": "YOUR_NUMERIC_ISSUER_ID",
    "clientEmail": "wallet@your-project.iam.gserviceaccount.com",
    "privateKey": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
  }
}
```

Optional Apple `signerKeyPassphrase` supports an encrypted PEM key. Use `scripts/ticketing/configure-wallets.mjs` to read a private `*.secret.json` input and append/update the encoded value in ignored `functions/.secret.local`, without printing the keys. Keep PEM/service-account source files outside the repository or use ignored `*.secret.json` names. Never paste private keys into chat or commit them.

For local preview, set `TICKETING_WALLETS_ENABLED=true` in ignored `functions/.env.local` and restart the preview. For staging/production, create the same Secret Manager secret (for example `firebase functions:secrets:set TICKETING_WALLET_CREDENTIALS --data-file <private-encoded-file>`), set the flag in the target project's Functions environment, and deploy `publicSite`. Only that function binds the optional wallet secret. Leave the flag false until setup is ready; other ticket workers don't need this secret.

Enable a Firestore TTL policy on `ticketingWalletDownloads.expiresAt` for expired download grants. Authorization always checks expiry immediately, independent of delayed TTL deletion. Configure secret access and certificate-expiry monitoring before launch.

## Admission behavior and limits

- Apple uses a signed `.pkpass` event ticket with Pluto colors/logo and sharing disabled. Google creates an event class/object via its API, then returns a compact RSA-signed save link. Google restricts an object to one Google user across their devices and requests screenshot blocking. These are provider restrictions, not a guarantee that a displayed QR cannot be copied. See [Google holder restrictions](https://developers.google.com/wallet/reference/rest/v1/MultipleDevicesAndHoldersAllowedStatus) and [screenshot constraints](https://developers.google.com/wallet/reference/rest/v1/PassConstraints).
- Both carry the same signed `PLUTO1` credential as the in-app ticket. Online scanning rejects stale versions, refunds, blocked payments and duplicate entry. Order access cannot export a transferred ticket. Pending approval RSVPs receive no wallet admission pass. Expired, admitted, cancelled and archived tickets cannot be exported.
- Apple downloads use a random scoped five-minute URL, with no-store headers and current ticket/version checks. The app requests passes directly; ticket passes are never emailed as PDFs.
- Existing saved passes do **not** receive automatic metadata/status push updates yet. A transferred/refunded pass may remain visually present; its old QR fails online validation. Wallet rendering controls the barcode's appearance; Pluto's custom high-contrast QR frame applies inside the app. Offline scanners retain the existing signed-manifest freshness limits and must reconnect to learn revocations.
- Scheduled private locations are withheld from pass payloads before reveal. A pass saved early directs the holder back to the app for location information; re-adding after reveal refreshes the pass metadata. Public event classes always omit holder-only exact locations.
- Apple opens the pass URL in the browser/platform handler; Google opens its save flow. Test Safari on iPhone and Chrome on Android with real issuer credentials before enabling public use. No proprietary native Wallet SDK is required for these URL flows.

## Validation and activation gates

`npm --prefix functions test` checks package manifest hashes, independently verifies Apple CMS signatures with OpenSSL and rejects tampering, verifies Google JWT signatures and provider payloads, and isolates missing configuration/provider errors. OpenSSL is a **test dependency**; runtime signing uses Node crypto. `functions/test/wallet-access.cjs` covers current-holder access, transfer/version invalidation, download expiry, financial blocks, approval and admission eligibility against isolated emulators. Firestore rules tests deny direct client access to download grants.

`flutter test test/ticket_qr_test.dart` renders signed-ticket fixtures; `node scripts/ticketing/qr-decoder-test.cjs` decodes those rendered images at phone/desktop densities and reduced sizes. The in-app QR keeps square finder patterns, an opaque white background and a four-module quiet zone, with decoration outside the code.

Local acceptance on October 3: TypeScript/site/release Flutter web builds, Flutter analysis, 35 Functions tests plus eight configuration/reporting tests, 19 Flutter tests, three wallet/revenue-access emulator tests, three private-rule contexts, existing ticketing integration and customer-wallet browser regression all passed. Seven rendered QR decoder checks passed (native-size 1x/2x, plus reduced desktop/2x images); the new phone-browser flow also decodes the enlarged QR and verifies both provider navigation paths and the disabled-provider message. Two revenue tests cover payment dates, local Monday boundaries and DST. The admin browser check verifies flyer loading, weekly totals, graph periods, public URL and desktop/mobile accessibility. Browser provider flows use controlled substitutes, not real Apple/Google accounts.

Before public activation: install a real Apple-signed pass on iPhone, save a Google demo pass using an authorized test user, scan both at the door, verify old passes fail after transfer/refund, check duplicate admission, validate approved/pending RSVPs, then obtain Google publishing access. Check lighting/screen brightness and native/browser return navigation on actual phones. These provider/device checks are pending account setup; generated test certificates establish packaging interoperability, not Apple device trust.
